import assert from "node:assert/strict";
import console from "node:console";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import process from "node:process";

// Convert a reviewed Overpass JSON snapshot; never fetch data during example startup.
const source = resolve(process.argv[2] ?? "Build/weather-nanjing-osm.json");
const toolRoot = resolve(process.argv[3] ?? "Build/weather-data-tools");
const requireTool = createRequire(resolve(toolRoot, "package.json"));
const convert = requireTool("osmtogeojson");
const sourceBytes = await readFile(source);
const raw = JSON.parse(sourceBytes);
assert.equal(
  raw.remark,
  undefined,
  "Overpass returned a partial/error response",
);
const converted = convert(raw);
const counts = { height: 0, levels: 0, estimated: 0, polygons: 0, holes: 0 };
const features = converted.features
  .filter((feature) => feature.properties.building !== "no")
  .map((feature) => {
    const properties = feature.properties;
    assert.ok(properties.building && properties.building !== "no");
    assert.ok(["Polygon", "MultiPolygon"].includes(feature.geometry.type));
    const polygons =
      feature.geometry.type === "Polygon"
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates;
    for (const rings of polygons) {
      counts.polygons++;
      counts.holes += rings.length - 1;
      for (const ring of rings) {
        assert.ok(ring.length >= 4);
        assert.deepEqual(ring[0], ring.at(-1));
        for (const [lon, lat] of ring) {
          assert.ok(Number.isFinite(lon) && Number.isFinite(lat));
          assert.ok(lon > 118.74 && lon < 118.83 && lat > 32.01 && lat < 32.08);
        }
      }
    }
    if (properties.height !== undefined) {
      assert.match(properties.height, /^\d+(\.\d+)?( ?m)?$/);
    }
    const taggedHeight = Number.parseFloat(properties.height);
    const levels = Number(properties["building:levels"]);
    const heightSource =
      taggedHeight > 0 ? "height" : levels > 0 ? "levels" : "estimated";
    const height =
      heightSource === "height"
        ? taggedHeight
        : heightSource === "levels"
          ? levels * 3
          : 12;
    assert.ok(Number.isFinite(height) && height > 0 && height < 1000);
    counts[heightSource]++;
    return {
      type: "Feature",
      id: feature.id,
      properties: {
        osmId: properties.id,
        building: properties.building,
        height,
        heightSource,
      },
      geometry: feature.geometry,
    };
  });
assert.ok(features.length > 5000);
assert.ok(counts.holes > 0);
features.sort((a, b) => a.id.localeCompare(b.id));
const output = {
  type: "FeatureCollection",
  metadata: {
    name: "Nanjing central district",
    source: "OpenStreetMap contributors",
    license: "ODbL-1.0",
    copyrightUrl: "https://www.openstreetmap.org/copyright",
    snapshot: raw.osm3s.timestamp_osm_base,
    sourceSha256: createHash("sha256").update(sourceBytes).digest("hex"),
    bounds: [118.755, 32.02, 118.815, 32.07],
    center: [118.785, 32.045],
    counts,
  },
  features,
};
const directory = "Test/Rendering/data/NanjingBuildings";
await mkdir(directory, { recursive: true });
await writeFile(
  `${directory}/buildings.geojson`,
  `${JSON.stringify(output)}\n`,
);
console.log(JSON.stringify({ features: features.length, ...output.metadata }));
