import {
  BoxGeometry,
  Cartesian2,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  GeometryInstance,
  Matrix4,
  OrthographicFrustum,
  PerInstanceColorAppearance,
  Primitive,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
  SceneGISTemporalAntialiasing,
  Transforms,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";

describe("SceneGIS/Scene/SceneGISTemporalAntialiasing", function () {
  let scene;
  let taa;
  let box;
  function setup(globe = false, orthographic = false) {
    scene = createScene({ canvas: createCanvas(96, 96), scene3DOnly: true });
    if (!globe) {
      const world = new SceneGISPlanarWorld({
        coordinateSystem: new SceneGISPlanarCoordinateSystem({
          extent: new SceneGISPlanarExtent({
            minimumX: -100,
            minimumY: -100,
            maximumX: 100,
            maximumY: 100,
          }),
        }),
        maximumLevel: 0,
      });
      scene._initializeWorld(world);
      world.show = false;
    }
    scene.highDynamicRange = true;
    scene.msaaSamples = 1;
    scene.postProcessStages.fxaa.enabled = false;
    scene.backgroundColor = Color.BLACK;
    scene.fog.enabled = false;
    const frame = globe
      ? Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(12, 48))
      : Matrix4.IDENTITY;
    const position = Matrix4.multiplyByPoint(
      frame,
      new Cartesian3(6, -14, 10),
      new Cartesian3(),
    );
    const direction = Matrix4.multiplyByPointAsVector(
      frame,
      new Cartesian3(-6, 14, -10),
      new Cartesian3(),
    );
    const up = Matrix4.multiplyByPointAsVector(
      frame,
      Cartesian3.UNIT_Z,
      new Cartesian3(),
    );
    Cartesian3.normalize(direction, direction);
    Cartesian3.normalize(up, up);
    scene.camera.setView({
      destination: position,
      orientation: { direction, up },
    });
    scene.camera.frustum.near = 0.1;
    scene.camera.frustum.far = 100;
    if (orthographic) {
      scene.camera.frustum = new OrthographicFrustum({
        width: 24,
        aspectRatio: 1,
        near: 0.1,
        far: 100,
      });
    }
    box = scene.primitives.add(
      new Primitive({
        geometryInstances: new GeometryInstance({
          id: "taa-box",
          geometry: BoxGeometry.fromDimensions({
            dimensions: new Cartesian3(8, 6, 4),
            vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
          }),
          modelMatrix: frame,
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(Color.WHITE),
          },
        }),
        appearance: new PerInstanceColorAppearance({
          flat: true,
          translucent: false,
          closed: true,
        }),
        asynchronous: false,
      }),
    );
    taa = new SceneGISTemporalAntialiasing({ scene });
  }
  function render(count = 1) {
    for (let i = 0; i < count; ++i) {
      scene.renderForSpecs();
    }
  }
  function intermediatePixels() {
    const pixels = scene.context.readPixels();
    let count = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] > 8 && pixels[i] < 220) {
        ++count;
      }
    }
    return count;
  }
  afterEach(function () {
    scene?.destroyForSpecs();
    scene = undefined;
  });

  it("validates explicit configuration and does not override native AA", function () {
    setup();
    expect(taa.enabled).toBe(false);
    expect(taa._state).toBeUndefined();
    expect(
      () => new SceneGISTemporalAntialiasing({ scene }),
    ).toThrowDeveloperError();
    expect(() => {
      taa.historyWeight = 1;
    }).toThrowDeveloperError();
    scene.highDynamicRange = false;
    expect(() => {
      taa.enabled = true;
    }).toThrowError(/Temporal antialiasing requires/);
    scene.highDynamicRange = true;
    scene.msaaSamples = 4;
    taa.enabled = true;
    render();
    expect(scene.msaaSamples).toBe(4);
    expect(scene.postProcessStages.fxaa.enabled).toBe(false);
    expect(taa.ready).toBe(true);
  });
  [false, true].forEach(function (globe) {
    it(`accumulates actual edge coverage without changing camera or replaying geometry (${globe ? "Globe" : "Planar"})`, function () {
      setup(globe);
      render();
      const original = intermediatePixels();
      const projection = Matrix4.clone(scene.camera.frustum.projectionMatrix);
      const view = Matrix4.clone(scene.camera.viewMatrix);
      const geometry = new Set(
        scene.frameState.commandList.map((c) => c.vertexArray),
      );
      const draw = spyOn(scene.context, "draw").and.callThrough();
      render();
      const count = () =>
        draw.calls.allArgs().filter(([c]) => geometry.has(c.vertexArray))
          .length;
      const baseline = count();
      taa.enabled = true;
      render(8);
      draw.calls.reset();
      render();
      expect(count()).toBe(baseline);
      expect(intermediatePixels()).toBeGreaterThan(original + 5);
      expect(
        Matrix4.equals(scene.camera.frustum.projectionMatrix, projection),
      ).toBe(true);
      expect(Matrix4.equals(scene.camera.viewMatrix, view)).toBe(true);
      expect(
        scene.context.uniformState._sceneGISProjectionJitter,
      ).toBeUndefined();
      expect(scene.pick(new Cartesian2(48, 48)).id).toBe("taa-box");
    });
  });
  it("publishes current color immediately on disocclusion and explicit reset", function () {
    setup();
    taa.enabled = true;
    render(8);
    box.show = false;
    render();
    expect(
      scene.context.readPixels({ x: 48, y: 48, width: 1, height: 1 })[0],
    ).toBe(0);
    box.show = true;
    taa.reset();
    expect(taa.ready).toBe(false);
    render();
    const reference = scene.context.readPixels();
    taa.historyWeight = 0;
    render();
    expect(scene.context.readPixels()).toEqual(reference);
  });
  it("stabilizes fine surface detail on a stationary grazing-angle surface", function () {
    setup();
    box.appearance = new PerInstanceColorAppearance({
      translucent: false,
      closed: true,
      fragmentShaderSource: `
        in vec3 v_positionEC;
        void main() {
          float detail = sin(v_positionEC.x * 9.0) * sin(v_positionEC.y * 9.0);
          out_FragColor = vec4(vec3(0.5 + 0.45 * detail), 1.0);
        }`,
    });
    scene.camera.setView({
      destination: new Cartesian3(6, -14, 3),
      orientation: {
        direction: Cartesian3.normalize(
          new Cartesian3(-6, 14, -1),
          new Cartesian3(),
        ),
        up: Cartesian3.UNIT_Z,
      },
    });
    taa.enabled = true;
    render(32);
    let previous = scene.context.readPixels();
    let difference = 0;
    for (let frame = 0; frame < 16; ++frame) {
      render();
      const pixels = scene.context.readPixels();
      for (let i = 0; i < pixels.length; i += 4) {
        difference += Math.abs(pixels[i] - previous[i]);
      }
      previous = pixels;
    }
    // Static details must not follow the eight-phase projection cycle. This bounds
    // actual presented-pixel variation, not merely intermediate edge-color counts.
    expect(difference / (16 * 96 * 96)).toBeLessThan(0.5);
  });
  it("supports orthographic motion, resize and deterministic history lifetime", function () {
    setup(false, true);
    taa.enabled = true;
    render(8);
    scene.camera.moveRight(1);
    render();
    expect(taa.ready).toBe(true);
    expect(intermediatePixels()).toBeGreaterThan(0);
    const old = taa._state.history[0].getColorTexture(0);
    scene.canvas.width = 112;
    render();
    expect(old.isDestroyed()).toBe(true);
    const resized = taa._state.history[0].getColorTexture(1);
    taa.enabled = false;
    expect(resized.isDestroyed()).toBe(true);
    expect(taa._state).toBeUndefined();
    taa.enabled = true;
    render();
    const last = taa._state.history[0].getColorTexture(0);
    scene.destroyForSpecs();
    scene = undefined;
    expect(last.isDestroyed()).toBe(true);
    expect(taa.isDestroyed()).toBe(true);
  });
  it("keeps surface detail attached during camera dolly", function () {
    setup();
    box.modelMatrix = Matrix4.fromScale(new Cartesian3(12, 12, 0.025));
    box.appearance = new PerInstanceColorAppearance({
      translucent: false,
      closed: true,
      fragmentShaderSource: `
        in vec3 v_positionEC;
        void main() {
          vec3 p = (czm_inverseView * vec4(v_positionEC, 1.0)).xyz;
          float detail = sin(p.x * 1.7) * sin(p.y * 1.7);
          out_FragColor = vec4(vec3(0.5 + 0.45 * detail), 1.0);
        }`,
    });
    const direction = Cartesian3.normalize(
      new Cartesian3(0, 1, -0.25),
      new Cartesian3(),
    );
    const start = new Cartesian3(0, -20, 5);
    function setPose(frame) {
      scene.camera.setView({
        destination: Cartesian3.add(
          start,
          Cartesian3.multiplyByScalar(direction, frame * 0.6, new Cartesian3()),
          new Cartesian3(),
        ),
        orientation: { direction, up: Cartesian3.UNIT_Z },
      });
    }
    const frames = [];
    const read = () =>
      scene.context.readPixels({ x: 24, y: 20, width: 48, height: 32 });
    setPose(0);
    taa.enabled = true;
    render(32);
    for (let frame = 1; frame <= 12; ++frame) {
      setPose(frame);
      render();
      frames.push(read());
    }
    // Spatial supersampling provides an independent reference at each camera pose.
    // Comparing against zero history would penalize legitimate temporal antialiasing.
    taa.enabled = false;
    scene.canvas.width = 384;
    scene.canvas.height = 384;
    let error = 0;
    for (let frame = 1; frame <= 12; ++frame) {
      setPose(frame);
      render();
      const reference = scene.context.readPixels({
        x: 96,
        y: 80,
        width: 192,
        height: 128,
      });
      for (let y = 0; y < 32; ++y) {
        for (let x = 0; x < 48; ++x) {
          let sum = 0;
          for (let sy = 0; sy < 4; ++sy) {
            for (let sx = 0; sx < 4; ++sx) {
              sum += reference[((y * 4 + sy) * 192 + x * 4 + sx) * 4];
            }
          }
          error += Math.abs(sum / 16 - frames[frame - 1][(y * 48 + x) * 4]);
        }
      }
    }
    // Bound the mean error to four percent of the displayed luminance range on
    // this deliberately fine texture. The previous resolve exceeds this budget.
    expect(error / (12 * 48 * 32 * 255)).toBeLessThan(0.04);
  });
  it("retains the covered surface depth instead of its nearest neighbor", function () {
    setup();
    taa.enabled = true;
    const inspect = scene.context.createViewportQuadCommand(
      `uniform sampler2D u_depth;
       uniform float u_expected;
       in vec2 v_textureCoordinates;
       void main() {
         float difference = abs(texture(u_depth, v_textureCoordinates).r - u_expected);
         out_FragColor = vec4(difference < 0.005 ? 1.0 : 0.0, 0.0, 0.0, 1.0);
       }`,
      {
        uniformMap: {
          u_depth: () =>
            taa._state.history[1 - taa._state.index].getColorTexture(1),
          u_expected: () => expected,
        },
      },
    );
    let expected;
    try {
      for (let frame = 0; frame < 8; ++frame) {
        render();
        const point = scene.pickPosition(new Cartesian2(48.5, 47.5));
        expected = -Matrix4.multiplyByPoint(
          scene.camera.viewMatrix,
          point,
          new Cartesian3(),
        ).z;
        inspect.execute(scene.context);
        expect(
          scene.context.readPixels({ x: 48, y: 48, width: 1, height: 1 })[0],
        ).toBe(255);
      }
    } finally {
      inspect.shaderProgram.destroy();
    }
  });
  it("keeps shared AO on the main MRT path with no depth geometry", function () {
    setup();
    scene.postProcessStages.ambientOcclusion.enabled = true;
    taa.enabled = true;
    render(2);
    const ao =
      scene.postProcessStages.ambientOcclusion._sceneGISAmbientOcclusion;
    expect(ao.mainPass).toBe(true);
    expect(ao.prepassDraws).toBe(0);
    expect(taa.ready).toBe(true);
  });
  it("unprojects sampled depth back onto the actual surface throughout the jitter cycle", function () {
    setup();
    taa.enabled = true;
    for (let i = 0; i < 8; ++i) {
      render();
      const p = scene.pickPosition(new Cartesian2(48.5, 47.5));
      expect(p).toBeDefined();
      expect(p.z).toEqualEpsilon(2, 0.005);
    }
  });
  it("merges near and far frustum depths without replaying geometry", function () {
    setup();
    scene.logarithmicDepthBuffer = false;
    scene.farToNearRatio = 5;
    scene.camera.frustum.far = 2000;
    scene.primitives.add(
      new Primitive({
        geometryInstances: new GeometryInstance({
          geometry: BoxGeometry.fromDimensions({
            dimensions: new Cartesian3(60, 60, 60),
            vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
          }),
          modelMatrix: Matrix4.fromTranslation(new Cartesian3(-60, 280, -200)),
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(Color.RED),
          },
        }),
        appearance: new PerInstanceColorAppearance({
          flat: true,
          translucent: false,
          closed: true,
        }),
        asynchronous: false,
      }),
    );
    taa.enabled = true;
    render(2);
    expect(scene._view.frustumCommandsList.length).toBeGreaterThan(1);
    const inspect = scene.context.createViewportQuadCommand(
      "uniform sampler2D u_depth; in vec2 v_textureCoordinates; void main() { float d = texture(u_depth, v_textureCoordinates).r; out_FragColor = vec4(d > 200.0 ? 1.0 : 0.0, d > 0.0 && d < 100.0 ? 1.0 : 0.0, 0.0, 1.0); }",
      { uniformMap: { u_depth: () => taa._state.depth.getColorTexture() } },
    );
    inspect.execute(scene.context);
    const pixels = scene.context.readPixels();
    inspect.shaderProgram.destroy();
    let near = 0;
    let far = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      far += pixels[i];
      near += pixels[i + 1];
    }
    expect(near).toBeGreaterThan(0);
    expect(far).toBeGreaterThan(0);
    expect(taa.ready).toBe(true);
  });
  it("restores projection and invalidates history when rendering fails", function () {
    setup();
    taa.enabled = true;
    render();
    const command = taa._state.resolve;
    const execute = command.execute;
    command.execute = function () {
      throw new Error("Expected temporal failure");
    };
    expect(() => render()).toThrowError("Expected temporal failure");
    command.execute = execute;
    expect(
      scene.context.uniformState._sceneGISProjectionJitter,
    ).toBeUndefined();
    expect(taa._state.valid).toBe(false);
    render();
    expect(taa.ready).toBe(true);
  });
});
