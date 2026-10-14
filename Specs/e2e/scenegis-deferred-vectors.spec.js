import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";

for (const mode of ["planar", "globe"]) {
  test(`ordered vector materials and public controls (${mode})`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120000);
    const errors = [];
    page.on("pageerror", (error) => {
      errors.push(error.message);
      console.error(error.message);
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/Test/Rendering/延迟矢量验收.html?world=${mode}`);
    await page.waitForFunction(() => {
      const example = window.example;
      return (
        example?.layer.ready &&
        example.layer.tilesLoaded &&
        example.world.tilesLoaded
      );
    });
    const snapshot = async (coverage = false) =>
      page.evaluate(
        (coverage) =>
          new Promise((resolve) => {
            const { scene, layer, errors } = window.example;
            const remove = scene.postRender.addEventListener(() => {
              remove();
              const renderer = scene._sceneGISDeferred;
              let minimumRed;
              if (coverage) {
                minimumRed = 255;
                const pixels = scene.context.readPixels({
                  x: 415,
                  y: 315,
                  width: 135,
                  height: 200,
                });
                for (let i = 0; i < pixels.length; i += 4) {
                  minimumRed = Math.min(minimumRed, pixels[i]);
                }
              }
              resolve({
                minimumRed,
                errors,
                stats: layer.statistics,
                draws: renderer.drawCount,
                classification: renderer.classificationDrawCount,
                lightDraws: renderer.lightDrawCount,
                waterReady: scene.frameState._sceneGISWater?.ready,
                waterCaptureDraws:
                  scene.frameState._sceneGISWater?.captureDraws,
                bytes: renderer.byteLength,
                mapBytes:
                  renderer._vectorOverlays?.raw.getColorTexture().sizeInBytes ??
                  0,
                planarBytes: renderer._planarVectors?.byteLength ?? 0,
                planarDepthDraws: renderer._planarVectors?.depthDrawCount ?? 0,
                planarMapDraws: renderer._planarVectors?.mapDrawCount ?? 0,
                planarTiles: renderer._planarVectors?.tiles.length ?? 0,
                mapCommands: scene._view.frustumCommandsList.reduce(
                  (sum, range) => sum + range.indices[3],
                  0,
                ),
                frusta: scene._view.frustumCommandsList.length,
                glError: scene.context._gl.getError(),
              });
            });
            scene.requestRender();
          }),
        coverage,
      );
    const initial = await snapshot();
    expect(initial.errors).toEqual([]);
    // Flat maps retain their unlit contract until physical vector lighting is active.
    expect(initial.mapBytes).toBe(0);
    await page.screenshot({ path: testInfo.outputPath("basic.png") });
    await page.locator("#selected").check();
    await page.locator("#physical").check();
    await page.waitForFunction(() => window.example.effects.ready);
    const physical = await snapshot();
    expect(physical.mapBytes).toBe(1280 * 800 * 8);
    expect(physical.errors).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("physical.png") });
    await page.locator("#water").check();
    await page.waitForFunction(() => window.example.water.ready);
    await page.locator("#screens").check();
    await page.waitForFunction(
      () => window.example.ssr.ready && window.example.ssil.ready,
    );
    const screen = await snapshot();
    expect(screen.draws).toBe(physical.draws);
    expect(screen.classification).toBe(physical.classification);
    expect(screen.waterReady).toBe(true);
    expect(screen.waterCaptureDraws).toBe(0);
    await page.screenshot({ path: testInfo.outputPath("water.png") });
    await page.locator("#water").uncheck();
    await page.locator("#background").check();
    await page.waitForFunction(
      () =>
        window.example.background.ready &&
        window.example.background.tilesLoaded,
    );
    const background = await snapshot();
    expect(background.errors).toEqual([]);
    expect(background.glError).toBe(0);
    expect(background.mapBytes).toBe(screen.mapBytes);
    await page.screenshot({ path: testInfo.outputPath("background.png") });
    await page.locator("#background").uncheck();
    await page.locator("#frusta").check();
    const frusta = await snapshot();
    expect(frusta.frusta).toBeGreaterThan(1);
    expect(frusta.errors).toEqual([]);
    expect(frusta.glError).toBe(0);
    await page.screenshot({ path: testInfo.outputPath("frusta.png") });
    await page.locator("#terrain").check();
    // Observe provider invalidation before waiting for replacement tile and anchor work.
    await snapshot();
    await page.waitForFunction(
      () =>
        window.example.world.tilesLoaded &&
        window.example.layer.tilesLoaded &&
        window.example.layer.statistics.placedSymbols === 1 &&
        window.example.layer.statistics.drawCommands === 7,
    );
    if (mode === "globe") {
      await page.waitForFunction(() =>
        window.example.world._surface._tilesToRender.every(
          (tile) =>
            Math.abs(
              tile.data.tileBoundingRegion.minimumHeight -
                window.example.terrainHeight,
            ) < 0.01,
        ),
      );
    }
    const terrain = await snapshot();
    expect(terrain.errors).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("terrain.png") });
    const transparent = [];
    {
      for (const opacity of [0.5, 0]) {
        await page.locator("#surface").evaluate((input, value) => {
          input.value = String(value);
          input.dispatchEvent(new Event("input"));
        }, opacity);
        await snapshot();
        await page.waitForFunction(
          () =>
            window.example.layer.tilesLoaded &&
            window.example.layer.statistics.placedSymbols === 1 &&
            window.example.layer.statistics.drawCommands === 7,
        );
        transparent.push(await snapshot());
        expect(transparent.at(-1).mapBytes).toBe(0);
        expect(transparent.at(-1).glError).toBe(0);
        expect(transparent.at(-1).errors).toEqual([]);
        if (mode === "planar") {
          const cost = transparent.at(-1);
          expect(cost.planarBytes).toBe(1280 * 800 * 12);
          expect(cost.planarDepthDraws).toBe(cost.planarTiles);
          expect(cost.planarMapDraws).toBe(cost.mapCommands);
        }
        await page.screenshot({
          path: testInfo.outputPath(`transparent-${opacity}.png`),
        });
      }
    }
    if (mode === "globe") {
      await page.locator("#physical").uncheck();
      await page.locator("#screens").uncheck();
      const continuous = await snapshot(true);
      expect(continuous.minimumRed).toBeGreaterThan(150);
      await page.locator("#terrain").uncheck();
      await snapshot();
      await page.waitForFunction(
        () =>
          window.example.world.tilesLoaded &&
          window.example.world._surface._tilesToRender.length > 0 &&
          window.example.world._surface._tilesToRender.every(
            (tile) => tile.data.tileBoundingRegion.minimumHeight === 0,
          ) &&
          window.example.layer.tilesLoaded &&
          window.example.layer.statistics.drawCommands === 7 &&
          window.example.layer.statistics.placedSymbols === 1,
      );
      await page.screenshot({
        path: testInfo.outputPath("transparent-ellipsoid.png"),
      });
    } else {
      await page.locator("#surface").evaluate((input) => {
        input.value = "1";
        input.dispatchEvent(new Event("input"));
      });
      const restored = await snapshot();
      expect(restored.planarBytes).toBe(0);
      expect(restored.mapBytes).toBe(1280 * 800 * 8);
    }
    expect(errors).toEqual([]);
    await writeFile(
      testInfo.outputPath("costs.json"),
      JSON.stringify(
        { initial, physical, screen, frusta, terrain, transparent },
        null,
        2,
      ),
    );
    await page.evaluate(() => {
      const { viewer, ssr, ssil } = window.example;
      ssr.destroy();
      ssil.destroy();
      viewer.destroy();
    });
  });
}
