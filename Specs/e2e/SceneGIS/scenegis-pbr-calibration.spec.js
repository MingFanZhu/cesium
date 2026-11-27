import { mkdir, writeFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";

test("calibration export retains camera/settings and samples real material channels", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/Specs/e2e/cesium.html");
  await page.evaluate(async () => {
    const C = await import("/Build/CesiumUnminified/index.js");
    const viewer = new C.Viewer("cesiumContainer", {
      planarWorld: {
        crs: "LOCAL",
        extent: {
          minimumX: -100,
          minimumY: -100,
          maximumX: 100,
          maximumY: 100,
        },
        maximumLevel: 0,
      },
      baseLayerPicker: false,
      geocoder: false,
      animation: false,
      timeline: false,
    });
    viewer.planarWorld.show = false;
    viewer.clock.shouldAnimate = false;
    viewer.clock.currentTime = C.JulianDate.fromIso8601("2026-06-21T04:00:00Z");
    const scene = viewer.scene;
    const effects = scene.environmentEffects;
    effects.showClouds = false;
    scene.highDynamicRange = true;
    scene.msaaSamples = 1;
    scene.postProcessStages.tonemapper = C.Tonemapper.PBR_NEUTRAL;
    scene.postProcessStages.exposure = 1.5;
    scene.postProcessStages.fxaa.enabled = false;
    scene.camera.setView({
      destination: new C.Cartesian3(0, -6, 1),
      orientation: { direction: C.Cartesian3.UNIT_Y, up: C.Cartesian3.UNIT_Z },
    });
    const modelUrl = "/Specs/Data/Models/glTF-2.0/Box/glTF/Box.gltf";
    const model = scene.primitives.add(
      await C.Model.fromGltfAsync({
        url: modelUrl,
        modelMatrix: C.Matrix4.fromTranslation(new C.Cartesian3(0, 0, 1)),
        scale: 2,
        gltfCallback: (gltf) => {
          const material = gltf.materials[0].pbrMetallicRoughness;
          material.roughnessFactor = 0.75;
          material.metallicFactor = 0.25;
        },
      }),
    );
    const atmosphere = { showAerialPerspective: true, showHeightFog: true };
    const trial = { ao: false, ssr: false, antialiasing: "无 AA" };
    const ssr = new C.SceneGISScreenSpaceReflections({ scene, enabled: false });
    const state = {
      comparison: "基线 A",
      get ready() {
        return (
          model.ready &&
          effects.ready &&
          !!scene.frameState._sceneGISPlanarLighting?.skyReflections?._source
        );
      },
      snapshot() {
        return {
          world: "planar",
          model: modelUrl,
          animate: viewer.clock.shouldAnimate,
          camera: { position: C.Cartesian3.pack(scene.camera.positionWC, []) },
          resolution: [scene.drawingBufferWidth, scene.drawingBufferHeight],
          atmosphere: { ...atmosphere },
          trial: { ...trial },
          comparison: state.comparison,
        };
      },
      apply() {
        scene.postProcessStages.fxaa.enabled = trial.antialiasing === "FXAA";
        scene.postProcessStages.ambientOcclusion.enabled = trial.ao;
        ssr.enabled = trial.ssr;
      },
      applyAtmosphere() {
        effects.showAerialPerspective = atmosphere.showAerialPerspective;
        effects.showHeightFog = atmosphere.showHeightFog;
        state.apply();
      },
    };
    state.applyAtmosphere();
    window.example = {
      viewer,
      state,
      atmosphere,
      trial,
      models: [model],
      destroy() {
        ssr.destroy();
        viewer.destroy();
      },
    };
  });
  await page.waitForFunction(() => window.example?.state.ready);
  const result = await page.evaluate(async () => {
    const C = await import("/Build/CesiumUnminified/index.js");
    const m =
      await import("/Specs/e2e/SceneGIS/fixtures/Rendering/PBR校准导出.js");
    const e = window.example;
    const scene = e.viewer.scene;
    const before = e.state.snapshot();
    const listeners = scene.postRender.numberOfListeners;
    const input = e.viewer.planarCameraController.enabled;
    const hdr = scene.highDynamicRange;
    const whiteBalance = scene.environmentEffects.whiteBalance;
    const fxaa = scene.postProcessStages.fxaa.enabled;
    const config = m.captureCalibration(e);
    const data = await m.captureDiagnosticViews(e);
    const samples = {};
    for (const name of [
      "material-roughness",
      "material-metalness",
      "material-occlusion",
    ]) {
      const img = new Image();
      img.src = data.images[name];
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      // The center of the native Box carries the known glTF material factors.
      samples[name] = Array.from(
        ctx.getImageData(
          Math.floor(img.width / 2),
          Math.floor(img.height / 2),
          1,
          1,
        ).data,
      );
    }
    // Read the real native GLSL output transform for independent Python agreement.
    const colors = [
      [0, 0, 0],
      [0.02, 0.05, 0.07],
      [0.18, 0.18, 0.18],
      [1, 1, 1],
      [8, 0.2, 0.05],
    ];
    const context = scene.context;
    const texture = new C.Texture({
      context,
      width: colors.length,
      height: 1,
      pixelFormat: C.PixelFormat.RGBA,
      pixelDatatype: C.PixelDatatype.FLOAT,
    });
    const framebuffer = new C.Framebuffer({
      context,
      colorTextures: [texture],
    });
    let command;
    let reference;
    try {
      const declarations = colors
        .map(
          (v, i) =>
            `if (int(gl_FragCoord.x) == ${i}) color = vec3(${v.map((x) => x.toFixed(5)).join(",")});`,
        )
        .join("\n");
      command = context.createViewportQuadCommand(
        `void main(){vec3 color;${declarations}out_FragColor=vec4(pow(czm_pbrNeutralTonemapping(color),vec3(1.0/2.2)),1.0);}`,
        {
          framebuffer,
          renderState: C.RenderState.fromCache({
            viewport: new C.BoundingRectangle(0, 0, colors.length, 1),
          }),
        },
      );
      command.execute(context);
      reference = Array.from(
        context.readPixels({ framebuffer, width: colors.length, height: 1 }),
      );
    } finally {
      command?.shaderProgram.destroy();
      framebuffer.destroy();
    }
    const restored =
      scene.highDynamicRange === hdr &&
      scene.environmentEffects.whiteBalance === whiteBalance &&
      scene.postProcessStages.fxaa.enabled === fxaa &&
      e.viewer.planarCameraController.enabled === input &&
      scene.postRender.numberOfListeners === listeners &&
      e.models.every((model) => model.customShader === undefined);
    const after = e.state.snapshot();
    e.destroy();
    return {
      before,
      after,
      restored,
      samples,
      imageCount: Object.keys(data.images).length,
      exportedSnapshot: config.snapshot,
      exposure: config.output.exposure,
      sun: config.sun,
      colors,
      reference,
    };
  });
  expect(result.after).toEqual(result.before);
  expect(result.exportedSnapshot).toEqual(result.before);
  expect(result.exposure).toBe(1.5);
  expect(result.restored).toBe(true);
  expect(result.imageCount).toBe(9);
  expect(
    result.sun.beamIrradiance.every((x) => Number.isFinite(x) && x > 0),
  ).toBe(true);
  const roughness = Math.round(Math.pow(0.75, 1 / 2.2) * 255);
  expect(
    Math.abs(result.samples["material-roughness"][0] - roughness),
  ).toBeLessThanOrEqual(1);
  const metalness = Math.round(Math.pow(0.25, 1 / 2.2) * 255);
  expect(
    Math.abs(result.samples["material-metalness"][0] - metalness),
  ).toBeLessThanOrEqual(1);
  expect(result.samples["material-occlusion"][0]).toBe(255);
  expect(errors).toEqual([]);
  await mkdir("Build/Specs/calibration", { recursive: true });
  await writeFile(
    "Build/Specs/calibration/color-reference.json",
    JSON.stringify({ colors: result.colors, reference: result.reference }),
  );
});

test("calibration comparison keeps pixel alignment and exposes missing artifacts", async ({
  page,
}) => {
  await page.route("**/calibration-images/reference-report.json", (route) =>
    route.fulfill({
      json: {
        snapshot: { resolution: [32, 20] },
        blender: "fixture",
        samples: 1,
        materials: 1,
        output: { exposure: 1, gamma: 2.2 },
      },
    }),
  );
  await page.route("**/calibration-images/*.png", (route) => {
    const name = new URL(route.request().url()).pathname.split("/").at(-1);
    if (name === "material-normal.png") {
      return route.fulfill({ status: 404 });
    }
    const width = name === "runtime-noaa.png" ? 24 : 32;
    const color = name === "cycles-full.png" ? "#a65" : "#579";
    return route.fulfill({
      contentType: "image/svg+xml",
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20"><rect width="100%" height="100%" fill="${color}"/></svg>`,
    });
  });
  await page.goto("/Specs/e2e/SceneGIS/fixtures/Rendering/PBR画质校准.html");
  await expect(page.locator("#comparison")).toBeVisible();
  await expect(page.locator("#status")).toContainText("32 × 20");
  await expect(page.locator("#error")).toBeEmpty();
  await page.locator("#split").fill("38");
  await expect(page.locator("#comparison")).toHaveCSS("--split", "38%");
  await page
    .getByRole("button", { name: "Cycles 间接光", exact: true })
    .click();
  await expect(page.locator("#left")).toHaveAttribute(
    "src",
    /cycles-direct.png$/,
  );
  await page.getByLabel("原始像素 1:1").check();
  await expect(page.locator("#comparison")).toHaveCSS("width", "32px");
  const left = page.getByLabel("左图", { exact: true });
  await left.selectOption("runtime-noaa");
  await expect(page.locator("#error")).toContainText("左右图尺寸不一致");
  await left.selectOption("material-normal");
  await expect(page.locator("#error")).toContainText("对照图未就绪");
  await expect(page.locator("#comparison")).toBeHidden();
});
