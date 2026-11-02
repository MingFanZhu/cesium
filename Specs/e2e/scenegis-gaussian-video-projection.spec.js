import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";

async function ready(page) {
  await page.waitForFunction(
    () => {
      const e = window.gaussianVideoExample;
      if (!e) {
        return false;
      }
      if (e.errors.length || e.splats.error) {
        throw new Error(e.errors.join("\n") || e.splats.error.message);
      }
      e.viewer.render();
      return e.projection.projectionReady;
    },
    undefined,
    { timeout: 45000 },
  );
}

async function sample(page) {
  return page.evaluate(async () => {
    const e = window.gaussianVideoExample;
    const C = await import("/Build/CesiumUnminified/index.js");
    e.viewer.render();
    return [
      [5, 0, 6.3],
      [-4.5, 0, 5],
      [-2, -4, 6.2],
    ].map((point) => {
      const xy = C.SceneTransforms.worldToWindowCoordinates(
        e.scene,
        e.point(...point),
      );
      return Array.from(
        e.scene.context.readPixels({
          x: Math.round(xy.x),
          y: e.scene.drawingBufferHeight - 1 - Math.round(xy.y),
          width: 1,
          height: 1,
        }),
      );
    });
  });
}
const difference = (a, b) =>
  a
    .slice(0, 3)
    .reduce((sum, value, index) => sum + Math.abs(value - b[index]), 0);

for (const world of ["planar", "globe"]) {
  test(`Gaussian ${world}: video grid, front/rear occlusion, pause and ownership`, async ({
    page,
  }, info) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    if (process.env.VIDEO_PROJECTION_RELEASE === "1") {
      await page.route("**/Build/CesiumUnminified/**", (route) =>
        route.continue({
          url: route
            .request()
            .url()
            .replace("/CesiumUnminified/", "/SceneGIS/"),
        }),
      );
    }
    await page.goto(`/Test/Rendering/高斯视频投射.html?world=${world}`);
    await ready(page);
    await page.evaluate(() => {
      window.gaussianVideoExample.viewer.useDefaultRenderLoop = false;
    });
    const projected = await sample(page);
    await page.evaluate(() => {
      window.gaussianVideoExample.projection.enabled = false;
    });
    const original = await sample(page);
    expect(difference(projected[0], original[0])).toBeGreaterThan(50);
    expect(difference(projected[1], original[1])).toBeLessThan(25);
    expect(difference(projected[2], original[2])).toBeGreaterThan(50);
    await page.evaluate(() => {
      window.gaussianVideoExample.projection.enabled = true;
    });
    await ready(page);
    const stable = await sample(page);
    expect(await sample(page)).toEqual(stable);
    await expect
      .poll(async () => {
        await page.evaluate(() => window.gaussianVideoExample.viewer.render());
        return page.locator("#status").textContent();
      })
      .toContain("ready");
    await page.screenshot({
      path: info.outputPath(`gaussian-video-${world}.png`),
    });
    const before = await page.evaluate(() => {
      const e = window.gaussianVideoExample;
      return {
        uploads: e.projection.statistics.videoUploads,
        atlas: e.splats.statistics.gpuAtlasAllocatedBytes,
      };
    });
    await page.evaluate(() => {
      window.gaussianVideoExample.blocker.show = true;
    });
    await ready(page);
    const blocked = await sample(page);
    expect(difference(blocked[0], original[0])).toBeLessThan(25);
    const after = await page.evaluate(() => {
      const e = window.gaussianVideoExample;
      return {
        uploads: e.projection.statistics.videoUploads,
        atlas: e.splats.statistics.gpuAtlasAllocatedBytes,
      };
    });
    expect(after).toEqual(before);
    await page.evaluate(() => {
      window.gaussianVideoExample.blocker.show = false;
      window.gaussianVideoExample.projection.flipY = true;
    });
    await ready(page);
    expect(await sample(page)).not.toEqual(stable);
    await page.evaluate(() => {
      const e = window.gaussianVideoExample;
      e.destroy();
    });
    expect(
      await page.evaluate(() => {
        const e = window.gaussianVideoExample;
        return {
          scene: e.viewer.isDestroyed(),
          track: e.stream.getVideoTracks()[0].readyState,
        };
      }),
    ).toEqual({ scene: true, track: "ended" });
    expect(errors).toEqual([]);
  });
}

test("Gaussian projector loads an occluder behind the display camera", async ({
  page,
}) => {
  await page.goto("/Test/Rendering/高斯视频投射.html?world=planar&view=behind");
  await ready(page);
  await page.evaluate(() => {
    window.gaussianVideoExample.viewer.useDefaultRenderLoop = false;
  });
  const center = () =>
    page.evaluate(() => {
      const e = window.gaussianVideoExample;
      e.viewer.render();
      return Array.from(
        e.scene.context.readPixels({ x: 640, y: 400, width: 1, height: 1 }),
      );
    });
  const blocked = await center();
  const atlas = await page.evaluate(
    () => window.gaussianVideoExample.splats.statistics.gpuAtlasAllocatedBytes,
  );
  await page.locator("#threshold").selectOption("1");
  await ready(page);
  expect(difference(await center(), blocked)).toBeGreaterThan(50);
  expect(
    await page.evaluate(
      () =>
        window.gaussianVideoExample.splats.statistics.gpuAtlasAllocatedBytes,
    ),
  ).toBe(atlas);
});

test("Gaussian bounded warm GPU and resource measurement", async ({
  page,
}, info) => {
  await page.goto("/Test/Rendering/高斯视频投射.html?world=planar");
  await ready(page);
  await page.evaluate(() => {
    window.gaussianVideoExample.viewer.useDefaultRenderLoop = false;
  });
  const result = await page.evaluate(async () => {
    const e = window.gaussianVideoExample,
      gl = e.scene.context._gl;
    const extension = gl.getExtension("EXT_disjoint_timer_query_webgl2");
    const stats = e.splats.statistics;
    const frameTimes = [];
    if (extension) {
      for (let i = 0; i < 16; i++) {
        const query = gl.createQuery();
        gl.beginQuery(extension.TIME_ELAPSED_EXT, query);
        e.viewer.render();
        gl.endQuery(extension.TIME_ELAPSED_EXT);
        const deadline = performance.now() + 3000;
        while (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) {
          if (performance.now() > deadline) {
            throw new Error("GPU timer did not complete.");
          }
          await new Promise((resolve) => window.requestAnimationFrame(resolve));
        }
        if (!gl.getParameter(extension.GPU_DISJOINT_EXT)) {
          frameTimes.push(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6);
        }
        gl.deleteQuery(query);
      }
    }
    frameTimes.sort((a, b) => a - b);
    return {
      viewport: [e.scene.drawingBufferWidth, e.scene.drawingBufferHeight],
      selectedSplats: stats.selectedSplats,
      atlasBytes: stats.gpuAtlasAllocatedBytes,
      depthResolution: 1024,
      videoBytes: e.video.videoWidth * e.video.videoHeight * 4,
      capture: e.projection.statistics,
      shaderPrograms: stats.videoShaderPrograms,
      wholeFrameGpuMs: frameTimes.length
        ? {
            samples: frameTimes.length,
            median: frameTimes[Math.floor(frameTimes.length / 2)],
            p95: frameTimes[Math.floor(frameTimes.length * 0.95)],
          }
        : null,
      gpu: gl.getExtension("WEBGL_debug_renderer_info")
        ? gl.getParameter(
            gl.getExtension("WEBGL_debug_renderer_info")
              .UNMASKED_RENDERER_WEBGL,
          )
        : gl.getParameter(gl.RENDERER),
    };
  });
  expect(result.selectedSplats).toBeGreaterThan(0);
  expect(result.capture.drawCalls).toBe(1);
  expect(result.shaderPrograms).toBe(2);
  await writeFile(
    info.outputPath("gaussian-video-cost.json"),
    JSON.stringify(result, null, 2),
  );
  await info.attach("gaussian-video-cost", {
    body: JSON.stringify(result, null, 2),
    contentType: "application/json",
  });
});
