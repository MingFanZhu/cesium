import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";

test("native feature styling preserves HDR, live edits and mixed target layouts", async ({
  page,
}, testInfo) => {
  test.setTimeout(120000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/Test/Rendering/延迟要素样式.html");
  await page.waitForFunction(
    () =>
      window.example?.tileset?.tilesLoaded && window.example.deferred._style,
    undefined,
    { timeout: 30000 },
  );
  await page.evaluate(() => {
    const e = window.example;
    e.viewer.useDefaultRenderLoop = false;
    e.viewer.scene.rethrowRenderErrors = true;
    e.taa.enabled = false;
  });
  const report = await page.evaluate(async () => {
    const C = await import("/Build/CesiumUnminified/index.js");
    const e = window.example,
      scene = e.viewer.scene,
      context = scene.context,
      gl = context._gl;
    const timer = gl.getExtension("EXT_disjoint_timer_query_webgl2");
    const target = new C.FramebufferManager({
      pixelDatatype: C.PixelDatatype.FLOAT,
    });
    target.update(context, 1280, 800);
    const copy = context.createViewportQuadCommand(
      "uniform sampler2D u_texture; void main(){out_FragColor=texelFetch(u_texture,ivec2(gl_FragCoord.xy),0);}",
      {
        framebuffer: target.framebuffer,
        uniformMap: {
          u_texture: () =>
            scene._view.sceneFramebuffer._colorFramebuffer.getColorTexture(),
        },
      },
    );
    const read = () => {
      copy.execute(context);
      return context.readPixels({
        framebuffer: target.framebuffer,
        width: 1280,
        height: 800,
      });
    };
    const result = { states: [], timing: [] };
    try {
      let previous;
      for (const [mode, style] of [
        ["HIGHLIGHT", "height"],
        ["REPLACE", "cyan"],
        ["MIX", "alpha"],
      ]) {
        document.getElementById("mode").value = mode;
        document.getElementById("style").value = style;
        e.applyStyle();
        e.ssr.reset();
        e.viewer.render();
        const after = read();
        let sum = 0,
          maximum = 0,
          nonfinite = 0;
        for (let i = 0; i < after.length; i++) {
          if (i % 4 === 3) {
            continue;
          }
          const delta =
            Math.abs((previous?.[i] ?? after[i]) - after[i]) /
            (1 + Math.abs(previous?.[i] ?? after[i]));
          sum += delta;
          maximum = Math.max(maximum, delta);
          if (!Number.isFinite(after[i])) {
            nonfinite++;
          }
        }
        result.states.push({
          mode,
          style,
          change: sum / (1280 * 800 * 3),
          maximum,
          nonfinite,
        });
        previous = after;
      }
      document.getElementById("mode").value = "HIGHLIGHT";
      document.getElementById("style").value = "height";
      e.applyStyle();
      e.taa.enabled = true;
      {
        e.taa.reset();
        e.ssr.reset();
        e.viewer.render();
        const durations = [],
          cpu = [];
        if (timer) {
          for (let i = 0; i < 12; i++) {
            const query = gl.createQuery();
            gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
            const start = performance.now();
            e.viewer.render();
            cpu.push(performance.now() - start);
            gl.endQuery(timer.TIME_ELAPSED_EXT);
            while (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) {
              await new Promise(requestAnimationFrame);
            }
            if (gl.getParameter(timer.GPU_DISJOINT_EXT)) {
              throw new Error("Disjoint GPU timing");
            }
            durations.push(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6);
            gl.deleteQuery(query);
          }
        }
        result.timing.push({
          durations,
          cpu,
          materialDraws: e.deferred.drawCount,
          lightingDraws: e.deferred.lightDrawCount,
          bytes: e.deferred.byteLength,
        });
      }
    } finally {
      copy.shaderProgram.destroy();
      target.destroy();
    }
    const base = e.deferred._raw.getColorTexture();
    const style = e.deferred._style.getColorTexture();
    e.tileset.show = false;
    e.viewer.render();
    result.hidden = {
      released: style.isDestroyed(),
      retained: base === e.deferred._raw.getColorTexture(),
      style: !!e.deferred._style,
    };
    e.tileset.show = true;
    e.viewer.render();
    result.restored = {
      retained: base === e.deferred._raw.getColorTexture(),
      style: !!e.deferred._style,
    };
    return result;
  });
  for (const item of report.states) {
    expect(item.nonfinite).toBe(0);
  }
  expect(report.states[1].change).toBeGreaterThan(0.0001);
  expect(report.hidden).toEqual({
    released: true,
    retained: true,
    style: false,
  });
  expect(report.restored).toEqual({ retained: true, style: true });
  expect(report.timing[0].bytes).toBe(1280 * 800 * 40);
  await page.mouse.click(640, 400);
  await expect(page.locator("#paint")).toBeEnabled();
  await page.getByRole("button", { name: "选中要素染红" }).click();
  await page.evaluate(() => window.example.viewer.render());
  await page.screenshot({ path: testInfo.outputPath("feature-color.png") });
  await page.getByRole("button", { name: "隐藏选中要素" }).click();
  await page.evaluate(() => window.example.viewer.render());
  await page.getByRole("button", { name: "恢复全部" }).click();
  const motion = await page.evaluate(() => {
    const e = window.example;
    e.ssil.enabled = true;
    for (let i = 0; i < 16; i++) {
      e.viewer.camera.moveRight(0.15);
      e.viewer.render();
    }
    return {
      ready: e.deferred.ready && e.ssil.ready && e.taa.ready,
      errors: e.errors,
    };
  });
  expect(motion).toEqual({ ready: true, errors: [] });
  await page.screenshot({ path: testInfo.outputPath("feature-motion.png") });
  expect(errors).toEqual([]);
  await writeFile(
    testInfo.outputPath("styling-report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
  await page.evaluate(() => window.example.viewer.destroy());
});
