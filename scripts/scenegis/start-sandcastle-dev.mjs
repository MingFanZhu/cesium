import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import path from "node:path";
import process from "node:process";
import { clearTimeout, setTimeout } from "node:timers";
import { watch } from "chokidar";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");
const sandcastleDirectory = path.join(repositoryRoot, "packages/sandcastle");
const galleryDirectory = path.join(sandcastleDirectory, "gallery");
const viteConfigPath = path.join(scriptDirectory, "sandcastle-vite.config.mjs");
const buildWatchReadyMarker = "SCENEGIS_BUILD_WATCH_READY";
const buildReadinessPaths = [
  path.join(repositoryRoot, "Source/Cesium.js"),
  path.join(repositoryRoot, "packages/engine/Build/Unminified/index.js"),
  path.join(repositoryRoot, "packages/widgets/Build/Unminified/index.js"),
  path.join(repositoryRoot, "Build/CesiumUnminified/index.js"),
];

function resolveWindowsNpmCli() {
  const candidates = [
    process.env.npm_execpath,
    path.join(
      path.dirname(process.execPath),
      "node_modules/npm/bin/npm-cli.js",
    ),
    path.join(
      path.dirname(process.execPath),
      "node_modules/npm/bin/npm-cli.cjs",
    ),
  ];
  return candidates.find((candidate) => candidate && existsSync(candidate));
}

export function createNpmInvocation(args) {
  if (process.platform !== "win32") {
    return { command: "npm", args, shell: false };
  }
  const npmCli = resolveWindowsNpmCli();
  if (npmCli) {
    return {
      command: process.execPath,
      args: [npmCli, ...args],
      shell: false,
    };
  }
  return { command: "npm.cmd", args, shell: true };
}

export function createViteArguments(port) {
  return [
    "run",
    "dev-no-embedding",
    "--",
    "--config",
    viteConfigPath,
    "--port",
    String(port),
    "--strictPort",
  ];
}

export function createSandcastleOrigin(port) {
  return new URL(`http://localhost:${port}`).origin;
}

export function createViteEnvironment(port, environment = process.env) {
  return {
    ...environment,
    SCENEGIS_SANDCASTLE_ORIGIN: createSandcastleOrigin(port),
  };
}

export function parseArguments(args) {
  const result = { port: 5173, id: undefined };
  const seen = new Set();
  for (let i = 0; i < args.length; ++i) {
    const option = args[i];
    if (option !== "--port" && option !== "--id") {
      throw new Error(
        `Unknown option "${option}". Use --port <1-65535> and optionally --id <example-slug>.`,
      );
    }
    if (seen.has(option)) {
      throw new Error(`${option} may only be specified once.`);
    }
    seen.add(option);
    const value = args[++i];
    if (!value || value.startsWith("--")) {
      throw new Error(`${option} requires a value.`);
    }
    if (option === "--port") {
      const port = Number(value);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error("--port must be an integer from 1 through 65535.");
      }
      result.port = port;
    } else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
      throw new Error(
        "--id must be a lowercase Sandcastle example slug containing only letters, numbers, and hyphens.",
      );
    } else {
      result.id = value;
    }
  }
  return result;
}

export function createSandcastleUrl({ port, id }) {
  const base = `${createSandcastleOrigin(port)}/index.html`;
  return id ? `${base}?id=${encodeURIComponent(id)}` : base;
}

export function createSerializedRebuilder(runBuild, onFailure, delay = 100) {
  let timer;
  let running = false;
  let queued = false;
  let closed = false;

  async function drain() {
    timer = undefined;
    if (closed || running) {
      queued = !closed;
      return;
    }
    running = true;
    do {
      queued = false;
      try {
        await runBuild();
      } catch (error) {
        closed = true;
        onFailure(error);
        break;
      }
    } while (queued && !closed);
    running = false;
  }

  return {
    notify() {
      if (closed) {
        return;
      }
      queued = true;
      if (running) {
        return;
      }
      clearTimeout(timer);
      timer = setTimeout(drain, delay);
    },
    close() {
      closed = true;
      queued = false;
      clearTimeout(timer);
    },
  };
}

function createProcessManager() {
  const children = new Set();

  function startProcess(
    command,
    args,
    cwd,
    label,
    stdio = "inherit",
    environment = process.env,
    shell = false,
  ) {
    const child = spawn(command, args, {
      cwd,
      detached: process.platform !== "win32",
      shell,
      stdio,
      env: environment,
    });
    child.sceneGISLabel = label;
    children.add(child);
    child.once("exit", () => children.delete(child));
    child.once("error", () => children.delete(child));
    return child;
  }

  function start(
    args,
    cwd,
    label,
    stdio = "inherit",
    environment = process.env,
  ) {
    const invocation = createNpmInvocation(args);
    return startProcess(
      invocation.command,
      invocation.args,
      cwd,
      label,
      stdio,
      environment,
      invocation.shell,
    );
  }

  function run(args, cwd, label) {
    return new Promise((resolve, reject) => {
      const child = start(args, cwd, label);
      child.once("error", (error) => {
        reject(new Error(`${label} failed to start: ${error.message}`));
      });
      child.once("exit", (code, signal) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(
          new Error(
            `${label} exited ${signal ? `with signal ${signal}` : `with code ${code}`}.`,
          ),
        );
      });
    });
  }

  async function terminateAll() {
    const liveChildren = Array.from(children).filter(
      (child) => child.exitCode === null && child.signalCode === null,
    );
    await Promise.all(
      liveChildren.map(
        (child) =>
          new Promise((resolve) => {
            if (process.platform === "win32") {
              const killer = spawn(
                "taskkill.exe",
                ["/pid", String(child.pid), "/t", "/f"],
                { shell: false, stdio: "ignore" },
              );
              killer.once("error", resolve);
              killer.once("exit", resolve);
              return;
            }
            try {
              process.kill(-child.pid, "SIGTERM");
            } catch {
              resolve();
              return;
            }
            const timeout = setTimeout(() => {
              try {
                process.kill(-child.pid, "SIGKILL");
              } catch {
                // The process group already exited.
              }
              resolve();
            }, 2000);
            child.once("exit", () => {
              clearTimeout(timeout);
              resolve();
            });
          }),
      ),
    );
  }

  return { start, startProcess, run, terminateAll };
}

export function createReadyMarkerDetector(onReady) {
  let buffered = "";
  let ready = false;
  return (chunk) => {
    if (ready) {
      return;
    }
    buffered = `${buffered}${chunk.toString()}`.slice(
      -(buildWatchReadyMarker.length + 64),
    );
    if (buffered.includes(buildWatchReadyMarker)) {
      ready = true;
      onReady();
    }
  };
}

export function waitForBuildWatchReady(child, options = {}) {
  const timeoutMilliseconds = options.timeoutMilliseconds ?? 120000;
  const outputsReady =
    options.outputsReady ??
    (() => buildReadinessPaths.every((file) => existsSync(file)));
  const writeStdout =
    options.writeStdout ?? ((chunk) => process.stdout.write(chunk));
  const writeStderr =
    options.writeStderr ?? ((chunk) => process.stderr.write(chunk));
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          "Timed out waiting for build-watch to initialize its incremental context and file watchers.",
        ),
      );
    }, timeoutMilliseconds);
    function cleanup(removeOutputListeners = true) {
      clearTimeout(timeout);
      if (removeOutputListeners) {
        child.stdout.removeListener("data", onStdout);
        child.stderr.removeListener("data", onStderr);
      }
      child.removeListener("error", onError);
      child.removeListener("exit", onExit);
    }
    const detectReady = createReadyMarkerDetector(() => {
      if (!outputsReady()) {
        cleanup();
        reject(
          new Error(
            "build-watch reported ready before all required Cesium development outputs existed.",
          ),
        );
        return;
      }
      cleanup(false);
      resolve();
    });
    function onStdout(chunk) {
      writeStdout(chunk);
      detectReady(chunk);
    }
    function onStderr(chunk) {
      writeStderr(chunk);
    }
    function onError(error) {
      cleanup();
      reject(new Error(`build-watch failed to start: ${error.message}`));
    }
    function onExit(code, signal) {
      cleanup();
      reject(
        new Error(
          `build-watch exited before readiness${
            signal ? ` with signal ${signal}` : ` with code ${code}`
          }.`,
        ),
      );
    }
    child.stdout.on("data", onStdout);
    child.stderr.on("data", onStderr);
    child.once("error", onError);
    child.once("exit", onExit);
  });
}

export async function runDevelopmentOrchestrator(options, dependencies) {
  const {
    initialGalleryBuild,
    prepareTypes,
    rebuildGallery,
    startBuildWatch,
    waitForBuildWatchReady,
    startVite,
    createGalleryWatcher,
    terminateAll,
    signalTarget,
    log,
    logError,
  } = dependencies;
  let watcher;
  let rebuilder;
  let shuttingDown = false;
  let resolveExit;
  const exitPromise = new Promise((resolve) => {
    resolveExit = resolve;
  });

  async function shutdown(exitCode, reason) {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    rebuilder?.close();
    try {
      await watcher?.close();
    } catch (error) {
      logError(`Gallery watcher cleanup failed: ${error.message}`);
    }
    try {
      if (reason) {
        logError(reason);
      }
      await terminateAll();
    } finally {
      resolveExit(exitCode);
    }
  }

  const onSigint = () => void shutdown(130);
  const onSigterm = () => void shutdown(143);
  signalTarget.once("SIGINT", onSigint);
  signalTarget.once("SIGTERM", onSigterm);

  try {
    await initialGalleryBuild();
    await prepareTypes();
    if (shuttingDown) {
      return await exitPromise;
    }
    const buildWatch = startBuildWatch();
    function monitorChild(child) {
      child.once("error", (error) => {
        void shutdown(
          1,
          `${child.sceneGISLabel} failed to start: ${error.message}`,
        );
      });
      child.once("exit", (code, signal) => {
        if (!shuttingDown) {
          void shutdown(
            code && code > 0 ? code : 1,
            `${child.sceneGISLabel} exited unexpectedly${
              signal ? ` with signal ${signal}` : ` with code ${code}`
            }.`,
          );
        }
      });
    }
    monitorChild(buildWatch);
    await waitForBuildWatchReady(buildWatch);
    if (shuttingDown) {
      return await exitPromise;
    }
    const vite = startVite(options.port);
    monitorChild(vite);
    rebuilder = createSerializedRebuilder(rebuildGallery, (error) => {
      void shutdown(1, `Gallery rebuild failed: ${error.message}`);
    });
    watcher = createGalleryWatcher(
      () => rebuilder.notify(),
      (error) => void shutdown(1, `Gallery watcher failed: ${error.message}`),
    );
    log(`Sandcastle development URL: ${createSandcastleUrl(options)}`);
    log(
      "Cesium source and Shader updates are produced by build-watch. Vite HMR is disabled; refresh the whole page after builds complete.",
    );
    return await exitPromise;
  } catch (error) {
    await shutdown(1, error.message);
    return await exitPromise;
  } finally {
    signalTarget.removeListener("SIGINT", onSigint);
    signalTarget.removeListener("SIGTERM", onSigterm);
  }
}

async function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`SceneGIS Sandcastle dev: ${error.message}\n`);
    return 1;
  }
  const manager = createProcessManager();
  const galleryCommand = ["run", "build-gallery-no-embedding"];
  return runDevelopmentOrchestrator(options, {
    initialGalleryBuild: () =>
      manager.run(galleryCommand, sandcastleDirectory, "Initial gallery sync"),
    prepareTypes: () =>
      manager.run(
        ["run", "build-ts"],
        repositoryRoot,
        "Type prerequisite build",
      ),
    rebuildGallery: () =>
      manager.run(galleryCommand, sandcastleDirectory, "Gallery rebuild"),
    startBuildWatch: () =>
      manager.startProcess(
        process.execPath,
        [fileURLToPath(import.meta.url), "--internal-build-watch"],
        repositoryRoot,
        "build-watch",
        ["ignore", "pipe", "pipe"],
      ),
    waitForBuildWatchReady,
    startVite: (port) =>
      manager.start(
        createViteArguments(port),
        sandcastleDirectory,
        "Sandcastle Vite",
        "inherit",
        createViteEnvironment(port),
      ),
    createGalleryWatcher: (onChange, onError) => {
      const watcher = watch(galleryDirectory, {
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 20 },
      });
      watcher.on("all", onChange);
      watcher.on("error", onError);
      return watcher;
    },
    terminateAll: manager.terminateAll,
    signalTarget: process,
    log: (message) => process.stdout.write(`${message}\n`),
    logError: (message) =>
      process.stderr.write(`SceneGIS Sandcastle dev: ${message}\n`),
  });
}

async function runBuildWatchChild() {
  try {
    const { buildWatch } = await import("../../gulpfile.js");
    await new Promise((resolve, reject) => {
      buildWatch((error) => (error ? reject(error) : resolve()));
    });
    process.stdout.write(`${buildWatchReadyMarker}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`SceneGIS build-watch child: ${error.message}\n`);
    return 1;
  }
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  process.exitCode =
    process.argv[2] === "--internal-build-watch"
      ? await runBuildWatchChild()
      : await main();
}
