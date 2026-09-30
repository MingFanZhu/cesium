import { test, expect } from "@playwright/test";

const features = ["物理大气", "高度雾", "体积云", "日月光照", "泛光与光晕"];

for (const world of ["globe", "planar"]) {
  test(`Night stars ${world}: local assets, controls and camera`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const errors = [];
    const starRequests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (request.url().includes("tycho2t3_80")) {
        starRequests.push(request.url());
      }
    });
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      return url.hostname === "localhost" || url.protocol === "data:"
        ? route.continue()
        : route.abort();
    });
    await page.goto(`/Test/AdvancedEnvironment/夜晚星空.html?world=${world}`);
    await page.waitForFunction(() => window.example?.effects.ready);
    const camera = await page.evaluate(() => {
      const { viewer, effects } = window.example;
      return {
        z: viewer.camera.positionWC.z,
        stars: effects.showStars,
        mode: effects.mode,
      };
    });
    expect(camera.stars).toBe(true);
    expect(camera.mode).toBe(world);
    if (world === "planar") {
      expect(camera.z).toBeCloseTo(200, 3);
    }
    await page.getByLabel("星空", { exact: true }).uncheck();
    expect(await page.evaluate(() => window.example.effects.showStars)).toBe(
      false,
    );
    await page.getByLabel("星空", { exact: true }).check();
    await page.getByLabel("体积云", { exact: true }).check();
    await page.getByRole("button", { name: "白昼", exact: true }).click();
    await page.getByRole("button", { name: "深夜", exact: true }).click();
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
    expect(await page.locator(".cesium-widget-errorPanel").count()).toBe(0);
    expect(errors).toEqual([]);
    expect(starRequests).toEqual([]);
    const disposed = await page.evaluate(() => {
      const { effects } = window.example;
      const stars = effects._pipeline._resources.starsVertexArray;
      window.example.destroy();
      return stars.isDestroyed();
    });
    expect(disposed).toBe(true);
  });
}

for (const world of ["球面", "平面"]) {
  for (const feature of features) {
    test(`Environment ${world}${feature}: offline API example`, async ({
      page,
    }, info) => {
      test.setTimeout(120000);
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
      await page.goto(`/Test/AdvancedEnvironment/${world}${feature}.html`);
      await page.waitForFunction(() => window.example?.effects.ready === true);
      await page.waitForFunction(
        () => window.example.viewer.dataSourceDisplay.ready,
      );
      const control = (label) => page.getByLabel(label, { exact: true });
      await expect(page.locator("#controls .lil-gui")).toBeVisible();
      const initial = await page.evaluate(() => {
        const { viewer, effects } = window.example;
        return {
          mode: effects.mode,
          enabled: effects.enabled,
          hdr: viewer.scene.highDynamicRange,
          count: viewer.scene.controllerHost.controllerCount,
          fog: effects.showHeightFog,
          clouds: effects.showClouds,
          bloom: effects.showBloom,
        };
      });
      expect(initial).toMatchObject({
        enabled: true,
        hdr: true,
        fog: feature === "高度雾",
        clouds: feature === "体积云",
        bloom: feature === "泛光与光晕",
      });
      if (feature === "物理大气") {
        await control("空气透视").uncheck();
        expect(
          await page.evaluate(
            () => window.example.effects.showAerialPerspective,
          ),
        ).toBe(false);
        await control("空气透视").check();
      } else if (feature === "高度雾") {
        await control("雾密度").fill("0.00004");
        await control("雾密度").press("Tab");
        expect(
          await page.evaluate(() => window.example.effects.heightFogDensity),
        ).toBe(0.00004);
      } else if (feature === "体积云") {
        await control("质量").selectOption({ label: "低" });
        expect(
          await page.evaluate(() => window.example.effects.cloudQuality),
        ).toBe("low");
        await control("质量").selectOption({ label: "中" });
        const sequence = await page.evaluate(async () => {
          const C = await import("/Build/CesiumUnminified/index.js");
          const { viewer, effects } = window.example;
          viewer.useDefaultRenderLoop = false;
          const clock = viewer.clock;
          clock.clockStep = C.ClockStep.TICK_DEPENDENT;
          const values = [effects.cloudTime];
          clock.shouldAnimate = true;
          clock.multiplier = 3;
          clock.tick();
          values.push(effects.cloudTime);
          clock.multiplier = -2;
          clock.tick();
          values.push(effects.cloudTime);
          clock.shouldAnimate = false;
          clock.tick();
          values.push(effects.cloudTime);
          viewer.useDefaultRenderLoop = true;
          return values;
        });
        expect(sequence).toEqual([0, 3, 1, 1]);
      } else if (feature === "日月光照") {
        await expect(page.locator(".cesium-timeline-main")).toBeVisible();
        await page.getByRole("button", { name: "夜间", exact: true }).click();
        const time = await page.evaluate(async () => {
          const C = await import("/Build/CesiumUnminified/index.js");
          return C.JulianDate.toIso8601(
            window.example.viewer.clock.currentTime,
          );
        });
        expect(time).toBe("2026-06-21T13:00:00Z");
        await control("月光").uncheck();
        expect(
          await page.evaluate(() => window.example.effects.showMoonlight),
        ).toBe(false);
        await control("月光").check();
      } else {
        await control("泛光强度").fill("0.2");
        await control("泛光强度").press("Tab");
        expect(
          await page.evaluate(() => window.example.effects.bloomIntensity),
        ).toBe(0.2);
      }
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
      await page.screenshot({
        path: info.outputPath(`${world}${feature}.png`),
      });
      const lifecycle = await page.evaluate(() => {
        const { viewer, effects } = window.example;
        const clock = viewer.clock;
        const cloudTime = effects.cloudTime;
        const running = viewer.useDefaultRenderLoop;
        window.dispatchEvent(
          new PageTransitionEvent("pagehide", { persisted: true }),
        );
        const retained = !viewer.isDestroyed();
        window.dispatchEvent(
          new PageTransitionEvent("pagehide", { persisted: false }),
        );
        window.example.destroy();
        clock.shouldAnimate = true;
        clock.tick();
        return {
          running,
          retained,
          destroyed: viewer.isDestroyed(),
          ready: effects.ready,
          timeUnchanged: cloudTime === effects.cloudTime,
          gui: document.querySelectorAll(".lil-gui").length,
        };
      });
      expect(lifecycle).toEqual({
        running: true,
        retained: true,
        destroyed: true,
        ready: false,
        timeUnchanged: true,
        gui: 0,
      });
      expect(external).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
}

test("Functional catalogs and legacy redirects resolve", async ({
  page,
  request,
}) => {
  for (const folder of ["Planar", "AdvancedEnvironment"]) {
    await page.goto(`/Test/${folder}/示例目录.html`);
    const links = await page
      .locator("a")
      .evaluateAll((anchors) => anchors.map((a) => a.href));
    for (const url of links) {
      const response = await request.get(url);
      expect(response.ok(), url).toBe(true);
    }
  }
  for (const name of [
    "高级环境",
    "高级环境-平面",
    "平面Viewer",
    "平面API集成",
    "平面地表样式",
    "平面环境",
  ]) {
    await page.goto(`/Test/${name}.html`);
    await expect
      .poll(() => decodeURI(page.url()))
      .toMatch(/\/Test\/(AdvancedEnvironment|Planar)\//);
  }
});
