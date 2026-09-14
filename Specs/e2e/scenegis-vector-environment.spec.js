import { test, expect } from "@playwright/test";

for (const globe of [true, false]) {
  test(`composes ${globe ? "Globe" : "Planar"} vectors with actual advanced environment and releases borrowed resources`, async ({
    page,
  }) => {
    // Includes native widget interaction and two environment resource lifecycles.
    test.setTimeout(240000);
    const errors = [],
      external = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === "localhost" || url.protocol === "data:") {
        return route.continue();
      }
      external.push(url.origin);
      return route.abort();
    });
    await page.setViewportSize({ width: 800, height: 600 });
    await page.goto(
      `/Test/vector-tiles/${globe ? "globe" : "public"}.html?provider=local`,
    );
    await page.waitForFunction(
      () => window.publicVectorPreview?.layer?.tilesLoaded,
    );
    await expect(
      page.locator(".cesium-viewer-timelineContainer"),
    ).toBeVisible();
    await expect(
      page.locator(".cesium-viewer-animationContainer"),
    ).toBeVisible();
    await page.evaluate(() => {
      const p = window.publicVectorPreview;
      window.envBaseline = {
        layer: p.layer,
        workers: p.layer._workers,
        controllers: p.viewer.scene.controllerHost.controllerCount,
        hdr: p.viewer.scene.highDynamicRange,
      };
    });
    await page.locator("#env-quality").selectOption("low");
    await page.locator("#env-enabled").check();
    await page.waitForFunction(
      () => window.publicVectorPreview.environment.effects?.ready,
      undefined,
      { timeout: 45000 },
    );
    await expect(page.locator("#env-status")).toContainText("高级环境已就绪");
    const enabled = await page.evaluate((globe) => {
      const p = window.publicVectorPreview,
        s = p.viewer.scene;
      const record =
        s.frameState[
          globe ? "_sceneGISGlobeLighting" : "_sceneGISPlanarLighting"
        ];
      window.envTextures = [
        record.atlasTexture,
        record.transmittanceTexture,
        record.irradianceTexture,
      ];
      return {
        same:
          p.layer === window.envBaseline.layer &&
          p.layer._workers === window.envBaseline.workers,
        controllers:
          s.controllerHost.controllerCount - window.envBaseline.controllers,
        active: record.active,
        pipeline: !!s._sceneGISEnvironmentEffectsPipeline,
        physical: p.layer._drawOrder.some((batch) =>
          batch.renderCommands.some((command) =>
            command.shaderProgram.fragmentShaderSource.defines.includes(
              "SCENEGIS_VECTOR_ENVIRONMENT",
            ),
          ),
        ),
        errors: p.environment.error,
        hdr: s.highDynamicRange,
      };
    }, globe);
    expect(enabled).toEqual({
      same: true,
      controllers: globe ? 1 : 2,
      active: true,
      pipeline: true,
      physical: true,
      hdr: true,
    });
    await page.getByText("光照与大气参数", { exact: true }).click();
    await page.locator("#env-surfaceRadianceScale").fill("3");
    await page.getByText("云层参数", { exact: true }).click();
    await page.locator("#env-cloudCoverage").fill("0.2");
    await page.locator("#env-cloudBaseHeight").fill("2200");
    await page.locator("#env-cloudWindDirection").fill("90");
    await page.getByText("雾与泛光参数", { exact: true }).click();
    await page.locator("#env-heightFogDensity").fill("12");
    await page.locator("#env-bloomIntensity").fill("0.08");
    const parameters = await page.evaluate(() => {
      const p = window.publicVectorPreview,
        e = p.environment.effects;
      return [
        e.surfaceRadianceScale,
        e.cloudCoverage,
        e.cloudBaseHeight,
        e.cloudWindDirection,
        e.heightFogDensity,
        e.bloomIntensity,
      ];
    });
    expect(parameters.slice(0, 3)).toEqual([3, 0.2, 2200]);
    expect(parameters[3]).toBeCloseTo(Math.PI / 2);
    expect(parameters[4]).toBeCloseTo(0.000012, 8);
    expect(parameters[5]).toBe(0.08);
    await page.evaluate((globe) => {
      const p = window.publicVectorPreview,
        s = p.viewer.scene;
      const r =
        s.frameState[
          globe ? "_sceneGISGlobeLighting" : "_sceneGISPlanarLighting"
        ];
      window.envSunBeforeScrub = { ...r.sunDirection };
      window.envCloudBeforeScrub = p.environment.effects.cloudTime;
    }, globe);
    const timeline = page.locator(".cesium-timeline-bar");
    const bar = await timeline.boundingBox();
    await timeline.click({
      position: { x: bar.width * 0.8, y: bar.height / 2 },
    });
    await expect(page.locator("#env-light")).toHaveValue("custom");
    await page.waitForFunction((globe) => {
      const p = window.publicVectorPreview,
        s = p.viewer.scene;
      const sun =
        s.frameState[
          globe ? "_sceneGISGlobeLighting" : "_sceneGISPlanarLighting"
        ].sunDirection;
      const old = window.envSunBeforeScrub;
      return (
        Math.hypot(sun.x - old.x, sun.y - old.y, sun.z - old.z) > 0.2 &&
        Math.abs(p.environment.effects.cloudTime - window.envCloudBeforeScrub) >
          3600
      );
    }, globe);
    await page
      .locator("g.cesium-animation-rectButton")
      .filter({ hasText: "Play Forward" })
      .click();
    await page.waitForFunction(
      () => window.publicVectorPreview.viewer.clock.shouldAnimate,
    );
    await page.evaluate(() => {
      window.envPlayTime =
        window.publicVectorPreview.environment.effects.cloudTime;
    });
    await page.waitForFunction(
      () =>
        window.publicVectorPreview.environment.effects.cloudTime >
        window.envPlayTime + 60,
    );
    await page
      .locator("g.cesium-animation-rectButton")
      .filter({ hasText: "Pause" })
      .click();
    expect(
      await page.evaluate(
        () => window.publicVectorPreview.viewer.clock.shouldAnimate,
      ),
    ).toBe(false);
    await page.locator("#env-light").selectOption("night");
    await page.locator("#env-cloud-shadows").uncheck();
    await page.locator("#env-fog").uncheck();
    if (globe) {
      await page.locator("#terrain").check();
      await page.locator("#tilt").click();
      await page.waitForFunction(
        () => window.publicVectorPreview.viewer.scene.globe.tilesLoaded,
      );
      expect(
        await page.evaluate(
          () => window.publicVectorPreview.viewer.scene.globe.enableLighting,
        ),
      ).toBe(false);
      await page.locator("#env-shadows").check();
    }
    await expect(page.locator("#error")).toBeEmpty();
    await expect(page.locator("#env-status")).toContainText("高级环境已就绪");
    const chosenTime = await page.evaluate(async () => {
      const C = await import("/Build/CesiumUnminified/index.js");
      return C.JulianDate.toIso8601(
        window.publicVectorPreview.viewer.clock.currentTime,
      );
    });
    await page.locator("#env-enabled").uncheck();
    await expect(page.locator("#error")).toBeEmpty();
    const released = await page.evaluate((globe) => {
      const p = window.publicVectorPreview,
        s = p.viewer.scene;
      return {
        record:
          !s.frameState[
            globe ? "_sceneGISGlobeLighting" : "_sceneGISPlanarLighting"
          ],
        pipeline: !s._sceneGISEnvironmentEffectsPipeline,
        textures: window.envTextures.every((texture) => texture.isDestroyed()),
        controllers:
          s.controllerHost.controllerCount === window.envBaseline.controllers,
        hdr: s.highDynamicRange === window.envBaseline.hdr,
        nativeShadows: !globe || s.shadowMap.enabled,
      };
    }, globe);
    expect(released).toEqual({
      record: true,
      pipeline: true,
      textures: true,
      controllers: true,
      hdr: true,
      nativeShadows: true,
    });
    await page.locator("#env-enabled").check();
    await page.waitForFunction(
      () =>
        window.publicVectorPreview.environment.effects?.ready ||
        document.querySelector("#error").textContent,
      undefined,
      { timeout: 45000 },
    );
    await expect(page.locator("#error")).toBeEmpty();
    await expect(page.locator("#env-status")).toContainText("高级环境已就绪");
    const retained = await page.evaluate(async () => {
      const C = await import("/Build/CesiumUnminified/index.js"),
        p = window.publicVectorPreview;
      return {
        time: C.JulianDate.toIso8601(p.viewer.clock.currentTime),
        surface: p.environment.effects.surfaceRadianceScale,
        coverage: p.environment.effects.cloudCoverage,
        layer: p.layer === window.envBaseline.layer,
      };
    });
    expect(retained).toEqual({
      time: chosenTime,
      surface: 3,
      coverage: 0.2,
      layer: true,
    });
    await page.locator("#env-reset").click();
    expect(
      await page.evaluate(
        () =>
          window.publicVectorPreview.environment.effects.surfaceRadianceScale,
      ),
    ).toBe(10);
    expect(
      await page.evaluate(
        () => window.publicVectorPreview.environment.effects.cloudCoverage,
      ),
    ).toBe(globe ? 0.3 : 0.45);
    expect(errors).toEqual([]);
    expect(external).toEqual([]);
  });
}
