import Cartesian3 from "../../../../Source/Core/Cartesian3.js";
import Matrix4 from "../../../../Source/Core/Matrix4.js";
import SceneGISPlanarPolygonGeometry from "../../../../Source/SceneGIS/Core/SceneGISPlanarPolygonGeometry.js";
import SceneGISPlanarPolylineGeometry from "../../../../Source/SceneGIS/Core/SceneGISPlanarPolylineGeometry.js";
import SceneGISPlanarGroundVolume from "../../../../Source/SceneGIS/Scene/_private/_SceneGISPlanarGroundVolume.js";

describe("SceneGIS/Scene/SceneGISPlanarGroundVolume", function () {
  it("builds a closed large-offset area volume with an outer ring and hole", function () {
    const offset = 20037508.342789244;
    const geometry = new SceneGISPlanarPolygonGeometry({
      positions: [
        new Cartesian3(offset, offset, 19),
        new Cartesian3(offset + 100, offset, 19),
        new Cartesian3(offset + 100, offset + 100, 19),
        new Cartesian3(offset, offset + 100, 19),
      ],
      holes: [
        [
          new Cartesian3(offset + 25, offset + 25, 19),
          new Cartesian3(offset + 25, offset + 75, 19),
          new Cartesian3(offset + 75, offset + 75, 19),
          new Cartesian3(offset + 75, offset + 25, 19),
        ],
      ],
    });
    const volume = SceneGISPlanarGroundVolume.create(
      { terrainProvider: undefined },
      geometry,
    );
    const positions = volume.geometry.attributes.position.values;
    expect(Array.from(positions).every(Number.isFinite)).toBeTrue();
    expect(
      Array.from(volume.geometry.indices).every(Number.isInteger),
    ).toBeTrue();
    expect(Math.min(...positions.filter((_, index) => index % 3 === 2))).toBe(
      -0.5,
    );
    expect(Math.max(...positions.filter((_, index) => index % 3 === 2))).toBe(
      0.5,
    );
    expect(volume.envelope).toEqual({ minimum: -1, maximum: 1 });
    expect(
      Matrix4.getTranslation(volume.modelMatrix, new Cartesian3()),
    ).toEqual(new Cartesian3(offset, offset, 0));
  });

  it("builds finite straight, turn, and loop route volumes", function () {
    const routes = [
      [new Cartesian3(0, 0, 0), new Cartesian3(10, 0, 0)],
      [
        new Cartesian3(0, 0, 0),
        new Cartesian3(10, 0, 0),
        new Cartesian3(10, 10, 0),
      ],
      [
        new Cartesian3(0, 0, 0),
        new Cartesian3(10, 0, 0),
        new Cartesian3(10, 10, 0),
        new Cartesian3(0, 0, 0),
      ],
    ];
    for (const positions of routes) {
      const volume = SceneGISPlanarGroundVolume.create(
        { terrainProvider: undefined },
        new SceneGISPlanarPolylineGeometry({ positions, width: 3.5 }),
      );
      expect(
        Array.from(volume.geometry.attributes.position.values).every(
          Number.isFinite,
        ),
      ).toBeTrue();
      expect(volume.geometry.indices.length).toBeGreaterThan(0);
      expect(volume.geometry.boundingSphere.radius).toBeGreaterThan(0);
      expect(
        Array.from(volume.geometry.attributes.previousPosition.values).every(
          Number.isFinite,
        ),
      ).toBeTrue();
      expect(
        Array.from(volume.geometry.attributes.nextPosition.values).every(
          Number.isFinite,
        ),
      ).toBeTrue();
    }

    const turn = SceneGISPlanarGroundVolume.create(
      { terrainProvider: undefined },
      new SceneGISPlanarPolylineGeometry({
        positions: routes[1],
        width: 3.5,
      }),
    );
    const turnPrevious = turn.geometry.attributes.previousPosition.values;
    const turnNext = turn.geometry.attributes.nextPosition.values;
    expect(Array.from(turnPrevious.slice(3, 6))).toEqual(
      Array.from(turnPrevious.slice(24, 27)),
    );
    expect(Array.from(turnNext.slice(3, 6))).toEqual(
      Array.from(turnNext.slice(24, 27)),
    );

    const loop = SceneGISPlanarGroundVolume.create(
      { terrainProvider: undefined },
      new SceneGISPlanarPolylineGeometry({
        positions: routes[2],
        width: 3.5,
      }),
    );
    const loopPrevious = loop.geometry.attributes.previousPosition.values;
    const loopNext = loop.geometry.attributes.nextPosition.values;
    const finalEndpointOffset = (2 * 8 + 1) * 3;
    expect(Array.from(loopPrevious.slice(0, 3))).toEqual(
      Array.from(
        loopPrevious.slice(finalEndpointOffset, finalEndpointOffset + 3),
      ),
    );
    expect(Array.from(loopNext.slice(0, 3))).toEqual(
      Array.from(loopNext.slice(finalEndpointOffset, finalEndpointOffset + 3)),
    );
  });

  it("updates only the provider envelope transform", function () {
    const world = {
      terrainProvider: { minimumHeight: -20, maximumHeight: 80 },
    };
    const geometry = new SceneGISPlanarPolygonGeometry({
      positions: [
        new Cartesian3(-2, -2, 0),
        new Cartesian3(2, -2, 0),
        new Cartesian3(2, 2, 0),
      ],
    });
    const volume = SceneGISPlanarGroundVolume.create(world, geometry);
    const values = volume.geometry.attributes.position.values;
    const indices = volume.geometry.indices;
    expect(volume.envelope).toEqual({ minimum: -21, maximum: 81 });

    world.terrainProvider = { minimumHeight: -5, maximumHeight: 5 };
    const envelope = SceneGISPlanarGroundVolume.updateEnvelope(
      world,
      volume.origin,
      volume.modelMatrix,
    );
    expect(envelope).toEqual({ minimum: -6, maximum: 6 });
    expect(volume.geometry.attributes.position.values).toBe(values);
    expect(volume.geometry.indices).toBe(indices);
  });
});
