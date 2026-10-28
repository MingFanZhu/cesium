import {
  BoxGeometry,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  GeometryInstance,
  Framebuffer,
  Globe,
  JulianDate,
  Matrix4,
  PerInstanceColorAppearance,
  PixelDatatype,
  PixelFormat,
  Primitive,
  SceneGISWindFieldSampling,
  SceneGISWindSimulation,
  SceneGISWindVisualization,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
  Transforms,
  Texture,
  ShaderSource,
} from "../../../index.js";
import particleShader from "../../../Source/Shaders/SceneGIS/Wind/SceneGISWindParticleUpdate.js";
import particleStruct from "../../../Source/Shaders/SceneGIS/Particles/SceneGISParticleState.js";
import createScene from "../../../../../Specs/createScene.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISWindVisualization", function () {
  let scene, wind, view;
  const time = JulianDate.fromIso8601("2026-10-28T00:00:00Z");
  function particleState(attachment = 0) {
    const state = view._particles._state;
    const texture = state.buffers[state.index].getColorTexture(attachment);
    const target = new Framebuffer({
      context: scene.context,
      colorTextures: [texture],
      destroyAttachments: false,
    });
    try {
      return Array.from(
        scene.context.readPixels({
          framebuffer: target,
          width: texture.width,
          height: texture.height,
        }),
      );
    } finally {
      target.destroy();
    }
  }
  afterEach(function () {
    if (view && !view.isDestroyed()) {
      scene.primitives.remove(view);
    }
    scene?.destroyForSpecs();
    scene = wind = view = undefined;
  });
  it("rejects solid crossings including corner intersections with fluid endpoints on GPU", function () {
    scene = createScene({ canvas: createCanvas(4, 4) });
    const mask = new Uint8Array(8 * 8 * 8);
    mask[2 + 8 * (2 + 8 * 2)] = 1;
    wind = scene.primitives.add(
      new SceneGISWindSimulation({
        dimensions: new Cartesian3(8, 8, 8),
        cellSize: 1,
        timeStep: 1,
        kinematicViscosity: 0.1,
        windSpeed: 0.02,
        solidMask: mask,
        paused: true,
      }),
    );
    scene.renderForSpecs(time);
    const target = new Framebuffer({
      context: scene.context,
      colorTextures: [
        new Texture({
          context: scene.context,
          width: 1,
          height: 1,
          pixelFormat: PixelFormat.RGBA,
          pixelDatatype: PixelDatatype.FLOAT,
        }),
      ],
    });
    const command = scene.context.createViewportQuadCommand(
      new ShaderSource({
        sources: [
          particleStruct,
          SceneGISWindFieldSampling.shaderSource,
          particleShader,
          `void main() {
        out_FragColor = vec4(
          windParticleClear(vec3(1.95,2.05,2.5),vec3(2.10,1.95,2.5)) ? 1.0 : 0.0,
          windParticleClear(vec3(1.9,2.5,2.5),vec3(2.1,2.5,2.5)) ? 1.0 : 0.0,
          windParticleClear(vec3(1.8,1.8,2.5),vec3(1.9,1.9,2.5)) ? 1.0 : 0.0,
          windParticleClear(vec3(0.1,1.0,1.0),vec3(-0.1,1.0,1.0)) ? 1.0 : 0.0);
      }`,
        ],
      }),
      {
        framebuffer: target,
        uniformMap: SceneGISWindFieldSampling.createUniformMap(
          wind.getGpuField(),
        ),
      },
    );
    try {
      command.execute(scene.context);
      expect(
        Array.from(
          scene.context.readPixels({
            framebuffer: target,
            width: 1,
            height: 1,
          }),
        ),
      ).toEqual([0, 0, 1, 0]);
    } finally {
      command.shaderProgram.destroy();
      target.destroy();
    }
  });
  it("advects GPU markers by completed physical time, freezes, resets and releases borrowed-field consumers", function () {
    scene = createScene({ canvas: createCanvas(32, 32) });
    wind = scene.primitives.add(
      new SceneGISWindSimulation({
        dimensions: new Cartesian3(8, 8, 8),
        cellSize: 1,
        timeStep: 1,
        kinematicViscosity: 0.1,
        windSpeed: 0.02,
        paused: true,
        boundaryConditions: {
          xMin: "periodic",
          xMax: "periodic",
          yMin: "periodic",
          yMax: "periodic",
          zMin: "periodic",
          zMax: "periodic",
        },
      }),
    );
    view = scene.primitives.add(
      new SceneGISWindVisualization({
        scene,
        simulation: wind,
        mode: "none",
        particleCount: 128,
      }),
    );
    scene.renderForSpecs(time);
    const first = particleState(),
      styles = particleState(3);
    const buffers = view._particles._state.buffers.slice();
    expect(view.particleTextureByteLength).toBe(12 * 11 * 128);
    expect(view.showStreamlines).toBeFalse();
    wind.step();
    scene.renderForSpecs(time);
    const moved = particleState();
    let compared = 0;
    for (let i = 0; i < 128; i++) {
      const k = i * 4;
      if (styles[k] + 1 < styles[k + 1]) {
        expect(moved.slice(k, k + 3)).toEqualEpsilon(
          [first[k] + 0.02, first[k + 1], first[k + 2]],
          2e-5,
        );
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(100);
    scene.renderForSpecs(JulianDate.addSeconds(time, 99, new JulianDate()));
    expect(particleState()).toEqual(moved);
    wind.reset();
    scene.renderForSpecs(time);
    expect(particleState()).toEqual(first);
    expect(view._particles._state.buffers).toEqual(buffers);
    const field = wind.getGpuField();
    scene.primitives.remove(view);
    expect(buffers.every((b) => b.isDestroyed())).toBeTrue();
    expect(field.velocityTexture.isDestroyed()).toBeFalse();
  });
  [false, true].forEach(function (planar) {
    it(`renders tracer volume/slice, preserves pause and occludes behind geometry in ${planar ? "Planar" : "Globe"}`, async function () {
      scene = createScene({ canvas: createCanvas(64, 64), scene3DOnly: true });
      scene.skyBox = scene.skyAtmosphere = scene.sun = scene.moon = undefined;
      scene.fog.enabled = false;
      let matrix;
      if (planar) {
        scene._initializeWorld(
          new SceneGISPlanarWorld({
            coordinateSystem: new SceneGISPlanarCoordinateSystem({
              extent: new SceneGISPlanarExtent({
                minimumX: 19999000,
                maximumX: 20001000,
                minimumY: -30001000,
                maximumY: -29999000,
              }),
            }),
            maximumLevel: 0,
          }),
        );
        matrix = Matrix4.fromTranslation(
          new Cartesian3(20000000, -30000000, 100),
        );
      } else {
        scene.globe = new Globe();
        matrix = Transforms.eastNorthUpToFixedFrame(
          Cartesian3.fromDegrees(118.8, 32, 100),
        );
      }
      scene.camera.setView({
        destination: Matrix4.multiplyByPoint(
          matrix,
          new Cartesian3(4, 4, 24),
          new Cartesian3(),
        ),
        orientation: {
          direction: Matrix4.multiplyByPointAsVector(
            matrix,
            new Cartesian3(0, 0, -1),
            new Cartesian3(),
          ),
          up: Matrix4.multiplyByPointAsVector(
            matrix,
            Cartesian3.UNIT_Y,
            new Cartesian3(),
          ),
        },
      });
      scene.camera.frustum.near = 0.1;
      scene.camera.frustum.far = 200;
      wind = scene.primitives.add(
        new SceneGISWindSimulation({
          dimensions: new Cartesian3(8, 8, 8),
          cellSize: 1,
          timeStep: 1,
          kinematicViscosity: 0.1,
          windSpeed: 0.02,
          modelMatrix: matrix,
          paused: true,
          tracerSources: [
            { position: new Cartesian3(4, 4, 4), radius: 20, rate: 1 },
          ],
        }),
      );
      view = scene.primitives.add(
        new SceneGISWindVisualization({
          scene,
          simulation: wind,
          colorBy: "concentration",
          colorMaximum: 1,
          extinction: 1,
          showStreamlines: false,
          sliceHeight: 4,
        }),
      );
      wind.step();
      await pollToPromise(() => {
        scene.renderForSpecs(time);
        return view._stage?.ready;
      });
      const pixel = () =>
        Array.from(
          scene.context.readPixels({ x: 32, y: 32, width: 1, height: 1 }),
        );
      scene.renderForSpecs(time);
      const snapshot = pixel(),
        version = wind.getGpuField().version;
      expect(snapshot[0]).toBeGreaterThan(100);
      const later = JulianDate.addSeconds(time, 100, new JulianDate());
      scene.renderForSpecs(later);
      expect(pixel()).toEqual(snapshot);
      expect(wind.getGpuField().version).toEqual(version);
      view.mode = "slice";
      scene.renderForSpecs(later);
      expect(pixel()[0]).toBeGreaterThan(100);
      view.mode = "volume";
      view.showStreamlines = true;
      scene.primitives.add(
        new Primitive({
          asynchronous: false,
          modelMatrix: Matrix4.multiplyByTranslation(
            matrix,
            new Cartesian3(4, 4, 12),
            new Matrix4(),
          ),
          geometryInstances: new GeometryInstance({
            geometry: BoxGeometry.fromDimensions({
              dimensions: new Cartesian3(10, 10, 1),
              vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
            }),
            attributes: {
              color: ColorGeometryInstanceAttribute.fromColor(Color.BLUE),
            },
          }),
          appearance: new PerInstanceColorAppearance({
            flat: true,
            translucent: false,
          }),
        }),
      );
      scene.renderForSpecs(later);
      const covered = pixel();
      expect(covered[2]).toBeGreaterThan(100);
      expect(covered[0]).toBeLessThan(5);
      view.show = false;
      scene.renderForSpecs(later);
      expect(pixel()).toEqual(covered);
      const stage = view._stage,
        program = view._command.shaderProgram,
        array = view._array,
        particleBuffers = view._particles._state.buffers.slice();
      view.show = true;
      scene.renderForSpecs(later);
      scene.primitives.remove(view);
      expect(stage.isDestroyed()).toBeTrue();
      expect(array.isDestroyed()).toBeTrue();
      expect(particleBuffers.every((b) => b.isDestroyed())).toBeTrue();
      expect(wind.isDestroyed()).toBeFalse();
      scene.renderForSpecs(later);
      expect(pixel()).toEqual(covered);
      scene.destroyForSpecs();
      scene = undefined;
      expect(program.isDestroyed()).toBeTrue();
    });
  });
});
