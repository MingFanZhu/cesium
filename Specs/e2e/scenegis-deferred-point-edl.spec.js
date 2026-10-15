import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";

test("mixed native point producers retain EDL controls and bounded resources", async ({
  page,
}, testInfo) => {
  test.setTimeout(60000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/Test/Rendering/延迟点云验收.html");
  await page.waitForFunction(
    () =>
      window.example?.tileset?.tilesLoaded &&
      window.example.dynamic.boundingSphere,
  );
  const report = await page.evaluate(() => {
    const e = window.example;
    const scene = e.viewer.scene;
    e.viewer.useDefaultRenderLoop = false;
    scene.rethrowRenderErrors = true;
    const render = () => e.viewer.render();
    const stats = () => ({
      material: e.deferred.drawCount,
      depth: e.deferred.pointEDLDrawCount,
      light: e.deferred.lightDrawCount,
      bytes: e.deferred.pointEDLByteLength,
      frustums: scene._view.frustumCommandsList.length,
      gl: scene.context._gl.getError(),
    });
    const change = (id, value) => {
      const input = document.getElementById(id);
      if (typeof value === "boolean") {
        input.checked = value;
      } else {
        input.value = value;
      }
      input.dispatchEvent(new Event("input"));
      render();
    };
    render();
    const base = stats();
    const rows = [];
    for (const [id, value] of [
      ["edl", false],
      ["edl", true],
      ["normals", false],
      ["normals", true],
      ["radius", 3.5],
      ["strength", 0],
      ["strength", 1],
      ["occluder", true],
      ["occluder", false],
      ["alpha", 0.5],
      ["alpha", 0],
      ["alpha", 1],
      ["taa", true],
      ["frustums", true],
      ["frustums", false],
      ["taa", false],
    ]) {
      change(id, value);
      rows.push({ id, value, ...stats() });
    }
    change("radius", 2);
    return { base, rows, errors: e.errors };
  });
  await page.click("#frame");
  await page.waitForFunction(() => {
    const e = window.example;
    e.viewer.render();
    return e.dynamic._frames[1]?.ready;
  });
  await page.evaluate(() => window.example.viewer.render());
  await page.screenshot({ path: testInfo.outputPath("point-edl.png") });
  await writeFile(
    testInfo.outputPath("point-edl-report.json"),
    JSON.stringify(report, null, 2),
  );
  expect(errors).toEqual([]);
  expect(report.errors).toEqual([]);
  expect(report.base.depth).toBe(2);
  expect(report.base.bytes).toBe(2 * 1280 * 800 * 8);
  for (const row of report.rows) {
    expect(row.gl).toBe(0);
    if (
      (row.id === "alpha" && row.value < 1) ||
      (row.id === "edl" && !row.value)
    ) {
      expect(row.depth).toBe(0);
      expect(row.bytes).toBe(0);
    }
  }
  const multi = report.rows.find((row) => row.id === "frustums" && row.value);
  expect(multi.frustums).toBeGreaterThan(1);
  expect(multi.depth).toBe(2);
  expect(multi.bytes).toBe(report.base.bytes);
});
