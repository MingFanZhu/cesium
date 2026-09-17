import { test, expect } from "@playwright/test";

for (const world of ["平面", "球面"]) {
  test(`${world} material examples load local MVT, share sprites and retain batches while moving`, async ({
    page,
  }, info) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/Test/vector-tiles/${world}样式增强.html`);
    await page.waitForFunction(
      () =>
        window.vectorEnhancements?.layer.ready &&
        window.vectorEnhancements.layer.tilesLoaded,
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
    await page.mouse.click(640, 400);
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
    expect(errors).toEqual([]);
  });
}
