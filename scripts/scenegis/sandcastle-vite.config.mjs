import process from "node:process";
import { createReadStream, existsSync, realpathSync, statSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import path from "node:path";

const originEnvironmentVariable = "SCENEGIS_SANDCASTLE_ORIGIN";
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");
const staticCopyPluginNames = new Set([
  "vite-plugin-static-copy:serve",
  "vite-plugin-static-copy:build",
]);
const upstreamImportMapPluginName = "custom-import-map";
export const sandcastleRuntimeModuleUrl = "/Build/CesiumUnminified/index.js";

const contentTypes = new Map([
  [".js", "text/javascript; charset=utf-8"],
  [".cjs", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".ts", "text/plain; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".czml", "application/json; charset=utf-8"],
  [".geojson", "application/geo+json; charset=utf-8"],
  [".topojson", "application/json; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".xml", "application/xml; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".svg", "image/svg+xml"],
  [".wasm", "application/wasm"],
  [".ktx2", "image/ktx2"],
  [".gltf", "model/gltf+json"],
  [".glb", "model/gltf-binary"],
  [".gpx", "application/gpx+xml"],
  [".kml", "application/vnd.google-earth.kml+xml"],
  [".kmz", "application/vnd.google-earth.kmz"],
  [".dae", "model/vnd.collada+xml"],
  [".md", "text/markdown; charset=utf-8"],
]);

function flattenPlugins(plugins) {
  return (plugins ?? []).flat(Infinity).filter(Boolean);
}

function isWithin(root, target) {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

export function resolveSceneGISStaticRequest(url, root = repositoryRoot) {
  const rawPathname = (url ?? "").split(/[?#]/u, 1)[0];
  let pathname;
  try {
    pathname = decodeURIComponent(rawPathname);
  } catch {
    return { status: 400 };
  }
  if (pathname.includes("\\") || pathname.includes("\0")) {
    return { status: 400 };
  }
  const exact = new Map([
    ["/Source/Cesium.js", "Source/Cesium.js"],
    ["/Source/Cesium.d.ts", "Source/Cesium.d.ts"],
    [
      "/packages/engine/Build/Unminified/index.js",
      "packages/engine/Build/Unminified/index.js",
    ],
    [
      "/packages/engine/Build/Unminified/index.d.ts",
      "packages/engine/index.d.ts",
    ],
    ["/packages/engine/index.d.ts", "packages/engine/index.d.ts"],
    [
      "/packages/widgets/Build/Unminified/index.js",
      "packages/widgets/Build/Unminified/index.js",
    ],
    [
      "/packages/widgets/Build/Unminified/index.d.ts",
      "packages/widgets/index.d.ts",
    ],
    ["/packages/widgets/index.d.ts", "packages/widgets/index.d.ts"],
  ]);
  let relative = exact.get(pathname);
  if (!relative) {
    for (const [prefix, directory] of [
      ["/Build/CesiumUnminified/", "Build/CesiumUnminified"],
      ["/Apps/SampleData/", "Apps/SampleData"],
      ["/SampleData/", "Apps/SampleData"],
    ]) {
      if (pathname.startsWith(prefix)) {
        const suffix = pathname.slice(prefix.length);
        if (
          !suffix ||
          suffix.split("/").some((part) => part === ".." || part === ".")
        ) {
          return { status: 400 };
        }
        relative = path.join(directory, ...suffix.split("/"));
        break;
      }
    }
  }
  if (!relative) {
    return undefined;
  }
  const absoluteRoot = path.resolve(root);
  const target = path.resolve(absoluteRoot, relative);
  if (!isWithin(absoluteRoot, target) || !existsSync(target)) {
    return { status: 404 };
  }
  const resolvedRoot = realpathSync(absoluteRoot);
  const resolvedTarget = realpathSync(target);
  if (
    !isWithin(resolvedRoot, resolvedTarget) ||
    !statSync(resolvedTarget).isFile()
  ) {
    return { status: 404 };
  }
  return {
    status: 200,
    path: resolvedTarget,
    contentType:
      contentTypes.get(path.extname(resolvedTarget).toLowerCase()) ??
      "application/octet-stream",
  };
}

export function createSceneGISStaticMiddleware(root = repositoryRoot) {
  return (request, response, next) => {
    const resolved = resolveSceneGISStaticRequest(request.url, root);
    if (!resolved) {
      next();
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.statusCode = 405;
      response.setHeader("Allow", "GET, HEAD");
      response.end();
      return;
    }
    if (resolved.status !== 200) {
      response.statusCode = resolved.status;
      response.end();
      return;
    }
    response.statusCode = 200;
    response.setHeader("Content-Type", resolved.contentType);
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    const stream = createReadStream(resolved.path);
    stream.once("error", () => {
      if (!response.headersSent) {
        response.statusCode = 500;
      }
      response.end();
    });
    stream.pipe(response);
  };
}

export function createSceneGISStaticPlugin(root = repositoryRoot) {
  return {
    name: "scenegis-sandcastle-static-routes",
    configureServer(server) {
      server.middlewares.use(createSceneGISStaticMiddleware(root));
    },
  };
}

export function createSceneGISImportMapPlugin() {
  const imports = {
    Sandcastle: "../templates/Sandcastle.js",
    cesium: sandcastleRuntimeModuleUrl,
    "@cesium/engine": sandcastleRuntimeModuleUrl,
    "@cesium/widgets": sandcastleRuntimeModuleUrl,
  };
  return {
    name: "scenegis-sandcastle-import-map",
    transformIndexHtml: {
      order: "pre",
      handler(html, context) {
        if (
          !["bucket.html", "standalone.html"].includes(
            path.basename(context.filename),
          )
        ) {
          return undefined;
        }
        return {
          html,
          tags: [
            {
              tag: "script",
              attrs: { type: "importmap" },
              children: JSON.stringify({ imports }, null, 2),
              injectTo: "head-prepend",
            },
          ],
        };
      },
    },
  };
}

function validateOrigin(origin) {
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    throw new Error(`${originEnvironmentVariable} must be a valid URL origin.`);
  }
  if (
    parsed.protocol !== "http:" ||
    parsed.hostname !== "localhost" ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      `${originEnvironmentVariable} must be an http://localhost origin with an optional port.`,
    );
  }
  return parsed.origin;
}

async function loadUpstreamConfig() {
  return (await import("../../packages/sandcastle/vite.config.dev.ts")).default;
}

export async function createSceneGISViteConfig(
  configEnvironment,
  options = {},
) {
  const origin = validateOrigin(
    options.origin ?? process.env[originEnvironmentVariable],
  );
  const upstreamConfig = options.upstreamConfig ?? (await loadUpstreamConfig());
  const config =
    typeof upstreamConfig === "function"
      ? await upstreamConfig(configEnvironment)
      : upstreamConfig;
  const plugins = flattenPlugins(config.plugins);
  const retainedPlugins = plugins.filter(
    (plugin) =>
      !staticCopyPluginNames.has(plugin.name) &&
      plugin.name !== upstreamImportMapPluginName,
  );
  const removedPluginNames = plugins
    .filter((plugin) => staticCopyPluginNames.has(plugin.name))
    .map((plugin) => plugin.name);
  if (!removedPluginNames.includes("vite-plugin-static-copy:serve")) {
    throw new Error(
      "Upstream Sandcastle config no longer exposes the named static-copy serve plugin; re-audit the SceneGIS wrapper seam.",
    );
  }
  if (!plugins.some((plugin) => plugin.name === upstreamImportMapPluginName)) {
    throw new Error(
      "Upstream Sandcastle config no longer exposes the named custom-import-map plugin; re-audit the SceneGIS wrapper seam.",
    );
  }
  return {
    ...config,
    plugins: [
      ...retainedPlugins,
      createSceneGISStaticPlugin(options.root),
      createSceneGISImportMapPlugin(),
    ],
    define: {
      ...config.define,
      __OUTER_ORIGIN__: JSON.stringify(origin),
      __INNER_ORIGIN__: JSON.stringify(origin),
    },
  };
}

export default function sceneGISViteConfig(configEnvironment) {
  return createSceneGISViteConfig(configEnvironment);
}
