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
import SceneGISPlanarPolylineGeometry from "../../../../Source/SceneGIS/Core/SceneGISPlanarPolylineGeometry.js";
import SceneGISPlanarPolylineVisualizer from "../../../../Source/SceneGIS/DataSources/_private/_SceneGISPlanarPolylineVisualizer.js";
import SceneGISPlanarPrimitive from "../../../../Source/SceneGIS/Scene/SceneGISPlanarPrimitive.js";
import SceneGISPlanarGroundPrimitive from "../../../../Source/SceneGIS/Scene/SceneGISPlanarGroundPrimitive.js";
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
          minimumX: -100,
          minimumY: -100,
          maximumX: 100,
          maximumY: 100,
        }),
      }),
      maximumLevel: 1,
    });
    scene = { primitives: new PrimitiveCollection(), isDestroyed: () => false };
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
          new Cartesian3(-10, 0, 2),
          new Cartesian3(10, 0, 4),
        ],
        material: options.material ?? new ColorMaterialProperty(Color.CYAN),
        width: options.width ?? 3,
        ...options.graphic,
      }),
    });
  }

  it("adapts straight Entity geometry to the public primitive", function () {
    const entity = addPolyline({ width: 300.5 });
    visualizer.update(time);
    const owner = visualizer._items.get(entity.id).owner;
    expect(owner.primitive).toBeInstanceOf(SceneGISPlanarPrimitive);
    expect(owner.primitive.geometry).toBeInstanceOf(
      SceneGISPlanarPolylineGeometry,
    );
    expect(owner.primitive.geometry.width).toBe(300.5);
    expect(owner.primitive.geometry.positions).toEqual([
      new Cartesian3(-10, 0, 2),
      new Cartesian3(10, 0, 4),
    ]);
    expect(scene.primitives.contains(owner.primitive)).toBeTrue();
  });

  it("defers clamp draping to the ground primitive and preserves its owner", function () {
    spyOn(world, "getTerrainHeight").and.returnValue(12);
    const entity = addPolyline({ graphic: { clampToGround: true } });
    visualizer.update(time);
    const first = visualizer._items.get(entity.id).owner;
    expect(first.primitive).toBeInstanceOf(SceneGISPlanarGroundPrimitive);
    expect(first.primitive.geometry.positions[0].z).toBe(2);
    world.getTerrainHeight.and.returnValue(20);
    visualizer.update(time);
    const second = visualizer._items.get(entity.id).owner;
    expect(second).toBe(first);
    expect(first.destroyed).toBeFalse();
    expect(world.getTerrainHeight).not.toHaveBeenCalled();
  });

  it("reports pending until the ground current is ready and follows revised bounds", function () {
    const entity = addPolyline({ graphic: { clampToGround: true } });
    visualizer.update(time);
    const primitive = visualizer._items.get(entity.id).owner.primitive;
    const sphere = new BoundingSphere();
    expect(visualizer.getBoundingSphere(entity, sphere)).toBe(
      BoundingSphereState.PENDING,
    );

    primitive._current = { ready: true, destroy: jasmine.createSpy("destroy") };
    primitive._currentValid = true;
    primitive._currentPresentationBounds = primitive._desiredPresentationBounds;
    const terrainHeight = spyOn(world, "getTerrainHeight").and.returnValue(4);
    expect(visualizer.getBoundingSphere(entity, sphere)).toBe(
      BoundingSphereState.DONE,
    );
    expect(sphere.center.z).toBe(4);

    terrainHeight.and.returnValue(18);
    expect(visualizer.getBoundingSphere(entity, sphere)).toBe(
      BoundingSphereState.DONE,
    );
    expect(sphere.center.z).toBe(18);

    entity.show = false;
    visualizer.update(time);
    expect(visualizer.getBoundingSphere(entity, sphere)).toBe(
      BoundingSphereState.FAILED,
    );
  });

  it("retains hidden owners, releases missing geometry, and reports bounds", function () {
    const entity = addPolyline();
    visualizer.update(time);
    const owner = visualizer._items.get(entity.id).owner;
    const sphere = new BoundingSphere();
    expect(visualizer.getBoundingSphere(entity, sphere)).toBe(
      BoundingSphereState.DONE,
    );
    entity.show = false;
    visualizer.update(time);
    expect(owner.primitive.show).toBeFalse();
    entity.polyline.positions = undefined;
    visualizer.update(time);
    expect(owner.destroyed).toBeTrue();
    expect(visualizer.getBoundingSphere(entity, sphere)).toBe(
      BoundingSphereState.FAILED,
    );
  });

  it("rejects unsupported and invalid values before current mutation", function () {
    const entity = addPolyline();
    visualizer.update(time);
    const owner = visualizer._items.get(entity.id).owner;
    entity.polyline.arcType = ArcType.GEODESIC;
    expect(function () {
      visualizer.update(time);
    }).toThrowDeveloperError();
    expect(visualizer._items.get(entity.id).owner).toBe(owner);
    entity.polyline.arcType = ArcType.NONE;
    entity.polyline.width = -1;
    expect(function () {
      visualizer.update(time);
    }).toThrowDeveloperError();
    expect(visualizer._items.get(entity.id).owner).toBe(owner);
  });

  it("preserves warm owner identity and updates color without geometry replacement", function () {
    const material = new ColorMaterialProperty(Color.RED);
    const entity = addPolyline({ material });
    visualizer.update(time);
    const owner = visualizer._items.get(entity.id).owner;
    visualizer.update(time);
    expect(visualizer._items.get(entity.id).owner).toBe(owner);
    material.color = Color.BLUE;
    visualizer.update(time);
    expect(visualizer._items.get(entity.id).owner).toBe(owner);
    expect(owner.appearance.material.uniforms.color).toEqual(Color.BLUE);
  });

  it("uses and preserves an explicit caller-owned PrimitiveCollection", function () {
    visualizer.destroy();
    const target = new PrimitiveCollection();
    visualizer = new SceneGISPlanarPolylineVisualizer(
      world,
      scene,
      collection,
      target,
    );
    const entity = addPolyline();
    visualizer.update(time);
    const primitive = visualizer._items.get(entity.id).owner.primitive;
    expect(target.contains(primitive)).toBeTrue();
    visualizer.destroy();
    expect(target.length).toBe(0);
    expect(target.isDestroyed()).toBeFalse();
    target.destroy();
  });
});
