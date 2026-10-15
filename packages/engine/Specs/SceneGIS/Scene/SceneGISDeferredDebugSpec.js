import {
  BlendOption,
  Cartesian2,
  Cartesian3,
  Color,
  Matrix4,
  OrthographicFrustum,
  PointPrimitiveCollection,
  BoxGeometry,
  Primitive,
  GeometryInstance,
  ColorGeometryInstanceAttribute,
  PerInstanceColorAppearance,
  DirectionalLight,
  ShadowMode,
  SceneGISTemporalAntialiasing,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";

describe("SceneGIS/Scene/SceneGISDeferredDebug", function () {
  let scene;
  beforeEach(function () {
    scene = createScene({ canvas: createCanvas(32, 32), scene3DOnly: true });
    scene.camera.setView({
      destination: new Cartesian3(7000000, 0, 10),
      orientation: {
        direction: new Cartesian3(0, 0, -1),
        up: Cartesian3.UNIT_Y,
      },
    });
    scene.camera.frustum = new OrthographicFrustum({
      width: 4,
      aspectRatio: 1,
      near: 0.1,
      far: 2000,
    });
    spyOn(Color, "fromRandom").and.returnValue(new Color(0.5, 0.25, 0.125, 1));
  });
  afterEach(function () {
    scene.destroyForSpecs();
  });
  function pixel() {
    return scene.context.readPixels({ x: 16, y: 16, width: 1, height: 1 });
  }
  function point(color, z = 0, blendOption = BlendOption.OPAQUE) {
    const points = scene.primitives.add(
      new PointPrimitiveCollection({ blendOption }),
    );
    points.add({
      position: new Cartesian3(7000000, 0, z),
      pixelSize: 16,
      color,
      id: "point",
    });
    return points;
  }

  it("tints completed opaque color without changing material and releases disabled targets", function () {
    point(Color.WHITE);
    scene.renderForSpecs();
    const renderer = scene._sceneGISDeferred;
    const raw = () =>
      scene.context.readPixels({
        framebuffer: renderer._raw.framebuffer,
        x: 16,
        y: 16,
        width: 1,
        height: 1,
      });
    const material = raw();
    scene.debugShowCommands = true;
    scene.renderForSpecs();
    expect(raw()).toEqual(material);
    expect(pixel()).toEqualEpsilon(
      [0.5, 0.25, 0.125]
        .map((v) => Math.round(255 * Math.pow(v, 1 / scene.gamma)))
        .concat(255),
      1,
    );
    expect(renderer.drawCount).toBe(1);
    expect(renderer.debugTintDrawCount).toBe(1);
    expect(renderer.debugTintScreenCount).toBe(0);
    expect(renderer.debugTintByteLength).toBe(32 * 32 * 8);
    expect(scene.pick(new Cartesian2(16, 16)).id).toBe("point");
    const target = renderer._debugTint.target.getColorTexture();
    scene.debugShowCommands = false;
    scene.renderForSpecs();
    expect(pixel()).toEqual([255, 255, 255, 255]);
    expect(target.isDestroyed()).toBe(true);
    expect(renderer.debugTintByteLength).toBe(0);
    expect(renderer.debugTintDrawCount).toBe(0);
    expect(scene.context._gl.getError()).toBe(0);
  });

  it("keeps OIT alpha unchanged while tinting both opaque and transparent colors", function () {
    point(Color.BLUE);
    point(new Color(1, 0, 0, 0.5), 1, BlendOption.TRANSLUCENT);
    scene.renderForSpecs();
    const baseline = Array.from(pixel());
    scene.debugShowCommands = true;
    scene.renderForSpecs();
    expect(scene._environmentState.useOIT).toBe(true);
    expect(pixel()[0]).toEqualEpsilon(
      baseline[0] * Math.pow(0.5, 1 / scene.gamma),
      2,
    );
    expect(pixel()[2]).toEqualEpsilon(
      baseline[2] * Math.pow(0.125, 1 / scene.gamma),
      2,
    );
    expect(pixel()[3]).toBe(255);
    expect(scene._sceneGISDeferred.debugTintDrawCount).toBe(1);
    expect(scene.context._gl.getError()).toBe(0);
  });

  it("retains frustum colors and cascade debug without restoring forward opaque draws", function () {
    scene.primitives.add(
      new Primitive({
        asynchronous: false,
        shadows: ShadowMode.ENABLED,
        modelMatrix: Matrix4.fromTranslation(new Cartesian3(7000000, 0, 0)),
        geometryInstances: new GeometryInstance({
          geometry: BoxGeometry.fromDimensions({
            dimensions: new Cartesian3(2, 2, 1),
            vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
          }),
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(Color.WHITE),
          },
        }),
        appearance: new PerInstanceColorAppearance({ translucent: false }),
      }),
    );
    scene.renderForSpecs();
    scene.debugShowFrustums = true;
    scene.renderForSpecs();
    expect(pixel()[0]).toBeGreaterThan(0);
    expect(pixel()[1]).toBe(0);
    expect(pixel()[2]).toBe(0);
    scene.debugShowFrustums = false;
    scene.light = new DirectionalLight({ direction: new Cartesian3(0, 0, -1) });
    scene.shadowMap.enabled = true;
    scene.shadowMap.debugCascadeColors = true;
    scene.renderForSpecs();
    const cascade = Array.from(pixel()).slice(0, 3);
    expect(Math.max(...cascade)).toBeGreaterThan(0);
    expect(Math.min(...cascade)).toBe(0);
    expect(scene._sceneGISDeferred.debugTintDrawCount).toBeGreaterThan(0);
    expect(scene._sceneGISDeferred.drawCount).toBeGreaterThan(0);
    expect(scene.context._gl.getError()).toBe(0);
  });

  it("shares tint storage across frustums and TAA and releases it with no opaque contents", function () {
    const near = point(Color.WHITE);
    const far = point(Color.BLUE, -100);
    scene.debugShowCommands = true;
    scene.renderForSpecs();
    const baseline = pixel();
    scene.farToNearRatio = scene.logarithmicDepthFarToNearRatio = 2;
    scene.renderForSpecs();
    expect(scene._view.frustumCommandsList.length).toBeGreaterThan(1);
    expect(pixel()).toEqualEpsilon(baseline, 1);
    const renderer = scene._sceneGISDeferred;
    expect(renderer.debugTintByteLength).toBe(32 * 32 * 8);
    scene.highDynamicRange = true;
    scene.renderForSpecs();
    const hdrBaseline = pixel();
    const taa = new SceneGISTemporalAntialiasing({ scene, enabled: true });
    scene.renderForSpecs();
    expect(pixel()).toEqualEpsilon(hdrBaseline, 1);
    expect(scene.pick(new Cartesian2(16, 16)).id).toBe("point");
    const texture = renderer._debugTint.target.getColorTexture();
    scene.canvas.width = 48;
    scene.renderForSpecs();
    expect(texture.isDestroyed()).toBe(true);
    expect(renderer.debugTintByteLength).toBe(48 * 32 * 8);
    near.show = far.show = false;
    point(new Color(1, 0, 0, 0.5), 1, BlendOption.TRANSLUCENT);
    scene.renderForSpecs();
    expect(renderer.debugTintByteLength).toBe(0);
    expect(renderer.debugTintDrawCount).toBe(0);
    expect(scene.context._gl.getError()).toBe(0);
    taa.destroy();
  });
});
