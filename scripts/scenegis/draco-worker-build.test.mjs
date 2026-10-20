import assert from "node:assert/strict";
import { atob } from "node:buffer";
import console from "node:console";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import { clearTimeout, setTimeout } from "node:timers";
import { fileURLToPath, URL } from "node:url";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const repository = fileURLToPath(new URL("../../", import.meta.url));
const dracoRoot = process.env.SCENEGIS_DRACO_ROOT
  ? path.resolve(process.env.SCENEGIS_DRACO_ROOT)
  : path.dirname(require.resolve("draco3d/package.json"));

test("browser worker builds keep Node imports dormant and decode real Draco data", async () => {
  const buildRoot = path.join(repository, "Build");
  await mkdir(buildRoot, { recursive: true });
  const fixture = await mkdtemp(path.join(buildRoot, "draco-worker-test-"));
  const previousDirectory = process.cwd();
  try {
    const workers = path.join(fixture, "packages/engine/Source/Workers");
    await mkdir(workers, { recursive: true });
    await mkdir(path.join(fixture, "Source"), { recursive: true });
    await writeFile(path.join(fixture, "Source/copyrightHeader.js"), "");
    const decoder = path
      .join(dracoRoot, "draco_decoder_nodejs.js")
      .replaceAll("\\", "/");
    await writeFile(
      path.join(fixture, "node-only.cjs"),
      `
if (typeof process === "object" && process.versions?.node) {
  require("fs");
  require("path");
  require("node:fs");
  throw new Error("The browser worker entered a Node-only branch.");
}
`,
    );
    await writeFile(
      path.join(workers, "dracoBoundary.js"),
      `
import "../../../../node-only.cjs";
import createDecoder from ${JSON.stringify(decoder)};
export {};
self.decodeFixture = async (wasmBinary, bytes) => {
  const draco = await createDecoder({ wasmBinary });
  const decoder = new draco.Decoder();
  const buffer = new draco.DecoderBuffer();
  const mesh = new draco.Mesh();
  try {
    buffer.Init(bytes, bytes.byteLength);
    const status = decoder.DecodeBufferToMesh(buffer, mesh);
    if (!status.ok()) {
      throw new Error(status.error_msg());
    }
    return [mesh.num_points(), mesh.num_faces()];
  } finally {
    draco.destroy(mesh);
    draco.destroy(buffer);
    draco.destroy(decoder);
  }
};
`,
    );
    const wasm = new Uint8Array(
      await readFile(path.join(dracoRoot, "draco_decoder.wasm")),
    );
    const bytes = new Int8Array(
      await readFile(path.join(dracoRoot, "bunny.drc")),
    );
    process.chdir(fixture);
    const { bundleWorkers } = await import("../build.js");
    let expected;
    for (const iife of [false, true]) {
      await bundleWorkers({
        path: "Build/output",
        iife,
        minify: iife,
        write: true,
      });
      const context = vm.createContext({
        WebAssembly: globalThis.WebAssembly,
        console,
        atob,
        setTimeout,
        clearTimeout,
        WorkerGlobalScope: function () {},
        location: { href: "https://example.invalid/Workers/dracoBoundary.js" },
        importScripts() {
          throw new Error("The decoder must use the supplied WASM bytes.");
        },
      });
      vm.runInContext("self = globalThis;", context);
      if (iife) {
        vm.runInContext(
          await readFile("Build/InlineWorkers.js", "utf8"),
          context,
        );
        vm.runInContext(context.CESIUM_WORKERS, context);
        await context.CesiumWorkers.dracoBoundary();
      } else {
        vm.runInContext(
          await readFile("Build/output/Workers/dracoBoundary.js", "utf8"),
          context,
        );
      }
      const counts = Array.from(await context.decodeFixture(wasm, bytes));
      assert.ok(
        counts[0] > 0 && counts[1] > 0,
        "Decoded a nonempty triangle mesh",
      );
      if (expected) {
        assert.deepEqual(
          counts,
          expected,
          "Both worker formats decode identically",
        );
      }
      expected = counts;
    }
  } finally {
    const { stop } = await import("esbuild");
    await stop();
    process.chdir(previousDirectory);
    assert.equal(path.dirname(path.resolve(fixture)), buildRoot);
    assert.ok(path.basename(fixture).startsWith("draco-worker-test-"));
    await rm(fixture, { recursive: true, force: true });
  }
});
