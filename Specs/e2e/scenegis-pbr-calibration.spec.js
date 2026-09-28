import { mkdir, writeFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";

test("calibration export retains camera/settings and samples real material channels", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/Test/Rendering/PBR综合验收.html?world=planar");
  await page.waitForFunction(() => window.example?.state.ready);
  const result = await page.evaluate(async () => {
    const C = await import("/Build/CesiumUnminified/index.js");
    const m = await import("/Test/Rendering/PBR校准导出.js");
    const e = window.example;
    const scene = e.viewer.scene;
    const before = e.state.snapshot();
    const listeners = scene.postRender.numberOfListeners;
    const input = e.viewer.planarCameraController.enabled;
    const hdr = scene.highDynamicRange;
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
      // Large left stone facade: dielectric, authored roughness 189/255, no AO.
      samples[name] = Array.from(
        ctx.getImageData(
          Math.floor(img.width * 0.06),
          Math.floor(img.height * 0.16),
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
      sun: config.sun,
      colors,
      reference,
    };
  });
  expect(result.after).toEqual(result.before);
  expect(result.restored).toBe(true);
  expect(result.imageCount).toBe(9);
  expect(
    result.sun.beamIrradiance.every((x) => Number.isFinite(x) && x > 0),
  ).toBe(true);
  const roughness = Math.round(Math.pow(189 / 255, 1 / 2.2) * 255);
  expect(
    Math.abs(result.samples["material-roughness"][0] - roughness),
  ).toBeLessThanOrEqual(1);
  expect(result.samples["material-metalness"][0]).toBe(0);
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
}, testInfo) => {
  await page.goto("/Test/Rendering/PBR画质校准.html");
  await expect(page.locator("#comparison")).toBeVisible();
  await expect(page.locator("#status")).toContainText("1778 × 1000");
  await expect(page.locator("#error")).toBeEmpty();
  await page.locator("#split").fill("38");
  await expect(page.locator("#comparison")).toHaveCSS("--split", "38%");
  await page.screenshot({
    path: testInfo.outputPath("cycles-comparison.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Cycles 间接光", exact: true })
    .click();
  await expect(page.locator("#left")).toHaveAttribute(
    "src",
    /cycles-direct.png$/,
  );
  await page.getByLabel("原始像素 1:1").check();
  await expect(page.locator("#comparison")).toHaveCSS("width", "1778px");
  await page.route("**/material-normal.png", (route) => route.abort());
  await page
    .getByLabel("左图", { exact: true })
    .selectOption("material-normal");
  await expect(page.locator("#error")).toContainText("对照图未就绪");
  await expect(page.locator("#comparison")).toBeHidden();
});
