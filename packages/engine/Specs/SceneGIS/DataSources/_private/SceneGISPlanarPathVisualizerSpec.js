import BoundingSphere from "../../../../Source/Core/BoundingSphere.js";
import BoundingSphereState from "../../../../Source/DataSources/BoundingSphereState.js";
import Cartesian3 from "../../../../Source/Core/Cartesian3.js";
import EntityCollection from "../../../../Source/DataSources/EntityCollection.js";
import JulianDate from "../../../../Source/Core/JulianDate.js";
import PathGraphics from "../../../../Source/DataSources/PathGraphics.js";
import PathMode from "../../../../Source/DataSources/PathMode.js";
import PrimitiveCollection from "../../../../Source/Scene/PrimitiveCollection.js";
import ReferenceFrame from "../../../../Source/Core/ReferenceFrame.js";
import SampledPositionProperty from "../../../../Source/DataSources/SampledPositionProperty.js";
import SceneGISPlanarCoordinateSystem from "../../../../Source/SceneGIS/Core/SceneGISPlanarCoordinateSystem.js";
import SceneGISPlanarExtent from "../../../../Source/SceneGIS/Core/SceneGISPlanarExtent.js";
import SceneGISPlanarPathVisualizer from "../../../../Source/SceneGIS/DataSources/_private/_SceneGISPlanarPathVisualizer.js";
import SceneGISPlanarWorld from "../../../../Source/SceneGIS/Scene/SceneGISPlanarWorld.js";

describe("SceneGIS/DataSources/SceneGISPlanarPathVisualizer", function () {
  const time = JulianDate.fromIso8601("2026-08-10T00:01:00Z");
  let world;
  let collection;
  let primitives;
  let visualizer;
  function sampled(frame = ReferenceFrame.FIXED) {
    const property = new SampledPositionProperty(frame);
    property.addSample(
      JulianDate.addSeconds(time, -60, new JulianDate()),
      new Cartesian3(-20, 0, 1),
    );
    property.addSample(
      JulianDate.addSeconds(time, 60, new JulianDate()),
      new Cartesian3(20, 0, 2),
    );
    return property;
  }
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
    collection = new EntityCollection();
    primitives = new PrimitiveCollection();
    visualizer = new SceneGISPlanarPathVisualizer(
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

  it("renders a fixed whole path and reuses its warm owner", function () {
    const entity = collection.add({
      id: "path",
      position: sampled(),
      path: new PathGraphics({
        leadTime: 60,
        trailTime: 60,
        resolution: 30,
        materialMode: PathMode.WHOLE,
      }),
    });
    visualizer.update(time);
    const owner = visualizer._items.get(entity.id).owner;
    expect(owner.primitive.id).toBe(entity);
    visualizer.update(time);
    expect(visualizer._items.get(entity.id).owner).toBe(owner);
    expect(visualizer.getBoundingSphere(entity, new BoundingSphere())).toBe(
      BoundingSphereState.DONE,
    );
  });

  it("rejects unsupported frames and modes before owner mutation", function () {
    const entity = collection.add({
      id: "invalid",
      position: sampled(ReferenceFrame.INERTIAL),
      path: new PathGraphics({ leadTime: 60, trailTime: 60 }),
    });
    expect(function () {
      visualizer.update(time);
    }).toThrowDeveloperError();
    expect(visualizer._items.get(entity.id).owner).toBeUndefined();
    entity.position = sampled();
    entity.path.materialMode = PathMode.PORTIONS;
    expect(function () {
      visualizer.update(time);
    }).toThrowDeveloperError();
  });

  it("hides outside samples and releases on removal", function () {
    const property = sampled();
    const entity = collection.add({
      id: "outside",
      position: property,
      path: new PathGraphics({ leadTime: 60, trailTime: 60 }),
    });
    visualizer.update(time);
    const owner = visualizer._items.get(entity.id).owner;
    property.addSample(
      JulianDate.addSeconds(time, 30, new JulianDate()),
      new Cartesian3(1000, 0, 0),
    );
    visualizer.update(time);
    expect(owner.shown).toBeFalse();
    collection.remove(entity);
    expect(owner.destroyed).toBeTrue();
  });

  it("hides stationary samples and resumes without losing its warm owner", function () {
    const entity = collection.add({
      id: "stationary",
      position: sampled(),
      path: new PathGraphics({ leadTime: 60, trailTime: 60 }),
    });
    visualizer.update(time);
    const owner = visualizer._items.get(entity.id).owner;
    const primitive = owner.primitive;

    const stationary = new SampledPositionProperty(ReferenceFrame.FIXED);
    stationary.addSample(
      JulianDate.addSeconds(time, -60, new JulianDate()),
      new Cartesian3(5, 6, 7),
    );
    stationary.addSample(
      JulianDate.addSeconds(time, 60, new JulianDate()),
      new Cartesian3(5, 6, 7),
    );
    entity.position = stationary;
    expect(function () {
      visualizer.update(time);
    }).not.toThrow();
    expect(visualizer._items.get(entity.id).owner).toBe(owner);
    expect(owner.shown).toBeFalse();
    expect(visualizer.getBoundingSphere(entity, new BoundingSphere())).toBe(
      BoundingSphereState.FAILED,
    );
    visualizer.update(time);
    expect(owner.primitive).toBe(primitive);

    entity.position = sampled();
    visualizer.update(time);
    expect(visualizer._items.get(entity.id).owner).toBe(owner);
    expect(owner.shown).toBeTrue();
    collection.remove(entity);
    expect(owner.destroyed).toBeTrue();
  });
});
