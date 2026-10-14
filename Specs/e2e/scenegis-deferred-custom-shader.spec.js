import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";

test("native CustomShader controls retain deferred materials and forward transparency", async ({
  page,
}, testInfo) => {
  test.setTimeout(60000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/Test/Rendering/延迟CustomShader验收.html");
  await page.waitForFunction(() => {
    const e = window.example;
    return (
      e?.models.length === 3 &&
      e.models.every((model) => model.ready) &&
      e.tileset?.tilesLoaded &&
      e.custom.uniformMap.u_tex() !== e.viewer.scene.context.defaultTexture
    );
  });
  const report = await page.evaluate(async () => {
    const C = await import("/Build/CesiumUnminified/index.js");
    const e = window.example,
      scene = e.viewer.scene;
    e.viewer.useDefaultRenderLoop = false;
    scene.rethrowRenderErrors = true;
    const render = () => e.viewer.render();
    const metrics = () => ({
      material: e.deferred.drawCount,
      light: e.deferred.lightDrawCount,
      bytes: e.deferred.byteLength,
      extension: e.deferred.materialExtensionDrawCount,
      oit: scene._environmentState.useOIT,
    });
    const change = (id, value, event = "change") => {
      const input = document.getElementById(id);
      if (typeof value === "boolean") {
        input.checked = value;
      } else {
        input.value = value;
      }
      input.dispatchEvent(new Event(event));
      render();
    };
    render();
    const base = metrics();
    const rows = [];
    for (const [id, value, event] of [
      ["mode", "REPLACE_MATERIAL"],
      ["lighting", "UNLIT"],
      ["texture", "warm"],
      ["shift", 0.4, "input"],
      ["cutout", true],
      ["alpha", 0.5, "input"],
      ["occluder", true],
      ["hdr", false],
      ["hdr", true],
      ["alpha", 1, "input"],
      ["occluder", false],
      ["cutout", false],
      ["shift", 0, "input"],
      ["enabled", false],
      ["enabled", true],
    ]) {
      change(id, value, event);
      rows.push({
        id,
        value,
        ...metrics(),
        glError: scene.context._gl.getError(),
      });
    }
    change("mode", "MODIFY_MATERIAL");
    change("lighting", "PBR");
    change("texture", "cool");
    const position = C.SceneTransforms.worldToWindowCoordinates(
      scene,
      e.point(-11, 0, 3),
    );
    const picked = scene.pick(position);
    render();
    return {
      base,
      rows,
      pick: picked?.primitive === e.editable,
      errors: e.errors,
    };
  });
  await writeFile(
    testInfo.outputPath("custom-shader-report.json"),
    JSON.stringify(report, null, 2),
  );
  expect(report.pick).toBe(true);
  expect(report.base.oit).toBe(true);
  expect(report.errors).toEqual([]);
  for (const row of report.rows) {
    expect(row.glError).toBe(0);
    expect(row.extension).toBe(0);
  }
  for (const id of [
    "mode",
    "lighting",
    "texture",
    "shift",
    "cutout",
    "enabled",
  ]) {
    const row = report.rows.find((value) => value.id === id);
    expect(row.material).toBe(report.base.material);
    expect(row.bytes).toBe(report.base.bytes);
  }
  expect(report.rows.find((row) => row.id === "alpha").material).toBe(
    report.base.material - 1,
  );
  await page.screenshot({ path: testInfo.outputPath("custom-shader.png") });
  await page.evaluate(() => {
    for (const [id, value, type] of [
      ["cutout", true, "change"],
      ["shift", "0.4", "input"],
      ["alpha", "0.5", "input"],
    ]) {
      const input = document.getElementById(id);
      if (typeof value === "boolean") {
        input.checked = value;
      } else {
        input.value = value;
      }
      input.dispatchEvent(new Event(type));
    }
    window.example.viewer.render();
  });
  await page.screenshot({
    path: testInfo.outputPath("custom-shader-transparent.png"),
  });
  await page.goto("about:blank");
  expect(errors).toEqual([]);
});
