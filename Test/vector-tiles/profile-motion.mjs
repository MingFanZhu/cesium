/* global process, window, performance, requestAnimationFrame, console */
// Run against the existing development server. Outputs remain in ignored Build/.
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const label = process.argv[2] ?? "before";
const output = path.resolve("Build/Specs/vector-motion");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const replay = process.argv[3];
const context = await browser.newContext({
  viewport: { width: 1433, height: 1150 },
  deviceScaleFactor: 1,
  ...(replay ? {} : { recordHar: { path: path.join(output, `${label}.har`) } }),
});
if (replay) {
  await context.routeFromHAR(path.resolve(replay), {
    url: "https://**/*",
    notFound: "abort",
  });
}
try {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:8080/Test/vector-tiles/planar-map.html");
  await page.waitForFunction(() => window.publicVectorPreview?.layer);
  await page.evaluate(async () => {
    const C = await import("/Build/CesiumUnminified/index.js");
    const scene = window.publicVectorPreview.viewer.scene;
    const target = new C.Cartesian3(13222558, 3769268, 0);
    const range = 2290;
    const pitch = Math.asin(0.49605178900906854);
    window.vectorMotion = (kind, step) => {
      const t = Math.sin((step / 60) * Math.PI * 2);
      const angle = kind === "rotate" ? t * 0.2 : 0;
      const distance = range * (kind === "zoom" ? 1 + t * 0.12 : 1);
      const x = Math.sin(angle),
        y = Math.cos(angle);
      const direction = new C.Cartesian3(
        x * Math.cos(pitch),
        y * Math.cos(pitch),
        -Math.sin(pitch),
      );
      scene.camera.setView({
        destination: new C.Cartesian3(
          target.x + (kind === "pan" ? 400 * t : 0) - direction.x * distance,
          target.y - direction.y * distance,
          -direction.z * distance,
        ),
        orientation: {
          direction,
          up: new C.Cartesian3(
            x * Math.sin(pitch),
            y * Math.sin(pitch),
            Math.cos(pitch),
          ),
        },
      });
      scene.requestRender();
    };
    window.vectorMotion("pan", 0);
  });
  const ready = () =>
    page.waitForFunction(
      () => window.publicVectorPreview.layer.tilesLoaded,
      undefined,
      { timeout: 90000 },
    );
  await ready();
  const motion = () =>
    page.evaluate(async () => {
      const scene = window.publicVectorPreview.viewer.scene;
      const results = {};
      for (const kind of ["pan", "zoom", "rotate"]) {
        let begin;
        const timing = { last: undefined };
        const cpu = [],
          intervals = [];
        const removePre = scene.preRender.addEventListener(() => {
          begin = performance.now();
        });
        const removePost = scene.postRender.addEventListener(() => {
          cpu.push(performance.now() - begin);
        });
        const start = performance.now();
        for (let i = 1; i <= 60; i++) {
          await new Promise((resolve) =>
            requestAnimationFrame((now) => {
              if (timing.last !== undefined) {
                intervals.push(now - timing.last);
              }
              timing.last = now;
              window.vectorMotion(kind, i);
              resolve();
            }),
          );
        }
        await new Promise((resolve) => {
          const remove = scene.postRender.addEventListener(() => {
            remove();
            resolve();
          });
          scene.requestRender();
        });
        removePre();
        removePost();
        const stats = (values) => {
          values.sort((a, b) => a - b);
          return {
            median: values[Math.floor(values.length * 0.5)],
            p95: values[Math.floor(values.length * 0.95)],
          };
        };
        results[kind] = {
          cpu: stats(cpu),
          interval: stats(intervals),
          elapsed: performance.now() - start,
          frames: cpu.length,
          statistics: window.publicVectorPreview.layer.statistics,
        };
      }
      return results;
    });
  await motion();
  await ready();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 500 });
  await cdp.send("Profiler.start");
  const result = await motion();
  const { profile } = await cdp.send("Profiler.stop");
  const counts = new Map();
  for (let i = 0; i < profile.samples.length; i++) {
    counts.set(
      profile.samples[i],
      (counts.get(profile.samples[i]) ?? 0) + profile.timeDeltas[i],
    );
  }
  const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
  const hotspots = [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 35)
    .map(([id, time]) => ({ ms: time / 1000, ...nodes.get(id).callFrame }));
  await writeFile(
    path.join(output, `${label}.cpuprofile`),
    JSON.stringify(profile),
  );
  await writeFile(
    path.join(output, `${label}.json`),
    JSON.stringify({ result, hotspots, errors }, null, 2),
  );
  await page.screenshot({ path: path.join(output, `${label}.png`) });
  console.log(
    JSON.stringify(
      { result, hotspots: hotspots.slice(0, 20), errors },
      null,
      2,
    ),
  );
} finally {
  await context.close();
  await browser.close();
}
