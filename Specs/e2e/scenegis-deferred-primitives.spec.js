import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";

test("deferred native primitives preserve Entity updates, mixed HDR and frame cost", async ({
  page,
}, testInfo) => {
  test.setTimeout(120000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/Test/Rendering/延迟图元验收.html");
  await page.waitForFunction(
    () =>
      window.example?.model?.ready &&
      window.example.viewer.dataSourceDisplay.ready &&
      window.example.deferred.ready,
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
    const render = () => e.viewer.render();
    const submittedEntities = () =>
      e.entities.every((entity) => {
        const graphics = entity.box ?? entity.cylinder ?? entity.polygon;
        const expected = C.ColorGeometryInstanceAttribute.toValue(
          graphics.material.color.getValue(e.viewer.clock.currentTime),
        );
        const pass = expected[3] === 255 ? C.Pass.OPAQUE : C.Pass.TRANSLUCENT;
        return scene.frameState.commandList.some((command) => {
          const primitive = command.owner;
          if (
            command.pass !== pass ||
            !primitive?.ready ||
            !primitive.getGeometryInstanceAttributes
          ) {
            return false;
          }
          const actual = primitive.getGeometryInstanceAttributes(entity)?.color;
          return (
            actual && expected.every((value, index) => value === actual[index])
          );
        });
      });
    const ready = async () => {
      const deadline = performance.now() + 30000;
      do {
        render();
        if (e.viewer.dataSourceDisplay.ready && submittedEntities()) {
          return;
        }
        await new Promise(requestAnimationFrame);
      } while (performance.now() <= deadline);
      throw new Error("Entity batches did not become ready.");
    };
    const read = () => {
      copy.execute(context);
      return context.readPixels({
        framebuffer: target.framebuffer,
        width: 1280,
        height: 800,
      });
    };
    const change = (id, value) => {
      const input = document.getElementById(id);
      if (typeof value === "boolean") {
        input.checked = value;
      } else {
        input.value = value;
      }
      input.dispatchEvent(new Event("change"));
    };
    const result = { comparisons: [], timing: [], counts: undefined };
    try {
      for (const [id, value] of [
        ["weather", "dry"],
        ["weather", "wet"],
        ["weather", "snow"],
        ["color", "ORANGE"],
        ["translucent", true],
        ["translucent", false],
      ]) {
        change(id, value);
        e.deferred.enabled = false;
        await ready();
        const before = read();
        e.deferred.enabled = true;
        render();
        const after = read();
        let sum = 0,
          max = 0,
          nonfinite = 0;
        for (let i = 0; i < before.length; ++i) {
          if (i % 4 === 3) {
            continue;
          }
          const delta =
            Math.abs(before[i] - after[i]) / (1 + Math.abs(before[i]));
          sum += delta;
          max = Math.max(max, delta);
          if (!Number.isFinite(after[i])) {
            ++nonfinite;
          }
        }
        result.comparisons.push({
          id,
          value,
          materialDraws: e.deferred.drawCount,
          mean: sum / (1280 * 800 * 3),
          max,
          nonfinite,
        });
      }
      change("weather", "dry");
      change("animate", true);
      e.viewer.clock.shouldAnimate = false;
      C.JulianDate.addSeconds(
        e.viewer.clock.currentTime,
        1,
        e.viewer.clock.currentTime,
      );
      await ready();
      const pixel = C.SceneTransforms.worldToWindowCoordinates(
        scene,
        e.point(1, -4, 2),
      );
      const picked = scene.pick(pixel);
      result.entityPick = picked?.id === e.boxEntity;
      change("animate", false);
      await ready();
      e.taa.enabled = true;
      const timer = gl.getExtension("EXT_disjoint_timer_query_webgl2");
      for (const enabled of [false, true]) {
        e.deferred.enabled = enabled;
        e.taa.reset();
        const gpu = [],
          cpu = [];
        for (let i = 0; i < 12; ++i) {
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
        const median = (items) => {
          items.sort((a, b) => a - b);
          const n = items.length;
          return n
            ? (items[Math.floor((n - 1) / 2)] + items[Math.floor(n / 2)]) / 2
            : null;
        };
        result.timing.push({
          enabled,
          gpuMs: median(gpu),
          cpuMs: median(cpu),
          samples: gpu.length,
        });
      }
      result.counts = {
        material: e.deferred.drawCount,
        lighting: e.deferred.lightDrawCount,
        groups: e.deferred.groupCount,
        bytes: e.deferred.byteLength,
        style: !!e.deferred._style,
      };
      return result;
    } finally {
      copy.shaderProgram.destroy();
      target.destroy();
    }
  });
  await writeFile(
    testInfo.outputPath("primitive-report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
  for (const comparison of report.comparisons) {
    expect(comparison.mean).toBeLessThan(0.002);
    expect(comparison.nonfinite).toBe(0);
  }
  expect(report.entityPick).toBe(true);
  expect(report.counts.style).toBe(false);
  expect(report.counts.groups).toBe(2);
  const alphaModes = report.comparisons.filter(
    (entry) => entry.id === "translucent",
  );
  expect(alphaModes[0].materialDraws).toBeLessThan(alphaModes[1].materialDraws);
  await page.screenshot({ path: testInfo.outputPath("primitives.png") });
  await page.evaluate(async () => {
    const e = window.example;
    for (let i = 0; i < 8; ++i) {
      e.viewer.scene.camera.moveRight(0.25);
      e.viewer.render();
      await new Promise(requestAnimationFrame);
    }
  });
  await page.screenshot({ path: testInfo.outputPath("motion.png") });
  await page.setViewportSize({ width: 960, height: 640 });
  await page.evaluate(() => {
    window.example.viewer.resize();
    window.example.viewer.render();
  });
  expect(await page.evaluate(() => window.example.errors)).toEqual([]);
  await page.goto("about:blank");
  expect(errors).toEqual([]);
});
