import {
  BoundingRectangle,
  Framebuffer,
  PassState,
  PixelDatatype,
  PixelFormat,
  Sampler,
  SceneGISEnvironmentEffects,
  Texture,
  Texture3D,
  TextureWrap,
} from "../../../index.js";
import createScene from "../../../../../Specs/createScene.js";
import { createEnvironmentEffectsProgramForSpecs } from "../../../Source/SceneGIS/Scene/_private/_SceneGISEnvironmentEffectsRenderer.js";
import materialSource from "../../../Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISGlobeClouds.js";
import cloudSource from "../../../Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISVolumetricClouds.js";

describe("SceneGIS/Scene/SceneGISCloudMaterial", function () {
  let scene;
  let resources;

  function decodeHalf(bits) {
    const exponent = (bits >> 10) & 31;
    const fraction = bits & 1023;
    if (exponent === 31) {
      return fraction
        ? Number.NaN
        : (bits >> 15 ? -1 : 1) * Number.POSITIVE_INFINITY;
    }
    return (
      (bits >> 15 ? -1 : 1) *
      (exponent === 0
        ? fraction * 2 ** -24
        : (1 + fraction / 1024) * 2 ** (exponent - 15))
    );
  }

  function draw(
    fragment,
    globe = true,
    library = materialSource,
    uniforms = {},
  ) {
    const context = scene.context;
    const output = new Texture({
      context,
      width: 7,
      height: 1,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.HALF_FLOAT,
    });
    const framebuffer = new Framebuffer({ context, colorTextures: [output] });
    const program = createEnvironmentEffectsProgramForSpecs(
      context,
      fragment,
      globe,
      undefined,
      cloudSource,
      library,
    );
    const command = context.createViewportQuadCommand(
      program._fragmentShaderSource,
      { framebuffer, uniformMap: uniforms },
    );
    const pass = new PassState(context);
    pass.viewport = new BoundingRectangle(0, 0, 7, 1);
    try {
      command.execute(context, pass);
      const values = Array.from(
        context.readPixels({ framebuffer, width: 7, height: 1 }),
        decodeHalf,
      );
      return Array.from({ length: 7 }, (_, i) =>
        values.slice(4 * i, 4 * i + 4),
      );
    } finally {
      command.shaderProgram.destroy();
      program.destroy();
      framebuffer.destroy();
    }
  }

  beforeEach(function () {
    resources = [];
    scene = createScene();
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      pending("Floating-point cloud rendering is unavailable");
    }
    scene.renderForSpecs();
  });

  afterEach(function () {
    resources.forEach((resource) => resource.destroy());
    scene.destroyForSpecs();
  });

  it("preserves ascending and descending remap endpoints and interpolation", function () {
    const pixels = draw(`precision highp float;
      precision highp sampler3D;
      void main() {
          float fraction = (floor(gl_FragCoord.x) - 1.0) * 0.25;
          float value = fraction * 0.3;
          out_FragColor = vec4(
              sceneGISGlobeCloudRemap(value, 0.0, 0.3),
              sceneGISGlobeCloudRemap(value, 0.3, 0.0),
              sceneGISGlobeCloudRemap(0.15, 0.0, 0.3), 1.0);
      }`);
    for (let i = 0; i < pixels.length; i++) {
      const ascending = Math.max(0, Math.min(1, (i - 1) * 0.25));
      expect(pixels[i]).toEqualEpsilon(
        [ascending, 1 - ascending, 0.5, 1],
        0.001,
      );
    }
  });

  it("keeps visible and shadow density continuous at the bottom turbulence boundary in both worlds", function () {
    const context = scene.context;
    const sampler = new Sampler({
      wrapS: TextureWrap.REPEAT,
      wrapT: TextureWrap.REPEAT,
      wrapR: TextureWrap.REPEAT,
    });
    const shape = new Texture3D({
      context,
      width: 32,
      height: 1,
      depth: 1,
      pixelFormat: PixelFormat.RED,
      pixelDatatype: PixelDatatype.UNSIGNED_BYTE,
      sampler,
      source: {
        arrayBufferView: Uint8Array.from({ length: 32 }, (_, i) =>
          Math.round(32 + (200 * i) / 31),
        ),
      },
    });
    resources.push(shape);
    const makeTexture = (bytes) => {
      const result = new Texture({
        context,
        width: 1,
        height: 1,
        pixelFormat: PixelFormat.RGBA,
        pixelDatatype: PixelDatatype.UNSIGNED_BYTE,
        sampler,
        source: { arrayBufferView: new Uint8Array(bytes) },
      });
      resources.push(result);
      return result;
    };
    const weather = makeTexture([255, 255, 255, 255]);
    const turbulence = makeTexture([255, 128, 128, 255]);
    const uniforms = {
      u_testShape: () => shape,
      u_testWeather: () => weather,
      u_testTurbulence: () => turbulence,
      u_sceneGISGlobeCloudTurbulence: () => true,
    };
    const fragment = `precision highp float;
      precision highp sampler3D;
      uniform sampler3D u_testShape;
      uniform sampler2D u_testWeather;
      uniform sampler2D u_testTurbulence;
      void main() {
          // The first layer's 30% boundary is 750 + 650 * .3 = 945 metres.
          float height = 945.0 + (floor(gl_FragCoord.x) - 3.0) * 0.5;
          #ifdef SCENEGIS_GLOBE
          vec3 position = vec3(1000.0, SCENEGIS_BOTTOM_RADIUS + height, 0.0);
          #else
          vec3 position = vec3(1000.0, 0.0, height);
          #endif
          float gradient;
          float shadowGradient;
          float density = sceneGISGlobeCloudDensitySample(
              u_testShape, u_testShape, u_testWeather, u_testTurbulence,
              position, vec3(0.0), vec2(0.0), 750.0, 4500.0,
              0.6, 0, 0.0, 0.0, 0.5, gradient);
          float shadowDensity = sceneGISGlobeCloudShadowDensitySample(
              u_testShape, u_testShape, u_testWeather, u_testTurbulence,
              position, vec3(0.0), vec2(0.0), 750.0, 4500.0,
              0.6, 0, 0.0, 0.0, 0.5, shadowGradient);
          out_FragColor = vec4(density, shadowDensity, gradient, shadowGradient);
      }`;
    const oldMaterial = materialSource.replace(
      "(value - minimum) / denominator",
      "(value - minimum) / max(maximum - minimum, 1.0e-4)",
    );
    expect(oldMaterial).not.toBe(materialSource);
    for (const globe of [true, false]) {
      const actual = draw(fragment, globe, materialSource, uniforms);
      const former = draw(fragment, globe, oldMaterial, uniforms);
      let formerJump = 0;
      for (let i = 0; i < actual.length; i++) {
        expect(actual[i][0]).withContext(`globe=${globe}`).toBeGreaterThan(0);
        expect(actual[i][1]).toEqual(actual[i][0]);
        expect(actual[i][3]).toEqual(actual[i][2]);
        if (i > 0) {
          expect(Math.abs(actual[i][0] - actual[i - 1][0]))
            .withContext(`globe=${globe}, densities=${JSON.stringify(actual)}`)
            .toBeLessThan(0.001);
          formerJump = Math.max(
            formerJump,
            Math.abs(former[i][0] - former[i - 1][0]),
          );
        }
      }
      expect(formerJump)
        .withContext(
          `old remap must reproduce the material cut, globe=${globe}`,
        )
        .toBeGreaterThan(0.001);
    }
  });
});
