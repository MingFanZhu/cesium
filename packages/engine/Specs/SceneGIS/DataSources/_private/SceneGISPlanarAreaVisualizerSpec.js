import BoundingSphere from "../../../../Source/Core/BoundingSphere.js";
import BoundingSphereState from "../../../../Source/DataSources/BoundingSphereState.js";
import CallbackProperty from "../../../../Source/DataSources/CallbackProperty.js";
import Cartesian2 from "../../../../Source/Core/Cartesian2.js";
import Cartesian3 from "../../../../Source/Core/Cartesian3.js";
import Color from "../../../../Source/Core/Color.js";
import ColorMaterialProperty from "../../../../Source/DataSources/ColorMaterialProperty.js";
import DistanceDisplayCondition from "../../../../Source/Core/DistanceDisplayCondition.js";
import EllipseGraphics from "../../../../Source/DataSources/EllipseGraphics.js";
import EntityCollection from "../../../../Source/DataSources/EntityCollection.js";
import HeightReference from "../../../../Source/Scene/HeightReference.js";
import JulianDate from "../../../../Source/Core/JulianDate.js";
import Matrix4 from "../../../../Source/Core/Matrix4.js";
import Plane from "../../../../Source/Core/Plane.js";
import PlaneGraphics from "../../../../Source/DataSources/PlaneGraphics.js";
import PrimitiveCollection from "../../../../Source/Scene/PrimitiveCollection.js";
import Quaternion from "../../../../Source/Core/Quaternion.js";
import Rectangle from "../../../../Source/Core/Rectangle.js";
import RectangleGraphics from "../../../../Source/DataSources/RectangleGraphics.js";
import SceneGISPlanarAreaVisualizer from "../../../../Source/SceneGIS/DataSources/_private/_SceneGISPlanarAreaVisualizer.js";
import SceneGISPlanarCoordinateSystem from "../../../../Source/SceneGIS/Core/SceneGISPlanarCoordinateSystem.js";
import SceneGISPlanarExtent from "../../../../Source/SceneGIS/Core/SceneGISPlanarExtent.js";
import SceneGISPlanarWorld from "../../../../Source/SceneGIS/Scene/SceneGISPlanarWorld.js";
import SceneGISPlanarGroundPrimitive from "../../../../Source/SceneGIS/Scene/SceneGISPlanarGroundPrimitive.js";

describe("SceneGIS/DataSources/SceneGISPlanarAreaVisualizer", function () {
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
    visualizer = new SceneGISPlanarAreaVisualizer(
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

  it("lowers vertical and oriented oblique Planes through canonical XY polygons", function () {
    const vertical = collection.add({
      id: "vertical-plane",
      position: new Cartesian3(100, 200, 30),
      plane: new PlaneGraphics({
        plane: new Plane(Cartesian3.UNIT_X, 0),
        dimensions: new Cartesian2(20, 10),
        outline: true,
      }),
    });
    const oblique = collection.add({
      id: "oblique-plane",
      position: new Cartesian3(-100, -200, 30),
      orientation: Quaternion.fromAxisAngle(Cartesian3.UNIT_Z, Math.PI / 4),
      plane: new PlaneGraphics({
        plane: Plane.fromPointNormal(
          new Cartesian3(0, 0, 2),
          Cartesian3.normalize(new Cartesian3(1, 1, 1), new Cartesian3()),
        ),
        dimensions: new Cartesian2(20, 10),
      }),
    });
    visualizer.update(time);
    const verticalOwner = visualizer._items.get(vertical.id).owners.plane;
    const obliqueOwner = visualizer._items.get(oblique.id).owners.plane;
    expect(verticalOwner.primitives.length).toBe(2);
    const primitive = verticalOwner.primitives[0];
    const worldPositions = primitive.geometry.positions.map((position) => {
      const transformed = Matrix4.multiplyByPoint(
        primitive.modelMatrix,
        Cartesian3.subtract(
          position,
          primitive.geometry._origin,
          new Cartesian3(),
        ),
        new Cartesian3(),
      );
      return Cartesian3.add(
        transformed,
        primitive.geometry._origin,
        transformed,
      );
    });
    expect(worldPositions.every((position) => position.x === 100)).toBeTrue();
    expect(
      new Set(worldPositions.map((position) => position.z)).size,
    ).toBeGreaterThan(1);
    expect(visualizer.getBoundingSphere(oblique, new BoundingSphere())).toBe(
      BoundingSphereState.DONE,
    );
    const obliqueMatrix = obliqueOwner.primitives[0].modelMatrix;
    expect(obliqueMatrix).not.toEqual(primitive.modelMatrix);

    oblique.plane.dimensions = new Cartesian2(-1, 10);
    expect(function () {
      visualizer.update(time);
    }).toThrowDeveloperError();
    expect(visualizer._items.get(oblique.id).owners.plane).toBe(obliqueOwner);
  });

  it("uses ellipse position only for XY and defers generated-vertex draping", function () {
    const terrain = spyOn(world, "getTerrainHeight").and.returnValue(11);
    const entity = collection.add({
      id: "ellipse",
      position: new Cartesian3(10, 20, 999),
      ellipse: new EllipseGraphics({
        semiMajorAxis: 20,
        semiMinorAxis: 10,
        height: 3,
        heightReference: HeightReference.RELATIVE_TO_GROUND,
        granularity: Math.PI / 4,
        rotation: Math.PI / 2,
      }),
    });
    visualizer.update(time);
    const positions = visualizer._items.get(entity.id).owners.ellipse
      .primitives[0].geometry.positions;
    expect(
      visualizer._items.get(entity.id).owners.ellipse.primitives[0],
    ).toBeInstanceOf(SceneGISPlanarGroundPrimitive);
    expect(positions.every((p) => p.z === 3)).toBeTrue();
    expect(terrain.calls.count()).toBe(0);
    expect(positions[0].x).toBeCloseTo(-10, 12);
    expect(positions[0].y).toBeCloseTo(20, 12);
  });

  it("rotates and extrudes metric rectangles and rejects granularity", function () {
    const entity = collection.add({
      id: "rectangle",
      rectangle: new RectangleGraphics({
        coordinates: new Rectangle(-20, -10, 20, 10),
        height: 30,
        extrudedHeight: 10,
        rotation: Math.PI / 2,
        outline: true,
      }),
    });
    visualizer.update(time);
    const owner = visualizer._items.get(entity.id).owners.rectangle;
    expect(owner.primitives.length).toBe(7);
    const positions = owner.primitives[0].geometry.positions;
    expect(positions[0].x).toBeCloseTo(-10, 12);
    expect(positions[0].y).toBeCloseTo(20, 12);
    entity.rectangle.granularity = 1;
    expect(function () {
      visualizer.update(time);
    }).toThrowDeveloperError();
    expect(visualizer._items.get(entity.id).owners.rectangle).toBe(owner);
  });

  it("allows NONE geometry outside the extent but hides ground vertices outside", function () {
    const entity = collection.add({
      id: "edge-ellipse",
      position: new Cartesian3(990, 0, 500),
      ellipse: new EllipseGraphics({
        semiMajorAxis: 30,
        semiMinorAxis: 20,
        height: 5,
        heightReference: HeightReference.NONE,
        granularity: Math.PI / 2,
      }),
    });
    visualizer.update(time);
    const owner = visualizer._items.get(entity.id).owners.ellipse;
    expect(owner).toBeDefined();
    expect(
      owner.primitives[0].geometry.positions.some(
        (position) => position.x > 1000,
      ),
    ).toBeTrue();
    entity.ellipse.heightReference = HeightReference.CLAMP_TO_GROUND;
    visualizer.update(time);
    expect(visualizer._items.get(entity.id).owners.ellipse).toBe(owner);
    expect(owner.shown).toBeFalse();
  });

  it("rebuilds a ready extruded ellipse for effective outline topology", function () {
    const entity = collection.add({
      id: "dynamic-ellipse",
      position: Cartesian3.ZERO,
      ellipse: new EllipseGraphics({
        semiMajorAxis: 20,
        semiMinorAxis: 10,
        height: 10,
        extrudedHeight: 0,
        granularity: Math.PI / 4,
        numberOfVerticalLines: 2,
        outline: true,
        outlineColor: Color.TRANSPARENT,
      }),
    });
    visualizer.update(time);
    const initial = visualizer._items.get(entity.id).owners.ellipse;
    expect(initial.primitives.length).toBe(1);
    makeOwnerReady(initial);

    entity.ellipse.outlineColor = Color.RED;
    visualizer.update(time);
    const visibleOutline = visualizer._items.get(entity.id).owners.ellipse;
    expect(visibleOutline).not.toBe(initial);
    expect(visibleOutline.primitives.length).toBe(5);
    makeOwnerReady(visibleOutline);

    entity.ellipse.numberOfVerticalLines = 4;
    visualizer.update(time);
    const expanded = visualizer._items.get(entity.id).owners.ellipse;
    expect(expanded).not.toBe(visibleOutline);
    expect(expanded.primitives.length).toBe(7);
  });

  it("snapshots a reused dynamic area distance condition", function () {
    const condition = new DistanceDisplayCondition(0, 1000);
    const entity = collection.add({
      id: "condition-ellipse",
      position: Cartesian3.ZERO,
      ellipse: new EllipseGraphics({
        semiMajorAxis: 20,
        semiMinorAxis: 10,
        granularity: Math.PI / 4,
        material: new ColorMaterialProperty(Color.WHITE),
        distanceDisplayCondition: new CallbackProperty(() => condition, false),
      }),
    });
    visualizer.update(time);
    const owner = visualizer._items.get(entity.id).owners.ellipse;
    const records = makeOwnerReady(owner);

    condition.near = 25;
    condition.far = 500;
    visualizer.update(time);
    expect(visualizer._items.get(entity.id).owners.ellipse).toBe(owner);
    expect(records[0].getGeometryInstanceAttributes).toHaveBeenCalled();
    expect(Array.from(records[0].values.distanceDisplayCondition)).toEqual([
      25, 500,
    ]);
    expect(owner.condition).not.toBe(condition);
  });
});
