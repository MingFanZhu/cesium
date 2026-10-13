import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";

test("Bistro deferred lighting preserves day/night responses and measures equal-quality cost", async ({
  page,
}, testInfo) => {
  test.setTimeout(240000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/Test/Rendering/延迟光照原型.html?world=globe");
  await page.waitForFunction(() => window.example?.deferred.ready, undefined, {
    timeout: 120000,
  });
  await page.evaluate(() => {
    const e = window.example;
    e.viewer.useDefaultRenderLoop = false;
    e.viewer.scene.rethrowRenderErrors = true;
    window.deferredErrors = [];
    e.viewer.scene.renderError.addEventListener((scene, error) =>
      window.deferredErrors.push(error.message),
    );
  });
  const report = await page.evaluate(async () => {
    const C = await import("/Build/CesiumUnminified/index.js");
    const e = window.example,
      viewer = e.viewer,
      scene = viewer.scene,
      context = scene.context;
    const gl = context._gl;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const timer = gl.getExtension("EXT_disjoint_timer_query_webgl2");
    const report = {
      renderer: info && gl.getParameter(info.UNMASKED_RENDERER_WEBGL),
      comparisons: [],
      timing: [],
      ao: e.ao.enabled,
      ssr: e.ssr.enabled,
      samples: scene.msaaSamples,
    };
    const width = scene.drawingBufferWidth,
      height = scene.drawingBufferHeight;
    const target = new C.FramebufferManager({
      pixelDatatype: C.PixelDatatype.FLOAT,
    });
    target.update(context, width, height);
    const copy = context.createViewportQuadCommand(
      "uniform sampler2D u_texture; void main(){out_FragColor=texelFetch(u_texture,ivec2(gl_FragCoord.xy),0);}",
      {
        framebuffer: target.framebuffer,
        uniformMap: {
          u_texture: () =>
            (scene._environmentState.useGlobeDepthFramebuffer
              ? scene._view.globeDepth.colorFramebufferManager
              : scene._view.sceneFramebuffer._colorFramebuffer
            ).getColorTexture(),
        },
      },
    );
    const read = () => {
      copy.execute(context);
      return context.readPixels({
        framebuffer: target.framebuffer,
        width,
        height,
      });
    };
    // Isolate current-frame lighting from temporal histories; the performance/motion case below retains TAA.
    e.taa.enabled = false;
    try {
      for (const [hour, ssil] of [
        [14, false],
        [22, false],
        [14, true],
      ]) {
        e.ssil.enabled = ssil;
        e.atmosphere.hour = hour;
        e.state.setTime();
        e.deferred.enabled = false;
        e.ssr.reset();
        viewer.render();
        const reference = read();
        e.deferred.enabled = true;
        e.ssr.reset();
        viewer.render();
        const actual = read();
        let sum = 0,
          maximum = 0,
          nonfinite = 0;
        for (let i = 0; i < reference.length; ++i) {
          if (i % 4 === 3) {
            continue;
          }
          if (!Number.isFinite(actual[i])) {
            ++nonfinite;
          }
          const error =
            Math.abs(actual[i] - reference[i]) / (1 + Math.abs(reference[i]));
          sum += error;
          maximum = Math.max(maximum, error);
        }
        report.comparisons.push({
          hour,
          ssil,
          mean: sum / (width * height * 3),
          maximum,
          nonfinite,
        });
      }
    } finally {
      copy.shaderProgram.destroy();
      target.destroy();
    }
    e.atmosphere.hour = 14;
    e.state.setTime();
    e.ssil.enabled = false;
    e.taa.enabled = true;
    for (const enabled of [false, true]) {
      e.deferred.enabled = enabled;
      e.taa.reset();
      e.ssr.reset();
      viewer.render();
      const durations = [];
      if (timer) {
        for (let i = 0; i < 8; ++i) {
          const query = gl.createQuery();
          gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
          viewer.render();
          gl.endQuery(timer.TIME_ELAPSED_EXT);
          while (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) {
            await new Promise(window.requestAnimationFrame);
          }
          if (gl.getParameter(timer.GPU_DISJOINT_EXT)) {
            throw new Error("Disjoint GPU timing");
          }
          durations.push(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6);
          gl.deleteQuery(query);
        }
      }
      report.timing.push({
        enabled,
        durations,
        materialDraws: e.deferred.drawCount,
        lightingDraws: e.deferred.lightDrawCount,
        groups: e.deferred.groupCount,
        materialDepthBytes: e.deferred.byteLength,
        sharedDepth:
          e.deferred._linearDepth === e.ssr._state.depth.getColorTexture(),
        ssrCaptureDraws: e.ssr._state.captureDraws,
      });
    }
    return report;
  });
  console.log(JSON.stringify(report));
  await writeFile(
    testInfo.outputPath("deferred-report.json"),
    JSON.stringify(report, null, 2),
  );
  expect(report.ao && report.ssr).toBe(true);
  expect(report.samples).toBe(1);
  for (const comparison of report.comparisons) {
    expect(comparison.nonfinite).toBe(0);
    expect(comparison.mean).toBeLessThan(0.01);
  }
  expect(report.timing[1].groups).toBe(1);
  expect(report.timing[1].lightingDraws).toBe(1);
  expect(report.timing[1].ssrCaptureDraws).toBe(0);
  expect(report.timing[1].sharedDepth).toBe(true);
  expect(report.timing[1].materialDepthBytes).toBe(1280 * 800 * 32);
  await page.screenshot({ path: testInfo.outputPath("day.png") });
  const motion = await page.evaluate(() => {
    const e = window.example;
    const texture = e.deferred._raw.getColorTexture();
    const depth = e.deferred._linearDepth;
    e.ssil.enabled = true;
    for (let i = 0; i < 24; ++i) {
      e.viewer.camera.moveRight(0.08);
      e.viewer.render();
    }
    return {
      taa: e.taa.ready,
      deferred: e.deferred.ready,
      sameTexture: texture === e.deferred._raw.getColorTexture(),
      sharedDepth:
        depth === e.deferred._linearDepth &&
        depth === e.ssil._state.sourceDepth,
    };
  });
  expect(motion).toEqual({
    taa: true,
    deferred: true,
    sameTexture: true,
    sharedDepth: true,
  });
  await page.screenshot({ path: testInfo.outputPath("motion.png") });
  await page.evaluate(() => {
    const e = window.example;
    e.atmosphere.hour = 22;
    e.state.setTime();
    e.autoExposure.enabled = true;
    e.autoExposure.reset();
    e.viewer.render();
  });
  await page.screenshot({
    path: testInfo.outputPath("night-auto-exposure.png"),
  });
  const lifetime = await page.evaluate(() => {
    const e = window.example,
      renderer = e.deferred,
      texture = renderer._raw.getColorTexture();
    e.viewer.destroy();
    return {
      texture: texture.isDestroyed(),
      renderer: renderer.isDestroyed(),
      errors: window.deferredErrors,
    };
  });
  expect(lifetime).toEqual({ texture: true, renderer: true, errors: [] });
  expect(errors).toEqual([]);
});
