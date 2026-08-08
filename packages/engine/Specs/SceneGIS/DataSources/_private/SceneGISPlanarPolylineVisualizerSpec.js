import ArcType from "../../../../Source/Core/ArcType.js";
import BoundingSphere from "../../../../Source/Core/BoundingSphere.js";
import BoundingSphereState from "../../../../Source/DataSources/BoundingSphereState.js";
import Cartesian3 from "../../../../Source/Core/Cartesian3.js";
import Color from "../../../../Source/Core/Color.js";
import ColorMaterialProperty from "../../../../Source/DataSources/ColorMaterialProperty.js";
import EntityCollection from "../../../../Source/DataSources/EntityCollection.js";
import JulianDate from "../../../../Source/Core/JulianDate.js";
import PolylineGraphics from "../../../../Source/DataSources/PolylineGraphics.js";
import PrimitiveCollection from "../../../../Source/Scene/PrimitiveCollection.js";
import SceneGISPlanarCoordinateSystem from "../../../../Source/SceneGIS/Core/SceneGISPlanarCoordinateSystem.js";
import SceneGISPlanarExtent from "../../../../Source/SceneGIS/Core/SceneGISPlanarExtent.js";
import SceneGISPlanarPolylineVisualizer from "../../../../Source/SceneGIS/DataSources/_private/_SceneGISPlanarPolylineVisualizer.js";
import SceneGISPlanarWorld from "../../../../Source/SceneGIS/Scene/SceneGISPlanarWorld.js";

describe("SceneGIS/DataSources/SceneGISPlanarPolylineVisualizer", function () {
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
    visualizer = new SceneGISPlanarPolylineVisualizer(world, scene, collection);
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

  function addPolyline(options = {}) {
    return collection.add({
      id: options.id ?? "line",
      polyline: new PolylineGraphics({
        positions: options.positions ?? [
          new Cartesian3(-10.0, 0.0, 2.0),
          new Cartesian3(10.0, 0.0, 4.0),
        ],
        material: options.material ?? new ColorMaterialProperty(Color.CYAN),
        width: options.width ?? 3.0,
        ...options.graphic,
      }),
    });
  }

  it("uses straight absolute local DOUBLE positions and planar default arc", function () {
    const entity = addPolyline();
    visualizer.update(time);
    const owner = visualizer._items.get(entity.id).owner;
    expect(owner.collection.modelMatrix[12]).toBe(-10.0);
    expect(owner.collection.modelMatrix[13]).toBe(0.0);
    expect(Array.from(owner.primitive.getPositions())).toEqual([
      0.0, 0.0, 2.0, 20.0, 0.0, 4.0,
    ]);
    expect(owner.primitive.getMaterial({ color: new Color() }).color).toEqual(
      Color.CYAN,
    );
    expect(owner.primitive.getMaterial({ color: new Color() }).width).toBe(3);
  });

  it("samples supplied clamp vertices and updates terrain without replacement", function () {
    world.getTerrainHeight = jasmine
      .createSpy("getTerrainHeight")
      .and.callFake(function (position) {
        return position.x + 20.0;
      });
    const entity = addPolyline({ graphic: { clampToGround: true } });
    visualizer.update(time);
    const owner = visualizer._items.get(entity.id).owner;
    expect(Array.from(owner.primitive.getPositions())).toEqual([
      0.0, 0.0, 10.0, 20.0, 0.0, 30.0,
    ]);

    world.getTerrainHeight.and.callFake(function (position) {
      return position.x + 25.0;
    });
    visualizer.update(time);
    expect(visualizer._items.get(entity.id).owner).toBe(owner);
    expect(Array.from(owner.primitive.getPositions())).toEqual([
      0.0, 0.0, 15.0, 20.0, 0.0, 35.0,
    ]);
  });

  it("retains hidden and outside owners but releases missing positions", function () {
    const entity = addPolyline();
    visualizer.update(time);
    const owner = visualizer._items.get(entity.id).owner;
    entity.polyline.show = false;
    visualizer.update(time);
    expect(visualizer._items.get(entity.id).owner).toBe(owner);
    expect(owner.collection.show).toBe(false);

    entity.polyline.show = true;
    entity.polyline.positions = [
      new Cartesian3(-10.0, 0.0, 0.0),
      new Cartesian3(101.0, 0.0, 0.0),
    ];
    visualizer.update(time);
    expect(visualizer._items.get(entity.id).owner).toBe(owner);
    expect(owner.collection.show).toBe(false);

    entity.polyline.positions = undefined;
    visualizer.update(time);
    expect(visualizer._items.get(entity.id).owner).toBeUndefined();
    expect(owner.destroyed).toBe(true);
  });

  it("rejects unsupported or invalid properties before current mutation", function () {
    const entity = addPolyline();
    visualizer.update(time);
    const owner = visualizer._items.get(entity.id).owner;
    const positions = Array.from(owner.primitive.getPositions());
    entity.polyline.width = 2.5;
    expect(function () {
      visualizer.update(time);
    }).toThrowDeveloperError();
    expect(visualizer._items.get(entity.id).owner).toBe(owner);
    expect(Array.from(owner.primitive.getPositions())).toEqual(positions);
    expect(owner.primitive.getMaterial({ color: new Color() }).width).toBe(3);

    entity.polyline.width = 255;
    visualizer.update(time);
    expect(visualizer._items.get(entity.id).owner).toBe(owner);
    expect(owner.primitive.getMaterial({ color: new Color() }).width).toBe(255);

    entity.polyline.arcType = ArcType.GEODESIC;
    expect(function () {
      visualizer.update(time);
    }).toThrowDeveloperError();
    expect(visualizer._items.get(entity.id).owner).toBe(owner);
  });

  it("replaces topology and blend candidates and destroys old owners once", function () {
    const entity = addPolyline();
    visualizer.update(time);
    const first = visualizer._items.get(entity.id).owner;
    spyOn(first.collection, "destroy").and.callThrough();
    entity.polyline.positions = [
      new Cartesian3(-10.0, 0.0, 0.0),
      new Cartesian3(0.0, 10.0, 0.0),
      new Cartesian3(10.0, 0.0, 0.0),
    ];
    entity.polyline.material = new ColorMaterialProperty(
      Color.fromAlpha(Color.CYAN, 0.5),
    );
    visualizer.update(time);
    const second = visualizer._items.get(entity.id).owner;
    expect(second).not.toBe(first);
    expect(first.destroyed).toBe(true);
    expect(first.collection.destroy).toHaveBeenCalledTimes(1);
    expect(second.primitive.vertexCount).toBe(3);
  });

  it("returns current bounds and preserves warm owner and collection identity", function () {
    const entity = addPolyline();
    visualizer.update(time);
    const owner = visualizer._items.get(entity.id).owner;
    const sphere = new BoundingSphere();
    expect(visualizer.getBoundingSphere(entity, sphere)).toBe(
      BoundingSphereState.DONE,
    );
    expect(Number.isFinite(sphere.radius)).toBe(true);
    visualizer.update(time);
    expect(visualizer._items.get(entity.id).owner).toBe(owner);
    expect(visualizer._items.get(entity.id).owner.collection).toBe(
      owner.collection,
    );
  });

  it("disconnects and releases its owner without owning the collection", function () {
    const entity = addPolyline();
    visualizer.update(time);
    const owner = visualizer._items.get(entity.id).owner;
    const listenerCount = collection.collectionChanged.numberOfListeners;
    spyOn(owner.collection, "destroy").and.callThrough();
    visualizer.destroy();
    visualizer = undefined;
    expect(owner.collection.destroy).toHaveBeenCalledTimes(1);
    expect(collection.collectionChanged.numberOfListeners).toBe(
      listenerCount - 1,
    );
    expect(collection.contains(entity)).toBe(true);
  });
});
