import {
  Cartesian2,
  Cartesian3,
  CustomShader,
  DirectionalLight,
  HeadingPitchRange,
  ImageBasedLighting,
  JulianDate,
  Matrix4,
  Model,
  PixelFormat,
  Texture,
  Transforms,
  UniformType,
} from "../../../index.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISModelEnvironmentLighting", function () {
  for (const planar of [false, true]) {
    it(`lights a native ${planar ? "Planar" : "Globe"} PBR model with physical sources and cloud transmittance while preserving material and resource ownership`, async function () {
      const scene = createScene();
      const context = scene.context;
      const textures = [];
      const time = JulianDate.fromIso8601("2026-06-21T12:00:00Z");
      const recordKey = planar
        ? "_sceneGISPlanarLighting"
        : "_sceneGISGlobeLighting";
      let shader;
      function texture(rgba) {
        const result = new Texture({
          context,
          width: 2,
          height: 2,
          pixelFormat: PixelFormat.RGBA,
          source: {
            arrayBufferView: new Uint8Array([
              ...rgba,
              ...rgba,
              ...rgba,
              ...rgba,
            ]),
          },
        });
        textures.push(result);
        return result;
      }
      function pixel() {
        scene.renderForSpecs(time);
        return Array.from(
          context.readPixels({
            x: Math.floor(context.drawingBufferWidth / 2),
            y: Math.floor(context.drawingBufferHeight / 2),
            width: 1,
            height: 1,
          }),
        );
      }
      function modelProgram() {
        return scene.frameState.commandList.find((command) =>
          command.shaderProgram?._fragmentShaderSource.sources.some((source) =>
            source.includes("computePbrLighting"),
          ),
        ).shaderProgram;
      }
      try {
        scene.highDynamicRange = true;
        scene.fog.enabled = false;
        scene.skyAtmosphere = undefined;
        scene.sun = undefined;
        scene.moon = undefined;
        scene.skyBox = undefined;
        scene.light = new DirectionalLight({
          direction: planar
            ? new Cartesian3(0, 0, -1)
            : new Cartesian3(-1, 0, 0),
        });
        scene.camera.frustum.near = 0.1;
        const origin = planar
          ? new Cartesian3(20000000, -30000000, 100)
          : Cartesian3.fromDegrees(0, 0, 100);
        shader = new CustomShader({
          uniforms: {
            u_testDiffuse: { type: UniformType.FLOAT, value: 0.3 },
            u_testEmissive: { type: UniformType.FLOAT, value: 0.0 },
          },
          fragmentShaderText: `void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
          material.diffuse = vec3(u_testDiffuse);
          material.specular = vec3(0.0);
          material.roughness = 1.0;
          material.emissive = vec3(u_testEmissive);
        }`,
        });
        const model = scene.primitives.add(
          await Model.fromGltfAsync({
            url: "./Data/Models/glTF-2.0/Box/glTF/Box.gltf",
            modelMatrix: planar
              ? Matrix4.fromTranslation(origin)
              : Transforms.eastNorthUpToFixedFrame(origin),
            customShader: shader,
            imageBasedLighting: new ImageBasedLighting({
              imageBasedLightingFactor: new Cartesian2(1, 0),
            }),
          }),
        );
        // Keep the native comparison's diffuse source fixed while its async cube map would otherwise evolve.
        model.environmentMapManager.enabled = false;
        if (planar) {
          scene.camera.setView({
            destination: Cartesian3.add(
              origin,
              new Cartesian3(0, 0, 3),
              new Cartesian3(),
            ),
            orientation: {
              direction: new Cartesian3(0, 0, -1),
              up: Cartesian3.UNIT_Y,
            },
          });
        } else {
          scene.camera.lookAt(
            origin,
            new HeadingPitchRange(0, -Math.PI / 2, 3),
          );
        }
        await pollToPromise(
          () => {
            scene.renderForSpecs(time);
            return model.ready;
          },
          { timeout: 30000 },
        );
        const nativePixel = pixel();
        const nativeProgram = modelProgram();
        expect(nativePixel[0]).toBeGreaterThan(0);

        // A spatially constant atlas isolates optical-depth attenuation from producer noise.
        const record = {
          active: true,
          atlasTexture: texture([0, 255, 177, 0]),
          transmittanceTexture: texture(
            planar ? [51, 51, 51, 255] : [128, 160, 192, 255],
          ),
          irradianceTexture: texture(
            planar ? [128, 128, 128, 255] : [8, 12, 16, 255],
          ),
          matrices: Array.from({ length: 3 }, () =>
            Matrix4.fromScale(Cartesian3.ZERO),
          ),
          intervals: Array.from({ length: 3 }, () => new Cartesian2(0, 100000)),
          cascadeCount: 1,
          showCloudShadows: false,
          primaryLightDirection: planar ? Cartesian3.UNIT_Z : Cartesian3.UNIT_X,
          sunDirection: planar ? Cartesian3.UNIT_Z : Cartesian3.UNIT_X,
          cameraRelativePosition: new Cartesian3(
            0,
            0,
            scene.camera.positionWC.z,
          ),
          primaryLightScale: new Cartesian3(1, 1, 1),
          surfaceRadianceScale: 1,
          cloudTop: 4000,
        };
        scene.frameState[recordKey] = record;
        const lit = pixel();
        const physicalProgram = modelProgram();
        expect(physicalProgram).not.toBe(nativeProgram);
        expect(physicalProgram._fragmentShaderSource.defines).toContain(
          "SCENEGIS_MODEL_LIGHTING",
        );
        expect(physicalProgram._fragmentShaderSource.defines).toContain(
          "SCENEGIS_MODEL_DIFFUSE_SKY",
        );
        expect(lit).not.toEqual(nativePixel);
        record.showCloudShadows = true;
        const shadowed = pixel();
        expect(shadowed[0]).toBeLessThan(lit[0]);
        expect(modelProgram()).toBe(physicalProgram);

        record.primaryLightScale = Cartesian3.ZERO;
        const sky = pixel();
        record.showCloudShadows = false;
        expect(pixel()).toEqual(sky);
        expect(sky[0]).toBeGreaterThan(0);
        record.surfaceRadianceScale = 2;
        expect(pixel()[0]).toBeGreaterThan(sky[0]);
        expect(modelProgram()).toBe(physicalProgram);

        if (planar) {
          const physicalIrradiance = record.irradianceTexture;
          record.irradianceTexture = texture([0, 0, 0, 255]);
          record.sunDirection = new Cartesian3(0, 0, -1);
          const readableNight = pixel();
          expect(readableNight[0]).toBeGreaterThan(0);
          expect(readableNight[2]).toBeGreaterThan(readableNight[0]);
          record.showCloudShadows = !record.showCloudShadows;
          expect(pixel()).toEqual(readableNight);
          expect(modelProgram()).toBe(physicalProgram);
          record.irradianceTexture = physicalIrradiance;
          record.sunDirection = Cartesian3.UNIT_Z;
        }

        shader.setUniform("u_testDiffuse", 0);
        shader.setUniform("u_testEmissive", 0.2);
        const emissive = pixel();
        record.showCloudShadows = true;
        record.primaryLightScale = new Cartesian3(1, 1, 1);
        expect(pixel()).toEqual(emissive);

        shader.setUniform("u_testDiffuse", 0.3);
        shader.setUniform("u_testEmissive", 0);
        scene.frameState[recordKey] = undefined;
        expect(pixel()).toEqual(nativePixel);
        expect(modelProgram()._fragmentShaderSource.defines).not.toContain(
          "SCENEGIS_MODEL_LIGHTING",
        );
        textures.forEach((value) => expect(value.isDestroyed()).toBe(false));
        scene.frameState[recordKey] = record;
        expect(pixel()[0]).toBeGreaterThan(0);
        expect(modelProgram()._fragmentShaderSource.defines).toContain(
          "SCENEGIS_MODEL_LIGHTING",
        );
        model.imageBasedLighting.sphericalHarmonicCoefficients = Array.from(
          { length: 9 },
          (_, index) =>
            index === 0 ? new Cartesian3(0.3, 0.2, 0.1) : new Cartesian3(),
        );
        model.lightColor = new Cartesian3(0.5, 0.5, 0.5);
        record.surfaceRadianceScale = 0;
        record.showCloudShadows = false;
        const authoredLight = pixel();
        expect(modelProgram()._fragmentShaderSource.defines).not.toContain(
          "SCENEGIS_MODEL_DIFFUSE_SKY",
        );
        record.showCloudShadows = true;
        expect(pixel()[0]).toBeLessThan(authoredLight[0]);
        model.lightColor = Cartesian3.ZERO;
        const authoredSky = pixel();
        expect(authoredSky[0]).toBeGreaterThan(0);
        record.surfaceRadianceScale = 64;
        expect(pixel()).toEqual(authoredSky);
        scene.frameState[recordKey] = undefined;
        expect(pixel()).toEqual(authoredSky);
      } finally {
        scene.frameState[recordKey] = undefined;
        scene.destroyForSpecs();
        textures.forEach((value) => {
          expect(value.isDestroyed()).toBe(false);
          value.destroy();
        });
        shader?.destroy();
      }
    }, 120000);
  }
});
