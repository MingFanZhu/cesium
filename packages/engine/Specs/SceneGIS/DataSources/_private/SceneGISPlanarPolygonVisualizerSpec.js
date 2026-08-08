import ArcType from "../../../../Source/Core/ArcType.js";
import BoundingSphere from "../../../../Source/Core/BoundingSphere.js";
import BoundingSphereState from "../../../../Source/DataSources/BoundingSphereState.js";
import BufferPolygonCollection from "../../../../Source/Scene/BufferPolygonCollection.js";
import Cartesian3 from "../../../../Source/Core/Cartesian3.js";
import Color from "../../../../Source/Core/Color.js";
import ColorMaterialProperty from "../../../../Source/DataSources/ColorMaterialProperty.js";
import EntityCollection from "../../../../Source/DataSources/EntityCollection.js";
import HeightReference from "../../../../Source/Scene/HeightReference.js";
import JulianDate from "../../../../Source/Core/JulianDate.js";
import PolygonGraphics from "../../../../Source/DataSources/PolygonGraphics.js";
import PolygonHierarchy from "../../../../Source/Core/PolygonHierarchy.js";
import PrimitiveCollection from "../../../../Source/Scene/PrimitiveCollection.js";
import SceneGISPlanarCoordinateSystem from "../../../../Source/SceneGIS/Core/SceneGISPlanarCoordinateSystem.js";
import SceneGISPlanarExtent from "../../../../Source/SceneGIS/Core/SceneGISPlanarExtent.js";
import SceneGISPlanarPolygonVisualizer from "../../../../Source/SceneGIS/DataSources/_private/_SceneGISPlanarPolygonVisualizer.js";
import SceneGISPlanarWorld from "../../../../Source/SceneGIS/Scene/SceneGISPlanarWorld.js";

describe("SceneGIS/DataSources/SceneGISPlanarPolygonVisualizer", function () {
  let world;
  let scene;
  let collection;
  let visualizer;
  const time = JulianDate.fromIso8601("2026-08-09T00:00:00Z");

  beforeEach(function () {
    world = new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: -100.0,
          minimumY: -100.0,
          maximumX: 100.0,
          maximumY: 100.0,
        }),
      }),
      maximumLevel: 1,
    });
    scene = {
      primitives: new PrimitiveCollection(),
      isDestroyed: function () {
        return false;
      },
    };
    collection = new EntityCollection();
    visualizer = new SceneGISPlanarPolygonVisualizer(world, scene, collection);
  });

  afterEach(function () {
    if (visualizer !== undefined && !visualizer.isDestroyed()) {
      visualizer.destroy();
    }
    scene.primitives.destroy();
    if (!world.isDestroyed()) {
      world.destroy();
    }
  });

  function square(minimum = -20.0, maximum = 20.0, z = 7.0) {
    return [
      new Cartesian3(minimum, minimum, z),
      new Cartesian3(maximum, minimum, z),
      new Cartesian3(maximum, maximum, z),
      new Cartesian3(minimum, maximum, z),
    ];
  }

  function addPolygon(options = {}) {
    return collection.add({
      id: options.id ?? "polygon",
      polygon: new PolygonGraphics({
        hierarchy: options.hierarchy ?? new PolygonHierarchy(square()),
        material: options.material ?? new ColorMaterialProperty(Color.LIME),
        ...options.graphic,
      }),
    });
  }

  it("normalizes closure and triangulates an outer ring with a direct hole", function () {
    const outer = square();
    outer.push(Cartesian3.clone(outer[0]));
    const entity = addPolygon({
      hierarchy: new PolygonHierarchy(outer, [
        new PolygonHierarchy(square(-5.0, 5.0)),
      ]),
    });
    visualizer.update(time);
    const owner = visualizer._items.get(entity.id).owner;
    expect(owner.fillPrimitive.vertexCount).toBe(8);
    expect(owner.fillPrimitive.triangleCount).toBe(8);
    const triangles = owner.fillPrimitive.getTriangles();
    const positions = owner.fillPrimitive.getPositions();
    for (let i = 0; i < triangles.length; i += 3) {
      const x =
        (positions[triangles[i] * 3] +
          positions[triangles[i + 1] * 3] +
          positions[triangles[i + 2] * 3]) /
        3.0;
      const y =
        (positions[triangles[i] * 3 + 1] +
          positions[triangles[i + 1] * 3 + 1] +
          positions[triangles[i + 2] * 3 + 1]) /
        3.0;
      expect(x > 15.0 && x < 25.0 && y > 15.0 && y < 25.0).toBe(false);
    }
  });

  it("supports scalar clamp and relative vertex-only terrain updates", function () {
    world.getTerrainHeight = jasmine
      .createSpy("getTerrainHeight")
      .and.returnValue(12.0);
    const entity = addPolygon({
      graphic: {
        height: 5.0,
        heightReference: HeightReference.CLAMP_TO_GROUND,
      },
    });
    visualizer.update(time);
    const owner = visualizer._items.get(entity.id).owner;
    const firstPositions = owner.fillPrimitive.getPositions();
    expect(firstPositions[2]).toBe(12.0);

    entity.polygon.heightReference = HeightReference.RELATIVE_TO_GROUND;
    visualizer.update(time);
    expect(visualizer._items.get(entity.id).owner).toBe(owner);
    expect(owner.fillPrimitive.getPositions()[2]).toBe(17.0);

    world.getTerrainHeight.and.returnValue(15.0);
    visualizer.update(time);
    expect(visualizer._items.get(entity.id).owner).toBe(owner);
    expect(owner.fillPrimitive.getPositions()[2]).toBe(20.0);
  });

  it("uses per-position absolute Z and rejects a non-NONE height reference", function () {
    const hierarchy = new PolygonHierarchy([
      new Cartesian3(-20.0, -20.0, 1.0),
      new Cartesian3(20.0, -20.0, 2.0),
      new Cartesian3(20.0, 20.0, 3.0),
      new Cartesian3(-20.0, 20.0, 4.0),
    ]);
    const entity = addPolygon({
      hierarchy,
      graphic: { perPositionHeight: true, height: 100.0 },
    });
    visualizer.update(time);
    const owner = visualizer._items.get(entity.id).owner;
    expect(
      Array.from(owner.fillPrimitive.getPositions()).filter(
        (_, i) => i % 3 === 2,
      ),
    ).toEqual([1.0, 2.0, 3.0, 4.0]);
    entity.polygon.heightReference = HeightReference.CLAMP_TO_GROUND;
    expect(function () {
      visualizer.update(time);
    }).toThrowDeveloperError();
    expect(visualizer._items.get(entity.id).owner).toBe(owner);
  });

  it("builds caps, side walls, hole walls, and outline segments", function () {
    const entity = addPolygon({
      hierarchy: new PolygonHierarchy(square(), [
        new PolygonHierarchy(square(-5.0, 5.0)),
      ]),
      graphic: {
        height: 20.0,
        extrudedHeight: 0.0,
        outline: true,
        outlineWidth: 255,
      },
    });
    visualizer.update(time);
    const owner = visualizer._items.get(entity.id).owner;
    expect(owner.fillPrimitive.vertexCount).toBe(16);
    expect(owner.fillPrimitive.triangleCount).toBe(32);
    expect(owner.outlinePrimitives.length).toBe(12);
    expect(owner.outlineCollection.vertexCount).toBe(36);
    expect(
      owner.outlinePrimitives[0].getMaterial({ color: new Color() }).width,
    ).toBe(255);
  });

  it("rejects invalid topology and profile before current mutation", function () {
    const entity = addPolygon();
    visualizer.update(time);
    const owner = visualizer._items.get(entity.id).owner;
    const original = Array.from(owner.fillPrimitive.getPositions());
    entity.polygon.hierarchy = new PolygonHierarchy([
      new Cartesian3(-10.0, -10.0, 0.0),
      new Cartesian3(10.0, 10.0, 0.0),
      new Cartesian3(-10.0, 10.0, 0.0),
      new Cartesian3(10.0, -10.0, 0.0),
    ]);
    expect(function () {
      visualizer.update(time);
    }).toThrowDeveloperError();
    expect(visualizer._items.get(entity.id).owner).toBe(owner);
    expect(Array.from(owner.fillPrimitive.getPositions())).toEqual(original);

    entity.polygon.hierarchy = new PolygonHierarchy(square());
    entity.polygon.outlineWidth = 2.5;
    expect(function () {
      visualizer.update(time);
    }).toThrowDeveloperError();
    expect(visualizer._items.get(entity.id).owner).toBe(owner);

    entity.polygon.outlineWidth = 255;
    entity.polygon.arcType = ArcType.GEODESIC;
    expect(function () {
      visualizer.update(time);
    }).toThrowDeveloperError();
    expect(visualizer._items.get(entity.id).owner).toBe(owner);
  });

  it("retains hidden and outside owners and releases missing hierarchy", function () {
    const entity = addPolygon();
    visualizer.update(time);
    const owner = visualizer._items.get(entity.id).owner;
    entity.polygon.fill = false;
    visualizer.update(time);
    expect(visualizer._items.get(entity.id).owner).toBe(owner);
    expect(owner.fillCollection.show).toBe(false);

    entity.polygon.fill = true;
    entity.polygon.hierarchy = new PolygonHierarchy(square(90.0, 110.0));
    visualizer.update(time);
    expect(visualizer._items.get(entity.id).owner).toBe(owner);
    expect(owner.fillCollection.show).toBe(false);

    entity.polygon.hierarchy = undefined;
    visualizer.update(time);
    expect(visualizer._items.get(entity.id).owner).toBeUndefined();
    expect(owner.destroyed).toBe(true);
  });

  it("replaces alpha and topology candidates and keeps warm state stable", function () {
    const entity = addPolygon();
    visualizer.update(time);
    const first = visualizer._items.get(entity.id).owner;
    visualizer.update(time);
    expect(visualizer._items.get(entity.id).owner).toBe(first);
    spyOn(first.fillCollection, "destroy").and.callThrough();

    entity.polygon.material = new ColorMaterialProperty(
      Color.fromAlpha(Color.LIME, 0.5),
    );
    visualizer.update(time);
    const second = visualizer._items.get(entity.id).owner;
    expect(second).not.toBe(first);
    expect(first.fillCollection.destroy).toHaveBeenCalledTimes(1);

    spyOn(second.fillCollection, "destroy").and.callThrough();
    entity.polygon.hierarchy = new PolygonHierarchy([
      new Cartesian3(-30.0, -20.0, 7.0),
      new Cartesian3(30.0, -20.0, 7.0),
      new Cartesian3(0.0, 30.0, 7.0),
    ]);
    visualizer.update(time);
    const third = visualizer._items.get(entity.id).owner;
    expect(third).not.toBe(second);
    expect(second.fillCollection.destroy).toHaveBeenCalledTimes(1);
  });

  it("rolls back a post-insertion event failure without replacing current", function () {
    const entity = addPolygon();
    visualizer.update(time);
    const current = visualizer._items.get(entity.id).owner;
    const primitiveBaseline = scene.primitives.length;
    const destroySpy = spyOn(
      BufferPolygonCollection.prototype,
      "destroy",
    ).and.callThrough();
    const removeAdded = scene.primitives.primitiveAdded.addEventListener(
      function (primitive) {
        if (primitive !== current.fillCollection) {
          throw new Error("fixture insertion failure");
        }
      },
    );
    const removeRemoved = scene.primitives.primitiveRemoved.addEventListener(
      function (primitive) {
        if (primitive !== current.fillCollection) {
          throw new Error("fixture cleanup failure");
        }
      },
    );
    try {
      function expectInsertionFailure(destroyPrimitives, alpha) {
        scene.primitives.destroyPrimitives = destroyPrimitives;
        entity.polygon.material = new ColorMaterialProperty(
          Color.fromAlpha(Color.LIME, alpha),
        );
        expect(function () {
          visualizer.update(time);
        }).toThrowError("fixture insertion failure");
        expect(scene.primitives.length).toBe(primitiveBaseline);
        expect(visualizer._items.get(entity.id).owner).toBe(current);
        expect(current.destroyed).toBe(false);
      }
      expectInsertionFailure(true, 0.5);
      expectInsertionFailure(false, 0.25);
      expect(destroySpy).toHaveBeenCalledTimes(2);
    } finally {
      scene.primitives.destroyPrimitives = true;
      removeAdded();
      removeRemoved();
    }
  });

  it("returns finite bounds and disconnects owned resources exactly once", function () {
    const entity = addPolygon({ graphic: { outline: true } });
    visualizer.update(time);
    const owner = visualizer._items.get(entity.id).owner;
    const sphere = new BoundingSphere();
    expect(visualizer.getBoundingSphere(entity, sphere)).toBe(
      BoundingSphereState.DONE,
    );
    expect(Number.isFinite(sphere.radius)).toBe(true);
    const listenerCount = collection.collectionChanged.numberOfListeners;
    spyOn(owner.fillCollection, "destroy").and.callThrough();
    spyOn(owner.outlineCollection, "destroy").and.callThrough();
    visualizer.destroy();
    visualizer = undefined;
    expect(owner.fillCollection.destroy).toHaveBeenCalledTimes(1);
    expect(owner.outlineCollection.destroy).toHaveBeenCalledTimes(1);
    expect(collection.collectionChanged.numberOfListeners).toBe(
      listenerCount - 1,
    );
    expect(collection.contains(entity)).toBe(true);
  });

  it("uses an explicit caller-owned primitive collection without owning it", function () {
    const target = new PrimitiveCollection();
    const targeted = new SceneGISPlanarPolygonVisualizer(
      world,
      scene,
      collection,
      target,
    );
    expect(targeted._primitives).toBe(target);
    targeted.destroy();
    expect(target.isDestroyed()).toBe(false);
    target.destroy();
  });
});
