import { test, expect } from "@playwright/test";

const planarPages = [
  "基础平面",
  "影像调色",
  "地形材质",
  "相机控制",
  "实体定位",
  "实体跟踪",
  "日月与天空",
];

for (const name of planarPages) {
  test(`Planar ${name}: focused controls and page lifecycle`, async ({
    page,
  }, info) => {
    const errors = [];
    const external = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") {
        errors.push(message.text());
      }
    });
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === "localhost" || url.protocol === "data:") {
        return route.continue();
      }
      external.push(url.href);
      return route.abort();
    });
    await page.goto(`/Test/Planar/${name}.html`);
    await page.waitForFunction(() => window.example !== undefined);
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          const remove =
            window.example.viewer.scene.postRender.addEventListener(() => {
              remove();
              resolve();
            });
        }),
    );
    await page.waitForFunction(() => window.example.world.tilesLoaded);
    await expect(page.locator("#controls .lil-gui")).toBeVisible();
    const control = (label) => page.getByLabel(label, { exact: true });
    if (name === "基础平面") {
      await control("显示地表").uncheck();
      expect(await page.evaluate(() => window.example.world.show)).toBe(false);
      await control("显示地表").check();
    } else if (name === "影像调色") {
      await control("亮度").fill("0.5");
      await control("亮度").press("Tab");
      expect(await page.evaluate(() => window.example.imagery.brightness)).toBe(
        0.5,
      );
    } else if (name === "地形材质") {
      await page.waitForFunction(async () => {
        const C = await import("/Build/CesiumUnminified/index.js");
        return (
          window.example.world.getTerrainHeight(new C.Cartesian3(0, 0, 0)) >
          2500
        );
      });
      await control("材质").selectOption({ label: "高程" });
      expect(
        await page.evaluate(
          () =>
            window.example.world.material === window.example.materials.height,
        ),
      ).toBe(true);
    } else if (name === "相机控制") {
      await page.getByRole("button", { name: "俯视", exact: true }).click();
      expect(
        await page.evaluate(() => window.example.viewer.camera.direction.z),
      ).toBeCloseTo(-1);
    } else if (name === "实体定位") {
      await page
        .getByRole("button", { name: "定位一栋建筑", exact: true })
        .click();
      await expect
        .poll(() =>
          page.evaluate(() => window.example.viewer.camera.position.z),
        )
        .toBeLessThan(5000);
    } else if (name === "实体跟踪") {
      await control("跟踪目标").check();
      expect(
        await page.evaluate(
          () => window.example.viewer.trackedEntity === window.example.entity,
        ),
      ).toBe(true);
      await control("跟踪目标").uncheck();
      expect(
        await page.evaluate(
          () => window.example.viewer.trackedEntity === undefined,
        ),
      ).toBe(true);
    } else if (name === "日月与天空") {
      expect(
        await page.evaluate(() => window.example.viewer.camera.direction.z),
      ).toBeCloseTo(-Math.sin(Math.PI / 36));
      await control("基础大气").uncheck();
      expect(
        await page.evaluate(() => window.example.environment.showAtmosphere),
      ).toBe(false);
      await control("基础大气").check();
      await expect(page.locator(".cesium-timeline-main")).toBeVisible();
    }
    await page.screenshot({ path: info.outputPath(`${name}.png`) });
    const lifecycle = await page.evaluate(() => {
      const sample = window.example;
      const running = sample.viewer.useDefaultRenderLoop;
      window.dispatchEvent(
        new PageTransitionEvent("pagehide", { persisted: true }),
      );
      const cached = !sample.viewer.isDestroyed();
      window.dispatchEvent(
        new PageTransitionEvent("pagehide", { persisted: false }),
      );
      sample.destroy();
      return {
        running,
        cached,
        destroyed: sample.viewer.isDestroyed(),
        gui: document.querySelectorAll(".lil-gui").length,
      };
    });
    expect(lifecycle).toEqual({
      running: true,
      cached: true,
      destroyed: true,
      gui: 0,
    });
    expect(external).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test("Planar public data documents network failure and keeps controls usable", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) =>
    new URL(route.request().url()).hostname === "localhost"
      ? route.continue()
      : route.abort(),
  );
  await page.goto("/Test/Planar/影像与地形.html");
  await page.waitForFunction(() => window.example?.viewer.useDefaultRenderLoop);
  await expect(page.locator("#error")).toContainText("公开服务暂不可用");
  await page.getByLabel("显示地形", { exact: true }).uncheck();
  expect(
    await page.evaluate(
      () => window.example.world.terrainProvider === undefined,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
