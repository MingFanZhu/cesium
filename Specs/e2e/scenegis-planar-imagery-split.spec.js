import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";

for (const build of ["dev", "release"]) {
  test(`planar imagery splitter: ${build}`, async ({ page }, info) => {
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
    await page.goto("/Test/Planar/影像分屏.html");
    await page.waitForFunction(() => window.example?.world.tilesLoaded);
    await page.evaluate(() => {
      const { viewer } = window.example;
      viewer.useBrowserRecommendedResolution = false;
      viewer.clock.shouldAnimate = false;
      window.splitFrames = 0;
      viewer.scene.postRender.addEventListener(() => window.splitFrames++);
      viewer.resize();
      viewer.scene.requestRender();
    });
    await page.waitForFunction(
      () => window.splitFrames > 0 && window.example.world.tilesLoaded,
    );
    const initialFrame = await page.evaluate(() => window.splitFrames);
    await page.mouse.move(480, 430);
    await page.mouse.down();
    await page.mouse.move(672, 430, { steps: 20 });
    await page.mouse.up();
    await page.waitForFunction((n) => window.splitFrames > n, initialFrame);
    expect(
      await page.evaluate(() => window.example.viewer.scene.splitPosition),
    ).toBeCloseTo(0.7, 2);

    async function comparePixels() {
      return page.evaluate(() => {
        const { viewer, setSplit } = window.example;
        const scene = viewer.scene;
        const pixels = () =>
          [0.3, 0.6, 0.8].map((x) =>
            Array.from(
              scene.context.readPixels({
                x: Math.floor(scene.drawingBufferWidth * x),
                y: Math.floor(scene.drawingBufferHeight * 0.3),
                width: 1,
                height: 1,
              }),
            ),
          );
        setSplit(1);
        viewer.render();
        const left = pixels();
        setSplit(0);
        viewer.render();
        const right = pixels();
        setSplit(0.7);
        viewer.render();
        const split = pixels();
        return {
          left,
          right,
          split,
          width: scene.drawingBufferWidth,
          cssWidth: viewer.canvas.clientWidth,
        };
      });
    }
    let pixels = await comparePixels();
    expect(pixels.width).toBe(pixels.cssWidth * 2);
    expect(pixels.split).toEqual([
      pixels.left[0],
      pixels.left[1],
      pixels.right[2],
    ]);
    expect(pixels.left[1]).not.toEqual(pixels.right[1]);
    await page.screenshot({ path: info.outputPath("split-terrain.png") });

    await page.setViewportSize({ width: 1100, height: 700 });
    await page.evaluate(() => {
      const { viewer } = window.example;
      viewer.resolutionScale = 0.75;
      viewer.resize();
      viewer.scene.requestRender();
    });
    await page.waitForFunction(() => window.example.world.tilesLoaded);
    pixels = await comparePixels();
    expect(pixels.width).toBe(pixels.cssWidth * 1.5);
    expect(pixels.split).toEqual([
      pixels.left[0],
      pixels.left[1],
      pixels.right[2],
    ]);
    await page.locator("#oblique").click();
    await page.waitForFunction(() => window.example.world.tilesLoaded);
    pixels = await comparePixels();
    expect(pixels.split).toEqual([
      pixels.left[0],
      pixels.left[1],
      pixels.right[2],
    ]);
    await page.screenshot({ path: info.outputPath("split-oblique.png") });

    const measured = await page.evaluate(() => {
      const { viewer, world, left, right, setSplit } = window.example;
      viewer.useDefaultRenderLoop = false;
      const surface = world._surface;
      const commands = surface._renderCommands.slice();
      const programs = commands.map((command) => command.shaderProgram);
      const resources = () => ({
        imagery: { ...surface._imagery._debug },
        shaders: surface._debug.createdShaders,
        commands: surface._debug.createdCommands,
      });
      const before = resources();
      const times = {};
      for (const [mode, first, second] of [
        ["none", 0, 0],
        ["leftRight", -1, 1],
        ["topBottom", -2, 2],
      ]) {
        left.splitDirection = first;
        right.splitDirection = second;
        const samples = [];
        for (let i = 0; i < 30; i++) {
          setSplit(i / 29);
          const start = performance.now();
          viewer.render();
          samples.push(performance.now() - start);
        }
        samples.sort((a, b) => a - b);
        times[mode] = {
          median: samples[15],
          p95: samples[28],
        };
      }
      setSplit(0.5);
      viewer.render();
      const after = resources();
      const stable =
        surface._renderCommands.length === commands.length &&
        commands.every(
          (command, i) =>
            surface._renderCommands[i] === command &&
            command.shaderProgram === programs[i],
        );
      const tiles = surface._quadtree._renderTiles.length;
      window.example.destroy();
      return {
        before,
        after,
        stable,
        draws: commands.length,
        tiles,
        times,
        destroyed: viewer.isDestroyed(),
        imageryAfterDestroy: { ...surface._imagery._debug },
      };
    });
    expect(measured.after).toEqual(measured.before);
    expect(measured.stable).toBe(true);
    expect(measured.draws).toBe(measured.tiles);
    expect(measured.destroyed).toBe(true);
    expect(measured.imageryAfterDestroy.destroyedTextures).toBe(
      measured.imageryAfterDestroy.createdTextures,
    );
    expect(errors).toEqual([]);
    await writeFile(
      info.outputPath("measurements.json"),
      JSON.stringify(measured, null, 2),
    );
  });
}
