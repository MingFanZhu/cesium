import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";

test("Bistro tiled lights match the complete list and measure sparse and overlapping cost", async ({
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
  const report = await page.evaluate(async () => {
    const C = await import("/Build/CesiumUnminified/index.js");
    const e = window.example,
      viewer = e.viewer,
      scene = viewer.scene;
    viewer.useDefaultRenderLoop = false;
    scene.rethrowRenderErrors = true;
    const lights = e.localLighting.collection;
    const context = scene.context,
      gl = context._gl;
    const timer = gl.getExtension("EXT_disjoint_timer_query_webgl2");
    const device = gl.getExtension("WEBGL_debug_renderer_info");
    const width = scene.drawingBufferWidth,
      height = scene.drawingBufferHeight;
    const report = {
      renderer: device && gl.getParameter(device.UNMASKED_RENDERER_WEBGL),
      width,
      height,
      comparisons: [],
      rows: [],
      samples: scene.msaaSamples,
      ao: e.ao.enabled,
      ssr: e.ssr.enabled,
    };
    const placements = new Map([[0, []]]);
    for (const count of [16, 256]) {
      e.localLighting.configure(count, 3, true, 25);
      placements.set(
        count,
        Array.from({ length: count }, (_, i) => lights.get(i)),
      );
    }
    function configure(count, range, tiled) {
      lights.removeAll();
      for (const light of placements.get(count)) {
        light.range = range;
        lights.add(light);
      }
      lights._tiled = tiled;
    }
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
    function read() {
      copy.execute(context);
      return context.readPixels({
        framebuffer: target.framebuffer,
        width,
        height,
      });
    }
    e.taa.enabled = false;
    e.atmosphere.hour = 22;
    e.state.setTime();
    try {
      for (const [count, range] of [
        [16, 6],
        [256, 3],
        [256, 6],
        [256, 80],
      ]) {
        configure(count, range, false);
        e.ssr.reset();
        viewer.render();
        const reference = read();
        lights._tiled = true;
        e.ssr.reset();
        viewer.render();
        const actual = read();
        let sum = 0,
          maximum = 0,
          nonfinite = 0;
        for (let i = 0; i < actual.length; ++i) {
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
          count,
          range,
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
    e.taa.enabled = true;
    const originalLight = e.deferred.light;
    const originalPrepare = C._SceneGISLocalLights.prepare;
    let query,
      mode,
      prepareMs = 0;
    e.deferred.light = function (...args) {
      if (mode === "light") {
        gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
      }
      const result = originalLight.apply(this, args);
      if (mode === "light") {
        gl.endQuery(timer.TIME_ELAPSED_EXT);
      }
      return result;
    };
    C._SceneGISLocalLights.prepare = function (...args) {
      const start = performance.now();
      const result = originalPrepare.apply(this, args);
      prepareMs = performance.now() - start;
      return result;
    };
    try {
      for (const [count, range] of [
        [0, 6],
        [16, 6],
        [256, 3],
        [256, 6],
        [256, 80],
      ]) {
        for (const tiled of count ? [false, true] : [true]) {
          configure(count, range, tiled);
          e.taa.reset();
          e.ssr.reset();
          viewer.render();
          const row = {
            count,
            range,
            tiled,
            light: [],
            whole: [],
            cpu: [],
            prepare: [],
          };
          if (timer) {
            for (mode of ["light", "whole"]) {
              for (let sample = 0; sample < 6; ++sample) {
                query = gl.createQuery();
                if (mode === "whole") {
                  gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
                }
                const start = performance.now();
                viewer.render();
                if (mode === "whole") {
                  row.cpu.push(performance.now() - start);
                  row.prepare.push(prepareMs);
                  gl.endQuery(timer.TIME_ELAPSED_EXT);
                }
                while (
                  !gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)
                ) {
                  await new Promise(window.requestAnimationFrame);
                }
                if (gl.getParameter(timer.GPU_DISJOINT_EXT)) {
                  throw new Error("Disjoint GPU timing");
                }
                row[mode].push(
                  gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6,
                );
                gl.deleteQuery(query);
              }
            }
          }
          mode = undefined;
          const tiles = lights._state.tiles;
          Object.assign(row, {
            averageCandidates: tiles
              ? tiles.referenceCount / (tiles.grid.x * tiles.grid.y)
              : 0,
            maximumCandidates: tiles?.maximumTileCount ?? 0,
            tableBytes: tiles?.byteLength ?? 0,
          });
          report.rows.push(row);
        }
      }
    } finally {
      e.deferred.light = originalLight;
      C._SceneGISLocalLights.prepare = originalPrepare;
    }
    e.localLighting.configure(256, 3, true, 1);
    e.atmosphere.hour = 22;
    e.state.setTime();
    viewer.render();
    const tiles = lights._state.tiles;
    const texture = tiles.texture;
    for (let i = 0; i < 24; ++i) {
      viewer.camera.moveRight(0.04);
      viewer.render();
    }
    report.motion = {
      taa: e.taa.ready,
      sameTable: texture === tiles.texture,
    };
    return report;
  });
  console.log(JSON.stringify(report));
  await writeFile(
    testInfo.outputPath("tiled-lighting.json"),
    JSON.stringify(report, null, 2),
  );
  expect(report.ao && report.ssr).toBe(true);
  expect(report.samples).toBe(1);
  for (const comparison of report.comparisons) {
    expect(comparison.nonfinite).toBe(0);
    expect(comparison.mean).toBeLessThan(0.0001);
  }
  expect(report.motion).toEqual({ taa: true, sameTable: true });
  await page.screenshot({ path: testInfo.outputPath("tiled-night.png") });
  const destroyed = await page.evaluate(() => {
    const e = window.example;
    const tiles = e.localLighting.collection._state.tiles;
    const texture = tiles.texture;
    e.viewer.destroy();
    return texture.isDestroyed();
  });
  expect(destroyed).toBe(true);
  expect(errors).toEqual([]);
});
