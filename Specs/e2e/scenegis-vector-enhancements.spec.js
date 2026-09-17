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
    expect(errors).toEqual([]);
  });
}
