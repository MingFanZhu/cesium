import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";

for (const world of ["globe", "planar"]) {
  for (const build of ["dev", "release"]) {
    test(`top/bottom native consumers: ${world} ${build}`, async ({
      page,
    }, info) => {
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/*", (route) => {
        const url = new URL(route.request().url());
        if (
          url.hostname !== "localhost" &&
          url.protocol !== "data:" &&
          url.protocol !== "blob:"
        ) {
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
      await page.goto(`/Test/分屏对比.html?world=${world}`);
      await page.waitForFunction(() => {
        const e = window.example;
        return (
          e?.groups.every((group) => group.length === 4) &&
          e.models.every((m) => m.ready) &&
          e.world.tilesLoaded &&
          e.groups.every((g) => g[2].ready)
        );
      });
      await page.evaluate(() => {
        const { viewer } = window.example;
        viewer.useBrowserRecommendedResolution = false;
        viewer.clock.shouldAnimate = false;
        viewer.scene.postProcessStages.fxaa.enabled = false;
        viewer.resize();
        viewer.scene.requestRender();
      });
      await page.waitForFunction(() => window.example.world.tilesLoaded);

      async function compare(axis, position) {
        return page.evaluate(
          ({ axis, position }) => {
            const { viewer, setSplit, setAxis, groups, C } = window.example;
            const scene = viewer.scene;
            setAxis(axis);
            const render = (value) => {
              setSplit(value);
              viewer.render();
              return scene.context.readPixels();
            };
            const a = render(1);
            const b = render(0);
            const split = render(position);
            const width = scene.drawingBufferWidth;
            const height = scene.drawingBufferHeight;
            let mismatches = 0;
            let differences = 0;
            const mismatchSamples = [];
            // Sample the full canvas, including actual imagery and primitive edges.
            for (let y = 7; y < height; y += 11) {
              for (let x = 7; x < width; x += 11) {
                const t =
                  axis === "horizontal"
                    ? 1 - (y + 0.5) / height
                    : (x + 0.5) / width;
                if (Math.abs(t - position) < 2 / Math.min(width, height)) {
                  continue;
                }
                const index = 4 * (y * width + x);
                const expected = t < position ? a : b;
                for (let channel = 0; channel < 3; channel++) {
                  if (
                    Math.abs(
                      split[index + channel] - expected[index + channel],
                    ) > 2
                  ) {
                    mismatches++;
                    if (mismatchSamples.length < 10) {
                      mismatchSamples.push({
                        x,
                        y,
                        channel,
                        actual: split[index + channel],
                        expected: expected[index + channel],
                      });
                    }
                  }
                  if (Math.abs(a[index + channel] - b[index + channel]) > 8) {
                    differences++;
                  }
                }
              }
            }
            const picks = [];
            if (axis === "horizontal" && position === 0.5) {
              for (let i = 1; i < 4; i++) {
                const object = groups[0][i];
                const location =
                  i === 1
                    ? C.Matrix4.getTranslation(
                        object.modelMatrix,
                        new C.Cartesian3(),
                      )
                    : object.position;
                const center = C.SceneTransforms.worldToWindowCoordinates(
                  scene,
                  location,
                );
                for (const [offset, group] of [
                  [-12, 0],
                  [12, 1],
                ]) {
                  const picked = scene.pick(
                    new C.Cartesian2(center.x, center.y + offset),
                  );
                  picks.push(picked?.primitive === groups[group][i]);
                }
              }
            }
            return {
              mismatches,
              mismatchSamples,
              differences,
              picks,
              width,
              height,
              cssWidth: viewer.canvas.clientWidth,
              cssHeight: viewer.canvas.clientHeight,
            };
          },
          { axis, position },
        );
      }

      const initial = await compare("horizontal", 0.5);
      expect(initial.mismatches, JSON.stringify(initial)).toBe(0);
      expect(initial.differences).toBeGreaterThan(100);
      expect(initial.picks).toEqual([true, true, true, true, true, true]);
      expect(initial.height).toBe(initial.cssHeight * 2);
      await page.screenshot({
        path: info.outputPath("top-bottom-objects.png"),
      });
      // DOM drag is top-down, while the engine uses bottom-up framebuffer Y.
      await page.mouse.move(800, 300);
      await page.mouse.down();
      await page.mouse.move(800, 420, { steps: 12 });
      await page.mouse.up();
      expect(
        await page.evaluate(() => window.example.viewer.scene.splitPosition),
      ).toBeCloseTo(0.7, 2);
      const dragged = await compare("horizontal", 0.7);
      expect(dragged.mismatches).toBe(0);
      await page.screenshot({ path: info.outputPath("top-bottom.png") });

      await page.setViewportSize({ width: 1100, height: 700 });
      await page.evaluate(() => {
        const { viewer } = window.example;
        viewer.resolutionScale = 0.75;
        viewer.resize();
        viewer.scene.requestRender();
      });
      await page.waitForFunction(() => window.example.world.tilesLoaded);
      const resized = await compare("horizontal", 0.5);
      expect(resized.mismatches).toBe(0);
      expect(resized.picks).toEqual([true, true, true, true, true, true]);
      expect(resized.height).toBe(resized.cssHeight * 1.5);
      const sideways = await compare("vertical", 0.4);
      expect(sideways.mismatches).toBe(0);
      expect(sideways.differences).toBeGreaterThan(100);
      await page.screenshot({ path: info.outputPath("left-right.png") });
      expect(errors).toEqual([]);
      expect(
        await page.evaluate(() => {
          const { viewer } = window.example;
          window.example.destroy();
          return viewer.isDestroyed();
        }),
      ).toBe(true);
      await writeFile(
        info.outputPath("pixels.json"),
        JSON.stringify({ initial, dragged, resized, sideways }, null, 2),
      );
    });
  }
}
