import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";

for (const build of ["dev", "release"]) {
  test(`planar terrain depth control: ${build}`, async ({ page }, info) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.hostname !== "localhost" && url.protocol !== "data:") {
        return route.abort();
      }
      if (
        build === "release" &&
        url.pathname === "/Build/CesiumUnminified/index.js"
      ) {
        url.pathname = "/Build/Cesium/index.js";
        return route.continue({ url: url.toString() });
      }
      return route.continue();
    });
    await page.goto("/Test/地形深度测试.html");
    await page.waitForFunction(() => {
      const example = window.depthTestExample;
      return (
        example?.world.tilesLoaded && example.boxes.every((box) => box.ready)
      );
    });
    await page.evaluate(() => {
      const { viewer } = window.depthTestExample;
      viewer.useDefaultRenderLoop = false;
      viewer.clock.shouldAnimate = false;
    });
    async function pixelCounts() {
      return page.evaluate(() => {
        const { viewer } = window.depthTestExample;
        viewer.render();
        const scene = viewer.scene;
        const pixels = scene.context.readPixels({
          width: scene.drawingBufferWidth,
          height: scene.drawingBufferHeight,
        });
        let red = 0;
        let blue = 0;
        for (let index = 0; index < pixels.length; index += 4) {
          if (
            pixels[index] > 200 &&
            pixels[index + 1] < 30 &&
            pixels[index + 2] < 30
          ) {
            red++;
          }
          if (
            pixels[index + 2] > 200 &&
            pixels[index] < 30 &&
            pixels[index + 1] < 30
          ) {
            blue++;
          }
        }
        return { red, blue };
      });
    }
    const occluded = await pixelCounts();
    expect(occluded.red).toBe(0);
    expect(occluded.blue).toBeGreaterThan(100);
    await page.screenshot({
      path: info.outputPath("terrain-test-enabled.png"),
    });
    await page.locator("#depthTest").uncheck();
    const visible = await pixelCounts();
    expect(visible.red).toBeGreaterThan(100);
    expect(visible.blue).toBe(occluded.blue);
    await page.screenshot({
      path: info.outputPath("terrain-test-disabled.png"),
    });
    await page.locator("#depthTest").check();
    expect(await pixelCounts()).toEqual(occluded);
    const measurements = await page.evaluate(() => {
      const { viewer, world } = window.depthTestExample;
      const renderer = viewer.scene._sceneGISDeferred;
      const material = renderer._raw.getColorTexture();
      const command = world._surface._renderCommands[0];
      const values = [];
      for (const enabled of [false, true]) {
        world.depthTestAgainstTerrain = enabled;
        viewer.render();
        const times = [];
        for (let frame = 0; frame < 30; frame++) {
          const start = performance.now();
          viewer.render();
          times.push(performance.now() - start);
        }
        times.sort((a, b) => a - b);
        values.push({
          enabled,
          median: times[15],
          p95: times[28],
          bytes: renderer.byteLength,
          draws: renderer.drawCount,
          lightDraws: renderer.lightDrawCount,
        });
      }
      const stableMaterial = renderer._raw.getColorTexture() === material;
      const stableCommand = world._surface._renderCommands[0] === command;
      const glError = viewer.scene.context._gl.getError();
      viewer.destroy();
      return {
        values,
        stableMaterial,
        stableCommand,
        glError,
        destroyed: material.isDestroyed() && world.isDestroyed(),
      };
    });
    expect(measurements.values[0].bytes).toBe(measurements.values[1].bytes);
    expect(measurements.stableMaterial).toBe(true);
    expect(measurements.stableCommand).toBe(true);
    expect(measurements.destroyed).toBe(true);
    expect(measurements.glError).toBe(0);
    expect(errors).toEqual([]);
    await writeFile(
      info.outputPath("measurements.json"),
      JSON.stringify(measurements, null, 2),
    );
  });
}
