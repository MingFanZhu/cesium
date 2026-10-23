import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import {
  readPlyHeader,
  streamPlyVertexBatches,
} from "./io/ply/PlyStreamReader.js";
import {
  inspectGaussianPlySchema,
  gaussianCorePropertyNames,
} from "../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianPlyGaussianSchema.js";
import { createRawGaussianBlock } from "../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianColumns.js";
import { decodePlyGaussianBlock } from "../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianDecodePlyGaussian.js";
import {
  encodeCorePage,
  encodeShPage,
} from "../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianEncodingExt.js";
import { PREBUILT_LOD_SCHEMA } from "./prebuiltLodPolicy.js";

export async function hashSource(file, onProgress) {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(file, {
    highWaterMark: 8 * 1024 * 1024,
  })) {
    hash.update(chunk);
    bytes += chunk.length;
    onProgress?.(bytes);
  }
  return hash.digest("hex");
}

export async function readPrebuiltLodManifest(file) {
  const manifest = JSON.parse(
    (await readFile(file, "utf8")).replace(/^\uFEFF/, ""),
  );
  if (
    manifest.schema !== PREBUILT_LOD_SCHEMA ||
    !Array.isArray(manifest.levels) ||
    manifest.levels.length < 2 ||
    manifest.levels.length > 8
  ) {
    throw new Error(
      "Expected " + PREBUILT_LOD_SCHEMA + " with 2 to 8 levels, finest first",
    );
  }
  const allowed = new Set([
    "schema",
    "levels",
    "coordinateSystem",
    "metersPerUnit",
    "localOrigin",
    "localToFixed",
    "fixedGridOrigin",
    "cellSizeMeters",
    "maxPackBytes",
    "batchSize",
  ]);
  for (const key of Object.keys(manifest)) {
    if (!allowed.has(key)) {
      throw new Error("Unknown prebuilt LOD manifest option: " + key);
    }
  }
  const inputs = [];
  for (const level of manifest.levels) {
    if (typeof level !== "string" || level.length === 0) {
      throw new Error(
        "Each level must be a PLY path; order is explicit, never inferred from filenames",
      );
    }
    const input = await realpath(path.resolve(path.dirname(file), level));
    if (
      inputs.some((item) => item.input.toLowerCase() === input.toLowerCase())
    ) {
      throw new Error("Duplicate LOD input: " + input);
    }
    const snapshot = await stat(input);
    const header = await readPlyHeader(input);
    const schema = inspectGaussianPlySchema(header);
    if (
      !header.format.startsWith("binary_") ||
      schema.vertexCount < 1 ||
      schema.vertexCount > 0xffffffff
    ) {
      throw new Error(
        "Each level must be a nonempty binary Gaussian PLY with uint32 point count",
      );
    }
    if (
      inputs.length &&
      (schema.maxShDegree !== inputs[0].schema.maxShDegree ||
        schema.vertexCount > inputs.at(-1).schema.vertexCount)
    ) {
      throw new Error(
        "Levels must have the same SH degree and non-increasing point counts",
      );
    }
    inputs.push({ input, header, schema, snapshot });
  }
  // PLY comments are preserved as evidence. They are not an ECEF transform.
  const coordinates = new Map();
  for (const item of inputs) {
    for (const comment of item.header.comments ?? []) {
      const match = /^(epsg|offsetx|offsety|offsetz)\s+(.+)$/i.exec(
        comment.trim(),
      );
      if (!match) {
        continue;
      }
      const key = match[1].toLowerCase(),
        value = Number(match[2]);
      if (
        !Number.isFinite(value) ||
        (coordinates.has(key) && coordinates.get(key) !== value)
      ) {
        throw new Error(
          "Conflicting or invalid PLY coordinate metadata: " + key,
        );
      }
      coordinates.set(key, value);
    }
  }
  return {
    manifest,
    inputs,
    coordinateComments: Object.fromEntries(coordinates),
  };
}

export async function assertSourcesUnchanged(inputs) {
  for (const item of inputs) {
    const current = await stat(item.input);
    if (
      current.size !== item.snapshot.size ||
      current.mtimeMs !== item.snapshot.mtimeMs ||
      current.ctimeMs !== item.snapshot.ctimeMs ||
      current.ino !== item.snapshot.ino
    ) {
      throw new Error("Source changed during import: " + item.input);
    }
  }
}

function decodeBatch(batch, schema) {
  const raw = createRawGaussianBlock(batch.count, schema.shCoefficientCount);
  // Keep double PLY coordinates intact until a shared origin has been subtracted.
  for (const name of [
    "position",
    "logScale",
    "rotation",
    "dc",
    "opacityLogit",
    "sh",
  ]) {
    raw[name] = new Float64Array(raw[name].length);
  }
  for (let i = 0; i < batch.count; i++) {
    for (let c = 0; c < 3; c++) {
      raw.position[i * 3 + c] = batch.columns[["x", "y", "z"][c]][i];
      raw.logScale[i * 3 + c] = batch.columns["scale_" + c][i];
      raw.dc[i * 3 + c] = batch.columns["f_dc_" + c][i];
    }
    for (let c = 0; c < 4; c++) {
      raw.rotation[i * 4 + c] = batch.columns[schema.rotationMapping[c]][i];
    }
    for (let j = 0; j < raw.shCount / 3; j++) {
      for (let c = 0; c < 3; c++) {
        raw.sh[i * raw.shCount + j * 3 + c] =
          batch.columns["f_rest_" + (c * (raw.shCount / 3) + j)][i];
      }
    }
    raw.opacityLogit[i] = batch.columns.opacity[i];
    raw.stableId[i] = batch.start + i;
  }
  const decoded = decodePlyGaussianBlock(raw);
  if (decoded.filterDiagnostics.filteredCount !== 0) {
    throw new Error(
      "Invalid source Gaussians; import does not silently filter: " +
        JSON.stringify(decoded.filterDiagnostics),
    );
  }
  return decoded.data;
}

// One disk spool, bounded input batches, scalar metadata per occupied cell.
// Parents reuse these encoded bytes without decoding/re-encoding proxy parameters.
export async function partitionPrebuiltLevels(
  inputs,
  options,
  spool,
  onProgress,
) {
  let origin;
  const levels = [];
  const shStride = [0, 16, 32, 64][inputs[0].schema.maxShDegree];
  for (let level = 0; level < inputs.length; level++) {
    const item = inputs[level],
      cells = new Map();
    const properties = [
      ...gaussianCorePropertyNames,
      ...Array.from(
        { length: item.schema.shCoefficientCount },
        (_, i) => "f_rest_" + i,
      ),
    ];
    for await (const batch of streamPlyVertexBatches(item.input, {
      header: item.header,
      batchSize: options.batchSize,
      properties,
    })) {
      const data = decodeBatch(batch, item.schema);
      origin ??= [0, 1, 2].map(
        (c) =>
          options.fixedGridOrigin[c] +
          Math.floor(
            (data.position[c] - options.fixedGridOrigin[c]) /
              options.cellSizeMeters[c],
          ) *
            options.cellSizeMeters[c],
      );
      for (let i = 0; i < data.count; i++) {
        for (let c = 0; c < 3; c++) {
          data.position[i * 3 + c] -= origin[c];
        }
      }
      const core = encodeCorePage(data, 0, data.count);
      const sh = shStride ? encodeShPage(data, 0, data.count) : undefined;
      const view = new DataView(core.buffer, core.byteOffset, core.byteLength);
      const groups = new Map();
      for (let i = 0; i < data.count; i++) {
        const xyz = [0, 1, 2].map((c) =>
          Math.floor(
            (view.getFloat32(i * 32 + c * 4, true) +
              origin[c] -
              options.fixedGridOrigin[c]) /
              options.cellSizeMeters[c],
          ),
        );
        if (
          !xyz.every(
            (v) => Number.isInteger(v) && v >= -2147483648 && v <= 2147483647,
          )
        ) {
          throw new Error(
            "Encoded Gaussian center exceeds the XYZ grid integer range",
          );
        }
        const key = xyz.join(",");
        let group = groups.get(key);
        if (!group) {
          group = { xyz, indices: [] };
          groups.set(key, group);
        }
        group.indices.push(i);
      }
      for (const [key, group] of groups) {
        if (level > 0 && !levels[0].has(key)) {
          throw new Error(
            "Coarse LOD " +
              level +
              " contains a cell absent from finest LOD: " +
              key +
              ". Choose a shared grid origin/tile size covering matching source domains.",
          );
        }
        let cell = cells.get(key);
        if (!cell) {
          cell = {
            key,
            xyz: group.xyz,
            count: 0,
            core: [],
            sh: [],
            sourceLevel: level,
          };
          cells.set(key, cell);
        }
        for (const [bytes, stride, records, kind] of [
          [core, 32, cell.core, 1],
          [sh, shStride, cell.sh, 2],
        ]) {
          if (!stride) {
            continue;
          }
          const selected = new Uint8Array(group.indices.length * stride);
          group.indices.forEach((index, local) =>
            selected.set(
              bytes.subarray(index * stride, (index + 1) * stride),
              local * stride,
            ),
          );
          records.push(
            await spool.append({
              kind,
              count: group.indices.length,
              bytes: selected,
            }),
          );
        }
        cell.count += group.indices.length;
      }
      onProgress?.({
        stage: "partition",
        level,
        scanned: batch.start + batch.count,
        total: item.schema.vertexCount,
        cells: cells.size,
      });
    }
    item.sha256 = await hashSource(item.input, (bytes) =>
      onProgress?.({
        stage: "source-hash",
        level,
        bytes,
        total: item.snapshot.size,
      }),
    );
    levels.push(cells);
  }
  await assertSourcesUnchanged(inputs);
  return { levels, origin, shStride };
}

export async function* readCellRows(cell, spool) {
  // Import locally to keep all raw parsing in this module.
  const { decodeCorePage } =
    await import("../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianEncodingExt.js");
  for (const record of cell.core) {
    yield decodeCorePage(await spool.read(record));
  }
}

export async function readCellRange(cells, kind, start, count, stride, spool) {
  const output = new Uint8Array(count * stride);
  let cursor = 0,
    written = 0;
  for (const cell of cells) {
    for (const record of cell[kind === 1 ? "core" : "sh"]) {
      const from = Math.max(start, cursor),
        to = Math.min(start + count, cursor + record.count);
      if (from < to) {
        const bytes = await spool.read({
          offset: record.offset + (from - cursor) * stride,
          byteLength: (to - from) * stride,
        });
        output.set(bytes, written);
        written += bytes.length;
      }
      cursor += record.count;
      if (cursor >= start + count) {
        if (written !== output.length) {
          throw new Error("Incomplete source spool range");
        }
        return output;
      }
    }
  }
  throw new Error("Source spool range exceeds cell inventory");
}
