import BoundingSphere from "../../../../Source/Core/BoundingSphere.js";
import BoundingSphereState from "../../../../Source/DataSources/BoundingSphereState.js";
import Cartesian2 from "../../../../Source/Core/Cartesian2.js";
import Cartesian3 from "../../../../Source/Core/Cartesian3.js";
import Color from "../../../../Source/Core/Color.js";
import CorridorGraphics from "../../../../Source/DataSources/CorridorGraphics.js";
import EntityCollection from "../../../../Source/DataSources/EntityCollection.js";
import JulianDate from "../../../../Source/Core/JulianDate.js";
import HeightReference from "../../../../Source/Scene/HeightReference.js";
import PolylineVolumeGraphics from "../../../../Source/DataSources/PolylineVolumeGraphics.js";
import PrimitiveCollection from "../../../../Source/Scene/PrimitiveCollection.js";
import WallGraphics from "../../../../Source/DataSources/WallGraphics.js";
import SceneGISPlanarCoordinateSystem from "../../../../Source/SceneGIS/Core/SceneGISPlanarCoordinateSystem.js";
import SceneGISPlanarExtent from "../../../../Source/SceneGIS/Core/SceneGISPlanarExtent.js";
import SceneGISPlanarRouteVisualizer from "../../../../Source/SceneGIS/DataSources/_private/_SceneGISPlanarRouteVisualizer.js";
import SceneGISPlanarWorld from "../../../../Source/SceneGIS/Scene/SceneGISPlanarWorld.js";
import SceneGISPlanarGroundPrimitive from "../../../../Source/SceneGIS/Scene/SceneGISPlanarGroundPrimitive.js";

describe("SceneGIS/DataSources/SceneGISPlanarRouteVisualizer", function () {
  const time = JulianDate.fromIso8601("2026-08-10T00:00:00Z");
  let world;
  let collection;
  let primitives;
  let visualizer;
  beforeEach(function () {
    world = new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: -1000,
          minimumY: -1000,
          maximumX: 1000,
          maximumY: 1000,
        }),
      }),
      maximumLevel: 1,
    });
    collection = new EntityCollection();
    primitives = new PrimitiveCollection();
    visualizer = new SceneGISPlanarRouteVisualizer(
      world,
      { primitives },
      collection,
      primitives,
    );
  });
  afterEach(function () {
    if (!visualizer.isDestroyed()) {
      visualizer.destroy();
    }
    primitives.destroy();
    world.destroy();
  });

  it("creates corridor fill and outline and reuses its warm owner", function () {
    const entity = collection.add({
      id: "corridor",
      corridor: new CorridorGraphics({
        positions: [
          new Cartesian3(-20, 0, 0),
          new Cartesian3(0, 0, 0),
          new Cartesian3(0, 20, 0),
        ],
        width: 4,
        height: 3,
        outline: true,
      }),
    });
    expect(visualizer.update(time)).toBeTrue();
    const owner = visualizer._items.get(entity.id).owners.corridor;
    expect(owner.primitives.length).toBe(2);
    visualizer.update(time);
    expect(visualizer._items.get(entity.id).owners.corridor).toBe(owner);
    expect(visualizer.getBoundingSphere(entity, new BoundingSphere())).toBe(
      BoundingSphereState.DONE,
    );
  });

  it("creates wall and volume owners with original Entity ids", function () {
    const entity = collection.add({
      id: "routes",
      wall: new WallGraphics({
        positions: [new Cartesian3(-10, -10, 5), new Cartesian3(10, -10, 8)],
        outline: true,
      }),
      polylineVolume: new PolylineVolumeGraphics({
        positions: [new Cartesian3(-10, 10, 5), new Cartesian3(10, 10, 5)],
        shape: [
          new Cartesian2(-1, -1),
          new Cartesian2(1, -1),
          new Cartesian2(1, 1),
          new Cartesian2(-1, 1),
        ],
        outline: true,
      }),
    });
    visualizer.update(time);
    for (const name of ["wall", "polylineVolume"]) {
      const owner = visualizer._items.get(entity.id).owners[name];
      expect(owner.primitives.length).toBeGreaterThan(1);
      expect(
        owner.primitives.every((primitive) => primitive.id === entity),
      ).toBeTrue();
    }
  });

  it("preflights all route graphics before mutating owners", function () {
    const entity = collection.add({
      id: "atomic",
      wall: new WallGraphics({
        positions: [Cartesian3.ZERO, Cartesian3.UNIT_X],
      }),
      corridor: new CorridorGraphics({
        positions: [Cartesian3.ZERO, Cartesian3.UNIT_X],
        width: -1,
      }),
    });
    expect(function () {
      visualizer.update(time);
    }).toThrowDeveloperError();
    expect(Object.keys(visualizer._items.get(entity.id).owners).length).toBe(0);
    expect(primitives.length).toBe(0);
  });

  it("defers corridor generated-vertex draping to the ground primitive", function () {
    spyOn(world, "getTerrainHeight").and.callFake(function (position) {
      return position.x * 0.1 + position.y * 0.05;
    });
    const entity = collection.add({
      id: "terrain-corridor",
      corridor: new CorridorGraphics({
        positions: [
          new Cartesian3(-20, -10, 999),
          new Cartesian3(20, -10, 999),
        ],
        width: 8,
        heightReference: HeightReference.CLAMP_TO_GROUND,
      }),
    });
    visualizer.update(time);
    const primitive = visualizer._items.get(entity.id).owners.corridor
      .fillPrimitive;
    const positions = primitive.geometry.positions;
    expect(primitive).toBeInstanceOf(SceneGISPlanarGroundPrimitive);
    expect(world.getTerrainHeight).not.toHaveBeenCalled();
    expect(new Set(positions.map((position) => position.z))).toEqual(
      new Set([0]),
    );
  });

  it("updates style in place and replaces dynamic topology atomically", function () {
    const entity = collection.add({
      id: "dynamic",
      wall: new WallGraphics({
        positions: [Cartesian3.ZERO, new Cartesian3(10, 0, 4)],
        material: Color.RED,
      }),
    });
    visualizer.update(time);
    const owner = visualizer._items.get(entity.id).owners.wall;
    entity.wall.positions = [Cartesian3.ZERO, new Cartesian3(20, 0, 4)];
    visualizer.update(time);
    expect(visualizer._items.get(entity.id).owners.wall).not.toBe(owner);
    expect(owner.destroyed).toBeTrue();
  });

  it("replaces all rigidly translated route owners and preserves current on insertion failure", function () {
    const corridor = collection.add({
      id: "translated-corridor",
      corridor: new CorridorGraphics({
        positions: [
          new Cartesian3(-20, 0, 0),
          Cartesian3.ZERO,
          new Cartesian3(0, 20, 0),
        ],
        width: 4,
      }),
    });
    const wall = collection.add({
      id: "translated-wall",
      wall: new WallGraphics({
        positions: [Cartesian3.ZERO, new Cartesian3(10, 0, 4)],
      }),
    });
    const volume = collection.add({
      id: "translated-volume",
      polylineVolume: new PolylineVolumeGraphics({
        positions: [Cartesian3.ZERO, new Cartesian3(10, 0, 0)],
        shape: [
          new Cartesian2(-1, -1),
          new Cartesian2(1, -1),
          new Cartesian2(1, 1),
          new Cartesian2(-1, 1),
        ],
      }),
    });
    visualizer.update(time);
    const fixtures = [
      { entity: corridor, name: "corridor" },
      { entity: wall, name: "wall" },
      { entity: volume, name: "polylineVolume" },
    ];
    for (const fixture of fixtures) {
      fixture.owner = visualizer._items.get(fixture.entity.id).owners[
        fixture.name
      ];
      fixture.center = Cartesian3.clone(fixture.owner.boundingSphere.center);
      const graphic = fixture.entity[fixture.name];
      graphic.positions = graphic.positions
        .getValue(time)
        .map(
          (position) =>
            new Cartesian3(position.x + 100, position.y + 200, position.z),
        );
    }
    visualizer.update(time);
    for (const fixture of fixtures) {
      const translated = visualizer._items.get(fixture.entity.id).owners[
        fixture.name
      ];
      expect(translated).not.toBe(fixture.owner);
      expect(translated.boundingSphere.center.x).toBeCloseTo(
        fixture.center.x + 100,
        12,
      );
      expect(translated.boundingSphere.center.y).toBeCloseTo(
        fixture.center.y + 200,
        12,
      );
      expect(
        translated.primitives.every(
          (primitive) => primitive.id === fixture.entity,
        ),
      ).toBeTrue();
      fixture.owner = translated;
    }
    visualizer.update(time);
    for (const fixture of fixtures) {
      expect(
        visualizer._items.get(fixture.entity.id).owners[fixture.name],
      ).toBe(fixture.owner);
    }

    const insertionError = new Error("translated candidate insertion failed");
    const removeListener = primitives.primitiveAdded.addEventListener(
      function () {
        throw insertionError;
      },
    );
    wall.wall.positions = [
      new Cartesian3(300, 400, 0),
      new Cartesian3(310, 400, 4),
    ];
    expect(function () {
      visualizer.update(time);
    }).toThrow(insertionError);
    removeListener();
    expect(visualizer._items.get(wall.id).owners.wall).toBe(fixtures[1].owner);
    expect(primitives.contains(fixtures[1].owner.primitives[0])).toBeTrue();
  });
});
