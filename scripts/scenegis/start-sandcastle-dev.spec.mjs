import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import {
  createSandcastleUrl,
  createSandcastleOrigin,
  createSerializedRebuilder,
  createNpmInvocation,
  createViteArguments,
  createViteEnvironment,
  initializeBuildWatch,
  parseArguments,
  runDevelopmentOrchestrator,
  waitForBuildWatchReady,
  waitForViteReady,
} from "./start-sandcastle-dev.mjs";
import {
  createSceneGISImportMapPlugin,
  createSceneGISStaticMiddleware,
  createSceneGISViteConfig,
  resolveSceneGISStaticRequest,
  sandcastleRuntimeModuleUrl,
} from "./sandcastle-vite.config.mjs";

function createChild(label) {
  const child = new EventEmitter();
  child.sceneGISLabel = label;
  return child;
}

test("parses the port and optional example id", () => {
  assert.deepEqual(parseArguments([]), { port: 5173, id: undefined });
  assert.deepEqual(parseArguments(["--port", "80"]), {
    port: 80,
    id: undefined,
  });
  assert.deepEqual(
    parseArguments(["--port", "6123", "--id", "scenegis-planar-terrain"]),
    {
      port: 6123,
      id: "scenegis-planar-terrain",
    },
  );
  assert.equal(
    createSandcastleUrl({ port: 6123, id: "scenegis-planar-terrain" }),
    "http://localhost:6123/index.html?id=scenegis-planar-terrain",
  );
  const viteArguments = createViteArguments(6123);
  assert.deepEqual(viteArguments.slice(0, 4), [
    "run",
    "dev-no-embedding",
    "--",
    "--config",
  ]);
  assert.equal(path.basename(viteArguments[4]), "sandcastle-vite.config.mjs");
  assert.deepEqual(viteArguments.slice(5), ["--port", "6123", "--strictPort"]);
});

test("couples listen port, URL, environment, and effective iframe origins", async () => {
  const plugin = { name: "preserved-plugin" };
  const staticServe = { name: "vite-plugin-static-copy:serve" };
  const staticBuild = { name: "vite-plugin-static-copy:build" };
  const upstreamImportMap = { name: "custom-import-map" };
  const upstreamConfig = async () => ({
    root: "sandcastle-root",
    plugins: [plugin, [staticServe, staticBuild], upstreamImportMap],
    define: { __UPSTREAM_DEFINE__: JSON.stringify("preserved") },
  });
  for (const port of [80, 5173, 6123]) {
    const origin = createSandcastleOrigin(port);
    const environment = createViteEnvironment(port, { KEEP: "value" });
    const effectiveConfig = await createSceneGISViteConfig(
      { command: "serve", mode: "development" },
      { origin: environment.SCENEGIS_SANDCASTLE_ORIGIN, upstreamConfig },
    );
    assert.equal(createViteArguments(port).at(-2), String(port));
    assert.equal(createSandcastleUrl({ port }), `${origin}/index.html`);
    assert.equal(environment.KEEP, "value");
    assert.equal(environment.SCENEGIS_SANDCASTLE_ORIGIN, origin);
    assert.equal(effectiveConfig.root, "sandcastle-root");
    assert.equal(effectiveConfig.plugins[0], plugin);
    assert.deepEqual(
      effectiveConfig.plugins.map((entry) => entry.name),
      [
        "preserved-plugin",
        "scenegis-sandcastle-static-routes",
        "scenegis-sandcastle-import-map",
      ],
    );
    assert.equal(
      effectiveConfig.define.__UPSTREAM_DEFINE__,
      JSON.stringify("preserved"),
    );
    assert.equal(
      effectiveConfig.define.__OUTER_ORIGIN__,
      JSON.stringify(origin),
    );
    assert.equal(
      effectiveConfig.define.__INNER_ORIGIN__,
      JSON.stringify(origin),
    );
  }
  assert.equal(createSandcastleOrigin(80), "http://localhost");
  assert.deepEqual(createViteArguments(80).slice(-3), [
    "--port",
    "80",
    "--strictPort",
  ]);
  assert.equal(
    createViteEnvironment(80, {}).SCENEGIS_SANDCASTLE_ORIGIN,
    "http://localhost",
  );
  assert.equal(
    createSandcastleUrl({ port: 80 }),
    "http://localhost/index.html",
  );
});

test("maps all Cesium runtime specifiers to one watched root module", () => {
  const plugin = createSceneGISImportMapPlugin();
  const transformed = plugin.transformIndexHtml.handler("<html></html>", {
    filename: path.join("sandcastle-root", "templates", "bucket.html"),
  });
  const importMap = JSON.parse(transformed.tags[0].children).imports;
  assert.deepEqual(importMap, {
    Sandcastle: "../templates/Sandcastle.js",
    cesium: sandcastleRuntimeModuleUrl,
    "@cesium/engine": sandcastleRuntimeModuleUrl,
    "@cesium/widgets": sandcastleRuntimeModuleUrl,
  });
  assert.equal(
    plugin.transformIndexHtml.handler("<html></html>", {
      filename: path.join("sandcastle-root", "index.html"),
    }),
    undefined,
  );
});

test("serves only explicit SceneGIS development routes", async (context) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "scenegis-static-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const files = new Map([
    ["Source/Cesium.js", "export const Cesium = true;"],
    ["Source/Cesium.d.ts", "export declare const Cesium: boolean;"],
    [
      "packages/engine/Build/Unminified/index.js",
      "export const engine = true;",
    ],
    ["packages/engine/index.d.ts", "export declare const engine: boolean;"],
    [
      "packages/widgets/Build/Unminified/index.js",
      "export const widgets = true;",
    ],
    ["packages/widgets/index.d.ts", "export declare const widgets: boolean;"],
    ["Build/CesiumUnminified/Assets/data.json", "{}"],
    ["Apps/SampleData/example.json", "{}"],
    ["Apps/SampleData/example.czml", "[]"],
  ]);
  for (const [relative, contents] of files) {
    const target = path.join(root, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, contents);
  }
  writeFileSync(path.join(root, "secret.txt"), "secret");

  assert.equal(
    resolveSceneGISStaticRequest("/Source/Cesium.js", root).contentType,
    "text/javascript; charset=utf-8",
  );
  assert.equal(
    resolveSceneGISStaticRequest(
      "/Build/CesiumUnminified/Assets/data.json",
      root,
    ).contentType,
    "application/json; charset=utf-8",
  );
  assert.equal(
    resolveSceneGISStaticRequest("/SampleData/example.json", root).contentType,
    "application/json; charset=utf-8",
  );
  assert.equal(
    resolveSceneGISStaticRequest("/SampleData/example.czml", root).contentType,
    "application/json; charset=utf-8",
  );
  assert.equal(
    resolveSceneGISStaticRequest(
      "/Build/CesiumUnminified/%2e%2e/%2e%2e/secret.txt",
      root,
    ).status,
    400,
  );
  assert.equal(resolveSceneGISStaticRequest("/secret.txt", root), undefined);

  const server = createServer((request, response) => {
    createSceneGISStaticMiddleware(root)(request, response, () => {
      response.statusCode = 418;
      response.end();
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const get = await globalThis.fetch(`${base}/Source/Cesium.js`);
  assert.equal(get.status, 200);
  assert.match(get.headers.get("content-type"), /javascript/u);
  assert.match(await get.text(), /Cesium = true/u);
  const head = await globalThis.fetch(`${base}/packages/engine/index.d.ts`, {
    method: "HEAD",
  });
  assert.equal(head.status, 200);
  assert.match(head.headers.get("content-type"), /text\/plain/u);
  assert.equal(await head.text(), "");
  const post = await globalThis.fetch(`${base}/Apps/SampleData/example.json`, {
    method: "POST",
  });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get("allow"), "GET, HEAD");
  assert.equal(
    (await globalThis.fetch(`${base}/Source/missing.js`)).status,
    418,
  );
  assert.equal(
    (await globalThis.fetch(`${base}/Build/CesiumUnminified/missing.js`))
      .status,
    404,
  );
});

test("launches the real npm CLI without the Windows npm.cmd EINVAL path", async () => {
  const invocation = createNpmInvocation(["--version"]);
  let child;
  assert.doesNotThrow(() => {
    child = spawn(invocation.command, invocation.args, {
      shell: invocation.shell,
      stdio: "ignore",
    });
  });
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  assert.equal(code, 0);
});

test("rejects invalid options with actionable messages", () => {
  assert.throws(() => parseArguments(["--port", "0"]), /1 through 65535/);
  assert.throws(() => parseArguments(["--id", "Bad Id"]), /lowercase/);
  assert.throws(() => parseArguments(["--unknown"]), /Unknown option/);
  assert.throws(() => parseArguments(["--port"]), /requires a value/);
  assert.throws(
    () => parseArguments(["--port", "5000", "--port", "5001"]),
    /only be specified once/,
  );
});

test("waits for the explicit build-watch marker across ANSI chunk boundaries", async () => {
  const child = createChild("build-watch");
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  let resolved = false;
  const forwardedOutput = [];
  const readiness = waitForBuildWatchReady(child, {
    timeoutMilliseconds: 1000,
    outputsReady: () => true,
    writeStdout: (chunk) => forwardedOutput.push(chunk.toString()),
    writeStderr: () => {},
  }).then(() => {
    resolved = true;
  });

  child.stdout.write("\u001b[32mbuild output\nSCENEGIS_BUILD_");
  await delay(0);
  assert.equal(resolved, false);
  child.stdout.write("WATCH_READY\u001b[0m\n");
  await readiness;
  assert.equal(resolved, true);

  child.stdout.write("incremental rebuild output\n");
  await delay(0);
  assert.match(forwardedOutput.at(-1), /incremental rebuild output/);
});

test("materializes the root bundle after build-watch registers", async () => {
  const events = [];
  await initializeBuildWatch(
    (callback) => {
      events.push("watchers-ready");
      callback();
    },
    async () => events.push("root-materialized"),
  );
  assert.deepEqual(events, ["watchers-ready", "root-materialized"]);
});

test("polls for outputs that become ready after the build-watch marker", async () => {
  const child = createChild("build-watch");
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  let outputsReady = false;
  const readiness = waitForBuildWatchReady(child, {
    timeoutMilliseconds: 1000,
    pollMilliseconds: 5,
    outputsReady: () => outputsReady,
    writeStdout: () => {},
    writeStderr: () => {},
  });
  child.stdout.write("SCENEGIS_BUILD_WATCH_READY\n");
  await delay(15);
  outputsReady = true;
  await readiness;
});

test("times out actionably when outputs never appear after the marker", async () => {
  const child = createChild("build-watch");
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  const readiness = waitForBuildWatchReady(child, {
    timeoutMilliseconds: 30,
    pollMilliseconds: 5,
    outputsReady: () => false,
    writeStdout: () => {},
    writeStderr: () => {},
  });
  child.stdout.write("SCENEGIS_BUILD_WATCH_READY\n");
  await assert.rejects(readiness, /outputs after build-watch reported ready/u);
});

test("waits for Vite HEAD routes to change from HTML fallback to JavaScript", async () => {
  const child = createChild("Sandcastle Vite");
  let calls = 0;
  const methods = [];
  await waitForViteReady(child, 6123, {
    timeoutMilliseconds: 1000,
    pollMilliseconds: 1,
    fetch: async (requestUrl, options) => {
      assert.match(requestUrl, /^http:\/\/localhost:6123\//u);
      methods.push(options.method);
      ++calls;
      const ready = calls > 1;
      return {
        ok: true,
        headers: {
          get: () =>
            ready
              ? "text/javascript; charset=utf-8"
              : "text/html; charset=utf-8",
        },
      };
    },
  });
  assert.ok(calls >= 2);
  assert.deepEqual(new Set(methods), new Set(["HEAD"]));
});

test("reports a Vite child exit while waiting for HTTP readiness", async () => {
  const child = createChild("Sandcastle Vite");
  const readiness = waitForViteReady(child, 6123, {
    timeoutMilliseconds: 1000,
    pollMilliseconds: 1,
    fetch: async () => ({
      ok: true,
      headers: { get: () => "text/html; charset=utf-8" },
    }),
  });
  await delay(2);
  child.emit("exit", 7, null);
  await assert.rejects(readiness, /exited before HTTP readiness with code 7/u);
});

test("debounces gallery changes and serializes a queued rebuild", async () => {
  const releases = [];
  let calls = 0;
  let active = 0;
  let maximumActive = 0;
  const rebuilder = createSerializedRebuilder(
    async () => {
      ++calls;
      maximumActive = Math.max(maximumActive, ++active);
      await new Promise((resolve) => releases.push(resolve));
      --active;
    },
    assert.fail,
    0,
  );
  rebuilder.notify();
  rebuilder.notify();
  await delay(10);
  assert.equal(calls, 1);
  rebuilder.notify();
  releases.shift()();
  await delay(10);
  assert.equal(calls, 2);
  releases.shift()();
  await delay(10);
  assert.equal(maximumActive, 1);
  rebuilder.close();
});

test("starts both services after sync and stops siblings on child failure", async () => {
  const signals = new EventEmitter();
  const buildWatch = createChild("build-watch");
  const vite = createChild("Sandcastle Vite");
  let initialBuilds = 0;
  let typeBuilds = 0;
  let rebuilds = 0;
  let buildWatchStarts = 0;
  let viteStarts = 0;
  let terminated = 0;
  let watched = false;
  let galleryChanged;
  const logs = [];
  const errors = [];
  let releaseBuildReady;
  const buildReady = new Promise((resolve) => {
    releaseBuildReady = resolve;
  });
  const completion = runDevelopmentOrchestrator(
    { port: 6123, id: "scenegis-planar-terrain" },
    {
      initialGalleryBuild: async () => ++initialBuilds,
      prepareTypes: async () => ++typeBuilds,
      rebuildGallery: async () => ++rebuilds,
      startBuildWatch: () => {
        ++buildWatchStarts;
        return buildWatch;
      },
      waitForBuildWatchReady: async () => buildReady,
      startVite: () => {
        ++viteStarts;
        return vite;
      },
      waitForViteReady: async () => {},
      createGalleryWatcher: (onChange) => {
        watched = true;
        galleryChanged = onChange;
        return { close: async () => {} };
      },
      terminateAll: async () => ++terminated,
      signalTarget: signals,
      log: (message) => logs.push(message),
      logError: (message) => errors.push(message),
    },
  );
  await delay(0);
  assert.equal(initialBuilds, 1);
  assert.equal(typeBuilds, 1);
  assert.equal(buildWatchStarts, 1);
  assert.equal(viteStarts, 0);
  assert.equal(watched, false);
  releaseBuildReady();
  await delay(0);
  assert.equal(watched, true);
  assert.match(logs[0], /6123.*scenegis-planar-terrain/);
  galleryChanged();
  await delay(120);
  assert.equal(rebuilds, 1);
  assert.equal(buildWatchStarts, 1);
  assert.equal(viteStarts, 1);
  vite.emit("exit", 7, null);
  assert.equal(await completion, 7);
  assert.equal(terminated, 1);
  assert.match(errors[0], /exited unexpectedly/);
});

test("maps Ctrl+C to exit 130 and cleans up children", async () => {
  const signals = new EventEmitter();
  let terminated = 0;
  const completion = runDevelopmentOrchestrator(
    { port: 5173 },
    {
      initialGalleryBuild: async () => {},
      prepareTypes: async () => {},
      rebuildGallery: async () => {},
      startBuildWatch: () => createChild("build-watch"),
      waitForBuildWatchReady: async () => {},
      startVite: () => createChild("Sandcastle Vite"),
      waitForViteReady: async () => {},
      createGalleryWatcher: () => ({ close: async () => {} }),
      terminateAll: async () => ++terminated,
      signalTarget: signals,
      log: () => {},
      logError: () => {},
    },
  );
  await delay(0);
  signals.emit("SIGINT");
  assert.equal(await completion, 130);
  assert.equal(terminated, 1);
});
