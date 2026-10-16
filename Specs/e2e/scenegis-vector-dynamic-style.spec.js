import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";

for (const release of [false, true]) {
  for (const world of ["平面", "球面"]) {
    test(`${world} dynamic style controls and export (${release ? "release" : "development"})`, async ({
      page,
    }, info) => {
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      if (release) {
        // Exercise the same example with a coherent release bundle and Worker base.
        for (const pattern of [
          "**/Test/vector-tiles/*.html",
          "**/Test/vector-tiles/style-enhancements.js",
        ]) {
          await page.route(pattern, async (route) => {
            const response = await route.fetch();
            await route.fulfill({
              response,
              body: (await response.text()).replaceAll(
                "/Build/CesiumUnminified/",
                "/Build/Cesium/",
              ),
            });
          });
        }
      }
      await page.goto(`/Test/vector-tiles/${world}样式增强.html`);
      await page.waitForFunction(
        () =>
          window.vectorEnhancements?.layer.ready &&
          window.vectorEnhancements.layer.tilesLoaded,
      );
      await page.evaluate(() => {
        const { layer } = window.vectorEnhancements;
        window.dynamicStyleResources = {
          layer,
          sources: layer._sources,
          workers: layer._workers,
          atlas: layer._patterns.texture,
          errors: [],
        };
        layer.errorEvent.addEventListener(({ error }) =>
          window.dynamicStyleResources.errors.push(error.message),
        );
        layer.setGlobalStateProperty("waterOpacity", 0.45);
        layer.setFeatureState(
          { source: "fixture", sourceLayer: "transportation", id: "203" },
          { selected: true },
        );
      });
      await page.screenshot({ path: info.outputPath("before.png") });
      for (const [name, value] of [
        ["道路宽度", "40"],
        ["建筑高度", "160"],
        ["标注字号", "26"],
      ]) {
        const input = page.getByRole("textbox", { name, exact: true });
        await input.fill(value);
        await input.press("Enter");
      }
      await page
        .getByRole("checkbox", { name: "显示水面", exact: true })
        .uncheck();
      await page
        .getByRole("checkbox", { name: "显示标注", exact: true })
        .uncheck();
      await page.waitForFunction(
        () => window.vectorEnhancements.layer.tilesLoaded,
      );
      await page.screenshot({ path: info.outputPath("edited.png") });
      const downloadPromise = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "导出当前样式", exact: true })
        .click();
      const download = await downloadPromise;
      const snapshot = JSON.parse(
        await readFile(await download.path(), "utf8"),
      );
      const rule = (id) => snapshot.layers.find((layer) => layer.id === id);
      expect(rule("road").paint["line-width"]).toBe(40);
      expect(rule("building").paint["fill-extrusion-height"]).toBe(160);
      expect(rule("poi").layout["text-size"]).toBe(26);
      expect(rule("water").layout.visibility).toBe("none");
      expect(rule("poi").filter).toEqual(["==", ["id"], ""]);
      expect(Object.keys(snapshot).sort()).toEqual([
        "glyphs",
        "layers",
        "sources",
        "sprite",
        "version",
      ]);
      await page
        .getByRole("button", { name: "恢复初始规则", exact: true })
        .click();
      await page.waitForFunction(
        () => window.vectorEnhancements.layer.tilesLoaded,
      );
      const result = await page.evaluate(() => {
        const { viewer, layer } = window.vectorEnhancements;
        const old = window.dynamicStyleResources;
        return {
          retained:
            old.layer === layer &&
            old.sources === layer._sources &&
            old.workers === layer._workers &&
            old.atlas === layer._patterns.texture,
          rendering: viewer.useDefaultRenderLoop,
          selected: layer.getFeatureState({
            source: "fixture",
            sourceLayer: "transportation",
            id: "203",
          }).selected,
          waterOpacity: layer.getGlobalState().waterOpacity,
          lineWidth: layer.getPaintProperty("road", "line-width"),
          visibility: layer.getLayoutProperty("water", "visibility"),
          filter: layer.getFilter("poi"),
          errors: old.errors,
        };
      });
      expect(result.retained).toBe(true);
      expect(result.rendering).toBe(true);
      expect(result.selected).toBe(true);
      expect(result.waterOpacity).toBe(0.45);
      expect(result.lineWidth).toEqual([
        "case",
        ["boolean", ["feature-state", "selected"], false],
        40,
        24,
      ]);
      expect(result.visibility).toBeUndefined();
      expect(result.filter).toBeUndefined();
      expect(result.errors).toEqual([]);
      expect(errors).toEqual([]);
      await page.screenshot({ path: info.outputPath("restored.png") });
    });
  }
}
