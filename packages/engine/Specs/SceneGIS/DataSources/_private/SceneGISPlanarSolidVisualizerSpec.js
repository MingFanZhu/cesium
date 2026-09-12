import BoundingSphere from "../../../../Source/Core/BoundingSphere.js";
import BoundingSphereState from "../../../../Source/DataSources/BoundingSphereState.js";
import BoxGraphics from "../../../../Source/DataSources/BoxGraphics.js";
import CallbackProperty from "../../../../Source/DataSources/CallbackProperty.js";
import Cartesian3 from "../../../../Source/Core/Cartesian3.js";
import Color from "../../../../Source/Core/Color.js";
import ColorMaterialProperty from "../../../../Source/DataSources/ColorMaterialProperty.js";
import CylinderGraphics from "../../../../Source/DataSources/CylinderGraphics.js";
import DistanceDisplayCondition from "../../../../Source/Core/DistanceDisplayCondition.js";
import EllipsoidGraphics from "../../../../Source/DataSources/EllipsoidGraphics.js";
import EntityCollection from "../../../../Source/DataSources/EntityCollection.js";
import HeightReference from "../../../../Source/Scene/HeightReference.js";
import JulianDate from "../../../../Source/Core/JulianDate.js";
import PrimitiveCollection from "../../../../Source/Scene/PrimitiveCollection.js";
import Quaternion from "../../../../Source/Core/Quaternion.js";
import SceneGISPlanarCoordinateSystem from "../../../../Source/SceneGIS/Core/SceneGISPlanarCoordinateSystem.js";
import SceneGISPlanarExtent from "../../../../Source/SceneGIS/Core/SceneGISPlanarExtent.js";
import SceneGISPlanarSolidVisualizer from "../../../../Source/SceneGIS/DataSources/_private/_SceneGISPlanarSolidVisualizer.js";
import SceneGISPlanarWorld from "../../../../Source/SceneGIS/Scene/SceneGISPlanarWorld.js";

describe("SceneGIS/DataSources/SceneGISPlanarSolidVisualizer", function () {
  const time = JulianDate.fromIso8601("2026-08-09T00:00:00Z");
  let world;
  let collection;
  let primitives;
  let visualizer;

  function makeOwnerReady(owner) {
    const records = [];
    for (const primitive of owner.primitives) {
      const values = {
        color: new Uint8Array([255, 255, 255, 255]),
        distanceDisplayCondition: new Float32Array([0, 1000]),
      };
      const getGeometryInstanceAttributes = jasmine
        .createSpy("getGeometryInstanceAttributes")
        .and.returnValue(values);
      primitive._current = {
        ready: true,
        getGeometryInstanceAttributes,
        destroy: jasmine.createSpy("destroy"),
      };
      records.push({ values, getGeometryInstanceAttributes });
    }
    return records;
  }

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
    visualizer = new SceneGISPlanarSolidVisualizer(
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

  it("creates oriented box fill/outline and reuses a warm owner", function () {
    const entity = collection.add({
      id: "box",
      position: new Cartesian3(100, 200, 30),
      orientation: Quaternion.fromAxisAngle(Cartesian3.UNIT_Z, Math.PI / 4),
      box: new BoxGraphics({
        dimensions: new Cartesian3(10, 20, 30),
        outline: true,
      }),
    });
    expect(visualizer.update(time)).toBeTrue();
    const owner = visualizer._items.get(entity.id).owners.box;
    expect(owner.primitives.length).toBe(7);
    expect(visualizer.update(time)).toBeTrue();
    expect(visualizer._items.get(entity.id).owners.box).toBe(owner);
    expect(visualizer.getBoundingSphere(entity, new BoundingSphere())).toBe(
      BoundingSphereState.DONE,
    );
  });

  it("applies unrotated terrain support and validates cylinder profile", function () {
    spyOn(world, "getTerrainHeight").and.returnValue(12);
    const entity = collection.add({
      id: "cylinder",
      position: new Cartesian3(10, 20, 3),
      cylinder: new CylinderGraphics({
        length: 8,
        topRadius: 2,
        bottomRadius: 3,
        slices: 12,
        numberOfVerticalLines: 4,
        heightReference: HeightReference.CLAMP_TO_GROUND,
      }),
    });
    visualizer.update(time);
    expect(
      visualizer._items.get(entity.id).owners.cylinder.primitives[0].geometry
        .center.z,
    ).toBe(16);
    entity.cylinder.numberOfVerticalLines = 2.5;
    const owner = visualizer._items.get(entity.id).owners.cylinder;
    expect(function () {
      visualizer.update(time);
    }).toThrowDeveloperError();
    expect(visualizer._items.get(entity.id).owners.cylinder).toBe(owner);
  });

  it("supports a full ellipsoid and rejects partial configuration atomically", function () {
    const entity = collection.add({
      id: "ellipsoid",
      position: Cartesian3.ZERO,
      ellipsoid: new EllipsoidGraphics({ radii: new Cartesian3(4, 5, 6) }),
    });
    visualizer.update(time);
    const owner = visualizer._items.get(entity.id).owners.ellipsoid;
    entity.ellipsoid.minimumClock = 0.5;
    expect(function () {
      visualizer.update(time);
    }).toThrowDeveloperError();
    expect(visualizer._items.get(entity.id).owners.ellipsoid).toBe(owner);
    collection.remove(entity);
    expect(owner.destroyed).toBeTrue();
  });

  it("preflights every solid before inserting any owner", function () {
    const entity = collection.add({
      id: "mixed",
      position: Cartesian3.ZERO,
      box: new BoxGraphics({ dimensions: Cartesian3.ONE }),
      cylinder: new CylinderGraphics({
        length: 2,
        topRadius: 1,
        bottomRadius: 1,
        slices: 2,
      }),
    });
    expect(function () {
      visualizer.update(time);
    }).toThrowDeveloperError();
    expect(visualizer._items.get(entity.id).owners.box).toBeUndefined();
    expect(primitives.length).toBe(0);
  });

  it("omits degenerate cone rings and retains apex vertical lines", function () {
    const topZero = collection.add({
      id: "top-zero",
      position: Cartesian3.ZERO,
      cylinder: new CylinderGraphics({
        length: 8,
        topRadius: 0,
        bottomRadius: 3,
        slices: 8,
        numberOfVerticalLines: 3,
        fill: false,
        outline: true,
      }),
    });
    const bottomZero = collection.add({
      id: "bottom-zero",
      position: new Cartesian3(20, 0, 0),
      cylinder: new CylinderGraphics({
        length: 8,
        topRadius: 3,
        bottomRadius: 0,
        slices: 8,
        numberOfVerticalLines: 3,
        fill: false,
        outline: true,
      }),
    });

    visualizer.update(time);
    for (const entity of [topZero, bottomZero]) {
      const owner = visualizer._items.get(entity.id).owners.cylinder;
      expect(owner.primitives.length).toBe(4);
      expect(
        owner.primitives.every(
          (primitive) => primitive.geometry.positions.length >= 2,
        ),
      ).toBeTrue();
    }
  });

  it("rebuilds ready owners when effective solid topology changes", function () {
    const cylinder = collection.add({
      id: "dynamic-cylinder",
      position: Cartesian3.ZERO,
      cylinder: new CylinderGraphics({
        length: 8,
        topRadius: 2,
        bottomRadius: 3,
        slices: 8,
        numberOfVerticalLines: 2,
        outline: true,
      }),
    });
    const box = collection.add({
      id: "dynamic-box",
      position: new Cartesian3(20, 0, 0),
      box: new BoxGraphics({
        dimensions: new Cartesian3(4, 4, 4),
        outline: true,
        outlineColor: Color.TRANSPARENT,
      }),
    });
    visualizer.update(time);
    const cylinderOwner = visualizer._items.get(cylinder.id).owners.cylinder;
    const boxOwner = visualizer._items.get(box.id).owners.box;
    expect(cylinderOwner.primitives.length).toBe(5);
    expect(boxOwner.primitives.length).toBe(1);
    makeOwnerReady(cylinderOwner);
    makeOwnerReady(boxOwner);

    cylinder.cylinder.numberOfVerticalLines = 4;
    box.box.outlineColor = Color.RED;
    visualizer.update(time);
    const nextCylinder = visualizer._items.get(cylinder.id).owners.cylinder;
    const nextBox = visualizer._items.get(box.id).owners.box;
    expect(nextCylinder).not.toBe(cylinderOwner);
    expect(nextCylinder.primitives.length).toBe(7);
    expect(nextBox).not.toBe(boxOwner);
    expect(nextBox.primitives.length).toBe(7);
  });

  it("snapshots a reused dynamic distance condition", function () {
    const condition = new DistanceDisplayCondition(0, 1000);
    const entity = collection.add({
      id: "condition-box",
      position: Cartesian3.ZERO,
      box: new BoxGraphics({
        dimensions: Cartesian3.ONE,
        material: new ColorMaterialProperty(Color.WHITE),
        distanceDisplayCondition: new CallbackProperty(() => condition, false),
      }),
    });
    visualizer.update(time);
    const owner = visualizer._items.get(entity.id).owners.box;
    const records = makeOwnerReady(owner);

    condition.near = 25;
    condition.far = 500;
    visualizer.update(time);
    expect(visualizer._items.get(entity.id).owners.box).toBe(owner);
    expect(records[0].getGeometryInstanceAttributes).toHaveBeenCalled();
    expect(Array.from(records[0].values.distanceDisplayCondition)).toEqual([
      25, 500,
    ]);
    expect(owner.condition).not.toBe(condition);
  });
});
