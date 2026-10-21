import { test, expect } from "@playwright/test";

async function open(page, world, sample = "blocks") {
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.route(/^https?:\/\/(?!localhost[:/]|127\.0\.0\.1[:/])/, (route) =>
    route.abort(),
  );
  if (process.env.VIDEO_PROJECTION_RELEASE === "1") {
    await page.route("**/Build/CesiumUnminified/**", (route) =>
      route.continue({
        url: route.request().url().replace("/CesiumUnminified/", "/Cesium/"),
      }),
    );
  }
  await page.goto(`/Test/视频投射.html?world=${world}&sample=${sample}`);
  await page.waitForFunction(
    () => window.videoProjectionExample?.ready,
    undefined,
    { timeout: 45000 },
  );
  await ready(page);
  expect(errors).toEqual([]);
}

async function ready(page) {
  await page.waitForFunction(
    () => {
      const e = window.videoProjectionExample;
      if (e.errors.length) {
        throw new Error(e.errors.join("\n"));
      }
      return e.projection.projectionReady && e.projection.ready;
    },
    undefined,
    { timeout: 45000 },
  );
}

async function changedPixels(page) {
  return page.evaluate(() => {
    const e = window.videoProjectionExample,
      scene = e.viewer.scene;
    e.projection.enabled = false;
    e.viewer.render();
    const original = scene.context.readPixels();
    e.projection.enabled = true;
    e.viewer.render();
    const projected = scene.context.readPixels();
    let changed = 0;
    for (let i = 0; i < original.length; i += 4) {
      if (
        Math.abs(original[i] - projected[i]) +
          Math.abs(original[i + 1] - projected[i + 1]) +
          Math.abs(original[i + 2] - projected[i + 2]) >
        40
      ) {
        changed++;
      }
    }
    return {
      changed,
      drawCalls: e.projection.statistics.drawCalls,
      status: e.projection.status,
    };
  });
}

for (const world of ["planar", "globe"]) {
  test(`${world}: controls, media, independent observers and sunlight coexist`, async ({
    page,
  }) => {
    await open(page, world);
    expect((await changedPixels(page)).changed).toBeGreaterThan(5000);
    await page.locator("#second").check();
    await page.locator("#viewshed").check();
    await page.locator("#shadows").check();
    await page.waitForFunction(() => {
      const e = window.videoProjectionExample;
      return e.second?.projectionReady && e.viewshed?.analysisReady;
    });
    const isolation = await page.evaluate(() => {
      const e = window.videoProjectionExample,
        scene = e.viewer.scene;
      document.getElementById("video").pause();
      e.viewer.useDefaultRenderLoop = false;
      e.viewer.render();
      const observers = [e.projection, e.second, e.viewshed];
      const depths = observers.map((s) => s._observer.depth.texture);
      const sun = scene.shadowMap._shadowMapTexture;
      const upload = e.projection.statistics.videoUploads;
      const observerPosition = e.C.Cartesian3.clone(
        e.projection._observer.camera.positionWC,
      );
      scene.camera.moveRight(30);
      e.viewer.render();
      for (let i = 0; i < 5; i++) {
        e.viewer.render();
      }
      return {
        separate: new Set(depths).size === 3 && depths.every((d) => d !== sun),
        sun: !!sun && scene.shadowMap.enabled,
        sharedVideo: e.projection.video === e.second.video,
        separateMedia:
          e.projection._observer.media.texture !==
          e.second._observer.media.texture,
        uploads: e.projection.statistics.videoUploads - upload,
        unmoved: e.C.Cartesian3.equals(
          observerPosition,
          e.projection._observer.camera.positionWC,
        ),
        errors: e.errors,
      };
    });
    expect(isolation).toEqual({
      separate: true,
      sun: true,
      sharedVideo: true,
      separateMedia: true,
      uploads: 0,
      unmoved: true,
      errors: [],
    });
    await page.screenshot({
      path: `Build/Specs/e2e/video-projection/${world}-coexist.png`,
    });
    const lifecycle = await page.evaluate(() => {
      const e = window.videoProjectionExample;
      const depth = e.projection._observer.depth.texture;
      const texture = e.projection._observer.media.texture;
      const track = e.projection.video.srcObject.getVideoTracks()[0];
      e.viewer.scene.postProcessStages.remove(e.projection);
      const borrowedAlive = track.readyState === "live";
      e.dispose();
      return {
        depth: depth.isDestroyed(),
        texture: texture.isDestroyed(),
        borrowedAlive,
        stopped: track.readyState === "ended",
        viewer: e.viewer.isDestroyed(),
      };
    });
    expect(lifecycle).toEqual({
      depth: true,
      texture: true,
      borrowedAlive: true,
      stopped: true,
      viewer: true,
    });
  });

  for (const sample of ["tiles", "mesh", "instances", "oblique"]) {
    test(`${world}: ${sample} streaming coverage and video display`, async ({
      page,
    }) => {
      await open(page, world, sample);
      const result = await changedPixels(page);
      expect(result.status).toBe("ready");
      expect(result.drawCalls).toBeGreaterThan(0);
      expect(result.changed).toBeGreaterThan(500);
      if (sample === "tiles") {
        await page.locator("#flatten").check();
        await ready(page);
        expect((await changedPixels(page)).changed).toBeGreaterThan(500);
      }
    });
  }
}

test("bounded 720p / 1080p single and dual projection submission costs", async ({
  page,
}) => {
  await open(page, "planar");
  const environment = await page.evaluate(() => {
    const gl = window.videoProjectionExample.viewer.scene.context._gl;
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      browser: navigator.userAgent,
      renderer: debug
        ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER),
      gpuTimerAvailable: !!gl.getExtension("EXT_disjoint_timer_query_webgl2"),
    };
  });
  console.log("VIDEO_PROJECTION_ENVIRONMENT", JSON.stringify(environment));
  const results = [];
  for (const size of ["720", "1080"]) {
    await page.locator("#mediaSize").selectOption(size);
    await ready(page);
    for (const dual of size === "720" ? [null, false, true] : [false, true]) {
      await page.locator("#second").setChecked(dual ?? false);
      await page.locator("#enabled").setChecked(dual !== null);
      if (dual) {
        await page.waitForFunction(
          () => window.videoProjectionExample.second?.projectionReady,
        );
      }
      results.push(
        await page.evaluate(
          async ({ size, dual }) => {
            const e = window.videoProjectionExample,
              scene = e.viewer.scene;
            const active =
              dual === null
                ? []
                : [e.projection, ...(e.second ? [e.second] : [])];
            const before = active.map((p) => p.statistics.videoUploads);
            const gl = scene.context._gl;
            const timer = gl.getExtension("EXT_disjoint_timer_query_webgl2");
            const queries = [];
            const capture = [],
              upload = [];
            await new Promise((resolve) => {
              let count = 0;
              const removeStart = scene.preRender.addEventListener(() => {
                if (timer) {
                  const query = gl.createQuery();
                  queries.push(query);
                  gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
                }
              });
              const remove = scene.postRender.addEventListener(() => {
                if (timer) {
                  gl.endQuery(timer.TIME_ELAPSED_EXT);
                }
                capture.push(
                  active.reduce(
                    (sum, p) => sum + p.statistics.captureMilliseconds,
                    0,
                  ),
                );
                upload.push(
                  active.reduce(
                    (sum, p) => sum + p.statistics.videoUploadMilliseconds,
                    0,
                  ),
                );
                if (++count === 30) {
                  removeStart();
                  remove();
                  resolve();
                }
              });
            });
            capture.sort((a, b) => a - b);
            upload.sort((a, b) => a - b);
            const gpu = [];
            for (const query of queries) {
              while (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) {
                await new Promise(requestAnimationFrame);
              }
              gpu.push(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6);
              gl.deleteQuery(query);
            }
            const disjoint = timer && gl.getParameter(timer.GPU_DISJOINT_EXT);
            gpu.sort((a, b) => a - b);
            return {
              size,
              dual,
              renders: 30,
              uploads: active.map(
                (p, i) => p.statistics.videoUploads - before[i],
              ),
              depthDraws: active.map((p) => p.statistics.drawCalls),
              captureMedian: capture[15],
              captureP95: capture[28],
              lastUploadMedian: upload[15],
              wholeFrameGpuMedian: !disjoint ? gpu[15] : undefined,
              wholeFrameGpuP95: !disjoint ? gpu[28] : undefined,
              textureBytes: active.reduce(
                (sum, p) =>
                  sum +
                  p._observer.media.texture.width *
                    p._observer.media.texture.height *
                    4,
                0,
              ),
            };
          },
          { size, dual },
        ),
      );
    }
  }
  for (const result of results) {
    expect(result.uploads.every((n) => n > 0 && n <= 30)).toBe(true);
    expect(result.depthDraws.every((n) => n > 0)).toBe(true);
  }
  console.log("VIDEO_PROJECTION_COST", JSON.stringify(results));
});
