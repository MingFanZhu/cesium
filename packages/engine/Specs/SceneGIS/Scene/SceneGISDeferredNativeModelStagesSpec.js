import {
  Cartesian2,
  Cartesian3,
  Color,
  BoxGeometry,
  ColorGeometryInstanceAttribute,
  GeometryInstance,
  PerInstanceColorAppearance,
  Primitive,
  EdgeDisplayMode,
  PerspectiveFrustum,
  FramebufferManager,
  ImageBasedLighting,
  Matrix4,
  Model,
  OrthographicFrustum,
  Pass,
  PixelDatatype,
  SceneGISTemporalAntialiasing,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISDeferredNativeModelStages", function () {
  let scene, ibl, taa;
  beforeEach(function () {
    scene = createScene({ canvas: createCanvas(64, 64), scene3DOnly: true });
    scene.highDynamicRange = true;
    scene.logarithmicDepthBuffer = false;
    scene.fog.enabled = false;
    scene.skyAtmosphere = scene.skyBox = scene.sun = scene.moon = undefined;
    scene.camera.setView({
      destination: new Cartesian3(7000000, 0, -20),
      orientation: {
        direction: new Cartesian3(0, 0, 1),
        up: Cartesian3.UNIT_Y,
      },
    });
    scene.camera.frustum = new OrthographicFrustum({
      width: 20,
      aspectRatio: 1,
      near: 0.1,
      far: 40,
    });
    scene.farToNearRatio = 10000;
    ibl = new ImageBasedLighting({
      imageBasedLightingFactor: new Cartesian2(0, 0),
    });
  });
  afterEach(function () {
    taa?.destroy();
    taa = undefined;
    scene.destroyForSpecs();
    ibl.destroy();
  });
  function render() {
    scene.renderForSpecs();
  }
  function sample(texture, x = 32, y = 32, width = 1, height = 1) {
    const target = new FramebufferManager({
      pixelDatatype: PixelDatatype.FLOAT,
    });
    target.update(scene.context, width, height);
    const command = scene.context.createViewportQuadCommand(
      `uniform sampler2D u_texture;void main(){out_FragColor=texelFetch(u_texture,ivec2(gl_FragCoord.xy)+ivec2(${x},${y}),0);}`,
      {
        framebuffer: target.framebuffer,
        uniformMap: { u_texture: () => texture },
      },
    );
    try {
      command.execute(scene.context);
      return Array.from(
        scene.context.readPixels({
          framebuffer: target.framebuffer,
          width,
          height,
        }),
      );
    } finally {
      command.shaderProgram.destroy();
      target.destroy();
    }
  }
  async function fill(background = false, splitOtherFeature = false) {
    const model = scene.primitives.add(
      await Model.fromGltfAsync({
        url: "./Data/Models/glTF-2.0/PlanarFill/glTF/planar-fill-polygons.gltf",
        modelMatrix: Matrix4.fromTranslation(new Cartesian3(7000000, 0, 0)),
        imageBasedLighting: ibl,
        id: "planar-fill",
        gltfCallback: (gltf) => {
          const index = background
            ? 0
            : gltf.nodes.findIndex((n) => n.mesh === 15);
          gltf.scenes[0].nodes = [index];
          gltf.nodes[index].translation = [0, 0, 0];
          for (const mesh of gltf.meshes) {
            for (const primitive of mesh.primitives) {
              delete primitive.extensions?.EXT_mesh_primitive_edge_visibility;
            }
          }
          if (background) {
            gltf.materials[0].extensions.BENTLEY_materials_planar_fill.backgroundFill = true;
          }
          if (splitOtherFeature) {
            const primitives = gltf.meshes[15].primitives;
            const mesh =
              gltf.meshes.push({ primitives: [primitives.pop()] }) - 1;
            const node =
              gltf.nodes.push({ name: "OtherFeatureFill", mesh }) - 1;
            gltf.scenes[0].nodes.push(node);
          }
        },
      }),
    );
    await pollToPromise(() => {
      render();
      return model.ready;
    });
    render();
    return model;
  }
  [false, true].forEach(function (logarithmic) {
    it(`preserves planar fill feature order with logarithmic depth ${logarithmic}`, async function () {
      scene.logarithmicDepthBuffer = logarithmic;
      scene.logarithmicDepthFarToNearRatio = 1.5;
      await fill();
      const renderer = scene._sceneGISDeferred;
      const color = () => renderer._source.getColorTexture(0);
      expect(sample(color(), 32, 41).slice(0, 3)).toEqualEpsilon(
        [1, 0, 0],
        0.01,
      );
      expect(sample(color(), 19, 32).slice(0, 3)).toEqualEpsilon(
        [1, 0, 1],
        0.01,
      );
      expect(sample(renderer._linearDepth)[0]).toBeGreaterThan(19);
      expect(sample(renderer._linearDepth)[0]).toBeLessThan(20);
      expect(
        scene.frameState.commandList.some(
          (c) => c.pass === Pass.CESIUM_3D_TILE_PLANAR_FILL_ID,
        ),
      ).toBe(true);
      expect(scene.pick(new Cartesian2(32, 32)).id).toBe("planar-fill");
      const baseline = sample(color(), 32, 41);
      scene.farToNearRatio = 1.5;
      render();
      expect(renderer._multiFrustum).toBe(true);
      expect(sample(color(), 32, 41)).toEqualEpsilon(baseline, 0.001);
      expect(sample(renderer._linearDepth)[0]).toBeGreaterThan(19);
      expect(scene.context._gl.getError()).toBe(0);
    });
  });
  it("keeps background fill unlit while sharing ambient occlusion outputs", async function () {
    scene.backgroundColor = Color.BLUE;
    await fill(true);
    scene.postProcessStages.ambientOcclusion.enabled = true;
    render();
    const renderer = scene._sceneGISDeferred;
    expect(
      sample(renderer._source.getColorTexture(0)).slice(0, 3),
    ).toEqualEpsilon([0, 0, 1], 0.01);
    expect(sample(renderer._linearDepth)[0]).toBeGreaterThan(19);
    expect(renderer.materialExtensionDrawCount).toBe(0);
    expect(renderer._extensions).toBeUndefined();
    expect(scene.context._gl.getError()).toBe(0);
  });
  it("keeps coplanar feature ordering through every TAA projection sample", async function () {
    scene.logarithmicDepthBuffer = true;
    scene.camera.setView({
      destination: new Cartesian3(7000000, -8, -28),
      orientation: {
        direction: Cartesian3.normalize(
          new Cartesian3(0, 8, 28),
          new Cartesian3(),
        ),
        up: Cartesian3.normalize(new Cartesian3(0, 28, -8), new Cartesian3()),
      },
    });
    scene.camera.frustum = new PerspectiveFrustum({
      fov: Math.PI / 3,
      aspectRatio: 1,
      near: 0.1,
      far: 100,
    });
    const model = await fill(false, true);
    const color = () => scene._sceneGISDeferred._source.getColorTexture(0);
    expect(sample(color(), 24, 32).slice(0, 3)).toEqualEpsilon([1, 0, 1], 0.01);
    taa = new SceneGISTemporalAntialiasing({ scene, enabled: true });
    function expectSamples(x, y, expected) {
      for (let sampleIndex = 0; sampleIndex < 8; ++sampleIndex) {
        render();
        expect(sample(color(), x, y).slice(0, 3))
          .withContext(`TAA sample ${sampleIndex}`)
          .toEqualEpsilon(expected, 0.01);
      }
    }
    expectSamples(24, 32, [1, 0, 1]);
    // A real separation beyond raster precision must retain its depth ordering.
    const other = model.getNode("OtherFeatureFill");
    other.matrix = Matrix4.fromTranslation(new Cartesian3(0, 0.02, 0));
    expectSamples(24, 32, [1, 0, 0]);
    other.matrix = Matrix4.fromTranslation(new Cartesian3(0, -0.02, 0));
    expectSamples(24, 32, [1, 0, 1]);
    other.matrix = Matrix4.IDENTITY;
    scene.logarithmicDepthFarToNearRatio = 1.5;
    expectSamples(24, 32, [1, 0, 1]);
    expect(scene._sceneGISDeferred._multiFrustum).toBe(true);
    scene.logarithmicDepthBuffer = false;
    expectSamples(24, 32, [1, 0, 1]);
    scene.camera.frustum = new OrthographicFrustum({
      width: 20,
      aspectRatio: 1,
      near: 0.1,
      far: 100,
    });
    expectSamples(19, 32, [1, 0, 1]);
    expect(sample(color(), 32, 41).slice(0, 3)).toEqualEpsilon([1, 0, 0], 0.01);
    expect(scene.context._gl.getError()).toBe(0);
  });
  it("preserves native edge display modes with deferred surface color", async function () {
    const model = scene.primitives.add(
      await Model.fromGltfAsync({
        url: "./Data/Models/glTF-2.0/PlanarFill/glTF/planar-fill-polygons.gltf",
        modelMatrix: Matrix4.fromTranslation(new Cartesian3(7000000, 0, 0)),
        imageBasedLighting: ibl,
        id: "edge-model",
        gltfCallback: (gltf) => {
          gltf.scenes[0].nodes = [0];
          gltf.nodes[0].translation = [0, 0, 0];
          const primitive = gltf.meshes[gltf.nodes[0].mesh].primitives[0];
          primitive.extensions.EXT_mesh_primitive_edge_visibility.material =
            gltf.materials.length;
          gltf.materials.push({
            pbrMetallicRoughness: { baseColorFactor: [0, 1, 0, 1] },
          });
          delete gltf.materials[primitive.material].extensions
            .BENTLEY_materials_planar_fill;
        },
      }),
    );
    await pollToPromise(() => {
      render();
      return model.ready;
    });
    const color = () => scene._sceneGISDeferred._source.getColorTexture(0);
    const greenCount = (texture) =>
      sample(texture, 0, 0, 64, 64).filter(
        (value, i, a) => i % 4 === 1 && value > 0.8 && a[i - 1] < 0.1,
      ).length;
    for (const orthographic of [true, false]) {
      if (!orthographic) {
        scene.camera.frustum = new PerspectiveFrustum({
          fov: Math.PI / 3,
          aspectRatio: 1,
          near: 0.1,
          far: 40,
        });
      }
      model.edgeDisplayMode = EdgeDisplayMode.SURFACES_ONLY;
      render();
      expect(greenCount(color())).toBe(0);
      model.edgeDisplayMode = EdgeDisplayMode.SURFACES_AND_EDGES;
      render();
      expect(
        greenCount(scene._view.edgeFramebuffer.colorTexture),
      ).toBeGreaterThan(0);
      expect(greenCount(color())).toBeGreaterThan(0);
      expect(scene.pick(new Cartesian2(32, 32)).id).toBe("edge-model");
      scene.postProcessStages.ambientOcclusion.enabled = true;
      render();
      expect(greenCount(color())).toBeGreaterThan(0);
      scene.postProcessStages.ambientOcclusion.enabled = false;
      model.edgeDisplayMode = EdgeDisplayMode.EDGES_ONLY;
      render();
      expect(greenCount(color())).toBeGreaterThan(0);
      expect(scene._sceneGISDeferred.drawCount).toBe(0);
      expect(scene.context._gl.getError()).toBe(0);
    }
    const edgePixels = sample(color(), 0, 0, 64, 64);
    const edgeIndex = edgePixels.findIndex(
      (value, i) => i % 4 === 1 && value > 0.8 && edgePixels[i - 1] < 0.1,
    );
    const pixel = Math.floor(edgeIndex / 4);
    expect(
      scene.pick(new Cartesian2(pixel % 64, 63 - Math.floor(pixel / 64))).id,
    ).toBe("edge-model");
    scene.logarithmicDepthBuffer = true;
    scene.logarithmicDepthFarToNearRatio = 1.5;
    model.edgeDisplayMode = EdgeDisplayMode.SURFACES_AND_EDGES;
    render();
    expect(scene._sceneGISDeferred._multiFrustum).toBe(true);
    expect(greenCount(color())).toBeGreaterThan(0);
    const occluder = scene.primitives.add(
      new Primitive({
        asynchronous: false,
        geometryInstances: new GeometryInstance({
          geometry: BoxGeometry.fromDimensions({
            dimensions: new Cartesian3(20, 20, 1),
            vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
          }),
          modelMatrix: Matrix4.fromTranslation(new Cartesian3(7000000, 0, -5)),
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(Color.BLUE),
          },
        }),
        appearance: new PerInstanceColorAppearance({
          translucent: false,
          flat: true,
        }),
      }),
    );
    render();
    expect(greenCount(color())).toBe(0);
    scene.primitives.remove(occluder);
    render();
    expect(greenCount(color())).toBeGreaterThan(0);
    expect(scene.context._gl.getError()).toBe(0);
  });
});
