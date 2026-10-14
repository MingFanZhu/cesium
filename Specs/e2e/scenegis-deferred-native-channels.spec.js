import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";

test("native model stages and volumes retain their dedicated passes", async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/Test/Rendering/延迟原生通道验收.html");
  await page.waitForFunction(() => {
    const e = window.example;
    return (
      e?.fill.ready && e.edge.ready && e.voxel._traversal?._initialTilesLoaded
    );
  });
  const report = await page.evaluate(async () => {
    const e = window.example,
      C = await import("/Build/CesiumUnminified/index.js");
    e.viewer.useDefaultRenderLoop = false;
    e.scene.rethrowRenderErrors = true;
    const rows = [];
    function snapshot(name) {
      const r = e.scene._sceneGISDeferred;
      const counts = {};
      for (const key of [
        "CESIUM_3D_TILE_EDGES",
        "CESIUM_3D_TILE_EDGES_DIRECT",
        "VOXELS",
      ]) {
        counts[key] = e.scene._view.frustumCommandsList.reduce(
          (n, f) => n + f.indices[C.Pass[key]],
          0,
        );
      }
      rows.push({
        name,
        material: r.drawCount,
        lighting: r.lightDrawCount,
        counts,
        frusta: e.scene._view.frustumCommandsList.length,
        bytes: r.byteLength,
        waterDepthBytes:
          e.scene.frameState._sceneGISWater.finalDepth?.byteLength ?? 0,
        glError: e.scene.context._gl.getError(),
      });
    }
    function change(id, value) {
      const el = document.getElementById(id);
      if (el.type === "checkbox") {
        el.checked = value;
      } else {
        el.value = String(value);
      }
      el.dispatchEvent(new Event("change"));
      e.viewer.render();
      snapshot(`${id}:${value}`);
    }
    e.viewer.render();
    snapshot("initial");
    const target = new C.FramebufferManager({
      pixelDatatype: C.PixelDatatype.FLOAT,
    });
    target.update(e.scene.context, 1, 1);
    const quad = e.scene.context.createViewportQuadCommand(
      "uniform sampler2D u_color; void main() { out_FragColor = texelFetch(u_color, ivec2(155, 400), 0); }",
      {
        framebuffer: target.framebuffer,
        uniformMap: {
          u_color: () => e.scene._sceneGISDeferred._source.getColorTexture(0),
        },
      },
    );
    const fillSamples = [];
    e.taa.reset();
    for (let i = 0; i < 8; ++i) {
      e.viewer.render();
      const display = Array.from(
        e.scene.context.readPixels({ x: 155, y: 400, width: 1, height: 1 }),
      );
      quad.execute(e.scene.context);
      const material = Array.from(
        e.scene.context.readPixels({
          framebuffer: target.framebuffer,
          width: 1,
          height: 1,
        }),
      );
      fillSamples.push({ material, display });
    }
    quad.shaderProgram.destroy();
    target.destroy();
    change("edges", 0);
    change("edges", 2);
    change("edges", 1);
    change("surface", 0);
    change("surface", -5);
    change("depth", false);
    change("depth", true);
    change("surface", 5);
    change("projection", "orthographic");
    change("projection", "perspective");
    change("multi", true);
    change("ao", true);
    change("taa", false);
    change("taa", true);
    change("multi", false);
    change("ao", false);
    change("volume", false);
    change("volume", true);
    change("water", true);
    change("waterPosition", -4);
    change("waterPosition", 0);
    change("waterPosition", 4);
    change("taa", false);
    change("volume", false);
    change("volume", true);
    change("taa", true);
    e.taa.reset();
    e.viewer.render();
    return { rows, fillSamples, errors: e.errors };
  });
  await page.screenshot({ path: testInfo.outputPath("native-channels.png") });
  await writeFile(
    testInfo.outputPath("native-channel-report.json"),
    JSON.stringify(report, null, 2),
  );
  expect(report.rows.every((r) => r.glError === 0)).toBe(true);
  for (const { material, display } of report.fillSamples) {
    expect(material.slice(0, 3)).toEqual([1, 0, 1]);
    expect(display[0]).toBeGreaterThan(150);
    expect(display[1]).toBeLessThan(60);
    expect(display[2]).toBeGreaterThan(150);
  }
  expect(report.rows[0].counts.VOXELS).toBe(1);
  expect(report.rows[0].counts.CESIUM_3D_TILE_EDGES).toBe(1);
  expect(
    report.rows.filter((r) => r.name === "taa:false").at(-1).waterDepthBytes,
  ).toBe(990 * 800 * 4);
  expect(
    report.rows.filter((r) => r.name === "volume:false").at(-1).waterDepthBytes,
  ).toBe(0);
  expect(
    report.rows.find((r) => r.name === "edges:0").counts.CESIUM_3D_TILE_EDGES,
  ).toBe(0);
  expect(
    report.rows.find((r) => r.name === "edges:2").counts
      .CESIUM_3D_TILE_EDGES_DIRECT,
  ).toBe(1);
  expect(
    report.rows.find((r) => r.name === "multi:true").frusta,
  ).toBeGreaterThan(1);
  expect(report.rows.find((r) => r.name === "volume:false").counts.VOXELS).toBe(
    0,
  );
  expect(report.errors).toEqual([]);
  expect(errors).toEqual([]);
  const canvas = page.locator("canvas").first();
  const pickPoint = await page.evaluate(async () => {
    const C = await import("/Build/CesiumUnminified/index.js");
    return C.SceneTransforms.worldToWindowCoordinates(
      window.example.scene,
      new C.Cartesian3(6999991, 0, 0),
    );
  });
  await canvas.click({ position: pickPoint });
  await expect(page.locator("#pick")).toHaveText("拾取：体积");
  await page.locator("#water").uncheck();
  await page.locator("#surface").selectOption("-5");
  await page.evaluate(() => window.example.viewer.render());
  await canvas.click({ position: pickPoint });
  await expect(page.locator("#pick")).toHaveText("拾取：遮挡面");
  await page.locator("#surface").selectOption("5");
  await page.evaluate(() => window.example.viewer.render());
  await canvas.click({ position: pickPoint });
  await expect(page.locator("#pick")).toHaveText("拾取：体积");
  await page.locator("#water").check();
  await page.locator("#waterPosition").selectOption("-4");
  await page.evaluate(() => {
    window.example.taa.reset();
    window.example.viewer.render();
  });
  await page.screenshot({ path: testInfo.outputPath("water-front.png") });
  await canvas.click({ position: pickPoint });
  await expect(page.locator("#pick")).toHaveText("拾取：遮挡面");
  await page.evaluate(() => window.example.destroy());
  expect(errors).toEqual([]);
});
