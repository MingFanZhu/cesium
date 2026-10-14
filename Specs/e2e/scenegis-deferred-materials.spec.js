import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";

test("deferred extensions preserve controls and report attachment overflow costs", async ({
  page,
}, testInfo) => {
  test.setTimeout(120000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/Test/Rendering/延迟扩展材质验收.html");
  await page.waitForFunction(
    () => {
      const e = window.example;
      return (
        e?.models.length === 5 &&
        e.models.every((m) => m.ready) &&
        e.tileset?.tilesLoaded &&
        e.ibl._specularEnvironmentCubeMap?.ready &&
        e.ssr.ready &&
        e.ssil.ready
      );
    },
    undefined,
    { timeout: 30000 },
  );
  await page.evaluate(() => {
    window.example.viewer.useDefaultRenderLoop = false;
    window.example.viewer.scene.rethrowRenderErrors = true;
  });
  const report = await page.evaluate(async () => {
    const C = await import("/Build/CesiumUnminified/index.js");
    const e = window.example,
      scene = e.viewer.scene,
      context = scene.context,
      gl = context._gl;
    const render = () => e.viewer.render();
    const change = (id, value, event = "change") => {
      const el = document.getElementById(id);
      if (typeof value === "boolean") {
        el.checked = value;
      } else {
        el.value = value;
      }
      el.dispatchEvent(new Event(event));
      render();
    };
    const metrics = () => ({
      material: e.deferred.drawCount,
      extraMaterial: e.deferred.materialExtensionDrawCount,
      light: e.deferred.lightDrawCount,
      pointCorrection: e.deferred.colorCorrectionDrawCount,
      bytes: e.deferred.byteLength,
      extensionTargets: e.deferred._extensions?._colorAttachmentsLength ?? 0,
      attachments: e.deferred._framebuffer.numberOfColorAttachments,
      split: e.ssr._state.main?.split,
      ssrReplay: e.ssr._state.captureDraws,
    });
    const readTarget = new C.FramebufferManager({
      pixelDatatype: C.PixelDatatype.FLOAT,
    });
    readTarget.update(context, 1280, 800);
    const copy = context.createViewportQuadCommand(
      "uniform sampler2D u_texture;void main(){out_FragColor=texelFetch(u_texture,ivec2(gl_FragCoord.xy),0);}",
      {
        framebuffer: readTarget.framebuffer,
        uniformMap: { u_texture: () => e.deferred._source.getColorTexture(0) },
      },
    );
    const sample = () => {
      copy.execute(context);
      return context.readPixels({
        framebuffer: readTarget.framebuffer,
        width: 1280,
        height: 800,
      });
    };
    const timer = gl.getExtension("EXT_disjoint_timer_query_webgl2");
    const measure = async () => {
      const cpu = [],
        gpu = [];
      for (let i = 0; i < 8; ++i) {
        const query = timer ? gl.createQuery() : undefined;
        if (query) {
          gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
        }
        const start = performance.now();
        render();
        cpu.push(performance.now() - start);
        if (query) {
          gl.endQuery(timer.TIME_ELAPSED_EXT);
          await new Promise((resolve) => {
            const poll = () =>
              gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)
                ? resolve()
                : setTimeout(poll, 0);
            poll();
          });
          if (!gl.getParameter(timer.GPU_DISJOINT_EXT)) {
            gpu.push(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6);
          }
          gl.deleteQuery(query);
        }
      }
      return { cpu, gpu };
    };
    const result = { states: [], timings: [] };
    try {
      render();
      result.timings.push({
        name: "combined",
        ...metrics(),
        ...(await measure()),
      });
      let previous = sample();
      for (const [id, value, event] of [
        ["classification", true],
        ["clip", true],
        ["clipPosition", 0.4, "input"],
        ["points", "cyan"],
        ["points", "translucent"],
        ["points", "hidden"],
        ["points", "orange"],
        ["pointSize", 8, "input"],
        ["effects", false],
        ["hdr", false],
        ["hdr", true],
        ["effects", true],
      ]) {
        change(id, value, event);
        const values = sample();
        let difference = 0,
          nonfinite = 0;
        for (let i = 0; i < values.length; ++i) {
          if (!Number.isFinite(values[i])) {
            ++nonfinite;
          }
          if (i % 4 !== 3) {
            difference += Math.abs(values[i] - previous[i]);
          }
        }
        result.states.push({
          id,
          value,
          nonfinite,
          difference: difference / (1280 * 800 * 3),
          ...metrics(),
        });
        previous = values;
        if (id === "classification") {
          result.timings.push({
            name: "classified overflow",
            ...metrics(),
            ...(await measure()),
          });
        }
      }
      change("clip", false);
      change("pointSize", 4, "input");
      change("classification", false);
      const point = C.SceneTransforms.worldToWindowCoordinates(
        scene,
        e.point(5, 0, 1.5),
      );
      result.pick = scene.pick(point)?.id === "组合与裁剪";
      return result;
    } finally {
      copy.shaderProgram.destroy();
      readTarget.destroy();
    }
  });
  await writeFile(
    testInfo.outputPath("material-report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
  expect(report.timings[0].extensionTargets).toBe(4);
  expect(report.timings[0].extraMaterial).toBe(0);
  expect(report.timings[0].split).toBe(true);
  expect(report.timings[1].extraMaterial).toBeGreaterThan(0);
  expect(report.timings[1].ssrReplay).toBe(0);
  for (const state of report.states) {
    expect(state.nonfinite).toBe(0);
  }
  for (const id of ["classification", "clip", "points"]) {
    expect(report.states.find((s) => s.id === id).difference).toBeGreaterThan(
      0.00001,
    );
  }
  expect(report.pick).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("extensions.png") });
  await page.evaluate(() => {
    for (const id of ["classification", "clip"]) {
      const el = document.getElementById(id);
      el.checked = true;
      el.dispatchEvent(new Event("change"));
    }
    window.example.viewer.render();
  });
  await page.screenshot({
    path: testInfo.outputPath("classification-clipping.png"),
  });
  await page.setViewportSize({ width: 960, height: 640 });
  await page.evaluate(() => {
    window.example.viewer.resize();
    window.example.viewer.render();
  });
  expect(await page.evaluate(() => window.example.errors)).toEqual([]);
  await page.goto("about:blank");
  expect(errors).toEqual([]);
});
