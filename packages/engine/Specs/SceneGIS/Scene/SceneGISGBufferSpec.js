import {
  _SceneGISGBuffer as GBuffer,
  BoxGeometry,
  Cartesian2,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  CustomShader,
  FramebufferManager,
  GeometryInstance,
  ImageBasedLighting,
  LightingModel,
  Matrix4,
  Model,
  OrthographicFrustum,
  PerInstanceColorAppearance,
  PixelDatatype,
  Primitive,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISGBuffer", function () {
  let scene, renderer, probe, custom, ibl;
  function setup() {
    scene = createScene({ canvas: createCanvas(64, 64), scene3DOnly: true });
    scene.highDynamicRange = true;
    scene.msaaSamples = 1;
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
    renderer = scene._sceneGISDeferred;
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
  function uniform(name) {
    // Native stages replace their public uniform descriptors after initialization.
    const map = probe._debug._uniformMap ?? probe._debug.uniforms;
    return map[name]();
  }
  afterEach(function () {
    scene?.destroyForSpecs();
    custom?.destroy();
    ibl?.destroy();
    scene = renderer = probe = custom = ibl = undefined;
  });

  it("borrows the actual material targets without changing main color, picking or geometry submissions", async function () {
    setup();
    const value = await model();
    const before = Array.from(
      scene.context.readPixels({ x: 32, y: 32, width: 1, height: 1 }),
    );
    const target = renderer._raw.getColorTexture();
    const bytes = renderer.byteLength;
    const draw = spyOn(scene.context, "draw").and.callThrough();
    function geometryDraws() {
      return draw.calls.allArgs().filter((args) => args[0].owner === value)
        .length;
    }
    render();
    const count = geometryDraws();
    expect(count).toBeGreaterThan(0);
    draw.calls.reset();
    probe.enabled = true;
    render();
    expect(geometryDraws()).toBe(count);
    expect(probe.ready).toBe(true);
    expect(uniform("u_diffuse")).toBe(target);
    expect(uniform("u_depth")).toBe(renderer._linearDepth);
    expect(renderer.byteLength).toBe(bytes);
    expect(
      Array.from(
        scene.context.readPixels({ x: 32, y: 32, width: 1, height: 1 }),
      ),
    ).toEqual(before);
    expect(sample(target)).toEqualEpsilon([0.2, 0.3, 0.4, 0.7], 0.001);
    expect(sample(renderer._raw.getColorTexture(1))).toEqualEpsilon(
      [0, 0, 1, 0.45],
      0.001,
    );
    expect(sample(renderer._raw.getColorTexture(3)).slice(0, 3)).toEqualEpsilon(
      [3, 1, 0.5],
      0.001,
    );
    expect(scene.pick(new Cartesian2(32, 32)).primitive).toBe(value);
    probe.debugView = 2;
    await pollToPromise(() => {
      render();
      return probe._debug.ready;
    });
    draw.calls.reset();
    render();
    expect(geometryDraws()).toBe(count);
    const normal = scene.context.readPixels({
      x: 32,
      y: 32,
      width: 1,
      height: 1,
    });
    expect(Array.from(normal)).toEqualEpsilon([128, 128, 255, 255], 1);
    expect(scene.context._gl.getError()).toBe(0);
  });

  it("uses material occupancy for MASK holes and stops publishing empty-frame textures", async function () {
    setup();
    await model(true);
    probe.enabled = true;
    probe.debugView = 8;
    await pollToPromise(() => {
      render();
      return probe._debug.ready;
    });
    render();
    expect(sample(uniform("u_specular"), 28)[3]).toBe(0);
    expect(sample(uniform("u_specular"), 36)[3]).toBeGreaterThan(0);
    expect(
      Array.from(
        scene.context.readPixels({ x: 28, y: 32, width: 1, height: 1 }),
      ).slice(0, 3),
    ).toEqual([0, 0, 0]);
    expect(
      Array.from(
        scene.context.readPixels({ x: 36, y: 32, width: 1, height: 1 }),
      ).slice(0, 3),
    ).toEqual([255, 255, 255]);
    scene.primitives.removeAll();
    render();
    expect(probe.ready).toBe(false);
    expect(uniform("u_diffuse")).toBe(scene.context.defaultTexture);
    expect(uniform("u_depth")).toBe(scene.context.defaultTexture);
    expect(scene.context._gl.getError()).toBe(0);
  });

  [true, false].forEach((flat) => {
    it(`shows occupied negative groups for flat=${flat} primitives`, async function () {
      setup();
      scene.primitives.add(
        new Primitive({
          asynchronous: false,
          geometryInstances: new GeometryInstance({
            geometry: BoxGeometry.fromDimensions({
              dimensions: new Cartesian3(3, 3, 1),
              vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
            }),
            modelMatrix: Matrix4.fromTranslation(new Cartesian3(7000000, 0, 0)),
            attributes: {
              color: ColorGeometryInstanceAttribute.fromColor(Color.RED),
            },
          }),
          appearance: new PerInstanceColorAppearance({
            flat,
            translucent: false,
          }),
        }),
      );
      probe.enabled = true;
      probe.debugView = 8;
      await pollToPromise(() => {
        render();
        return renderer.ready && probe._debug.ready;
      });
      render();
      expect(sample(uniform("u_specular"))[3]).toBeLessThan(0);
      expect(
        Array.from(
          scene.context.readPixels({ x: 32, y: 32, width: 1, height: 1 }),
        ).slice(0, 3),
      ).toEqual([255, 255, 255]);
    });
  });

  it("follows resized targets and never destroys the renderer's borrowed resources", async function () {
    setup();
    await model();
    probe.enabled = true;
    render();
    const first = uniform("u_diffuse");
    scene.canvas.width = 96;
    render();
    expect(first.isDestroyed()).toBe(true);
    const current = uniform("u_diffuse");
    expect(current.width).toBe(96);
    probe.enabled = false;
    expect(current.isDestroyed()).toBe(false);
    expect(probe.ready).toBe(false);
    probe.destroy();
    expect(current.isDestroyed()).toBe(false);
    expect(scene._sceneGISDeferred).toBe(renderer);
    render();
    expect(renderer.ready).toBe(true);
    probe = new GBuffer(scene);
    probe.enabled = true;
    scene.primitives.removeAll();
    render();
    expect(current.isDestroyed()).toBe(true);
    expect(probe.ready).toBe(false);
    expect(uniform("u_diffuse")).toBe(scene.context.defaultTexture);
    await model();
    render();
    expect(probe.ready).toBe(true);
    const last = renderer._raw.getColorTexture();
    const oldProbe = probe;
    scene.destroyForSpecs();
    scene = undefined;
    expect(last.isDestroyed()).toBe(true);
    expect(oldProbe.isDestroyed()).toBe(true);
  });

  it("borrows the Scene renderer and requires one inspector per scene", function () {
    scene = createScene();
    renderer = scene._sceneGISDeferred;
    probe = new GBuffer(scene);
    expect(() => new GBuffer(scene)).toThrowDeveloperError();
    expect(() => {
      probe.enabled = 1;
    }).toThrowDeveloperError();
    expect(probe.ready).toBe(false);
  });
});
