import {
  _SceneGISGBuffer as GBuffer,
  Cartesian2,
  Cartesian3,
  Color,
  CustomShader,
  FramebufferManager,
  ImageBasedLighting,
  LightingModel,
  Matrix4,
  Model,
  OrthographicFrustum,
  PerspectiveFrustum,
  PixelDatatype,
  Primitive,
  GeometryInstance,
  BoxGeometry,
  PerInstanceColorAppearance,
  ColorGeometryInstanceAttribute,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISGBuffer", function () {
  let scene, probe, custom, ibl;
  function setup(samples = 1) {
    scene = createScene({ canvas: createCanvas(64, 64), scene3DOnly: true });
    scene.highDynamicRange = true;
    scene.msaaSamples = samples;
    scene.fog.enabled = false;
    scene.skyAtmosphere = scene.skyBox = scene.sun = scene.moon = undefined;
    scene.camera.setView({
      destination: new Cartesian3(7000000, 0, 10),
      orientation: {
        direction: new Cartesian3(0, 0, -1),
        up: new Cartesian3(0, 1, 0),
      },
    });
    scene.camera.frustum = new OrthographicFrustum({
      width: 8,
      aspectRatio: 1,
      near: 0.1,
      far: 30,
    });
    scene.farToNearRatio = 10000;
    scene.logarithmicDepthBuffer = false;
    probe = new GBuffer(scene);
  }
  function render() {
    scene.renderForSpecs();
  }
  async function model(mask = false, unlit = false, clearcoat = false) {
    custom = new CustomShader({
      lightingModel: unlit ? LightingModel.UNLIT : LightingModel.PBR,
      fragmentShaderText: `void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial m) {
        m.diffuse=vec3(0.2,0.3,0.4); m.specular=vec3(0.04,0.1,0.2);
        m.roughness=0.45; m.occlusion=0.7; m.emissive=vec3(3.0,1.0,0.5);
        m.normalEC=vec3(0.0,0.0,1.0); ${mask ? "m.alpha=step(32.0,gl_FragCoord.x);" : ""}
      }`,
    });
    ibl = new ImageBasedLighting({
      imageBasedLightingFactor: new Cartesian2(0, 0),
    });
    const value = scene.primitives.add(
      await Model.fromGltfAsync({
        url: clearcoat
          ? "./Data/Models/glTF-2.0/BoxClearcoat/glTF/BoxClearcoat.gltf"
          : "./Data/Models/glTF-2.0/Box/glTF/Box.gltf",
        modelMatrix: Matrix4.multiplyByUniformScale(
          Matrix4.fromTranslation(new Cartesian3(7000000, 0, 0)),
          3,
          new Matrix4(),
        ),
        customShader: custom,
        imageBasedLighting: ibl,
        gltfCallback: (gltf) => {
          if (mask) {
            gltf.materials[0].alphaMode = "MASK";
            gltf.materials[0].alphaCutoff = 0.5;
          }
        },
      }),
    );
    await pollToPromise(
      () => {
        render();
        return value.ready;
      },
      { timeout: 30000 },
    );
    render();
    return value;
  }
  function sample(texture, x = 32, y = 32) {
    const target = new FramebufferManager({
      pixelDatatype: PixelDatatype.FLOAT,
    });
    target.update(scene.context, 1, 1);
    const command = scene.context.createViewportQuadCommand(
      "uniform sampler2D u_texture; uniform vec2 u_pixel; void main(){out_FragColor=texelFetch(u_texture,ivec2(u_pixel),0);}",
      {
        framebuffer: target.framebuffer,
        uniformMap: {
          u_texture: () => texture,
          u_pixel: () => new Cartesian2(x, y),
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
  afterEach(function () {
    scene?.destroyForSpecs();
    custom?.destroy();
    ibl?.destroy();
    scene = probe = custom = ibl = undefined;
  });
  [1, 4].forEach((samples) => {
    it(`captures native material and all attachments at ${samples} samples without changing main color or picking`, async function () {
      setup(samples);
      const value = await model();
      const before = Array.from(
        scene.context.readPixels({ x: 32, y: 32, width: 1, height: 1 }),
      );
      const picked = scene.pick(new Cartesian2(32, 32));
      probe.enabled = true;
      render();
      expect(probe.ready).toBe(true);
      expect(probe._raw.numSamples).toBe(samples);
      expect(sample(probe._raw.getColorTexture(0))).toEqualEpsilon(
        [0.2, 0.3, 0.4, 0.7],
        0.001,
      );
      expect(sample(probe._raw.getColorTexture(1))).toEqualEpsilon(
        [0, 0, 1, 0.45],
        0.001,
      );
      expect(sample(probe._raw.getColorTexture(2))).toEqualEpsilon(
        [0.04, 0.1, 0.2, 1],
        0.001,
      );
      expect(sample(probe._raw.getColorTexture(3))).toEqualEpsilon(
        [3, 1, 0.5, 1],
        0.001,
      );
      expect(sample(probe._depth.getColorTexture())[0]).toBeGreaterThan(0);
      expect(sample(probe._depth.getColorTexture())[0]).toBeLessThan(10);
      render();
      expect(
        Array.from(
          scene.context.readPixels({ x: 32, y: 32, width: 1, height: 1 }),
        ),
      ).toEqual(before);
      expect(scene.pick(new Cartesian2(32, 32)).primitive).toBe(
        picked.primitive,
      );
      expect(picked.primitive).toBe(value);
      expect(scene.context._gl.getError()).toBe(0);
    });
  });
  it("retains alpha-mask holes and clears vacated material and linear depth", async function () {
    setup();
    await model(true);
    probe.enabled = true;
    render();
    expect(sample(probe._raw.getColorTexture(3), 28)[3]).toBe(0);
    expect(sample(probe._raw.getColorTexture(3), 36)[3]).toBe(1);
    scene.primitives.removeAll();
    render();
    expect(sample(probe._raw.getColorTexture(3), 36)[3]).toBe(0);
    expect(sample(probe._depth.getColorTexture(), 36)[0]).toBe(0);
    expect(probe.ready).toBe(false);
    expect(probe.drawCount).toBe(0);
  });
  it("decodes perspective logarithmic depth and exposes fractional MSAA edge coverage", async function () {
    setup(4);
    const value = await model();
    scene.camera.frustum = new PerspectiveFrustum({
      fov: Math.PI / 3,
      aspectRatio: 1,
      near: 0.1,
      far: 30,
    });
    scene.logarithmicDepthBuffer = true;
    value.modelMatrix[12] += 0.04;
    probe.enabled = true;
    render();
    expect(sample(probe._depth.getColorTexture())[0]).toEqualEpsilon(
      8.5,
      0.002,
    );
    const target = new FramebufferManager({
      pixelDatatype: PixelDatatype.FLOAT,
    });
    target.update(scene.context, 64, 64);
    const command = scene.context.createViewportQuadCommand(
      "uniform sampler2D u_texture; void main(){out_FragColor=texelFetch(u_texture,ivec2(gl_FragCoord.xy),0);}",
      {
        framebuffer: target.framebuffer,
        uniformMap: { u_texture: () => probe._raw.getColorTexture(3) },
      },
    );
    try {
      command.execute(scene.context);
      const pixels = scene.context.readPixels({
        framebuffer: target.framebuffer,
        width: 64,
        height: 64,
      });
      const partial = [];
      for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] > 0 && pixels[i] < 1) {
          partial.push(pixels[i]);
        }
      }
      expect(partial.length).toBeGreaterThan(0);
      // Values are sample averages, not a promise of correctly shaded deferred edges.
      expect(partial.every((value) => [0.25, 0.5, 0.75].includes(value))).toBe(
        true,
      );
    } finally {
      command.shaderProgram.destroy();
      target.destroy();
    }
  });
  it("marks unlit materials and lets non-Model opaque geometry occlude them", async function () {
    setup();
    await model(false, true);
    probe.enabled = true;
    render();
    expect(sample(probe._raw.getColorTexture(2))[3]).toBe(2);
    scene.primitives.add(
      new Primitive({
        asynchronous: false,
        geometryInstances: new GeometryInstance({
          geometry: BoxGeometry.fromDimensions({
            dimensions: new Cartesian3(3, 3, 1),
            vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
          }),
          modelMatrix: Matrix4.fromTranslation(new Cartesian3(7000000, 0, 4)),
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(Color.RED),
          },
        }),
        appearance: new PerInstanceColorAppearance({
          translucent: false,
          flat: true,
        }),
      }),
    );
    render();
    render();
    expect(sample(probe._raw.getColorTexture(3))[3]).toBe(0);
    expect(sample(probe._depth.getColorTexture())[0]).toBeLessThan(7);
  });
  it("allocates lazily, replaces resized targets and releases before scene destruction", async function () {
    setup();
    expect(probe._raw).toBeUndefined();
    await model();
    probe.enabled = true;
    render();
    const first = probe._raw.getColorTexture();
    scene.canvas.width = 96;
    render();
    expect(first.isDestroyed()).toBe(true);
    const resized = probe._raw.getColorTexture();
    expect(resized.width).toBe(96);
    probe.enabled = false;
    expect(resized.isDestroyed()).toBe(true);
    expect(probe.ready).toBe(false);
    probe.enabled = true;
    probe.debugView = 2;
    render();
    render();
    const last = probe._raw.getColorTexture();
    const oldProbe = probe;
    scene.destroyForSpecs();
    scene = undefined;
    expect(last.isDestroyed()).toBe(true);
    expect(oldProbe.isDestroyed()).toBe(true);
  });
  it("rejects unrepresented clearcoat only when the diagnostic probe is enabled", async function () {
    setup();
    await model(false, false, true);
    probe.enabled = true;
    expect(render).toThrowDeveloperError();
    expect(probe.ready).toBe(false);
    expect(probe._raw).toBeUndefined();
    probe.enabled = false;
    expect(render).not.toThrow();
  });
});
