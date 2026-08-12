import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
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
  parseArguments,
  runDevelopmentOrchestrator,
  waitForBuildWatchReady,
} from "./start-sandcastle-dev.mjs";
import { createSceneGISViteConfig } from "./sandcastle-vite.config.mjs";

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
  const plugin = {};
  const upstreamConfig = async () => ({
    root: "sandcastle-root",
    plugins: [plugin],
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
