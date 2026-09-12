import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const markerPrefix = "SCENEGIS_" + "PATCH_";
const auditScript = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "audit-upstream-patches.mjs",
);

function git(repo, args) {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
}

function write(repo, file, value) {
  const target = path.join(repo, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value);
}

function manifestFile(file, markerMode = "paired") {
  return {
    id: "SGP-0001",
    status: "active",
    risk: "high",
    reason: "fixture",
    removalCondition: "fixture removed",
    decision: "Documentation/SceneGIS/Decisions/ADR.md",
    tests: ["packages/engine/Specs/SceneGIS/TestSpec.js"],
    files: [{ path: file, markerMode }],
  };
}

function writeManifest(repo, files) {
  const patches = files.map(({ file, markerMode }) =>
    manifestFile(file, markerMode),
  );
  patches.forEach((entry, index) => {
    entry.id = `SGP-${String(index + 1).padStart(4, "0")}`;
  });
  write(
    repo,
    ".scenegis/upstream-patches.json",
    JSON.stringify({ schemaVersion: 1, patches }),
  );
}

function setPatchStatus(repo, index, status) {
  const manifestPath = path.join(repo, ".scenegis/upstream-patches.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.patches[index].status = status;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
}

function fixture() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "scenegis-audit-"));
  git(repo, ["init", "--quiet"]);
  git(repo, ["config", "user.email", "audit@example.invalid"]);
  git(repo, ["config", "user.name", "SceneGIS Audit"]);
  write(repo, "packages/engine/Source/Scene/Scene.js", "export default 1;\n");
  write(repo, "packages/engine/Source/Scene/Extra.js", "export default 1;\n");
  write(repo, "packages/engine/Source/Scene/Rename.js", "export default 1;\n");
  write(repo, "packages/engine/Source/Scene/Delete.js", "export default 1;\n");
  write(repo, "packages/engine/Source/Scene/Stale.js", "export default 1;\n");
  write(repo, "Documentation/SceneGIS/Decisions/ADR.md", "# ADR\n");
  write(repo, "packages/engine/Specs/SceneGIS/TestSpec.js", "// spec\n");
  git(repo, ["add", "."]);
  git(repo, ["commit", "--quiet", "-m", "base"]);
  const base = git(repo, ["rev-parse", "HEAD"]);
  write(
    repo,
    ".scenegis/upstream-base.json",
    JSON.stringify({ schemaVersion: 1, commit: base }),
  );
  writeManifest(repo, [
    { file: "packages/engine/Source/Scene/Scene.js", markerMode: "paired" },
  ]);
  write(
    repo,
    "packages/engine/Source/Scene/Scene.js",
    `// ${markerPrefix}BEGIN SGP-0001: fixture.\nexport default 2;\n// ${markerPrefix}END SGP-0001\n`,
  );
  return repo;
}

function audit(repo) {
  return spawnSync(process.execPath, [auditScript, "--repo", repo], {
    encoding: "utf8",
  });
}

function expectFailure(name, mutate) {
  test(`rejects ${name}`, () => {
    const repo = fixture();
    mutate(repo);
    const result = audit(repo);
    assert.notEqual(
      result.status,
      0,
      `${name}\n${result.stdout}\n${result.stderr}`,
    );
    fs.rmSync(repo, { recursive: true, force: true });
  });
}

test("accepts registered paired upstream patches", () => {
  const repo = fixture();
  assert.equal(audit(repo).status, 0);
  fs.rmSync(repo, { recursive: true, force: true });
});

test("accepts independent paired patch registrations for one upstream file", () => {
  const repo = fixture();
  writeManifest(repo, [
    { file: "packages/engine/Source/Scene/Scene.js", markerMode: "paired" },
    { file: "packages/engine/Source/Scene/Scene.js", markerMode: "paired" },
  ]);
  write(
    repo,
    "packages/engine/Source/Scene/Scene.js",
    `// ${markerPrefix}BEGIN SGP-0001: first fixture.\nexport const first = 1;\n// ${markerPrefix}END SGP-0001\n// ${markerPrefix}BEGIN SGP-0002: second fixture.\nexport const second = 2;\n// ${markerPrefix}END SGP-0002\n`,
  );
  const result = audit(repo);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /1 registered upstream-owned entries/u);
  assert.match(result.stdout, /SGP-0001, SGP-0002/u);
  fs.rmSync(repo, { recursive: true, force: true });
});

test("accepts an active pair beside retired history for one upstream file", () => {
  const repo = fixture();
  writeManifest(repo, [
    { file: "packages/engine/Source/Scene/Scene.js", markerMode: "paired" },
    { file: "packages/engine/Source/Scene/Scene.js", markerMode: "paired" },
  ]);
  setPatchStatus(repo, 1, "retired");
  const result = audit(repo);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /SGP-0001/u);
  assert.doesNotMatch(result.stdout, /SGP-0002/u);
  fs.rmSync(repo, { recursive: true, force: true });
});

test("accepts an active pair beside an unmaterialized proposed registration", () => {
  const repo = fixture();
  writeManifest(repo, [
    { file: "packages/engine/Source/Scene/Scene.js", markerMode: "paired" },
    { file: "packages/engine/Source/Scene/Scene.js", markerMode: "paired" },
  ]);
  setPatchStatus(repo, 1, "proposed");
  const result = audit(repo);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /SGP-0001/u);
  assert.doesNotMatch(result.stdout, /SGP-0002/u);
  fs.rmSync(repo, { recursive: true, force: true });
});

test("accepts a valid materialized proposed pair beside an active pair", () => {
  const repo = fixture();
  writeManifest(repo, [
    { file: "packages/engine/Source/Scene/Scene.js", markerMode: "paired" },
    { file: "packages/engine/Source/Scene/Scene.js", markerMode: "paired" },
  ]);
  setPatchStatus(repo, 1, "proposed");
  write(
    repo,
    "packages/engine/Source/Scene/Scene.js",
    `// ${markerPrefix}BEGIN SGP-0001: active fixture.\nexport const active = 1;\n// ${markerPrefix}END SGP-0001\n// ${markerPrefix}BEGIN SGP-0002: proposed fixture.\nexport const proposed = 2;\n// ${markerPrefix}END SGP-0002\n`,
  );
  const result = audit(repo);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /SGP-0001, SGP-0002/u);
  fs.rmSync(repo, { recursive: true, force: true });
});

test("accepts a retired registration with no upstream diff", () => {
  const repo = fixture();
  setPatchStatus(repo, 0, "retired");
  write(repo, "packages/engine/Source/Scene/Scene.js", "export default 1;\n");
  assert.equal(audit(repo).status, 0);
  fs.rmSync(repo, { recursive: true, force: true });
});

test("accepts registered manifest-only rename and retains the old path", () => {
  const repo = fixture();
  writeManifest(repo, [
    { file: "packages/engine/Source/Scene/Scene.js", markerMode: "paired" },
    {
      file: "packages/engine/Source/Scene/Rename.js",
      markerMode: "manifest-only",
    },
  ]);
  git(repo, [
    "mv",
    "packages/engine/Source/Scene/Rename.js",
    "packages/engine/Source/Scene/Renamed.js",
  ]);
  const result = audit(repo);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /2 registered upstream-owned entries/u);
  fs.rmSync(repo, { recursive: true, force: true });
});

test("accepts registered manifest-only deletion", () => {
  const repo = fixture();
  writeManifest(repo, [
    { file: "packages/engine/Source/Scene/Scene.js", markerMode: "paired" },
    {
      file: "packages/engine/Source/Scene/Delete.js",
      markerMode: "manifest-only",
    },
  ]);
  git(repo, ["rm", "--quiet", "packages/engine/Source/Scene/Delete.js"]);
  assert.equal(audit(repo).status, 0);
  fs.rmSync(repo, { recursive: true, force: true });
});

expectFailure("an unregistered upstream diff", (repo) => {
  fs.appendFileSync(
    path.join(repo, "packages/engine/Source/Scene/Extra.js"),
    "// changed\n",
  );
});

expectFailure("a duplicate patch and path registration", (repo) => {
  const manifestPath = path.join(repo, ".scenegis/upstream-patches.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.patches[0].files.push({
    path: "packages/engine/Source/Scene/Scene.js",
    markerMode: "paired",
  });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
});

expectFailure("paired and manifest-only registrations for one file", (repo) => {
  writeManifest(repo, [
    { file: "packages/engine/Source/Scene/Scene.js", markerMode: "paired" },
    {
      file: "packages/engine/Source/Scene/Scene.js",
      markerMode: "manifest-only",
    },
  ]);
});

expectFailure("a missing marker for a second registered patch", (repo) => {
  writeManifest(repo, [
    { file: "packages/engine/Source/Scene/Scene.js", markerMode: "paired" },
    { file: "packages/engine/Source/Scene/Scene.js", markerMode: "paired" },
  ]);
});

expectFailure("a retained marker for a retired patch", (repo) => {
  writeManifest(repo, [
    { file: "packages/engine/Source/Scene/Scene.js", markerMode: "paired" },
    { file: "packages/engine/Source/Scene/Scene.js", markerMode: "paired" },
  ]);
  setPatchStatus(repo, 1, "retired");
  write(
    repo,
    "packages/engine/Source/Scene/Scene.js",
    `// ${markerPrefix}BEGIN SGP-0001: active fixture.\nexport const active = 1;\n// ${markerPrefix}END SGP-0001\n// ${markerPrefix}BEGIN SGP-0002: retired fixture.\nexport const retired = 2;\n// ${markerPrefix}END SGP-0002\n`,
  );
});

expectFailure(
  "an unregistered third marker in a multiply registered file",
  (repo) => {
    writeManifest(repo, [
      { file: "packages/engine/Source/Scene/Scene.js", markerMode: "paired" },
      { file: "packages/engine/Source/Scene/Scene.js", markerMode: "paired" },
    ]);
    write(
      repo,
      "packages/engine/Source/Scene/Scene.js",
      `// ${markerPrefix}BEGIN SGP-0001: first fixture.\nexport const first = 1;\n// ${markerPrefix}END SGP-0001\n// ${markerPrefix}BEGIN SGP-0002: second fixture.\nexport const second = 2;\n// ${markerPrefix}END SGP-0002\n// ${markerPrefix}BEGIN SGP-9999: foreign.\nexport const foreign = 3;\n// ${markerPrefix}END SGP-9999\n`,
    );
  },
);

expectFailure("a changed line outside multiple paired ranges", (repo) => {
  writeManifest(repo, [
    { file: "packages/engine/Source/Scene/Scene.js", markerMode: "paired" },
    { file: "packages/engine/Source/Scene/Scene.js", markerMode: "paired" },
  ]);
  write(
    repo,
    "packages/engine/Source/Scene/Scene.js",
    `// ${markerPrefix}BEGIN SGP-0001: first fixture.\nexport const first = 1;\n// ${markerPrefix}END SGP-0001\n// ${markerPrefix}BEGIN SGP-0002: second fixture.\nexport const second = 2;\n// ${markerPrefix}END SGP-0002\nexport const unmarked = true;\n`,
  );
});

expectFailure("a second unmarked hunk in a registered file", (repo) => {
  fs.appendFileSync(
    path.join(repo, "packages/engine/Source/Scene/Scene.js"),
    "\nexport const unmarked = true;\n",
  );
});

expectFailure("an unpaired marker", (repo) => {
  write(
    repo,
    "packages/engine/Source/Scene/Scene.js",
    `// ${markerPrefix}BEGIN SGP-0001: broken.\nexport default 2;\n`,
  );
});

expectFailure("a foreign marker id", (repo) => {
  write(
    repo,
    "packages/engine/Source/Scene/Scene.js",
    `// ${markerPrefix}BEGIN SGP-9999: foreign.\nexport default 2;\n// ${markerPrefix}END SGP-9999\n`,
  );
});

expectFailure("an unregistered pure rename", (repo) => {
  git(repo, [
    "mv",
    "packages/engine/Source/Scene/Rename.js",
    "packages/engine/Source/Scene/Renamed.js",
  ]);
});

expectFailure("a stale active manifest entry", (repo) => {
  writeManifest(repo, [
    { file: "packages/engine/Source/Scene/Scene.js", markerMode: "paired" },
    {
      file: "packages/engine/Source/Scene/Stale.js",
      markerMode: "manifest-only",
    },
  ]);
});

for (const [name, file] of [
  ["SceneGIS engine source marker", "packages/engine/Source/SceneGIS/New.js"],
  ["SceneGIS E2E marker", "Specs/e2e/scenegis-fixture.spec.js"],
  [
    "SceneGIS Sandcastle marker",
    "packages/sandcastle/gallery/scenegis-fixture/main.js",
  ],
  ["SceneGIS Test example marker", "Test/fixture.html"],
]) {
  expectFailure(name, (repo) => {
    write(repo, file, `// ${markerPrefix}BEGIN SGP-9999: forbidden.\n`);
  });
}

expectFailure("a dirty generated delivery path", (repo) => {
  write(repo, "packages/engine/index.js", "generated\n");
});
