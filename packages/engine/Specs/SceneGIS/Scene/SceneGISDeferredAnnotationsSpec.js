import {
  BillboardCollection,
  BlendOption,
  BoxGeometry,
  Cartesian2,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  FramebufferManager,
  GeometryInstance,
  LabelCollection,
  Matrix4,
  OrthographicFrustum,
  PerInstanceColorAppearance,
  PixelDatatype,
  Primitive,
  PerspectiveFrustum,
  SceneGISTemporalAntialiasing,
  SceneGISWaterSurface,
  PolygonHierarchy,
  VerticalOrigin,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISDeferredAnnotations", function () {
  let scene;
  function setup(orderIndependentTranslucency = true) {
    scene = createScene({
      canvas: createCanvas(64, 64),
      scene3DOnly: true,
      orderIndependentTranslucency,
    });
    scene.highDynamicRange = true;
    scene.logarithmicDepthBuffer = false;
    scene.fog.enabled = false;
    scene.skyAtmosphere = scene.skyBox = scene.sun = scene.moon = undefined;
    scene.camera.setView({
      destination: new Cartesian3(7000000, 0, 10),
      orientation: {
        direction: new Cartesian3(0, 0, -1),
        up: Cartesian3.UNIT_Y,
      },
    });
    scene.camera.frustum = new OrthographicFrustum({
      width: 8,
      aspectRatio: 1,
      near: 0.1,
      far: 40,
    });
    scene.farToNearRatio = 10000;
  }
  beforeEach(function () {
    setup();
  });
  afterEach(function () {
    scene.destroyForSpecs();
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
      `uniform sampler2D u_texture; void main() { out_FragColor = texelFetch(u_texture, ivec2(gl_FragCoord.xy) + ivec2(${x}, ${y}), 0); }`,
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
  function box(z, color) {
    return scene.primitives.add(
      new Primitive({
        asynchronous: false,
        geometryInstances: new GeometryInstance({
          geometry: BoxGeometry.fromDimensions({
            dimensions: new Cartesian3(4, 4, 0.2),
            vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
          }),
          modelMatrix: Matrix4.fromTranslation(new Cartesian3(7000000, 0, z)),
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(color),
          },
        }),
        appearance: new PerInstanceColorAppearance({
          translucent: color.alpha < 1,
          flat: true,
          closed: true,
        }),
      }),
    );
  }
  async function annotation(alpha = 0.5) {
    const image = document.createElement("canvas");
    image.width = image.height = 4;
    const ctx = image.getContext("2d");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 4, 4);
    const collection = scene.primitives.add(
      new BillboardCollection({ blendOption: BlendOption.TRANSLUCENT }),
    );
    const billboard = collection.add({
      position: new Cartesian3(7000000, 0, 2),
      image,
      width: 20,
      height: 20,
      color: new Color(0, 1, 0, alpha),
      id: "annotation",
    });
    await pollToPromise(() => {
      render();
      return collection.ready;
    });
    return { collection, billboard };
  }
  it("keeps a translucent panel visible through a half-transparent annotation", async function () {
    box(0, Color.RED);
    box(1, new Color(0, 0, 1, 0.7));
    await annotation();
    const renderer = scene._sceneGISDeferred;
    const composed = sample(
      scene._view.sceneFramebuffer._colorFramebuffer.getColorTexture(),
    );
    expect(composed[2]).toBeGreaterThan(0.1);
    // A fractional background is not an opaque occluder.
    expect(sample(renderer.opaqueDepthTexture)[0]).toEqualEpsilon(9.9, 0.01);
    expect(scene.context._gl.getError()).toBe(0);
  });
  it("composes fractional annotation coverage through native sorted transparency", async function () {
    scene.destroyForSpecs();
    setup(false);
    box(0, Color.RED);
    box(1, new Color(0, 0, 1, 0.7));
    await annotation();
    const composed = sample(
      scene._view.globeDepth.colorFramebufferManager.getColorTexture(),
    );
    expect(composed[2]).toBeGreaterThan(0.1);
    expect(
      sample(scene._sceneGISDeferred.opaqueDepthTexture)[0],
    ).toEqualEpsilon(9.9, 0.01);
    expect(scene.context._gl.getError()).toBe(0);
  });
  it("blends a half-transparent annotation with the water behind it", async function () {
    box(0, Color.RED);
    scene.primitives.add(
      new SceneGISWaterSurface({
        polygonHierarchy: new PolygonHierarchy([
          new Cartesian3(-3, -3, 0),
          new Cartesian3(3, -3, 0),
          new Cartesian3(3, 3, 0),
          new Cartesian3(-3, 3, 0),
        ]),
        modelMatrix: Matrix4.fromTranslation(new Cartesian3(7000000, 0, 1)),
        waveAmplitude: 0,
        foamIntensity: 0,
        reflections: false,
        refractionStrength: 0,
      }),
    );
    const { collection } = await annotation();
    collection.show = false;
    render();
    const target = () =>
      scene._view.sceneFramebuffer._colorFramebuffer.getColorTexture();
    const behind = sample(target());
    collection.show = true;
    render();
    const actual = sample(target());
    expect(actual.slice(0, 3)).toEqualEpsilon(
      [behind[0] * 0.5, behind[1] * 0.5 + 0.5, behind[2] * 0.5],
      0.02,
    );
    expect(scene.context._gl.getError()).toBe(0);
  });
  it("separates solid billboard coverage from fractional transparency", async function () {
    box(0, Color.RED);
    const { collection, billboard } = await annotation();
    const renderer = scene._sceneGISDeferred;
    const color = sample(
      scene._view.sceneFramebuffer._colorFramebuffer.getColorTexture(),
    );
    expect(color.slice(0, 3)).toEqualEpsilon([0.5, 0.5, 0], 0.01);
    expect(renderer.annotationDrawCount).toBe(1);
    expect(renderer.drawCount).toBe(1);
    expect(sample(renderer._raw.getColorTexture())[0]).toBe(1);
    expect(sample(renderer.opaqueDepthTexture)[0]).toEqualEpsilon(9.9, 0.01);
    expect(sample(renderer._linearDepth)[0]).toEqualEpsilon(9.9, 0.01);
    expect(scene.pick(new Cartesian2(32, 32)).id).toBe("annotation");
    const behind = box(1, new Color(0, 0, 1, 0.7));
    render();
    expect(
      sample(
        scene._view.sceneFramebuffer._colorFramebuffer.getColorTexture(),
      )[2],
    ).toBeGreaterThan(0.1);
    billboard.color = new Color(0, 1, 0, 1);
    render();
    expect(
      sample(
        scene._view.sceneFramebuffer._colorFramebuffer.getColorTexture(),
      ).slice(0, 3),
    ).toEqualEpsilon([0, 1, 0], 0.01);
    expect(sample(renderer.opaqueDepthTexture)[0]).toEqualEpsilon(8, 0.01);
    behind.modelMatrix = Matrix4.multiplyByTranslation(
      behind.modelMatrix,
      new Cartesian3(0, 0, 2),
      new Matrix4(),
    );
    render();
    expect(
      scene.context.readPixels({ x: 32, y: 32, width: 1, height: 1 })[2],
    ).toBeGreaterThan(80);
    behind.show = false;
    billboard.color = new Color(0, 1, 0, 0);
    render();
    expect(sample(renderer.opaqueDepthTexture)[0]).toEqualEpsilon(9.9, 0.01);
    const depth = renderer.opaqueDepthTexture;
    scene.primitives.remove(collection);
    render();
    expect(depth.isDestroyed()).toBe(true);
    expect(renderer.opaqueDepthTexture).toBe(renderer._linearDepth);
  });
  it("retains label picking with independent opaque glyph and transparent background passes", async function () {
    box(0, Color.RED);
    const labels = scene.primitives.add(new LabelCollection());
    labels.add({
      text: "X",
      font: "20px sans-serif",
      position: new Cartesian3(7000000, 0, 2),
      showBackground: true,
      backgroundColor: new Color(0, 1, 0, 0.5),
      backgroundPadding: new Cartesian2(12, 12),
      verticalOrigin: VerticalOrigin.CENTER,
      id: "label",
    });
    await pollToPromise(() => {
      render();
      return (
        labels._glyphBillboardCollection.ready &&
        labels._backgroundBillboardCollection.ready
      );
    });
    const renderer = scene._sceneGISDeferred;
    expect(renderer.annotationDrawCount).toBe(2);
    expect(renderer.drawCount).toBe(1);
    expect(sample(renderer.opaqueDepthTexture)[0]).toEqualEpsilon(9.9, 0.01);
    const coverage = sample(renderer.opaqueDepthTexture, 16, 16, 32, 32).filter(
      (value, i) => i % 4 === 0 && value > 0,
    );
    expect(Math.min(...coverage)).toEqualEpsilon(8, 0.01);
    expect(scene.pick(new Cartesian2(32, 32)).id).toBe("label");
  });
  it("preserves logarithmic multi-frustum annotation depth in temporal outputs and releases resized targets", async function () {
    scene.camera.frustum = new PerspectiveFrustum({
      fov: Math.PI / 3,
      aspectRatio: 1,
      near: 0.1,
      far: 1000,
    });
    scene.farToNearRatio = 1.5;
    scene.logarithmicDepthBuffer = true;
    scene.logarithmicDepthFarToNearRatio = 1.5;
    box(0, Color.RED);
    const far = box(-90, Color.BLUE);
    far.modelMatrix = Matrix4.fromTranslation(new Cartesian3(15, 0, 0));
    const taa = new SceneGISTemporalAntialiasing({ scene, enabled: true });
    try {
      const { collection } = await annotation(1);
      const renderer = scene._sceneGISDeferred;
      expect(renderer._multiFrustum).toBe(true);
      const actual = sample(renderer.opaqueDepthTexture);
      expect(actual[0]).toEqualEpsilon(8, 0.03);
      expect(actual[1]).toBeLessThan(0);
      expect(sample(taa._state.depth.getColorTexture())[0]).toEqualEpsilon(
        actual[0],
        0.001,
      );
      expect(renderer._annotations.byteLength).toBe(64 * 64 * 8);
      expect(renderer.annotationDepthCopyCount).toBeGreaterThan(0);
      const before = renderer.opaqueDepthTexture;
      scene.canvas.width = 48;
      scene.canvas.height = 48;
      render();
      expect(before.isDestroyed()).toBe(true);
      expect(renderer._annotations.byteLength).toBe(48 * 48 * 8);
      collection.show = false;
      render();
      expect(renderer._annotations).toBeUndefined();
    } finally {
      taa.destroy();
    }
  });
  it("excludes annotations from water refraction while publishing their final temporal depth", async function () {
    box(0, Color.RED);
    const taa = new SceneGISTemporalAntialiasing({ scene, enabled: true });
    const water = scene.primitives.add(
      new SceneGISWaterSurface({
        polygonHierarchy: new PolygonHierarchy([
          new Cartesian3(-3, -3, 0),
          new Cartesian3(3, -3, 0),
          new Cartesian3(3, 3, 0),
          new Cartesian3(-3, 3, 0),
        ]),
        modelMatrix: Matrix4.fromTranslation(new Cartesian3(7000000, 0, 1)),
        waveAmplitude: 0,
        foamIntensity: 0,
        reflections: false,
        refractionStrength: 0,
      }),
    );
    try {
      const { collection, billboard } = await annotation(1);
      const renderer = scene._sceneGISDeferred;
      for (const enabled of [false, true]) {
        scene.postProcessStages.ambientOcclusion.enabled = enabled;
        render();
        const state = scene.frameState._sceneGISWater;
        expect(state.ready).toBe(true);
        expect(state.depthTexture).toBe(renderer._linearDepth);
        expect(sample(state.depthTexture)[0]).toEqualEpsilon(9.9, 0.01);
        expect(sample(taa._state.depth.getColorTexture())[0]).toEqualEpsilon(
          8,
          0.01,
        );
        expect(state.depthTexture).not.toBe(taa._state.depth.getColorTexture());
        expect(sample(state.colorTexture).slice(0, 2)).toEqualEpsilon(
          [1, 0],
          0.02,
        );
        expect(scene.context._gl.getError()).toBe(0);
      }
      water.modelMatrix = Matrix4.fromTranslation(
        new Cartesian3(7000000, 0, 3),
      );
      render();
      expect(sample(taa._state.depth.getColorTexture())[0]).toEqualEpsilon(
        7,
        0.01,
      );
      expect(
        sample(scene.frameState._sceneGISWater.depthTexture)[0],
      ).toEqualEpsilon(9.9, 0.01);
      const target = () =>
        scene._view.sceneFramebuffer._colorFramebuffer.getColorTexture();
      collection.show = false;
      render();
      const waterOnly = sample(target()).slice(0, 3);
      collection.show = true;
      for (const alpha of [0.5, 1]) {
        billboard.color = new Color(0, 1, 0, alpha);
        render();
        expect(sample(target()).slice(0, 3)).toEqualEpsilon(waterOnly, 0.01);
      }
      expect(scene.context._gl.getError()).toBe(0);
    } finally {
      taa.destroy();
    }
  });

  it("retains near-plane depth overrides without letting far labels overwrite nearer opaque segments", async function () {
    box(0, Color.RED);
    const { billboard } = await annotation(1);
    billboard.disableDepthTestDistance = Number.POSITIVE_INFINITY;
    render();
    const renderer = scene._sceneGISDeferred;
    expect(sample(renderer.opaqueDepthTexture)[0]).toEqualEpsilon(
      scene._view.frustumCommandsList[0].near,
      0.001,
    );
    scene.camera.frustum = new PerspectiveFrustum({
      fov: Math.PI / 3,
      aspectRatio: 1,
      near: 0.1,
      far: 1000,
    });
    scene.farToNearRatio = 1.5;
    billboard.position = new Cartesian3(7000000, 0, -90);
    render();
    expect(renderer._multiFrustum).toBe(true);
    expect(
      sample(renderer._source.getColorTexture(0)).slice(0, 3),
    ).toEqualEpsilon([1, 0, 0], 0.01);
    expect(sample(renderer.opaqueDepthTexture)[0]).toEqualEpsilon(9.9, 0.01);
    expect(scene.context._gl.getError()).toBe(0);
  });
});
