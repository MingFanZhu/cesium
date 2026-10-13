import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";

test("Bistro native material buffers, navigation, clock and measured replay cost", async ({
  page,
}, testInfo) => {
  test.setTimeout(240000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/Test/Rendering/GBuffer原型.html?world=globe");
  await page.waitForFunction(() => window.example?.gbuffer.ready, undefined, {
    timeout: 120000,
  });
  await page.evaluate(() => {
    const scene = window.example.viewer.scene;
    window.gbufferRenderErrors = [];
    scene.renderError.addEventListener((scene, error) =>
      window.gbufferRenderErrors.push(error.message),
    );
    scene.rethrowRenderErrors = true;
    window.example.viewer.useDefaultRenderLoop = false;
  });
  const report = await page.evaluate(async () => {
    const C = await import("/Build/CesiumUnminified/index.js");
    const example = window.example;
    const viewer = example.viewer;
    const scene = viewer.scene;
    const probe = example.gbuffer;
    const context = scene.context;
    const gl = context._gl;
    const renderer = gl.getExtension("WEBGL_debug_renderer_info");
    const timer = gl.getExtension("EXT_disjoint_timer_query_webgl2");
    const result = {
      renderer: renderer && gl.getParameter(renderer.UNMASKED_RENDERER_WEBGL),
      timing: [],
    };
    // Time complete frames after compiling each configuration once. Report, do not gate on GPU speed.
    for (const config of [
      { enabled: false, samples: 1 },
      { enabled: true, samples: 1 },
      { enabled: true, samples: 4 },
    ]) {
      probe.enabled = config.enabled;
      scene.msaaSamples = config.samples;
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
      result.timing.push({
        ...config,
        durations,
        draws: probe.drawCount,
        byteLength: probe.byteLength,
      });
    }
    // Read an actual 32x20 grid from each attachment, independent of the display shader.
    const target = new C.FramebufferManager({
      pixelDatatype: C.PixelDatatype.FLOAT,
    });
    target.update(context, 32, 20);
    let texture;
    const copy = context.createViewportQuadCommand(
      "uniform sampler2D u_texture; in vec2 v_textureCoordinates; void main(){out_FragColor=texture(u_texture,v_textureCoordinates);}",
      {
        framebuffer: target.framebuffer,
        renderState: C.RenderState.fromCache({
          viewport: new C.BoundingRectangle(0, 0, 32, 20),
        }),
        uniformMap: { u_texture: () => texture },
      },
    );
    result.channels = [];
    try {
      for (let i = 0; i < 4; ++i) {
        texture = probe._raw.getColorTexture(i);
        copy.execute(context);
        const values = context.readPixels({
          framebuffer: target.framebuffer,
          width: 32,
          height: 20,
        });
        result.channels.push({
          finite: Array.from(values).every(Number.isFinite),
          min: Math.min(...values),
          max: Math.max(...values),
          nonzero: values.filter((value) => value !== 0).length,
        });
      }
    } finally {
      copy.shaderProgram.destroy();
      target.destroy();
    }
    result.glError = gl.getError();
    scene.msaaSamples = 1;
    viewer.render();
    return result;
  });
  expect(report.glError).toBe(0);
  expect(report.timing[0].byteLength).toBe(0);
  expect(report.timing[1].draws).toBeGreaterThan(100);
  expect(report.timing[2].byteLength).toBe(1280 * 800 * 184);
  for (const channel of report.channels) {
    expect(channel.finite).toBe(true);
    expect(channel.nonzero).toBeGreaterThan(0);
  }
  const reportPath = testInfo.outputPath("material-and-cost-report.json");
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  await testInfo.attach("material-and-cost-report", {
    path: reportPath,
    contentType: "application/json",
  });
  // Present the same scene through the diagnostic channels, including after a camera move.
  for (const view of [0, 1, 2, 6, 7]) {
    await page.selectOption("#gbuffer-view", String(view));
    await page.evaluate(() => {
      window.example.viewer.render();
    });
    await page.screenshot({ path: testInfo.outputPath(`channel-${view}.png`) });
  }
  const navigation = await page.evaluate(() => {
    const example = window.example;
    example.viewer.camera.moveRight(2);
    example.viewer.render();
    const moved = example.gbuffer.ready && example.gbuffer.drawCount > 0;
    example.atmosphere.hour = 22;
    example.state.setTime();
    example.viewer.render();
    return {
      moved,
      night: example.gbuffer.ready,
      errors: window.gbufferRenderErrors,
    };
  });
  expect(navigation).toEqual({ moved: true, night: true, errors: [] });
  await page.selectOption("#gbuffer-view", "6");
  await page.evaluate(() => window.example.viewer.render());
  await page.screenshot({ path: testInfo.outputPath("night-emission.png") });
  expect(errors).toEqual([]);
  const released = await page.evaluate(() => {
    const probe = window.example.gbuffer;
    const texture = probe._raw.getColorTexture();
    window.example.destroy();
    return probe.isDestroyed() && texture.isDestroyed();
  });
  expect(released).toBe(true);
});
