import {
  Cartesian2,
  Cartesian3,
  Cesium3DTileset,
  ClearCommand,
  Color,
  ContextLimits,
  CustomShader,
  ClassificationPrimitive,
  ClassificationType,
  BoxGeometry,
  GeometryInstance,
  ColorGeometryInstanceAttribute,
  DirectionalLight,
  DrawCommand,
  FramebufferManager,
  ImageBasedLighting,
  Matrix4,
  Model,
  OrthographicFrustum,
  Primitive,
  PerInstanceColorAppearance,
  Pass,
  PixelDatatype,
  Resource,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISDeferredMaterialExtensions", function () {
  let scene, ibl, custom;
  function render() {
    scene.renderForSpecs();
  }
  beforeEach(function () {
    scene = createScene({ canvas: createCanvas(64, 64), scene3DOnly: true });
    scene.highDynamicRange = true;
    scene.logarithmicDepthBuffer = false;
    scene.fog.enabled = false;
    scene.skyAtmosphere = scene.skyBox = scene.sun = scene.moon = undefined;
    scene.light = new DirectionalLight({
      direction: new Cartesian3(-0.3, -0.2, -1),
      intensity: 2,
    });
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
      far: 30,
    });
    scene.farToNearRatio = 10000;
    ibl = new ImageBasedLighting({
      imageBasedLightingFactor: new Cartesian2(0, 0),
    });
  });
  afterEach(function () {
    scene?.destroyForSpecs();
    custom?.destroy();
    ibl.destroy();
    scene = custom = undefined;
  });
  function sample(texture, x = 36) {
    const target = new FramebufferManager({
      pixelDatatype: PixelDatatype.FLOAT,
    });
    target.update(scene.context, 1, 1);
    const copy = scene.context.createViewportQuadCommand(
      `uniform sampler2D u_texture; void main() { out_FragColor = texelFetch(u_texture, ivec2(${x}, 32), 0); }`,
      {
        framebuffer: target.framebuffer,
        uniformMap: { u_texture: () => texture },
      },
    );
    try {
      copy.execute(scene.context);
      return Array.from(
        scene.context.readPixels({
          framebuffer: target.framebuffer,
          width: 1,
          height: 1,
        }),
      );
    } finally {
      copy.shaderProgram.destroy();
      target.destroy();
    }
  }
  function color(x = 36) {
    return sample(scene._sceneGISDeferred._source.getColorTexture(0), x);
  }
  async function model(kind, combined = false) {
    if (combined) {
      custom = new CustomShader({
        fragmentShaderText: `void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial m) {
        m.diffuse = vec3(0.2, 0.3, 0.4); m.specular = vec3(0.04, 0.1, 0.2);
        m.normalEC = normalize(vec3(0.1, 0.2, 1.0)); m.roughness = 0.45;
        m.specularWeight = 0.6; m.clearcoatFactor = 0.7; m.clearcoatRoughness = 0.3;
        m.clearcoatNormal = normalize(vec3(-0.2, 0.1, 1.0));
        m.anisotropicT = normalize(vec3(1.0, 0.3, 0.1));
        m.anisotropicB = normalize(vec3(-0.2, 1.0, 0.3)); m.anisotropyStrength = 0.8;
        m.alpha = step(32.0, gl_FragCoord.x);
      }`,
      });
    }
    const result = scene.primitives.add(
      await Model.fromGltfAsync({
        url: `./Data/Models/glTF-2.0/Box${kind}/glTF/Box${kind}.gltf`,
        modelMatrix: Matrix4.multiplyByUniformScale(
          Matrix4.fromTranslation(new Cartesian3(7000000, 0, 0)),
          3,
          new Matrix4(),
        ),
        imageBasedLighting: ibl,
        customShader: custom,
        gltfCallback: combined
          ? (gltf) => {
              gltf.extensionsUsed = [
                "KHR_materials_specular",
                "KHR_materials_clearcoat",
                "KHR_materials_anisotropy",
              ];
              const material = gltf.materials[0];
              material.extensions = {
                KHR_materials_specular: { specularFactor: 0.6 },
                KHR_materials_clearcoat: {
                  clearcoatFactor: 0.7,
                  clearcoatRoughnessFactor: 0.3,
                },
                KHR_materials_anisotropy: { anisotropyStrength: 0.8 },
              };
              material.alphaMode = "MASK";
              material.alphaCutoff = 0.5;
            }
          : undefined,
      }),
    );
    await pollToPromise(() => {
      render();
      return result.ready;
    });
    render();
    return result;
  }
  function nativeColor(model, x = 36) {
    // Draw the existing native command into a test-owned target as a BRDF oracle.
    const source = scene.frameState.commandList.find(
      (command) => command.owner === model,
    );
    const command = DrawCommand.shallowClone(
      source.derivedCommands.hdr.command,
    );
    const target = new FramebufferManager({
      pixelDatatype: PixelDatatype.HALF_FLOAT,
      depthStencil: true,
      supportsDepthTexture: true,
    });
    target.update(scene.context, 64, 64);
    try {
      new ClearCommand({
        color: Color.TRANSPARENT,
        depth: 1,
        stencil: 0,
        framebuffer: target.framebuffer,
      }).execute(scene.context);
      command.framebuffer = target.framebuffer;
      command.execute(scene.context);
      return sample(target.getColorTexture(), x);
    } finally {
      target.destroy();
    }
  }
  [
    ["Specular", 1],
    ["Clearcoat", 2],
    ["Anisotropy", 2],
  ].forEach(([kind, targets]) => {
    it(`preserves native ${kind} material textures and BRDF`, async function () {
      const subject = await model(kind);
      const renderer = scene._sceneGISDeferred;
      expect(renderer._extensions._colorAttachmentsLength).toBe(targets);
      expect(renderer.materialExtensionDrawCount).toBe(0);
      const actual = color();
      expect(actual.slice(0, 3).some((v) => v > 0.01)).toBe(true);
      expect(actual).toEqualEpsilon(nativeColor(subject), 0.005);
    });
  });
  it("preserves independent custom extension vectors and MASK across attachment overflow and lifecycle", async function () {
    const subject = await model("Anisotropy", true);
    const renderer = scene._sceneGISDeferred;
    expect(renderer._extensions._colorAttachmentsLength).toBe(4);
    expect(renderer.materialExtensionDrawCount).toBe(0);
    const expected = color();
    expect(expected).toEqualEpsilon(nativeColor(subject), 0.005);
    expect(sample(renderer._raw.getColorTexture(2), 28)[3]).toBe(0);
    const depth = renderer._source.depthStencilTexture;
    const limit = ContextLimits._maximumDrawBuffers;
    try {
      ContextLimits._maximumDrawBuffers = 4;
      render();
      expect(renderer._framebuffer.numberOfColorAttachments).toBe(4);
      expect(renderer.materialExtensionDrawCount).toBe(1);
      expect(color()).toEqualEpsilon(expected, 0.0001);
      expect(sample(renderer._extensions.getColorTexture(0))).toEqualEpsilon(
        [0.6, 0.7, 0.3, -0.19518],
        0.001,
      );
    } finally {
      ContextLimits._maximumDrawBuffers = limit;
    }
    render();
    expect(renderer.materialExtensionDrawCount).toBe(0);
    scene.farToNearRatio = 1.1;
    render();
    expect(renderer._multiFrustum).toBe(true);
    expect(renderer.materialExtensionDrawCount).toBe(renderer.drawCount);
    expect(color()).toEqualEpsilon(expected, 0.002);
    scene.farToNearRatio = 10000;
    render();
    expect(renderer.materialExtensionDrawCount).toBe(0);
    const old = renderer._extensions.getColorTexture();
    scene.canvas.width = 80;
    render();
    expect(old.isDestroyed()).toBe(true);
    const current = renderer._extensions.getColorTexture();
    scene.primitives.remove(subject);
    render();
    expect(current.isDestroyed()).toBe(true);
    expect(renderer._extensions).toBeUndefined();
    expect(depth.isDestroyed()).toBe(true);
    expect(scene.context._gl.getError()).toBe(0);
  });
  it("composes native primitive outline coverage after deferred lighting and releases its field", async function () {
    scene.primitives.add(
      new Primitive({
        asynchronous: false,
        geometryInstances: new GeometryInstance({
          geometry: BoxGeometry.fromDimensions({
            dimensions: new Cartesian3(8, 8, 0.1),
          }),
          modelMatrix: Matrix4.fromTranslation(new Cartesian3(7000000, 0, -2)),
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(Color.GRAY),
          },
        }),
        appearance: new PerInstanceColorAppearance({
          closed: true,
          translucent: false,
        }),
      }),
    );
    const subject = await model("WithPrimitiveOutline");
    const renderer = scene._sceneGISDeferred;
    expect(renderer._extensions._colorAttachmentsLength).toBe(1);
    const coverage = Array.from(
      { length: 64 },
      (_, x) => sample(renderer._extensions.getColorTexture(), x)[0],
    );
    const edge = coverage.findIndex((value) => value > 0.1);
    expect(edge).toBeGreaterThan(-1);
    expect(color(edge)).toEqualEpsilon(nativeColor(subject, edge), 0.005);
    subject.outlineColor = Color.BLUE.withAlpha(0.5);
    scene.postProcessStages.ambientOcclusion.enabled = true;
    render();
    expect(color(edge)).toEqualEpsilon(nativeColor(subject, edge), 0.005);
    subject.showOutline = false;
    render();
    expect(sample(renderer._extensions.getColorTexture(), edge)[0]).toBe(0);
    expect(color(edge)).toEqualEpsilon(nativeColor(subject, edge), 0.005);
    const texture = renderer._extensions.getColorTexture();
    scene.primitives.remove(subject);
    render();
    expect(texture.isDestroyed()).toBe(true);
  });

  it("keeps extension storage independent for translucent inverse classification and restores combined attachments", async function () {
    const url = new URL(
      "./Data/Models/glTF-2.0/BoxAnisotropy/glTF/BoxAnisotropy.gltf",
      window.location.href,
    );
    const gltf = await Resource.fetchJson(url.href);
    for (const entry of [...gltf.buffers, ...(gltf.images ?? [])]) {
      if (entry.uri) {
        entry.uri = new URL(entry.uri, url).href;
      }
    }
    gltf.extensionsUsed = [
      "KHR_materials_specular",
      "KHR_materials_clearcoat",
      "KHR_materials_anisotropy",
    ];
    gltf.materials[0].extensions = {
      KHR_materials_specular: { specularFactor: 0.6 },
      KHR_materials_clearcoat: {
        clearcoatFactor: 0.7,
        clearcoatRoughnessFactor: 0.3,
      },
      KHR_materials_anisotropy: { anisotropyStrength: 0.8 },
    };
    const json = {
      asset: { version: "1.1" },
      geometricError: 100,
      root: {
        boundingVolume: { box: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1] },
        geometricError: 0,
        transform: Matrix4.toArray(
          Matrix4.multiplyByUniformScale(
            Matrix4.fromTranslation(new Cartesian3(7000000, 0, 0)),
            3,
            new Matrix4(),
          ),
        ),
        content: {
          uri: `data:model/gltf+json;base64,${btoa(JSON.stringify(gltf))}`,
        },
      },
    };
    const tileset = scene.primitives.add(
      await Cesium3DTileset.fromUrl(
        `data:application/json;base64,${btoa(JSON.stringify(json))}`,
        { imageBasedLighting: ibl, environmentMapOptions: { enabled: false } },
      ),
    );
    const failures = [];
    tileset.tileFailed.addEventListener((error) =>
      failures.push(error.message),
    );
    await pollToPromise(
      () => {
        render();
        if (failures.length) {
          throw new Error(failures.join("; "));
        }
        return (
          tileset.tilesLoaded &&
          scene.frameState.commandList.some(
            (c) => c.pass === Pass.CESIUM_3D_TILE,
          )
        );
      },
      { timeout: 30000 },
    );
    render();
    const renderer = scene._sceneGISDeferred;
    const expected = color();
    scene.invertClassification = true;
    scene.invertClassificationColor = new Color(0.5, 0.25, 0.75, 0.5);
    render();
    expect(renderer._extensionCombined).toBe(false);
    expect(renderer.materialExtensionDrawCount).toBe(1);
    expect(renderer._inverse._extensions).not.toBe(renderer._extensions);
    expect(sample(renderer._inverse._color.getColorTexture())).toEqualEpsilon(
      expected,
      0.005,
    );
    expect(
      sample(renderer._inverse._extensions.getColorTexture(0)).slice(0, 3),
    ).toEqualEpsilon([0.6, 0.7, 0.3], 0.001);
    const volume = scene.primitives.add(
      new ClassificationPrimitive({
        geometryInstances: new GeometryInstance({
          geometry: BoxGeometry.fromDimensions({
            dimensions: new Cartesian3(1.2, 4, 4),
          }),
          modelMatrix: Matrix4.fromTranslation(new Cartesian3(7000000.5, 0, 0)),
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(
              Color.BLUE.withAlpha(0.5),
            ),
          },
        }),
        classificationType: ClassificationType.CESIUM_3D_TILE,
        asynchronous: false,
      }),
    );
    await pollToPromise(() => {
      render();
      return volume.ready;
    });
    render();
    expect(sample(renderer._inverse._mask.getColorTexture())[0]).toBe(1);
    expect(sample(renderer._raw.getColorTexture(2))[3]).toBeGreaterThan(0);
    expect(sample(renderer._extensions.getColorTexture(0))).toEqualEpsilon(
      sample(renderer._inverse._extensions.getColorTexture(0)),
      0.0001,
    );
    scene.primitives.remove(volume);
    const inverse = renderer._inverse._extensions.getColorTexture();
    scene.invertClassification = false;
    render();
    expect(inverse.isDestroyed()).toBe(true);
    expect(renderer.materialExtensionDrawCount).toBe(0);
    expect(color()).toEqualEpsilon(expected, 0.001);
  });
});
