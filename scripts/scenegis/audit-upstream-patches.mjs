#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const markerPrefix = "SCENEGIS_" + "PATCH_";
const generatedPatterns = [
  /^packages\/engine\/index\.(?:js|d\.ts)$/u,
  /^packages\/engine\/Build\//u,
  /^packages\/engine\/Specs\/SpecList\.js$/u,
  /^packages\/widgets\/index\.(?:js|d\.ts)$/u,
  /^packages\/widgets\/Build\//u,
  /^Build\//u,
  /^Source\/Cesium\.(?:js|d\.ts)$/u,
  /^Specs\/SpecList\.js$/u,
];
const ownedMarkerPatterns = [
  /^packages\/(?:engine|widgets)\/(?:Source|Specs)\/SceneGIS\//u,
  /^packages\/sandcastle\/gallery\/scenegis-[^/]+\//u,
  /^Specs\/e2e\/scenegis-[^/]+\.spec\.js$/u,
  /^scripts\/scenegis\//u,
  /^\.github\/workflows\/scenegis-[^/]+\.ya?ml$/u,
];

function gitBuffer(repo, args) {
  return execFileSync("git", args, {
    cwd: repo,
    encoding: "buffer",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function gitText(repo, args) {
  return gitBuffer(repo, args).toString("utf8").trim();
}

function gitSucceeds(repo, args) {
  try {
    gitBuffer(repo, args);
    return true;
  } catch {
    return false;
  }
}

function readJson(repo, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repo, relativePath), "utf8"));
}

function parseNameStatus(buffer) {
  const tokens = buffer
    .toString("utf8")
    .split("\0")
    .filter((token) => token.length > 0);
  const entries = [];
  for (let index = 0; index < tokens.length;) {
    const status = tokens[index++];
    if (/^[RC]\d*$/u.test(status)) {
      entries.push({
        status: status[0],
        score: status.slice(1),
        oldPath: tokens[index++],
        newPath: tokens[index++],
      });
    } else {
      const file = tokens[index++];
      entries.push({
        status: status[0],
        oldPath: status[0] === "D" ? file : undefined,
        newPath: status[0] === "D" ? undefined : file,
      });
    }
  }
  return entries;
}

function diffEntries(repo, base) {
  const entries = parseNameStatus(
    gitBuffer(repo, [
      "diff",
      "--name-status",
      "-z",
      "--find-renames",
      base,
      "--",
    ]),
  );
  const known = new Set(
    entries.flatMap((entry) => [entry.oldPath, entry.newPath]).filter(Boolean),
  );
  const untracked = gitBuffer(repo, [
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z",
  ])
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
  for (const file of untracked) {
    if (!known.has(file)) {
      entries.push({ status: "A", newPath: file });
    }
  }
  return entries;
}

function entryPaths(entry) {
  return [entry.oldPath, entry.newPath].filter(Boolean);
}

function existsAtBase(repo, base, file) {
  return (
    file !== undefined &&
    gitSucceeds(repo, ["cat-file", "-e", `${base}:${file}`])
  );
}

function registeredFile(entriesByFile, entry) {
  return (
    (entry.oldPath && entriesByFile.get(entry.oldPath)) ||
    (entry.newPath && entriesByFile.get(entry.newPath))
  );
}

function markerRanges(source, expectedId, errors, file) {
  const ranges = [];
  let open;
  const marker = new RegExp(`${markerPrefix}(BEGIN|END) (SGP-\\d{4})`, "u");
  const lines = source.split(/\r?\n/u);
  for (let index = 0; index < lines.length; ++index) {
    const match = marker.exec(lines[index]);
    if (!match) {
      continue;
    }
    const line = index + 1;
    const [, kind, id] = match;
    if (id !== expectedId) {
      errors.push(`Foreign marker ${id} in ${file}; expected ${expectedId}.`);
    }
    if (kind === "BEGIN") {
      if (open !== undefined) {
        errors.push(
          `Nested or misordered ${expectedId} marker at ${file}:${line}.`,
        );
      }
      open = { id, start: line };
    } else if (open === undefined || open.id !== id) {
      errors.push(`Unmatched ${id} END marker at ${file}:${line}.`);
    } else {
      ranges.push({ start: open.start, end: line });
      open = undefined;
    }
  }
  if (open !== undefined) {
    errors.push(`Unclosed ${open.id} marker at ${file}:${open.start}.`);
  }
  if (ranges.length === 0) {
    errors.push(`No paired ${expectedId} marker range in ${file}.`);
  }
  return ranges;
}

function changedNewLines(repo, base, file) {
  const diff = gitText(repo, [
    "diff",
    "--unified=0",
    "--no-color",
    base,
    "--",
    file,
  ]);
  const lines = diff.split(/\r?\n/u);
  const changed = [];
  let newLine;
  let deletionAnchor;
  for (const line of lines) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/u.exec(line);
    if (hunk) {
      newLine = Number(hunk[1]);
      deletionAnchor = Number(hunk[2] ?? 1) === 0 ? newLine : undefined;
      continue;
    }
    if (newLine === undefined || line.startsWith("+++")) {
      continue;
    }
    if (line.startsWith("+")) {
      if (line.slice(1).trim().length > 0) {
        changed.push(newLine);
      }
      ++newLine;
      deletionAnchor = undefined;
    } else if (line.startsWith("-")) {
      // The deletion is anchored between current new-side lines.
    } else if (line.startsWith(" ")) {
      ++newLine;
    }
    if (deletionAnchor !== undefined && !line.startsWith("-")) {
      changed.push(Math.max(1, deletionAnchor));
      deletionAnchor = undefined;
    }
  }
  if (deletionAnchor !== undefined) {
    changed.push(Math.max(1, deletionAnchor));
  }
  return changed;
}

function isBinaryDiff(repo, base, file) {
  const output = gitText(repo, ["diff", "--numstat", base, "--", file]);
  return output.split(/\r?\n/u).some((line) => line.startsWith("-\t-\t"));
}

function statusPaths(repo) {
  const tokens = gitBuffer(repo, [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
  ])
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
  const paths = [];
  for (let index = 0; index < tokens.length; ++index) {
    const token = tokens[index];
    const code = token.slice(0, 2);
    paths.push(token.slice(3));
    if (code.includes("R") || code.includes("C")) {
      paths.push(tokens[++index]);
    }
  }
  return paths;
}

function audit(repo) {
  const errors = [];
  const base = readJson(repo, ".scenegis/upstream-base.json");
  const manifest = readJson(repo, ".scenegis/upstream-patches.json");
  if (base.schemaVersion !== 1 || manifest.schemaVersion !== 1) {
    errors.push("Unsupported SceneGIS audit schema version.");
  }
  if (!gitSucceeds(repo, ["cat-file", "-e", `${base.commit}^{commit}`])) {
    return {
      errors: [
        ...errors,
        `Upstream base commit is unavailable: ${base.commit}`,
      ],
      upstreamOwned: [],
      deliveryUpstreamOwned: [],
      patchIds: [],
      markerCount: 0,
      changedCount: 0,
    };
  }

  const entries = diffEntries(repo, base.commit);
  const deliveryEntries = diffEntries(repo, "HEAD");
  const upstreamOwned = entries.filter(
    (entry) =>
      existsAtBase(repo, base.commit, entry.oldPath) ||
      existsAtBase(repo, base.commit, entry.newPath),
  );
  const deliveryUpstreamOwned = deliveryEntries.filter(
    (entry) =>
      existsAtBase(repo, base.commit, entry.oldPath) ||
      existsAtBase(repo, base.commit, entry.newPath),
  );

  const entriesByFile = new Map();
  const patchIds = new Set();
  for (const patchEntry of manifest.patches ?? []) {
    if (!/^SGP-\d{4}$/u.test(patchEntry.id) || patchIds.has(patchEntry.id)) {
      errors.push(`Invalid or duplicate SGP id: ${patchEntry.id}`);
    }
    patchIds.add(patchEntry.id);
    if (!["proposed", "active", "retired"].includes(patchEntry.status)) {
      errors.push(`${patchEntry.id} has an invalid status.`);
    }
    if (!["low", "medium", "high"].includes(patchEntry.risk)) {
      errors.push(`${patchEntry.id} has an invalid risk.`);
    }
    if (!patchEntry.reason || !patchEntry.removalCondition) {
      errors.push(`${patchEntry.id} is missing reason or removalCondition.`);
    }
    if (!fs.existsSync(path.join(repo, patchEntry.decision))) {
      errors.push(`${patchEntry.id} decision path does not exist.`);
    }
    for (const test of patchEntry.tests ?? []) {
      if (!fs.existsSync(path.join(repo, test))) {
        errors.push(`${patchEntry.id} test path does not exist: ${test}`);
      }
    }
    for (const file of patchEntry.files ?? []) {
      if (!["paired", "manifest-only"].includes(file.markerMode)) {
        errors.push(
          `${patchEntry.id} has an invalid marker mode for ${file.path}.`,
        );
      }
      if (!existsAtBase(repo, base.commit, file.path)) {
        errors.push(
          `${patchEntry.id} lists a file absent from the upstream base: ${file.path}`,
        );
      }
      if (entriesByFile.has(file.path)) {
        errors.push(`Upstream file is registered more than once: ${file.path}`);
      }
      entriesByFile.set(file.path, { patchEntry, file });
    }
  }

  let markerCount = 0;
  const seenManifestFiles = new Set();
  for (const entry of upstreamOwned) {
    const registered = registeredFile(entriesByFile, entry);
    const displayPath = entry.newPath ?? entry.oldPath;
    if (!registered) {
      errors.push(
        `Unregistered upstream-owned diff: ${entryPaths(entry).join(" -> ")}`,
      );
      continue;
    }
    seenManifestFiles.add(registered.file.path);
    if (registered.file.markerMode === "manifest-only") {
      const unannotatable =
        ["D", "R", "C"].includes(entry.status) ||
        (displayPath && isBinaryDiff(repo, base.commit, displayPath));
      if (!unannotatable) {
        errors.push(
          `Stale manifest-only registration for annotatable diff: ${displayPath}`,
        );
      }
      continue;
    }
    if (entry.status !== "M" || entry.newPath !== registered.file.path) {
      errors.push(
        `Paired registration cannot cover ${entry.status} path change: ${entryPaths(entry).join(" -> ")}`,
      );
      continue;
    }
    const source = fs.readFileSync(path.join(repo, entry.newPath), "utf8");
    const ranges = markerRanges(
      source,
      registered.patchEntry.id,
      errors,
      entry.newPath,
    );
    markerCount += ranges.length * 2;
    for (const line of changedNewLines(repo, base.commit, entry.newPath)) {
      if (!ranges.some((range) => line >= range.start && line <= range.end)) {
        errors.push(`Unmarked changed line in ${entry.newPath}:${line}.`);
      }
    }
  }

  for (const [file, registration] of entriesByFile) {
    if (
      registration.patchEntry.status === "active" &&
      !seenManifestFiles.has(file)
    ) {
      errors.push(`Active manifest entry has no upstream diff: ${file}`);
    }
  }

  const changedPaths = new Set(entries.flatMap(entryPaths));
  for (const file of changedPaths) {
    if (
      ownedMarkerPatterns.some((pattern) => pattern.test(file)) &&
      fs.existsSync(path.join(repo, file)) &&
      fs.readFileSync(path.join(repo, file), "utf8").includes(markerPrefix)
    ) {
      errors.push(
        `SceneGIS-owned product/test/script contains a patch marker: ${file}`,
      );
    }
  }
  for (const file of statusPaths(repo)) {
    if (generatedPatterns.some((pattern) => pattern.test(file))) {
      errors.push(`Generated delivery file is dirty: ${file}`);
    }
  }

  return {
    errors,
    upstreamOwned,
    deliveryUpstreamOwned,
    patchIds: [...patchIds],
    markerCount,
    changedCount: changedPaths.size,
  };
}

const repoArgument = process.argv.indexOf("--repo");
const repo = path.resolve(
  repoArgument === -1 ? process.cwd() : process.argv[repoArgument + 1],
);
try {
  const result = audit(repo);
  if (result.errors.length > 0) {
    for (const error of result.errors) {
      process.stderr.write(`ERROR: ${error}\n`);
    }
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `SceneGIS upstream audit passed: ${result.upstreamOwned.length} registered upstream-owned entries, current delivery upstream-owned entries ${result.deliveryUpstreamOwned.length}, ${result.patchIds.join(", ")}, ${result.markerCount} marker tokens, ${result.changedCount} total changed paths, generated status 0.\n`,
    );
  }
} catch (error) {
  process.stderr.write(`ERROR: ${error.message}\n`);
  process.exitCode = 1;
}
