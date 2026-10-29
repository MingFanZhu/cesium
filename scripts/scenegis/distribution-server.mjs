import { Buffer } from "node:buffer";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

const root = fileURLToPath(new URL("../../Build/SceneGIS/", import.meta.url));
const types = {
  ".js": "text/javascript",
  ".html": "text/html",
  ".css": "text/css",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};
createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  try {
    if (url.pathname === "/__case") {
      const mount =
        url.searchParams.get("mount") === "nested"
          ? "/deep/site/vendor/engine/"
          : "/";
      const format = url.searchParams.get("format") === "iife" ? "iife" : "esm";
      const base = url.searchParams.get("base");
      const globals =
        base === "new"
          ? `window.SCENEGIS_BASE_URL=${JSON.stringify(mount)}; window.CESIUM_BASE_URL='/wrong/';`
          : base === "legacy"
            ? `window.CESIUM_BASE_URL=${JSON.stringify(mount)};`
            : "";
      response.setHeader("Content-Type", "text/html");
      response.end(
        `<!doctype html><link rel="stylesheet" href="${mount}Widgets/widgets.css"><style>html,body,#view{width:100%;height:100%;margin:0}</style><div id="view"></div><script>${globals}</script>${format === "iife" ? `<script src="${mount}SceneGIS.js?v=test#bundle"></script>` : ""}<script type="module">window.engine = ${format === "iife" ? "window.SceneGIS" : `await import(${JSON.stringify(`${mount}index.js`)})`}; window.ready=true;</script>`,
      );
      return;
    }
    if (url.pathname === "/__draco.bin") {
      const gltf = JSON.parse(
        await readFile(
          fileURLToPath(
            new URL(
              "../../Specs/Data/Models/glTF-2.0/BoxWithTangents/glTF-Draco/BoxWithTangents.gltf",
              import.meta.url,
            ),
          ),
          "utf8",
        ),
      );
      const view = gltf.bufferViews[0];
      response.end(
        Buffer.from(gltf.buffers[0].uri.split(",")[1], "base64").subarray(
          view.byteOffset,
          view.byteOffset + view.byteLength,
        ),
      );
      return;
    }
    const relative = decodeURIComponent(url.pathname).replace(
      /^\/deep\/site\/vendor\/engine\//,
      "/",
    );
    const target = path.resolve(root, `.${relative}`);
    if (!target.startsWith(`${path.resolve(root)}${path.sep}`)) {
      response.writeHead(403).end();
      return;
    }
    response.setHeader(
      "Content-Type",
      types[path.extname(target)] ?? "application/octet-stream",
    );
    response.end(await readFile(target));
  } catch {
    response.writeHead(404).end();
  }
}).listen(8104, "127.0.0.1", () =>
  process.stdout.write("Distribution fixture ready\n"),
);
