import { Buffer } from "node:buffer";
import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import { fileURLToPath, URL } from "node:url";
import { copyEngineAssets, copyWidgetsAssets } from "../build.js";

const root = fileURLToPath(new URL("../../", import.meta.url));

async function filesAndEmptyDirectories(directory, relative = "") {
  const files = [];
  const empty = [];
  const entries = await readdir(path.join(directory, relative), {
    withFileTypes: true,
  });
  if (!entries.length) {
    empty.push(relative);
  }
  for (const entry of entries) {
    const name = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) {
      const child = await filesAndEmptyDirectories(directory, name);
      files.push(...child.files);
      empty.push(...child.empty);
    } else {
      files.push(name);
    }
  }
  return { files: files.sort(), empty: empty.sort() };
}

test("native asset copying preserves files and remapping without source-only directories", async () => {
  const build = path.resolve(root, "Build");
  const fixture = await mkdtemp(path.join(build, "asset-copy-"));
  const previousDirectory = process.cwd();
  try {
    const inputs = {
      "packages/engine/Source/Core/code.js": "export default 1;",
      "packages/engine/Source/SceneGIS/Scene/code.js": "export default 2;",
      "packages/engine/Source/Shaders/SceneGIS/code.glsl": "void main() {}",
      "packages/engine/Source/Assets/Textures/sample.bin": Buffer.from([
        0, 1, 255,
      ]),
      "packages/engine/Source/Assets/SceneGIS/LICENSE.txt": "Resource notice",
      "packages/engine/Source/ThirdParty/decoder.wasm": "\u0000asm",
      "packages/engine/Source/Widget/Widget.js": "export default 3;",
      "packages/engine/Source/Widget/Widget.css": ".widget {}",
      "packages/widgets/Source/Viewer/Viewer.js": "export default 4;",
      "packages/widgets/Source/Viewer/Viewer.css": ".viewer {}",
      "packages/widgets/Source/Images/icon.svg": "<svg/>",
    };
    for (const [filename, content] of Object.entries(inputs)) {
      await mkdir(path.dirname(path.join(fixture, filename)), {
        recursive: true,
      });
      await writeFile(path.join(fixture, filename), content);
    }
    await mkdir(path.join(fixture, "packages/engine/Source/Unused/empty"), {
      recursive: true,
    });
    await mkdir(
      path.join(fixture, "packages/widgets/Source/ViewModels/empty"),
      { recursive: true },
    );
    process.chdir(fixture);
    await copyEngineAssets("output");
    await copyWidgetsAssets("output/Widgets");
    const result = await filesAndEmptyDirectories("output");
    assert.deepEqual(result.empty, []);
    const expected = {
      "Assets/Textures/sample.bin":
        inputs["packages/engine/Source/Assets/Textures/sample.bin"],
      "Assets/SceneGIS/LICENSE.txt": "Resource notice",
      "ThirdParty/decoder.wasm": "\u0000asm",
      "Widgets/CesiumWidget/Widget.css": ".widget {}",
      "Widgets/Images/icon.svg": "<svg/>",
    };
    assert.deepEqual(result.files, Object.keys(expected).sort());
    for (const [filename, content] of Object.entries(expected)) {
      assert.deepEqual(
        await readFile(path.join("output", filename)),
        Buffer.from(content),
      );
    }
  } finally {
    process.chdir(previousDirectory);
    assert.ok(fixture.startsWith(`${build}${path.sep}`));
    await rm(fixture, { recursive: true, force: true });
  }
});

test("complete SceneGIS artifact contains no empty directories", async () => {
  const result = await filesAndEmptyDirectories(
    path.join(root, "Build/SceneGIS"),
  );
  assert.deepEqual(result.empty, []);
});
