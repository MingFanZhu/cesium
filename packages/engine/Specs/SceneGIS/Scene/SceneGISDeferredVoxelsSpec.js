import {
  BoxGeometry,
  Cartesian2,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  CustomShader,
  FramebufferManager,
  PixelDatatype,
  GeometryInstance,
  Matrix3,
  Matrix4,
  PolygonHierarchy,
  SceneGISWaterSurface,
  SceneGISTemporalAntialiasing,
  OrthographicFrustum,
  PerspectiveFrustum,
  PerInstanceColorAppearance,
  Primitive,
  VoxelPrimitive,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISDeferredVoxels", function () {
  let scene;
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
      width: 12,
      aspectRatio: 1,
      near: 0.1,
      far: 100,
    });
    scene.farToNearRatio = 10000;
  });
  afterEach(function () {
    scene.destroyForSpecs();
  });
  function render() {
    scene.renderForSpecs();
  }
  function color() {
    const target = new FramebufferManager({
      pixelDatatype: PixelDatatype.FLOAT,
    });
    target.update(scene.context, 1, 1);
    const command = scene.context.createViewportQuadCommand(
      "uniform sampler2D u_color;void main(){out_FragColor=texelFetch(u_color,ivec2(32),0);}",
      {
        framebuffer: target.framebuffer,
        uniformMap: {
          u_color: () => scene._sceneGISDeferred._source.getColorTexture(0),
        },
      },
    );
    try {
      command.execute(scene.context);
      return Array.from(
        scene.context.readPixels({
          framebuffer: target.framebuffer,
          width: 1,
          height: 1,
        }),
      );
    } finally {
      command.shaderProgram.destroy();
      target.destroy();
    }
  }
  function box(z) {
    return scene.primitives.add(
      new Primitive({
        asynchronous: false,
        geometryInstances: new GeometryInstance({
          geometry: BoxGeometry.fromDimensions({
            dimensions: new Cartesian3(10, 10, 0.2),
            vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
          }),
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(Color.RED),
          },
        }),
        modelMatrix: Matrix4.fromTranslation(new Cartesian3(7000000, 0, z)),
        appearance: new PerInstanceColorAppearance({
          translucent: false,
          flat: true,
        }),
      }),
    );
  }
  async function volume() {
    const voxel = scene.primitives.add(
      new VoxelPrimitive({
        calculateStatistics: true,
        modelMatrix: Matrix4.multiplyByUniformScale(
          Matrix4.fromTranslation(new Cartesian3(7000000, 0, 0)),
          3,
          new Matrix4(),
        ),
        customShader: new CustomShader({
          fragmentShaderText:
            "void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) { material.diffuse=vec3(0.0,1.0,0.0); material.alpha=0.05; }",
        }),
      }),
    );
    voxel.stepSize = 0.25;
    await pollToPromise(() => {
      render();
      return voxel._traversal?._initialTilesLoaded;
    });
    return voxel;
  }
  it("composes native volume color after lighting and clips against unified opaque depth", async function () {
    const surface = box(5);
    const voxel = await volume();
    const full = color();
    expect(full[1]).toBeGreaterThan(0.01);
    expect(full[0]).toBeGreaterThan(0.01);
    const pick = () => scene.pick(new Cartesian2(32, 32), 1, 1)?.primitive;
    expect(pick()).toBe(voxel);
    expect(scene.pickVoxel(new Cartesian2(32, 32), 1, 1)?.primitive).toBe(
      voxel,
    );
    const renderer = scene._sceneGISDeferred;
    expect(renderer.drawCount).toBe(1);
    const move = (z) => {
      surface.modelMatrix = Matrix4.fromTranslation(
        new Cartesian3(7000000, 0, z),
      );
      render();
    };
    move(0);
    expect(color()[1]).toBeGreaterThan(0);
    expect(color()[1]).toBeLessThan(full[1]);
    expect(pick()).toBe(voxel);
    move(-5);
    expect(color().slice(0, 3)).toEqualEpsilon([1, 0, 0], 0.01);
    expect(pick()).toBe(surface);
    voxel.depthTest = false;
    render();
    expect(color()[1]).toBeGreaterThan(0.01);
    expect(pick()).toBe(voxel);
    voxel.depthTest = true;
    scene.camera.frustum = new PerspectiveFrustum({
      fov: Math.PI / 3,
      aspectRatio: 1,
      near: 0.1,
      far: 100,
    });
    scene.logarithmicDepthBuffer = true;
    scene.logarithmicDepthFarToNearRatio = 1.5;
    move(5);
    expect(renderer._multiFrustum).toBe(true);
    expect(color()[1]).toBeGreaterThan(0.01);
    expect(pick()).toBe(voxel);
    move(-5);
    expect(color().slice(0, 3)).toEqualEpsilon([1, 0, 0], 0.01);
    expect(pick()).toBe(surface);
    surface.show = false;
    render();
    expect(scene.pick(new Cartesian2(32, 32)).primitive).toBe(voxel);
    expect(scene.context._gl.getError()).toBe(0);
    scene.primitives.remove(voxel);
    expect(voxel.isDestroyed()).toBe(true);
  });
  it("keeps foreground volume visible over water and clips the portion behind water", async function () {
    box(8);
    const voxel = await volume();
    const matrix = (z) =>
      Matrix4.fromRotationTranslation(
        Matrix3.fromRotationX(Math.PI),
        new Cartesian3(7000000, 0, z),
      );
    const water = scene.primitives.add(
      new SceneGISWaterSurface({
        polygonHierarchy: new PolygonHierarchy([
          new Cartesian3(-4, -4, 0),
          new Cartesian3(4, -4, 0),
          new Cartesian3(4, 4, 0),
          new Cartesian3(-4, 4, 0),
        ]),
        modelMatrix: matrix(5),
        waveAmplitude: 0,
        foamIntensity: 0,
        reflections: false,
        refractionStrength: 0,
      }),
    );
    render();
    const frontVolume = color();
    const pick = () => scene.pick(new Cartesian2(32, 32), 1, 1)?.primitive;
    expect(pick()).toBe(voxel);
    const initialDepth =
      scene.frameState._sceneGISWater.finalDepth.depth.getColorTexture();
    expect(scene.frameState._sceneGISWater.finalDepth.byteLength).toBe(
      64 * 64 * 4,
    );
    voxel.show = false;
    render();
    const waterOnly = color();
    expect(frontVolume[1]).toBeGreaterThan(waterOnly[1] + 0.01);
    voxel.show = true;
    water.modelMatrix = matrix(-5);
    render();
    const frontWater = color();
    expect(pick()).toBe(water);
    voxel.show = false;
    render();
    expect(frontWater).toEqualEpsilon(color(), 0.01);
    voxel.show = true;
    water.modelMatrix = matrix(0);
    render();
    const partial = color();
    expect(pick()).toBe(voxel);
    voxel.show = false;
    render();
    expect(partial[1]).toBeGreaterThan(color()[1] + 0.01);
    expect(initialDepth.isDestroyed()).toBe(true);
    voxel.show = true;
    render();
    const borrowed =
      scene.frameState._sceneGISWater.finalDepth.depth.getColorTexture();
    const taa = new SceneGISTemporalAntialiasing({ scene, enabled: true });
    try {
      scene.camera.frustum = new PerspectiveFrustum({
        fov: Math.PI / 3,
        aspectRatio: 1,
        near: 0.1,
        far: 100,
      });
      scene.logarithmicDepthBuffer = true;
      scene.logarithmicDepthFarToNearRatio = 1.5;
      water.modelMatrix = matrix(5);
      render();
      expect(scene.frameState._sceneGISWater.finalDepth).toBeUndefined();
      expect(borrowed.isDestroyed()).toBe(true);
      expect(scene._sceneGISDeferred._multiFrustum).toBe(true);
      expect(color()[1]).toBeGreaterThan(0.1);
      expect(pick()).toBe(voxel);
      taa.enabled = false;
      render();
      const resized =
        scene.frameState._sceneGISWater.finalDepth.depth.getColorTexture();
      scene.canvas.width = scene.canvas.height = 48;
      render();
      expect(resized.isDestroyed()).toBe(true);
      expect(scene.frameState._sceneGISWater.finalDepth.byteLength).toBe(
        48 * 48 * 4,
      );
      water.show = false;
      render();
      expect(scene.frameState._sceneGISWater.finalDepth).toBeUndefined();
    } finally {
      taa.destroy();
    }
    expect(scene.context._gl.getError()).toBe(0);
  });
});
