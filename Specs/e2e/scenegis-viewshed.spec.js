import { test, expect } from "@playwright/test";

async function nextFrame(page) {
  await page.evaluate(() => window.viewshedExample.viewer.render());
}

async function colors(page) {
  let result;
  await expect
    .poll(
      async () => {
        result = await page.evaluate(() => {
          const { viewer, errors } = window.viewshedExample;
          viewer.render();
          if (errors.length) {
            throw new Error(errors.join("\n"));
          }
          const analysis = window.viewshedExample.analysis;
          if (analysis.enabled && !analysis.analysisReady) {
            return undefined;
          }
          const pixels = viewer.scene.context.readPixels();
          let red = 0,
            green = 0;
          for (let i = 0; i < pixels.length; i += 4) {
            const r = pixels[i],
              g = pixels[i + 1],
              b = pixels[i + 2];
            if (r > 80 && r > g * 1.4 && r > b * 1.4) {
              red++;
            }
            if (g > 80 && g > r * 1.4 && g > b * 1.3) {
              green++;
            }
          }
          return { red, green };
        });
        return result !== undefined;
      },
      { timeout: 15000 },
    )
    .toBe(true);
  return result;
}

async function open(page, world, sample) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.route(/^https?:\/\/(?!localhost[:/]|127\.0\.0\.1[:/])/, (route) =>
    route.abort(),
  );
  if (process.env.VIEWSHED_RELEASE === "1") {
    await page.route("**/Build/CesiumUnminified/**", (route) =>
      route.continue({
        url: route.request().url().replace("/CesiumUnminified/", "/Cesium/"),
      }),
    );
  }
  await page.goto(`/Test/可视域分析.html?world=${world}&sample=${sample}`);
  await page.waitForFunction(() => window.viewshedExample?.ready, undefined, {
    timeout: 45000,
  });
  await page.waitForFunction(
    () => {
      const t = window.viewshedExample;
      if (t.analysis.error) {
        throw t.analysis.error;
      }
      return t.analysis.analysisReady && t.analysis.ready;
    },
    undefined,
    { timeout: 45000 },
  );
  return errors;
}

for (const world of ["planar", "globe"]) {
  test(`${world}: directed viewshed controls, offscreen occlusion, pick and lifecycle`, async ({
    page,
  }, info) => {
    test.setTimeout(90000);
    const errors = await open(page, world, "blocks");
    await expect(page.locator("#frustum")).toBeChecked();
    const guideState = await page.evaluate(() => {
      const { analysis } = window.viewshedExample;
      return {
        shown: analysis.showFrustum,
        draws: analysis.statistics.drawCalls,
      };
    });
    expect(guideState.shown).toBe(true);
    await page.evaluate(() => {
      const t = window.viewshedExample;
      const pose = t.pose();
      t.viewer.camera.viewBoundingSphere(
        new t.C.BoundingSphere(pose.position, pose.distance),
        new t.C.HeadingPitchRange(0.5, -0.4, pose.distance * 2.8),
      );
      t.viewer.camera.lookAtTransform(t.C.Matrix4.IDENTITY);
    });
    await colors(page);
    await page.screenshot({
      path: info.outputPath(`${world}-range-guide.png`),
    });
    await page.click("#home");
    await page.uncheck("#frustum");
    await nextFrame(page);
    expect(
      await page.evaluate(() => window.viewshedExample.analysis.showFrustum),
    ).toBe(false);
    const initial = await colors(page);
    expect(initial.red).toBeGreaterThan(100);
    expect(initial.green).toBeGreaterThan(100);
    await page.screenshot({ path: info.outputPath(`${world}-blocks.png`) });
    expect(
      await page.evaluate(
        () => window.viewshedExample.analysis.statistics.drawCalls,
      ),
    ).toBe(guideState.draws);
    await page.check("#frustum");
    await page.uncheck("#enabled");
    await nextFrame(page);
    expect(
      await page.evaluate(() => {
        const { analysis } = window.viewshedExample;
        return analysis.showFrustum && !analysis.enabled;
      }),
    ).toBe(true);
    await page.check("#enabled");
    await page.uncheck("#frustum");
    await page.uncheck("#source");
    const clear = await colors(page);
    expect(clear.red).toBeLessThan(initial.red * 0.1);
    await page.check("#source");
    await page.locator("#heading").evaluate((input) => {
      input.value = "25";
      input.dispatchEvent(new Event("input"));
    });
    const turned = await colors(page);
    expect(turned).not.toEqual(initial);
    await page.locator("#heading").evaluate((input) => {
      input.value = "0";
      input.dispatchEvent(new Event("input"));
    });
    const stable = await page.evaluate(async () => {
      const t = window.viewshedExample;
      const scene = t.viewer.scene;
      const depth = t.analysis._observer.depth.texture;
      scene.pick(new t.C.Cartesian2(800, 400));
      const matrix = t.C.Matrix4.clone(scene.camera.viewMatrix);
      const pose = t.pose();
      t.viewer.camera.setView({
        destination: t.point(15, 40, 20),
        orientation: {
          direction: t.C.Cartesian3.normalize(
            t.C.Cartesian3.subtract(
              t.point(15, 40, 0),
              t.point(15, 40, 20),
              new t.C.Cartesian3(),
            ),
            new t.C.Cartesian3(),
          ),
          up: t.C.Matrix4.multiplyByPointAsVector(
            t.frame,
            t.C.Cartesian3.UNIT_Y,
            new t.C.Cartesian3(),
          ),
        },
      });
      return {
        sameDepth: t.analysis._observer.depth.texture === depth,
        unchangedPose: t.C.Cartesian3.equals(
          t.analysis._observer.camera.positionWC,
          pose.position,
        ),
        mainChanged: !t.C.Matrix4.equals(matrix, scene.camera.viewMatrix),
      };
    });
    expect(stable).toEqual({
      sameDepth: true,
      unchangedPose: true,
      mainChanged: true,
    });
    const offscreen = await colors(page);
    expect(offscreen.red).toBeGreaterThan(100);
    await page.evaluate(() => window.viewshedExample.home());
    await colors(page);
    const performance = await page.evaluate(() => {
      const t = window.viewshedExample;
      const scene = t.viewer.scene;
      t.viewer.useDefaultRenderLoop = false;
      const measure = (enabled) => {
        t.analysis.enabled = enabled;
        let coverageComplete = true;
        const times = [],
          capture = [];
        for (let i = 0; i < 32; i++) {
          const start = window.performance.now();
          t.viewer.render();
          coverageComplete &&= !enabled || t.analysis.analysisReady;
          if (i >= 2) {
            times.push(window.performance.now() - start);
            capture.push(t.analysis.statistics.captureMilliseconds);
          }
        }
        times.sort((a, b) => a - b);
        capture.sort((a, b) => a - b);
        return {
          renderCpuMedian: times[15],
          renderCpuP95: times[28],
          captureCpuMedian: enabled ? capture[15] : 0,
          coverageComplete,
        };
      };
      const on = measure(true),
        off = measure(false);
      const depth = t.analysis._observer.depth.texture;
      const report = {
        off,
        on,
        draws: t.analysis.statistics.drawCalls,
        textureBytes: depth.sizeInBytes,
        renderer: scene.context._gl.getParameter(scene.context._gl.RENDERER),
      };
      t.viewer.useDefaultRenderLoop = true;
      t.analysis.enabled = true;
      return report;
    });
    await info.attach("CPU submission cost", {
      body: JSON.stringify(performance, null, 2),
      contentType: "application/json",
    });
    expect(performance.draws).toBeGreaterThan(0);
    expect(performance.on.coverageComplete).toBe(true);
    const lifecycle = await page.evaluate(() => {
      const t = window.viewshedExample;
      const depth = t.analysis._observer.depth.texture;
      const sources = [...t.sources];
      t.viewer.scene.postProcessStages.remove(t.analysis);
      const result = {
        depth: depth.isDestroyed(),
        sourcesLive: sources.every((s) => !s.isDestroyed()),
        observers: t.viewer.scene._sceneGISObservers.size,
        errors: t.errors,
      };
      t.viewer.destroy();
      return result;
    });
    expect(lifecycle).toEqual({
      depth: true,
      sourcesLive: true,
      observers: 0,
      errors: [],
    });
    expect(errors).toEqual([]);
  });
}

const samples = ["tiles", "mesh", "instances"];
if (process.env.VIEWSHED_OBLIQUE === "1") {
  samples.push("oblique");
}
for (const world of ["planar", "globe"]) {
  for (const sample of samples) {
    test(`${world}: ${sample} observer streaming and native geometry`, async ({
      page,
    }, info) => {
      test.setTimeout(90000);
      const errors = await open(page, world, sample);
      const before = await colors(page);
      expect(before.green + before.red).toBeGreaterThan(100);
      await page.screenshot({
        path: info.outputPath(`${world}-${sample}.png`),
      });
      if (sample === "tiles") {
        await page.check("#flatten");
        const after = await colors(page);
        expect(after).not.toEqual(before);
        await page.uncheck("#flatten");
      }
      await page.evaluate(() => {
        const t = window.viewshedExample;
        t.viewer.camera.setView({
          destination: t.point(10000, 10000, 1000),
          orientation: {
            direction: t.C.Matrix4.multiplyByPointAsVector(
              t.frame,
              new t.C.Cartesian3(0, 0, -1),
              new t.C.Cartesian3(),
            ),
            up: t.C.Matrix4.multiplyByPointAsVector(
              t.frame,
              t.C.Cartesian3.UNIT_Y,
              new t.C.Cartesian3(),
            ),
          },
        });
      });
      await nextFrame(page);
      const result = await page.evaluate(() => {
        const t = window.viewshedExample;
        return {
          ready: t.analysis.analysisReady,
          draws: t.analysis.statistics.drawCalls,
          errors: t.errors,
          stats: t.sources[0].statistics,
          observer: t.analysis.statistics,
        };
      });
      expect(result.ready).toBe(true);
      expect(result.draws).toBeGreaterThan(0);
      expect(result.errors).toEqual([]);
      expect(errors).toEqual([]);
      await info.attach("observer", {
        body: JSON.stringify(result, null, 2),
        contentType: "application/json",
      });
      await page.evaluate(() => window.viewshedExample.dispose());
    });
  }
}
