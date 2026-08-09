import Cartesian3 from "../../../../Source/Core/Cartesian3.js";
import HeightReference from "../../../../Source/Scene/HeightReference.js";
import SceneGISPlanarExtent from "../../../../Source/SceneGIS/Core/SceneGISPlanarExtent.js";
import SceneGISPlanarPolygonGeometry from "../../../../Source/SceneGIS/Core/SceneGISPlanarPolygonGeometry.js";
import SceneGISPlanarPolylineGeometry from "../../../../Source/SceneGIS/Core/SceneGISPlanarPolylineGeometry.js";
import SceneGISPlanarGroundDraper from "../../../../Source/SceneGIS/Scene/_private/_SceneGISPlanarGroundDraper.js";

function entry(mesh) {
  return {
    key: "0/0/0",
    extent: new SceneGISPlanarExtent({
      minimumX: 0,
      minimumY: 0,
      maximumX: 10,
      maximumY: 10,
    }),
    mesh,
  };
}

function maximumZ(result) {
  const values = result.geometry.attributes.position.values;
  let maximum = -Infinity;
  for (let i = 2; i < values.length; i += 3) {
    maximum = Math.max(maximum, values[i] + result.origin.z);
  }
  return maximum;
}

function triangleKeys(result) {
  const values = result.geometry.attributes.position.values;
  const keys = new Set();
  for (let i = 0; i < values.length; i += 9) {
    const area =
      (values[i + 3] - values[i]) * (values[i + 7] - values[i + 1]) -
      (values[i + 4] - values[i + 1]) * (values[i + 6] - values[i]);
    expect(area).not.toBe(0);
    const points = [];
    for (let j = 0; j < 3; ++j) {
      points.push(
        `${values[i + j * 3]},${values[i + j * 3 + 1]},${values[i + j * 3 + 2]}`,
      );
    }
    keys.add(points.sort().join("|"));
  }
  return keys;
}

describe("SceneGIS/Scene/SceneGISPlanarGroundDraper", function () {
  it("splits a line at actual terrain triangles and captures an interior peak", function () {
    const mesh = {
      positions: new Float32Array([
        -0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 10,
      ]),
      indices: new Uint16Array([0, 1, 3, 0, 3, 2, 0, 1, 2]),
      width: 2,
      height: 2,
      surfaceIndexCount: 6,
      referenceHeight: 0,
    };
    const result = SceneGISPlanarGroundDraper.drape(
      new SceneGISPlanarPolylineGeometry({
        positions: [new Cartesian3(0, 5, 0), new Cartesian3(10, 5, 0)],
        width: 2,
      }),
      HeightReference.CLAMP_TO_GROUND,
      undefined,
      [entry(mesh)],
      1,
    );
    expect(result).toBeDefined();
    expect(maximumZ(result)).toBeGreaterThan(0);
  });

  it("uses the same clipping path for flat fallback and relative heights", function () {
    const result = SceneGISPlanarGroundDraper.drape(
      new SceneGISPlanarPolylineGeometry({
        positions: [new Cartesian3(0, 5, 3), new Cartesian3(10, 5, 3)],
        width: 1,
      }),
      HeightReference.RELATIVE_TO_GROUND,
      undefined,
      [entry(undefined)],
      1,
    );
    expect(maximumZ(result)).toBe(3);
  });

  it("keeps disconnected actual-cover pieces separated in one logical geometry", function () {
    const geometry = new SceneGISPlanarPolylineGeometry({
      positions: [new Cartesian3(0, 2, 0), new Cartesian3(10, 2, 0)],
      width: 1,
    });
    const west = entry(undefined);
    west.extent = new SceneGISPlanarExtent({
      minimumX: 0,
      minimumY: 0,
      maximumX: 4,
      maximumY: 4,
    });
    const east = entry(undefined);
    east.key = "0/1/0";
    east.extent = new SceneGISPlanarExtent({
      minimumX: 6,
      minimumY: 0,
      maximumX: 10,
      maximumY: 4,
    });
    const westOnly = SceneGISPlanarGroundDraper.drape(
      geometry,
      HeightReference.CLAMP_TO_GROUND,
      undefined,
      [west],
      1,
    ).geometry;
    const eastOnly = SceneGISPlanarGroundDraper.drape(
      geometry,
      HeightReference.CLAMP_TO_GROUND,
      undefined,
      [east],
      1,
    ).geometry;
    const combined = SceneGISPlanarGroundDraper.drape(
      geometry,
      HeightReference.CLAMP_TO_GROUND,
      undefined,
      [west, east],
      2,
    ).geometry;
    expect(combined.indices.length).toBe(
      westOnly.indices.length + eastOnly.indices.length,
    );
    const attribute = westOnly.attributes[Object.keys(westOnly.attributes)[0]];
    const westVertices =
      attribute.values.length / attribute.componentsPerAttribute;
    expect(
      Math.min(...combined.indices.slice(westOnly.indices.length)),
    ).toBeGreaterThanOrEqual(westVertices);
  });

  it("clips polygon caps and holes against the actual cover", function () {
    const result = SceneGISPlanarGroundDraper.drape(
      new SceneGISPlanarPolygonGeometry({
        positions: [
          new Cartesian3(1, 1, 2),
          new Cartesian3(9, 1, 2),
          new Cartesian3(9, 9, 2),
          new Cartesian3(1, 9, 2),
        ],
        holes: [
          [
            new Cartesian3(4, 4, 2),
            new Cartesian3(6, 4, 2),
            new Cartesian3(6, 6, 2),
            new Cartesian3(4, 6, 2),
          ],
        ],
      }),
      HeightReference.CLAMP_TO_GROUND,
      undefined,
      [entry(undefined)],
      1,
    );
    expect(result.geometry.indices.length).toBeGreaterThan(0);
    expect(maximumZ(result)).toBe(0);
  });

  it("supports mixed top and bottom references and excludes skirt indices", function () {
    const mesh = {
      positions: new Float32Array([
        -0.5, -0.5, 4, 0.5, -0.5, 4, 0.5, 0.5, 4, -0.5, 0.5, 4, -0.5, -0.5,
        -100,
      ]),
      indices: new Uint16Array([0, 1, 2, 0, 2, 3, 0, 4, 1]),
      width: 2,
      height: 2,
      surfaceIndexCount: 6,
      referenceHeight: 0,
    };
    const result = SceneGISPlanarGroundDraper.drape(
      new SceneGISPlanarPolygonGeometry({
        positions: [
          new Cartesian3(1, 1, 8),
          new Cartesian3(9, 1, 8),
          new Cartesian3(9, 9, 8),
          new Cartesian3(1, 9, 8),
        ],
        bottomPositions: [
          new Cartesian3(1, 1, -2),
          new Cartesian3(9, 1, -2),
          new Cartesian3(9, 9, -2),
          new Cartesian3(1, 9, -2),
        ],
      }),
      HeightReference.NONE,
      HeightReference.RELATIVE_TO_GROUND,
      [entry(mesh)],
      1,
    );
    expect(maximumZ(result)).toBe(8);
    expect(result.geometry.boundingSphere.radius).toBeLessThan(100);
  });

  it("visits only bounded regular-grid cells in a 257 by 257 tile", function () {
    const width = 257;
    const height = 257;
    const positions = new Float32Array(width * height * 3);
    for (let row = 0; row < height; ++row) {
      for (let column = 0; column < width; ++column) {
        const offset = (row * width + column) * 3;
        positions[offset] = column / (width - 1) - 0.5;
        positions[offset + 1] = 0.5 - row / (height - 1);
      }
    }
    const indices = new Uint32Array((width - 1) * (height - 1) * 6);
    let offset = 0;
    for (let row = 0; row < height - 1; ++row) {
      for (let column = 0; column < width - 1; ++column) {
        const northwest = row * width + column;
        const northeast = northwest + 1;
        const southwest = northwest + width;
        const southeast = southwest + 1;
        indices.set(
          [southwest, southeast, northeast, southwest, northeast, northwest],
          offset,
        );
        offset += 6;
      }
    }
    const tile = entry({
      positions,
      indices,
      width,
      height,
      surfaceIndexCount: indices.length,
      referenceHeight: 0,
    });
    tile.source = "DIRECT";
    tile.revision = 1;
    const unrelated = entry(undefined);
    unrelated.key = "unrelated";
    unrelated.source = "FLAT";
    unrelated.revision = 7;
    unrelated.extent = new SceneGISPlanarExtent({
      minimumX: 20,
      minimumY: 20,
      maximumX: 30,
      maximumY: 30,
    });
    const geometry = new SceneGISPlanarPolylineGeometry({
      positions: [new Cartesian3(1, 1, 0), new Cartesian3(1.1, 1.1, 0)],
      width: 1,
    });
    const debug = {};
    expect(
      SceneGISPlanarGroundDraper.drape(
        geometry,
        HeightReference.CLAMP_TO_GROUND,
        undefined,
        [tile, unrelated],
        2,
        debug,
      ),
    ).toBeDefined();
    expect(debug.relevantEntries).toBe(1);
    expect(debug.visitedTriangles).toBeLessThan(100);
    expect(
      SceneGISPlanarGroundDraper.getCoverageSignature(
        geometry,
        [tile, unrelated],
        2,
        "9|all",
      ),
    ).toBe("9|0/0/0:DIRECT:1");
  });

  it("normalizes shared-edge caps and rejects derived extrusion inversion", function () {
    const geometry = new SceneGISPlanarPolygonGeometry({
      positions: [
        new Cartesian3(0, 0, 5),
        new Cartesian3(10, 0, 5),
        new Cartesian3(10, 10, 5),
        new Cartesian3(0, 10, 5),
      ],
    });
    const result = SceneGISPlanarGroundDraper.drape(
      geometry,
      HeightReference.CLAMP_TO_GROUND,
      undefined,
      [entry(undefined)],
      1,
    );
    expect(result.geometry.indices.length).toBe(6);
    expect(triangleKeys(result).size).toBe(2);

    const extruded = new SceneGISPlanarPolygonGeometry({
      positions: geometry._getDrapeSource().top,
      bottomPositions: geometry
        ._getDrapeSource()
        .top.map((position) => new Cartesian3(position.x, position.y, 4)),
    });
    const raised = entry({
      positions: new Float32Array([
        -0.5, -0.5, 5, 0.5, -0.5, 5, 0.5, 0.5, 5, -0.5, 0.5, 5,
      ]),
      indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
      width: 2,
      height: 2,
      surfaceIndexCount: 6,
      referenceHeight: 0,
    });
    expect(function () {
      SceneGISPlanarGroundDraper.drape(
        extruded,
        HeightReference.NONE,
        HeightReference.RELATIVE_TO_GROUND,
        [raised],
        1,
      );
    }).toThrowDeveloperError();
  });

  it("derives vertical outline endpoints from one cover snapshot", function () {
    const vertical = new SceneGISPlanarPolylineGeometry({
      positions: [new Cartesian3(5, 5, 6), new Cartesian3(5, 5, 0)],
      width: 1,
    });
    expect(
      SceneGISPlanarGroundDraper.drape(
        vertical,
        HeightReference.CLAMP_TO_GROUND,
        undefined,
        [entry(undefined)],
        1,
        undefined,
        [HeightReference.CLAMP_TO_GROUND, HeightReference.CLAMP_TO_GROUND],
      ),
    ).toBeUndefined();

    const mixed = SceneGISPlanarGroundDraper.drape(
      new SceneGISPlanarPolylineGeometry({
        positions: [new Cartesian3(5, 5, 6), new Cartesian3(5, 5, 0)],
        width: 1,
      }),
      HeightReference.NONE,
      undefined,
      [entry(undefined)],
      1,
      undefined,
      [HeightReference.NONE, HeightReference.CLAMP_TO_GROUND],
    );
    expect(mixed).toBeDefined();
    expect(maximumZ(mixed)).toBe(6);
  });
});
