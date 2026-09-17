import { test, expect } from "@playwright/test";

for (const world of ["平面", "球面"]) {
  test(`${world} material examples load local MVT, share sprites and retain batches while moving`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 1061, height: 852 });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") {
        errors.push(message.text());
      }
    });
    await page.goto(`/Test/vector-tiles/${world}样式增强.html`);
    await page.waitForFunction(
      () =>
        window.vectorEnhancements?.layer.ready &&
        window.vectorEnhancements.layer.tilesLoaded &&
        (window.vectorEnhancements.viewer.scene.globe?.tilesLoaded ?? true),
    );
    await expect(page.locator("#status")).toContainText("点击地图");
    const initial = await page.evaluate(() => {
      const { layer } = window.vectorEnhancements;
      window.patternAtlas = layer._patterns.texture;
      return {
        commands: layer.statistics.drawCommands,
        pattern: layer._drawOrder.filter((b) => b._pattern).length,
      };
    });
    expect(initial.commands).toBeGreaterThan(0);
    expect(initial.pattern).toBeGreaterThan(0);
    const anchors = await page.evaluate(() =>
      window.vectorEnhancements.layer._symbols._placed
        .filter((c) => c.placed?.text)
        .map((c) => c.variableAnchor),
    );
    expect(new Set(anchors).size).toBeGreaterThanOrEqual(3);
    const fitted = await page.evaluate(() =>
      window.vectorEnhancements.layer._symbols._placed
        .filter((c) => c.placed?.text)
        .map((c) => ({
          quads: c.shaped.icon.quads.length,
          paired: c.shaped.icon === c.shaped.icons.get(c.variableAnchor),
          width: c.shaped.icon.box[2] - c.shaped.icon.box[0],
        })),
    );
    expect(fitted.every((c) => c.quads === 9 && c.paired)).toBe(true);
    expect(new Set(fitted.map((c) => c.width)).size).toBeGreaterThanOrEqual(3);
    await page.screenshot({ path: info.outputPath(`${world}-patterns.png`) });
    await page.getByRole("button", { name: "俯视", exact: true }).click();
    await page.waitForFunction(
      () => window.vectorEnhancements.layer.tilesLoaded,
    );
    expect(
      await page.evaluate(
        () =>
          window.patternAtlas ===
          window.vectorEnhancements.layer._patterns.texture,
      ),
    ).toBe(true);
    const viewport = page.viewportSize();
    await page.mouse.click(viewport.width / 2, viewport.height / 2);
    await page.waitForFunction(
      () => window.vectorEnhancements.layer.tilesLoaded,
    );
    expect(
      await page.evaluate(
        () =>
          window.vectorEnhancements.layer.getFeatureState({
            source: "fixture",
            sourceLayer: "transportation",
            id: "203",
          }).selected,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "清除选中", exact: true }).click();
    expect(
      await page.evaluate(() =>
        window.vectorEnhancements.layer.getFeatureState({
          source: "fixture",
          sourceLayer: "transportation",
          id: "203",
        }),
      ),
    ).toEqual({});
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          const { viewer } = window.vectorEnhancements;
          const remove = viewer.scene.postRender.addEventListener(() => {
            remove();
            resolve();
          });
          viewer.camera.moveBackward(100000);
        }),
    );
    await page.waitForFunction(
      () =>
        window.vectorEnhancements.layer.tilesLoaded &&
        (window.vectorEnhancements.viewer.scene.globe?.tilesLoaded ?? true),
    );
    const distant = await page.evaluate(() => {
      const { viewer, layer } = window.vectorEnhancements;
      return {
        rendering: viewer.useDefaultRenderLoop,
        visible: layer.statistics.visibleTiles,
        rendered: layer.statistics.renderedTiles,
        zoom: layer.statistics.zoom,
      };
    });
    expect(distant.rendering).toBe(true);
    expect(distant.visible).toBeLessThanOrEqual(32);
    expect(distant.rendered).toBeGreaterThan(0);
    expect(distant.zoom).toBeLessThan(15);
    expect(errors).toEqual([]);
  });
}
