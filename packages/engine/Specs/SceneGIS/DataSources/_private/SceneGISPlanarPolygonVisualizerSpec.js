import ArcType from "../../../../Source/Core/ArcType.js";
import BoundingSphere from "../../../../Source/Core/BoundingSphere.js";
import BoundingSphereState from "../../../../Source/DataSources/BoundingSphereState.js";
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
import SceneGISPlanarPolygonGeometry from "../../../../Source/SceneGIS/Core/SceneGISPlanarPolygonGeometry.js";
import SceneGISPlanarPolygonVisualizer from "../../../../Source/SceneGIS/DataSources/_private/_SceneGISPlanarPolygonVisualizer.js";
import SceneGISPlanarPrimitive from "../../../../Source/SceneGIS/Scene/SceneGISPlanarPrimitive.js";
import SceneGISPlanarWorld from "../../../../Source/SceneGIS/Scene/SceneGISPlanarWorld.js";

describe("SceneGIS/DataSources/SceneGISPlanarPolygonVisualizer", function () {
  let world;
  let scene;
  let collection;
  let visualizer;
  const time = JulianDate.fromIso8601("2026-08-09T00:00:00Z");
  const square = (min = -20, max = 20, z = 7) => [
    new Cartesian3(min, min, z),
    new Cartesian3(max, min, z),
    new Cartesian3(max, max, z),
    new Cartesian3(min, max, z),
  ];

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

  it("adapts outer and direct-hole fill to the public geometry", function () {
    const entity = addPolygon({
      hierarchy: new PolygonHierarchy(
        [...square(), square()[0]],
        [new PolygonHierarchy(square(-5, 5, 7))],
      ),
    });
    visualizer.update(time);
    const owner = visualizer._items.get(entity.id).owner;
    expect(owner.fillPrimitive).toBeInstanceOf(SceneGISPlanarPrimitive);
    expect(owner.fillPrimitive.geometry).toBeInstanceOf(
      SceneGISPlanarPolygonGeometry,
    );
    expect(owner.fillPrimitive.geometry.positions.length).toBe(4);
    expect(owner.fillPrimitive.geometry.holes.length).toBe(1);
    expect(scene.primitives.contains(owner.fillPrimitive)).toBeTrue();
  });

  it("creates extrusion fill and exact fractional wide outlines", function () {
    const entity = addPolygon({
      graphic: {
        extrudedHeight: 0,
        height: 7,
        outline: true,
        outlineWidth: 512.25,
        outlineColor: Color.BLUE,
      },
    });
    visualizer.update(time);
    const owner = visualizer._items.get(entity.id).owner;
    expect(owner.fillPrimitive.geometry._bottomPositions.length).toBe(4);
    expect(owner.outlinePrimitives.length).toBe(6);
    for (const primitive of owner.outlinePrimitives) {
      expect(primitive.geometry.width).toBe(512.25);
    }
  });

  it("resolves vertex-only terrain and replaces changed geometry", function () {
    spyOn(world, "getTerrainHeight").and.returnValue(10);
    const entity = addPolygon({
      graphic: {
        heightReference: HeightReference.RELATIVE_TO_GROUND,
        height: 2,
      },
    });
    visualizer.update(time);
    const first = visualizer._items.get(entity.id).owner;
    expect(first.fillPrimitive.geometry.positions[0].z).toBe(12);
    world.getTerrainHeight.and.returnValue(20);
    visualizer.update(time);
    const second = visualizer._items.get(entity.id).owner;
    expect(second).not.toBe(first);
    expect(first.destroyed).toBeTrue();
    expect(second.fillPrimitive.geometry.positions[0].z).toBe(22);
  });

  it("retains hidden owner, releases missing hierarchy, and reports bounds", function () {
    const entity = addPolygon();
    visualizer.update(time);
    const owner = visualizer._items.get(entity.id).owner;
    expect(visualizer.getBoundingSphere(entity, new BoundingSphere())).toBe(
      BoundingSphereState.DONE,
    );
    entity.show = false;
    visualizer.update(time);
    expect(owner.fillPrimitive.show).toBeFalse();
    entity.polygon.hierarchy = undefined;
    visualizer.update(time);
    expect(owner.destroyed).toBeTrue();
  });

  it("rejects invalid topology and unsupported arc before mutation", function () {
    const entity = addPolygon();
    visualizer.update(time);
    const owner = visualizer._items.get(entity.id).owner;
    entity.polygon.arcType = ArcType.GEODESIC;
    expect(function () {
      visualizer.update(time);
    }).toThrowDeveloperError();
    expect(visualizer._items.get(entity.id).owner).toBe(owner);
    entity.polygon.arcType = ArcType.NONE;
    entity.polygon.outlineWidth = -1;
    expect(function () {
      visualizer.update(time);
    }).toThrowDeveloperError();
    expect(visualizer._items.get(entity.id).owner).toBe(owner);
  });

  it("uses and preserves an explicit caller-owned PrimitiveCollection", function () {
    visualizer.destroy();
    const target = new PrimitiveCollection();
    visualizer = new SceneGISPlanarPolygonVisualizer(
      world,
      scene,
      collection,
      target,
    );
    const entity = addPolygon({ graphic: { outline: true } });
    visualizer.update(time);
    const owner = visualizer._items.get(entity.id).owner;
    for (const primitive of owner.primitives) {
      expect(target.contains(primitive)).toBeTrue();
    }
    visualizer.destroy();
    expect(target.length).toBe(0);
    expect(target.isDestroyed()).toBeFalse();
    target.destroy();
  });

  it("rolls back multi-primitive post-insertion failures exactly once", function () {
    const entity = addPolygon({ graphic: { outline: true } });
    visualizer.update(time);
    const current = visualizer._items.get(entity.id).owner;
    const baseline = scene.primitives.length;
    const candidateCount = current.primitives.length;
    const destroySpy = spyOn(
      SceneGISPlanarPrimitive.prototype,
      "destroy",
    ).and.callThrough();
    const removeAdded = scene.primitives.primitiveAdded.addEventListener(
      function (primitive) {
        if (!current.primitives.includes(primitive)) {
          throw new Error("fixture insertion failure");
        }
      },
    );
    const removeRemoved = scene.primitives.primitiveRemoved.addEventListener(
      function (primitive) {
        if (!current.primitives.includes(primitive)) {
          throw new Error("fixture cleanup failure");
        }
      },
    );
    try {
      function expectFailure(destroyPrimitives, alpha) {
        scene.primitives.destroyPrimitives = destroyPrimitives;
        entity.polygon.material = new ColorMaterialProperty(
          Color.fromAlpha(Color.LIME, alpha),
        );
        expect(function () {
          visualizer.update(time);
        }).toThrowError("fixture insertion failure");
        expect(scene.primitives.length).toBe(baseline);
        expect(visualizer._items.get(entity.id).owner).toBe(current);
        expect(current.destroyed).toBeFalse();
      }
      expectFailure(true, 0.5);
      expectFailure(false, 0.25);
      expect(destroySpy).toHaveBeenCalledTimes(candidateCount * 2);
    } finally {
      scene.primitives.destroyPrimitives = true;
      removeAdded();
      removeRemoved();
    }
  });
});
