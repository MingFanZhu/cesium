import BoxGraphics from "../../../Source/DataSources/BoxGraphics.js";
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

  it("defers and atomically appends the four planar visualizers", function () {
    const visualizers = createCallbackState();
    const listenerBaseline =
      dataSource.entities.collectionChanged.numberOfListeners;

    expect(visualizers.length).toBe(1);
    expect(visualizers[0].getBoundingSphere).toBeUndefined();
    expect(visualizers[0].update(time)).toBe(false);
    expect(visualizers.length).toBe(5);
    expect(
      visualizers
        .slice(1)
        .map((visualizer) => visualizer.constructor.name.replace(/\d+$/, "")),
    ).toEqual([
      "SceneGISPlanarAnchorVisualizer",
      "SceneGISPlanarModelVisualizer",
      "SceneGISPlanarPolylineVisualizer",
      "SceneGISPlanarPolygonVisualizer",
    ]);
    expect(visualizers[0].update(time)).toBe(true);
    expect(visualizers.length).toBe(5);
    expect(dataSource.entities.collectionChanged.numberOfListeners).toBe(
      listenerBaseline + 4,
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

  it("rejects unsupported standard and custom properties before activation", function () {
    const visualizers = createCallbackState();
    const entity = dataSource.entities.add({
      id: "unsupported",
      box: new BoxGraphics({ dimensions: new Cartesian3(1.0, 1.0, 1.0) }),
    });
    expect(function () {
      visualizers[0].update(time);
    }).toThrowDeveloperError();
    expect(visualizers.length).toBe(1);

    entity.box = undefined;
    entity.addProperty("customGraphic");
    entity.customGraphic = 1;
    expect(function () {
      visualizers[0].update(time);
    }).toThrowDeveloperError();
    expect(visualizers.length).toBe(1);
  });

  it("allows metadata and recovers after invalid profile and cluster correction", function () {
    const visualizers = createCallbackState();
    const entity = dataSource.entities.add({
      id: "metadata",
      properties: new PropertyBag({ category: "planar" }),
    });
    entity.addProperty("temporaryGraphic");
    entity.temporaryGraphic = true;
    expect(function () {
      visualizers[0].update(time);
    }).toThrowDeveloperError();
    entity.temporaryGraphic = undefined;

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
    expect(visualizers.length).toBe(5);
    for (let i = visualizers.length - 1; i >= 0; i--) {
      visualizers[i].destroy();
    }
    expect(dataSource.entities.collectionChanged.numberOfListeners).toBe(
      listenerBaseline,
    );
  });

  it("blocks dynamic invalid profiles before child normal updates", function () {
    const visualizers = createCallbackState();
    visualizers[0].update(time);
    const childUpdates = visualizers
      .slice(1)
      .map((visualizer) => spyOn(visualizer, "update").and.callThrough());
    dataSource.entities.add({
      id: "dynamic-box",
      box: new BoxGraphics({ dimensions: new Cartesian3(1.0, 1.0, 1.0) }),
    });

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
