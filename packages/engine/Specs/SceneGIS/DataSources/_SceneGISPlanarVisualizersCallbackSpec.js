import Cesium3DTilesetGraphics from "../../../Source/DataSources/Cesium3DTilesetGraphics.js";
import CorridorGraphics from "../../../Source/DataSources/CorridorGraphics.js";
import Cartesian3 from "../../../Source/Core/Cartesian3.js";
import CustomDataSource from "../../../Source/DataSources/CustomDataSource.js";
import EntityCluster from "../../../Source/DataSources/EntityCluster.js";
import JulianDate from "../../../Source/Core/JulianDate.js";
import PrimitiveCollection from "../../../Source/Scene/PrimitiveCollection.js";
import PropertyBag from "../../../Source/DataSources/PropertyBag.js";
import SceneGISPlanarCoordinateSystem from "../../../Source/SceneGIS/Core/SceneGISPlanarCoordinateSystem.js";
import SceneGISPlanarExtent from "../../../Source/SceneGIS/Core/SceneGISPlanarExtent.js";
import SceneGISPlanarWorld from "../../../Source/SceneGIS/Scene/SceneGISPlanarWorld.js";
import createSceneGISPlanarVisualizersCallback from "../../../Source/SceneGIS/DataSources/_private/_SceneGISPlanarVisualizersCallback.js";
import SceneGISPlanarAnchorVisualizer from "../../../Source/SceneGIS/DataSources/_private/_SceneGISPlanarAnchorVisualizer.js";
import SceneGISPlanarModelVisualizer from "../../../Source/SceneGIS/DataSources/_private/_SceneGISPlanarModelVisualizer.js";
import SceneGISPlanarPolygonVisualizer from "../../../Source/SceneGIS/DataSources/_private/_SceneGISPlanarPolygonVisualizer.js";
import SceneGISPlanarPolylineVisualizer from "../../../Source/SceneGIS/DataSources/_private/_SceneGISPlanarPolylineVisualizer.js";
import SceneGISPlanarSolidVisualizer from "../../../Source/SceneGIS/DataSources/_private/_SceneGISPlanarSolidVisualizer.js";

describe("SceneGIS/DataSources/_SceneGISPlanarVisualizersCallback", function () {
  const time = JulianDate.fromIso8601("2026-08-09T00:00:00Z");
  let world;
  let scene;
  let dataSource;
  let cluster;

  function createWorld() {
    return new SceneGISPlanarWorld({
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
  }

  function createCallbackState(source = new CustomDataSource()) {
    dataSource = source;
    dataSource._primitives = new PrimitiveCollection();
    cluster = source.clustering;
    cluster.enabled = false;
    cluster._scene = scene;
    return createSceneGISPlanarVisualizersCallback(world)(
      scene,
      cluster,
      source,
    );
  }

  beforeEach(function () {
    world = createWorld();
    scene = {
      world,
      primitives: new PrimitiveCollection(),
      camera: { changed: { addEventListener: function () {} } },
      requestRender: jasmine.createSpy("requestRender"),
      isDestroyed: function () {
        return false;
      },
    };
  });

  afterEach(function () {
    if (!world.isDestroyed()) {
      world.destroy();
    }
  });

  it("uses the world liveness contract for bound live and destroyed worlds", function () {
    expect(createSceneGISPlanarVisualizersCallback(undefined)).toBeUndefined();
    expect(createSceneGISPlanarVisualizersCallback({})).toBeUndefined();
    world.update = world.update.bind(world);
    world.beginFrame = world.beginFrame.bind(world);
    world.render = world.render.bind(world);
    world.endFrame = world.endFrame.bind(world);
    world.destroy = world.destroy.bind(world);
    expect(createSceneGISPlanarVisualizersCallback(world)).toEqual(
      jasmine.any(Function),
    );
    world.destroy();
    expect(createSceneGISPlanarVisualizersCallback(world)).toBeUndefined();
  });

  it("defers and atomically appends the eight planar visualizers", function () {
    const visualizers = createCallbackState();
    const listenerBaseline =
      dataSource.entities.collectionChanged.numberOfListeners;

    expect(visualizers.length).toBe(1);
    expect(visualizers[0].getBoundingSphere).toBeUndefined();
    expect(visualizers[0].update(time)).toBe(false);
    expect(visualizers.length).toBe(9);
    expect(
      visualizers
        .slice(1)
        .map((visualizer) => visualizer.constructor.name.replace(/\d+$/, "")),
    ).toEqual([
      "SceneGISPlanarAnchorVisualizer",
      "SceneGISPlanarModelVisualizer",
      "SceneGISPlanarPolylineVisualizer",
      "SceneGISPlanarPolygonVisualizer",
      "SceneGISPlanarSolidVisualizer",
      "SceneGISPlanarAreaVisualizer",
      "SceneGISPlanarRouteVisualizer",
      "SceneGISPlanarPathVisualizer",
    ]);
    expect(visualizers[0].update(time)).toBe(true);
    expect(visualizers.length).toBe(9);
    expect(dataSource.entities.collectionChanged.numberOfListeners).toBe(
      listenerBaseline + 8,
    );

    visualizers[0].destroy();
    for (let i = 1; i < visualizers.length; i++) {
      expect(visualizers[i].isDestroyed()).toBe(false);
    }
    for (let i = visualizers.length - 1; i >= 1; i--) {
      visualizers[i].destroy();
    }
    expect(dataSource.entities.collectionChanged.numberOfListeners).toBe(
      listenerBaseline,
    );
  });

  it("rejects unsupported standard graphics but allows custom business properties", function () {
    const visualizers = createCallbackState();
    const entity = dataSource.entities.add({
      id: "unsupported",
      tileset: new Cesium3DTilesetGraphics({ uri: "local.json" }),
    });
    expect(function () {
      visualizers[0].update(time);
    }).toThrowDeveloperError();
    expect(visualizers.length).toBe(1);

    entity.tileset = undefined;
    entity.addProperty("businessCode");
    entity.businessCode = "A-1";
    expect(visualizers[0].update(time)).toBe(false);
    entity.businessCode = "A-2";
    entity.addProperty("metadata");
    entity.metadata = { category: "parcel" };
    expect(visualizers[0].update(time)).toBe(true);
    entity.removeProperty("businessCode");
    expect(visualizers[0].update(time)).toBe(true);
    expect(entity.metadata).toEqual({ category: "parcel" });
    for (let i = visualizers.length - 1; i >= 0; i--) {
      visualizers[i].destroy();
    }
  });

  it("allows metadata and recovers after invalid profile and cluster correction", function () {
    const visualizers = createCallbackState();
    const entity = dataSource.entities.add({
      id: "metadata",
      properties: new PropertyBag({ category: "planar" }),
    });
    entity.tileset = new Cesium3DTilesetGraphics({ uri: "local.json" });
    expect(function () {
      visualizers[0].update(time);
    }).toThrowDeveloperError();
    entity.tileset = undefined;

    cluster.enabled = true;
    expect(function () {
      visualizers[0].update(time);
    }).toThrowDeveloperError();
    cluster.enabled = false;
    expect(visualizers[0].update(time)).toBe(false);

    for (let i = visualizers.length - 1; i >= 0; i--) {
      visualizers[i].destroy();
    }
  });

  it("rejects non-CustomDataSource without mutating its visualizer array", function () {
    const source = {
      name: "structural-source",
      entities: new CustomDataSource().entities,
      clustering: new EntityCluster(),
      _primitives: new PrimitiveCollection(),
    };
    source.clustering.enabled = false;
    const visualizers = createSceneGISPlanarVisualizersCallback(world)(
      scene,
      source.clustering,
      source,
    );
    expect(function () {
      visualizers[0].update(time);
    }).toThrowDeveloperError();
    expect(visualizers.length).toBe(1);
    visualizers[0].destroy();
  });

  it("rolls back constructed children and preserves the original failure", function () {
    const visualizers = createCallbackState();
    const listenerBaseline =
      dataSource.entities.collectionChanged.numberOfListeners;
    dataSource._primitives = {};

    expect(function () {
      visualizers[0].update(time);
    }).toThrowError("primitiveCollection must own primitives.");
    expect(visualizers.length).toBe(1);
    expect(dataSource.entities.collectionChanged.numberOfListeners).toBe(
      listenerBaseline,
    );

    dataSource._primitives = new PrimitiveCollection();
    expect(visualizers[0].update(time)).toBe(false);
    for (let i = visualizers.length - 1; i >= 0; i--) {
      visualizers[i].destroy();
    }
  });

  it("rolls back through a third-child constructor failure", function () {
    const visualizers = createCallbackState();
    const originalError = new Error("third child constructor failed");
    const listenerBaseline =
      dataSource.entities.collectionChanged.numberOfListeners;
    const event = dataSource.entities.collectionChanged;
    const originalAddEventListener = event.addEventListener;
    let failThirdListener = true;
    let listenerCalls = 0;
    spyOn(event, "addEventListener").and.callFake(function (listener, scope) {
      listenerCalls++;
      if (failThirdListener && listenerCalls === 3) {
        throw originalError;
      }
      return originalAddEventListener.call(this, listener, scope);
    });
    const anchorDestroy = spyOn(
      SceneGISPlanarAnchorVisualizer.prototype,
      "destroy",
    ).and.callThrough();
    const modelDestroy = spyOn(
      SceneGISPlanarModelVisualizer.prototype,
      "destroy",
    ).and.callThrough();

    let thrownError;
    try {
      visualizers[0].update(time);
    } catch (error) {
      thrownError = error;
    }
    expect(thrownError).toBe(originalError);
    expect(anchorDestroy).toHaveBeenCalledTimes(1);
    expect(modelDestroy).toHaveBeenCalledTimes(1);
    expect(visualizers.length).toBe(1);
    expect(dataSource.entities.collectionChanged.numberOfListeners).toBe(
      listenerBaseline,
    );

    failThirdListener = false;
    listenerCalls = 0;
    expect(visualizers[0].update(time)).toBe(false);
    expect(visualizers.length).toBe(9);
    for (let i = visualizers.length - 1; i >= 0; i--) {
      visualizers[i].destroy();
    }
    expect(dataSource.entities.collectionChanged.numberOfListeners).toBe(
      listenerBaseline,
    );
  });

  it("rolls back all existing children when the sixth child constructor fails", function () {
    const visualizers = createCallbackState();
    const listenerBaseline =
      dataSource.entities.collectionChanged.numberOfListeners;
    const event = dataSource.entities.collectionChanged;
    const originalAdd = event.addEventListener;
    let calls = 0;
    spyOn(event, "addEventListener").and.callFake(function (listener, scope) {
      calls++;
      if (calls === 6) {
        throw new Error("sixth child failed");
      }
      return originalAdd.call(this, listener, scope);
    });
    const destroys = [
      SceneGISPlanarAnchorVisualizer,
      SceneGISPlanarModelVisualizer,
      SceneGISPlanarPolylineVisualizer,
      SceneGISPlanarPolygonVisualizer,
      SceneGISPlanarSolidVisualizer,
    ].map((Constructor) =>
      spyOn(Constructor.prototype, "destroy").and.callThrough(),
    );
    expect(function () {
      visualizers[0].update(time);
    }).toThrowError("sixth child failed");
    expect(visualizers.length).toBe(1);
    expect(dataSource.entities.collectionChanged.numberOfListeners).toBe(
      listenerBaseline,
    );
    for (const destroy of destroys) {
      expect(destroy).toHaveBeenCalledTimes(1);
    }
    visualizers[0].destroy();
  });

  it("rolls back existing children when the seventh or eighth constructor fails", function () {
    for (const failAt of [7, 8]) {
      const source = new CustomDataSource(`failure-${failAt}`);
      const visualizers = createCallbackState(source);
      const event = source.entities.collectionChanged;
      const listenerBaseline = event.numberOfListeners;
      const originalAdd = event.addEventListener;
      let calls = 0;
      spyOn(event, "addEventListener").and.callFake(function (listener, scope) {
        calls++;
        if (calls === failAt) {
          throw new Error(`child ${failAt} failed`);
        }
        return originalAdd.call(this, listener, scope);
      });
      expect(function () {
        visualizers[0].update(time);
      }).toThrowError(`child ${failAt} failed`);
      expect(visualizers.length).toBe(1);
      expect(event.numberOfListeners).toBe(listenerBaseline);
      visualizers[0].destroy();
    }
  });

  it("allows route profiles and blocks other dynamic invalid profiles before child updates", function () {
    const visualizers = createCallbackState();
    visualizers[0].update(time);
    const childUpdates = visualizers
      .slice(1)
      .map((visualizer) => spyOn(visualizer, "update").and.callThrough());
    dataSource.entities.add({
      id: "dynamic-corridor",
      corridor: new CorridorGraphics({
        positions: [Cartesian3.ZERO, Cartesian3.UNIT_X],
        width: 1,
      }),
    });
    const invalid = dataSource.entities.add({ id: "dynamic-invalid" });
    invalid.tileset = new Cesium3DTilesetGraphics({ uri: "local.json" });

    expect(function () {
      for (let i = 0, length = visualizers.length; i < length; i++) {
        visualizers[i].update(time);
      }
    }).toThrowDeveloperError();
    for (let i = 0; i < childUpdates.length; i++) {
      expect(childUpdates[i]).not.toHaveBeenCalled();
    }
    for (let i = visualizers.length - 1; i >= 0; i--) {
      visualizers[i].destroy();
    }
  });
});
