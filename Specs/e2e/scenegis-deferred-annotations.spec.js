import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
test("native annotations preserve background, depth controls and conditional resources", async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/Test/Rendering/延迟标注验收.html");
  await page.waitForFunction(() => {
    const e = window.example;
    return (
      e?.labels._glyphBillboardCollection.ready &&
      e.labels._backgroundBillboardCollection.ready &&
      e.scene._sceneGISDeferred.annotationDrawCount === 2
    );
  });
  await page.evaluate(() => {
    window.example.viewer.useDefaultRenderLoop = false;
    window.example.scene.rethrowRenderErrors = true;
  });
  const report = await page.evaluate(async () => {
    const C = await import("/Build/CesiumUnminified/index.js");
    const e = window.example,
      r = e.scene._sceneGISDeferred;
    const render = () => e.viewer.render();
    const rows = [];
    function snapshot(name) {
      rows.push({
        name,
        width: e.scene.drawingBufferWidth,
        height: e.scene.drawingBufferHeight,
        material: r.drawCount,
        annotation: r.annotationDrawCount,
        annotationTransparent: e.scene._view.frustumCommandsList.reduce(
          (count, range) =>
            count +
            range.commands[C.Pass.TRANSLUCENT]
              .slice(0, range.indices[C.Pass.TRANSLUCENT])
              .filter(
                (c) =>
                  c.owner === e.labels._glyphBillboardCollection ||
                  c.owner === e.labels._backgroundBillboardCollection,
              ).length,
          0,
        ),
        depthCopies: r.annotationDepthCopyCount,
        annotationBytes: r._annotations?.byteLength ?? 0,
        frusta: e.scene._view.frustumCommandsList.length,
        bytes: r.byteLength,
        glError: e.scene.context._gl.getError(),
      });
    }
    function change(id, value, event = "change") {
      const el = document.getElementById(id);
      if (typeof value === "boolean") {
        el.checked = value;
      } else {
        el.value = value;
      }
      el.dispatchEvent(new Event(event));
      render();
      snapshot(`${id}:${value}`);
    }
    render();
    snapshot("initial");
    const gl = e.scene.context._gl,
      timer = gl.getExtension("EXT_disjoint_timer_query_webgl2"),
      gpu = [];
    if (timer) {
      for (let i = 0; i < 6; ++i) {
        const query = gl.createQuery();
        gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
        render();
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
    change("alpha", 0, "input");
    change("alpha", 1, "input");
    change("alpha", 0.5, "input");
    change("panel", 5);
    change("panel", 1);
    change("water", 5);
    change("water", 1);
    change("multi", true);
    change("ao", true);
    change("taa", false);
    change("taa", true);
    const screen = C.SceneTransforms.worldToWindowCoordinates(
      e.scene,
      e.labels.get(0).position,
    );
    let pick;
    // Label backgrounds intentionally do not pick; inspect the glyph strokes around the anchor.
    for (const x of [-20, -10, 0, 10, 20]) {
      for (const y of [-6, 0, 6]) {
        pick = e.scene.pick(new C.Cartesian2(screen.x + x, screen.y + y))?.id;
        if (pick) {
          break;
        }
      }
      if (pick) {
        break;
      }
    }
    const old = r.opaqueDepthTexture;
    e.labels.show = false;
    render();
    const released = old.isDestroyed();
    e.labels.show = true;
    change("background", false);
    change("background", true);
    change("multi", false);
    change("ao", false);
    e.taa.reset();
    render();
    return { rows, pick, released, gpu, errors: e.errors };
  });
  await page.screenshot({ path: testInfo.outputPath("annotations.png") });
  await writeFile(
    testInfo.outputPath("annotation-report.json"),
    JSON.stringify(report, null, 2),
  );
  expect(report.rows.every((r) => r.glError === 0)).toBe(true);
  expect(report.rows[0].height).toBe(800);
  expect(report.rows[0].annotation).toBe(2);
  expect(report.rows[0].annotationTransparent).toBe(2);
  expect(report.rows[0].depthCopies).toBe(1);
  expect(report.rows[0].annotationBytes).toBe(
    report.rows[0].width * report.rows[0].height * 4,
  );
  const multi = report.rows.find((r) => r.name === "multi:true");
  expect(multi.frusta).toBeGreaterThan(1);
  expect(multi.annotationBytes).toBe(multi.width * multi.height * 8);
  expect(report.released).toBe(true);
  expect(report.pick).toBe("混色背景");
  expect(report.errors).toEqual([]);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("annotations.png") });
  await page.locator("#panel").selectOption("5");
  await page.locator("#water").selectOption("5");
  await page.evaluate(() => {
    window.example.taa.reset();
    window.example.viewer.render();
  });
  await page.screenshot({ path: testInfo.outputPath("foreground.png") });
  await writeFile(
    testInfo.outputPath("annotation-report.json"),
    JSON.stringify(report, null, 2),
  );
  await page.evaluate(() => window.example.destroy());
  expect(errors).toEqual([]);
});
