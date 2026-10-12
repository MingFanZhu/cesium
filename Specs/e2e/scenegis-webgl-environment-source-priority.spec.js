import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import {
  createDefaultContainer,
  write,
  VK_FORMAT_R16G16B16A16_SFLOAT,
} from "ktx-parse";

function cubeAsset(second) {
  const container = createDefaultContainer();
  Object.assign(container, {
    vkFormat: VK_FORMAT_R16G16B16A16_SFLOAT,
    typeSize: 2,
    pixelWidth: 2,
    pixelHeight: 2,
    faceCount: 6,
    levelCount: 1,
  });
  const values = new Uint16Array(2 * 2 * 6 * 4);
  for (let i = 0; i < values.length; i += 4) {
    values.set(
      second
        ? [0x3800, 0x4000, 0x4400, 0x3c00]
        : [0x4400, 0x3c00, 0x3800, 0x3c00],
      i,
    );
  }
  const levelData = new Uint8Array(values.buffer);
  container.levels = [
    { levelData, uncompressedByteLength: levelData.byteLength },
  ];
  return Buffer.from(write(container));
}

async function initialize(page, backend, mode) {
  await page.route("**/webgl-backport-fixture.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><link rel="stylesheet" href="/Build/CesiumUnminified/Widgets/widgets.css"><style>html,body,#view{margin:0;width:640px;height:400px;overflow:hidden}</style><div id="view"></div><script src="/Build/CesiumUnminified/Cesium.js"></script>',
    }),
  );
  await page.goto("/webgl-backport-fixture.html");
  await page.waitForFunction(() => window.Cesium !== undefined);
  await page.evaluate(
    async ({ backend, mode }) => {
      try {
        const C = window.Cesium;
        const options = {
          useDefaultRenderLoop: false,
          globe: false,
          baseLayer: false,
          skyBox: false,
          skyAtmosphere: false,
          scene3DOnly: true,
          orderIndependentTranslucency: false,
          msaaSamples: 1,
        };
        for (const name of [
          "animation",
          "timeline",
          "baseLayerPicker",
          "sceneModePicker",
          "projectionPicker",
          "geocoder",
          "homeButton",
          "navigationHelpButton",
          "fullscreenButton",
          "vrButton",
          "selectionIndicator",
          "infoBox",
        ]) {
          options[name] = false;
        }
        const viewer = (window.viewer = new C.Viewer("view", options));
        viewer.resize();
        const scene = viewer.scene;
        scene.rethrowRenderErrors = false;
        scene.highDynamicRange = true;
        scene.postProcessStages.fxaa.enabled = false;
        scene.fog.enabled = false;
        scene.sunBloom = false;
        scene.light = new C.DirectionalLight({
          direction: new C.Cartesian3(0, 0, -1),
          intensity: 0,
        });
        viewer.clock.shouldAnimate = false;
        viewer.clock.currentTime = C.JulianDate.fromIso8601(
          "2026-06-21T12:00:00Z",
        );
        window.errors = [];
        scene.renderError.addEventListener((scene, error) =>
          window.errors.push(error.message),
        );
        if (mode === "planar") {
          const world = new C.SceneGISPlanarWorld({
            maximumLevel: 0,
            coordinateSystem: new C.SceneGISPlanarCoordinateSystem({
              extent: new C.SceneGISPlanarExtent({
                minimumX: -20000,
                maximumX: 20000,
                minimumY: -20000,
                maximumY: 20000,
              }),
            }),
          });
          scene._initializeWorld(world);
          window.planarEnvironment = new C.SceneGISPlanarEnvironment({
            world,
            sunDirection: new C.Cartesian3(0.6, 0.3, 0.8),
            moonDirection: new C.Cartesian3(-0.6, -0.3, -0.8),
          });
          scene.controllerHost.registerController(
            window.planarEnvironment,
            viewer.container,
          );
        } else if (mode === "globe") {
          const globe = new C.Globe();
          globe.showGroundAtmosphere = false;
          globe.showWaterEffect = false;
          globe.enableLighting = false;
          scene.globe = globe;
          scene.light = new C.SunLight({ intensity: 0 });
        }
        if (mode !== "none") {
          window.effects = new C.SceneGISEnvironmentEffects({
            mode,
            world: mode === "planar" ? scene.world : undefined,
            enabled: true,
            showHeightFog: false,
            showClouds: false,
            showCloudShadows: false,
            showCrepuscularRays: false,
            showBloom: false,
            showLensFlare: false,
            showStars: false,
          });
          window.effects.errorEvent.addEventListener((controller, error) =>
            window.errors.push(error.message),
          );
          scene.controllerHost.registerController(
            window.effects,
            viewer.container,
          );
        }
        const origin = new C.Cartesian3(
          0,
          0,
          mode === "globe"
            ? scene.ellipsoid.radii.z + 100
            : mode === "planar"
              ? 100
              : 0,
        );
        scene.camera.setView({
          destination: C.Cartesian3.add(
            origin,
            new C.Cartesian3(0, 0, 5),
            new C.Cartesian3(),
          ),
          orientation: {
            direction: new C.Cartesian3(0, 0, -1),
            up: C.Cartesian3.UNIT_Y,
          },
        });
        scene.camera.frustum.near = 0.1;
        scene.camera.frustum.far = 5e8;
        window.model = await C.Model.fromGltfAsync({
          url: "/Specs/Data/Models/glTF-2.0/Box/glTF/Box.gltf",
          modelMatrix: C.Matrix4.fromTranslation(origin),
        });
        window.model.environmentMapManager.enabled = false;
        window.model.imageBasedLighting.imageBasedLightingFactor =
          new C.Cartesian2(1, 0);
        scene.primitives.add(window.model);
        window.coefficients = (x, y, z) =>
          Array.from({ length: 9 }, (_, i) =>
            i === 0 ? new C.Cartesian3(x, y, z) : new C.Cartesian3(),
          );
        window.sample = async () => {
          viewer.render();
          return Array.from(
            scene.context.readPixels({ x: 320, y: 200, width: 1, height: 1 }),
          ).slice(0, 3);
        };
      } catch (error) {
        throw new Error(error.message, { cause: error });
      }
    },
    { backend, mode },
  );
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          try {
            window.viewer.render();
          } catch (error) {
            throw new Error(error.message, { cause: error });
          }
          if (window.errors.length) {
            throw new Error(window.errors.join("\n"));
          }
          return (
            window.model.ready && (!window.effects || window.effects.ready)
          );
        }),
      { timeout: 60000 },
    )
    .toBe(true);
}

async function readyMap(page, backend, model = false) {
  await expect
    .poll(() =>
      page.evaluate((model) => {
        window.viewer.render();
        return !!(
          model
            ? window.model.imageBasedLighting.specularEnvironmentCubeMap
            : window.viewer.scene._specularEnvironmentCubeMap
        )?.ready;
      }, model),
    )
    .toBe(true);
  await page.evaluate(() => window.viewer.render());
}

test.afterEach(async ({ page }) => {
  await page.evaluate(() => {
    const viewer = window.viewer;
    if (!viewer || viewer.isDestroyed()) {
      return;
    }
    for (const controller of [window.effects, window.planarEnvironment]) {
      if (controller?._element) {
        viewer.scene.controllerHost.unregisterController(
          controller,
          viewer.container,
        );
      }
    }
    viewer.destroy();
  });
});

{
  const backend = "webgl";
  for (const mode of ["none", "planar", "globe"]) {
    test(`${backend} ${mode} Model sources precede live Scene sources and defaults`, async ({
      page,
    }, testInfo) => {
      // Native physical shader compilation is synchronous and can exceed the default test timeout.
      test.setTimeout(120000);
      await page.route("**/scene-source-a.ktx2", (route) =>
        route.fulfill({ body: cubeAsset(false) }),
      );
      await page.route("**/scene-source-b.ktx2", (route) =>
        route.fulfill({ body: cubeAsset(true) }),
      );
      await initialize(page, backend, mode);
      const sh = await page.evaluate(async () => {
        const scene = window.viewer.scene,
          ibl = window.model.imageBasedLighting;
        const baseline = await window.sample();
        const a = window.coefficients(1, 2, 3),
          b = window.coefficients(4, 0.5, 0.2),
          c = window.coefficients(0.25, 4, 0.5);
        scene.sphericalHarmonicCoefficients = a;
        window.viewer.render();
        const sceneA = await window.sample();
        ibl.sphericalHarmonicCoefficients = b;
        const modelB = await window.sample();
        scene.sphericalHarmonicCoefficients = c;
        const override = await window.sample();
        ibl.sphericalHarmonicCoefficients = undefined;
        const sceneC = await window.sample();
        scene.sphericalHarmonicCoefficients = a;
        const replaced = await window.sample();
        a[0].x *= 0.5;
        const mutated = await window.sample();
        ibl.sphericalHarmonicCoefficients = a;
        scene.sphericalHarmonicCoefficients = undefined;
        const sameModel = await window.sample();
        ibl.sphericalHarmonicCoefficients = undefined;
        const cleared = await window.sample();
        return {
          baseline,
          sceneA,
          modelB,
          override,
          sceneC,
          replaced,
          mutated,
          sameModel,
          cleared,
          supported: scene.specularEnvironmentMapsSupported,
        };
      });
      expect(sh.supported).toBe(true);
      expect(sh.sceneA).not.toEqual(sh.baseline);
      expect(sh.modelB).not.toEqual(sh.sceneA);
      expect(sh.override).toEqual(sh.modelB);
      expect(sh.sceneC).not.toEqual(sh.modelB);
      expect(sh.replaced).toEqual(sh.sceneA);
      expect(sh.mutated).not.toEqual(sh.sceneA);
      expect(sh.sameModel).toEqual(sh.mutated);
      expect(sh.cleared).toEqual(sh.baseline);
      await page.evaluate(() => {
        window.model.imageBasedLighting.imageBasedLightingFactor =
          new window.Cesium.Cartesian2(0, 1);
        window.viewer.scene.specularEnvironmentMaps = "/scene-source-a.ktx2";
      });
      await readyMap(page, backend);
      const sceneA = await page.evaluate(() => window.sample());
      await page.evaluate(() => {
        window.model.imageBasedLighting.specularEnvironmentMaps =
          "/scene-source-b.ktx2";
      });
      await readyMap(page, backend, true);
      const modelB = await page.evaluate(() => window.sample());
      await page.evaluate(() => {
        window.viewer.scene.specularEnvironmentMaps = "/scene-source-b.ktx2";
      });
      await readyMap(page, backend);
      const ignoredScene = await page.evaluate(() => window.sample());
      const sameScene = await page.evaluate(async () => {
        window.model.imageBasedLighting.specularEnvironmentMaps = undefined;
        return window.sample();
      });
      await page.evaluate(() => {
        window.viewer.scene.specularEnvironmentMaps = "/scene-source-a.ktx2";
      });
      await readyMap(page, backend);
      const restoredScene = await page.evaluate(() => window.sample());
      const cleared = await page.evaluate(async () => {
        window.viewer.scene.specularEnvironmentMaps = undefined;
        return window.sample();
      });
      expect(modelB).not.toEqual(sceneA);
      expect(ignoredScene).toEqual(modelB);
      expect(sameScene).toEqual(modelB);
      expect(restoredScene).toEqual(sceneA);
      expect(cleared).not.toEqual(sceneA);
      if (mode === "globe") {
        const fog = await page.evaluate(() => {
          const C = window.Cesium,
            viewer = window.viewer,
            scene = viewer.scene;
          window.model.show = false;
          scene.globe.show = false;
          scene.camera.setView({
            destination: C.Cartesian3.fromDegrees(0, 0, 1000),
            orientation: {
              direction: new C.Cartesian3(0.5, 0, Math.sqrt(0.75)),
              up: C.Cartesian3.UNIT_X,
            },
          });
          const effects = window.effects;
          effects.showAerialPerspective = false;
          effects.showHeightFog = true;
          effects.heightFogDensity = 0.001;
          effects.heightFogHeightFalloff = 0;
          effects.heightFogInscatteringScale = 0;
          effects.heightFogDirectionalInscatteringScale = 0;
          const sample = (opacity) => {
            effects.heightFogMaximumOpacity = opacity;
            viewer.render();
            const framebuffer =
              effects._pipeline._resources.aerialFramebuffer.framebuffer;
            return Array.from(
              scene.context.readPixels({
                framebuffer,
                x: 320,
                y: 200,
                width: 1,
                height: 1,
              }),
              (bits) => {
                const e = (bits >> 10) & 31;
                return (
                  (bits & 32768 ? -1 : 1) *
                  (e === 0
                    ? (bits & 1023) * 2 ** -24
                    : (1 + (bits & 1023) / 1024) * 2 ** (e - 15))
                );
              },
            );
          };
          const sky = sample(0);
          window.fogTexture =
            effects._pipeline._resources.aerialFramebuffer.getColorTexture(0);
          const half = sample(0.5),
            restored = sample(0);
          return {
            sky,
            half,
            restored,
            reused:
              window.fogTexture ===
              effects._pipeline._resources.aerialFramebuffer.getColorTexture(0),
          };
        });
        expect(Math.max(...fog.sky.slice(0, 3))).toBeGreaterThan(0);
        for (let c = 0; c < 3; c++) {
          expect(fog.half[c]).toBeCloseTo(fog.sky[c] * 0.5, 3);
        }
        expect(fog.restored).toEqual(fog.sky);
        expect(fog.reused).toBe(true);
        await writeFile(
          testInfo.outputPath("globe-fog.json"),
          JSON.stringify(fog, null, 2),
        );
      }
      const lifecycle = await page.evaluate(() => {
        const viewer = window.viewer;
        if (window.effects) {
          viewer.scene.controllerHost.unregisterController(
            window.effects,
            viewer.container,
          );
        }
        if (window.planarEnvironment) {
          viewer.scene.controllerHost.unregisterController(
            window.planarEnvironment,
            viewer.container,
          );
        }
        viewer.destroy();
        return {
          errors: window.errors,
          fogReleased: !window.fogTexture || window.fogTexture.isDestroyed(),
        };
      });
      expect(lifecycle.errors).toEqual([]);
      expect(lifecycle.fogReleased).toBe(true);
      await writeFile(
        testInfo.outputPath("source-priority.json"),
        JSON.stringify(
          {
            sh,
            sceneA,
            modelB,
            ignoredScene,
            sameScene,
            restoredScene,
            cleared,
          },
          null,
          2,
        ),
      );
    });
  }
}
