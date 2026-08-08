import BoundingSphere from "../../../../Source/Core/BoundingSphere.js";
import BoundingSphereState from "../../../../Source/DataSources/BoundingSphereState.js";
import Cartesian3 from "../../../../Source/Core/Cartesian3.js";
import Color from "../../../../Source/Core/Color.js";
import DistanceDisplayCondition from "../../../../Source/Core/DistanceDisplayCondition.js";
import EntityCollection from "../../../../Source/DataSources/EntityCollection.js";
import HeightReference from "../../../../Source/Scene/HeightReference.js";
import JulianDate from "../../../../Source/Core/JulianDate.js";
import Matrix4 from "../../../../Source/Core/Matrix4.js";
import Model from "../../../../Source/Scene/Model/Model.js";
import ModelGraphics from "../../../../Source/DataSources/ModelGraphics.js";
import Quaternion from "../../../../Source/Core/Quaternion.js";
import PrimitiveCollection from "../../../../Source/Scene/PrimitiveCollection.js";
import SceneGISPlanarCoordinateSystem from "../../../../Source/SceneGIS/Core/SceneGISPlanarCoordinateSystem.js";
import SceneGISPlanarExtent from "../../../../Source/SceneGIS/Core/SceneGISPlanarExtent.js";
import SceneGISPlanarModelVisualizer from "../../../../Source/SceneGIS/DataSources/_private/_SceneGISPlanarModelVisualizer.js";
import SceneGISPlanarWorld from "../../../../Source/SceneGIS/Scene/SceneGISPlanarWorld.js";
import ShadowMode from "../../../../Source/Scene/ShadowMode.js";

describe("SceneGIS/DataSources/SceneGISPlanarModelVisualizer", function () {
  let world;
  let scene;
  let collection;
  let visualizer;
  let primitives;
  let requests;
  const time = JulianDate.fromIso8601("2026-08-09T00:00:00Z");

  function createDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    return { promise, resolve, reject };
  }

  function createFakeModel() {
    let destroyed = false;
    return {
      ready: true,
      show: true,
      modelMatrix: new Matrix4(),
      boundingSphere: new BoundingSphere(new Cartesian3(1.0, 2.0, 3.0), 4.0),
      imageBasedLighting: {},
      activeAnimations: {
        addAll: jasmine.createSpy("addAll"),
        removeAll: jasmine.createSpy("removeAll"),
      },
      getNode: function () {
        return undefined;
      },
      setArticulationStage: jasmine.createSpy("setArticulationStage"),
      applyArticulations: jasmine.createSpy("applyArticulations"),
      destroy: jasmine.createSpy("destroy").and.callFake(function () {
        destroyed = true;
      }),
      isDestroyed: function () {
        return destroyed;
      },
    };
  }

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
    const values = [];
    primitives = {
      add: jasmine.createSpy("add").and.callFake(function (model) {
        values.push(model);
        return model;
      }),
      removeAndDestroy: jasmine
        .createSpy("removeAndDestroy")
        .and.callFake(function (model) {
          const index = values.indexOf(model);
          if (index !== -1) {
            values.splice(index, 1);
          }
          if (model !== undefined && !model.isDestroyed()) {
            model.destroy();
          }
          return true;
        }),
      get length() {
        return values.length;
      },
    };
    scene = {
      primitives,
      requestRender: jasmine.createSpy("requestRender"),
      isDestroyed: function () {
        return false;
      },
    };
    collection = new EntityCollection();
    requests = [];
    spyOn(Model, "fromGltfAsync").and.callFake(function (options) {
      const deferred = createDeferred();
      requests.push({ options, deferred });
      return deferred.promise;
    });
    visualizer = new SceneGISPlanarModelVisualizer(world, scene, collection);
  });

  afterEach(function () {
    if (visualizer !== undefined && !visualizer.isDestroyed()) {
      visualizer.destroy();
    }
    if (!world.isDestroyed()) {
      world.destroy();
    }
  });

  function addModel(options = {}) {
    return collection.add({
      id: options.id ?? "model",
      position: options.position ?? new Cartesian3(10.0, 20.0, 30.0),
      orientation: options.orientation,
      model: new ModelGraphics({
        uri: options.uri ?? "model.glb",
        ...options.model,
      }),
    });
  }

  async function settle(model) {
    requests.at(-1).deferred.resolve(model);
    await Promise.resolve();
    await Promise.resolve();
  }

  it("uses fixed planar translation and approved low-level options", async function () {
    const entity = addModel({
      model: {
        scale: 2.0,
        minimumPixelSize: 8.0,
        color: Color.CYAN,
        heightReference: HeightReference.NONE,
      },
    });
    visualizer.update(time);
    expect(requests.length).toBe(1);
    expect(requests[0].options.scene).toBeUndefined();
    expect(requests[0].options.heightReference).toBe(HeightReference.NONE);
    expect(requests[0].options.enableVerticalExaggeration).toBe(false);
    expect(requests[0].options.shadows).toBe(ShadowMode.DISABLED);
    expect(requests[0].options.environmentMapOptions).toEqual({
      enabled: false,
    });
    expect(requests[0].options.allowPicking).toBe(true);
    expect(requests[0].options.enablePick).toBe(true);

    const model = createFakeModel();
    await settle(model);
    expect(primitives.add).not.toHaveBeenCalled();
    expect(scene.requestRender).toHaveBeenCalled();
    visualizer.update(time);
    expect(primitives.add).toHaveBeenCalledOnceWith(model);
    expect(model.id).toBe(entity);
    expect(model.modelMatrix[0]).toBe(1.0);
    expect(model.modelMatrix[5]).toBe(1.0);
    expect(model.modelMatrix[10]).toBe(1.0);
    expect(model.modelMatrix[12]).toBe(10.0);
    expect(model.modelMatrix[13]).toBe(20.0);
    expect(model.modelMatrix[14]).toBe(30.0);
    expect(model.scale).toBe(2.0);
  });

  it("robustly normalizes orientation and updates pose without reload", async function () {
    const entity = addModel({
      orientation: new Quaternion(0.0, 0.0, 1.0e300, 1.0e300),
    });
    visualizer.update(time);
    const model = createFakeModel();
    await settle(model);
    visualizer.update(time);
    const originalRequestCount = requests.length;
    expect(model.modelMatrix[0]).toBeCloseTo(0.0, 12);
    expect(model.modelMatrix[1]).toBeCloseTo(1.0, 12);

    entity.position = new Cartesian3(40.0, 50.0, 60.0);
    entity.orientation = Quaternion.IDENTITY;
    visualizer.update(time);
    expect(requests.length).toBe(originalRequestCount);
    expect(model.modelMatrix[12]).toBe(40.0);
    expect(model.modelMatrix[0]).toBe(1.0);
  });

  it("rejects invalid orientation and unsupported profile before loading", function () {
    addModel({ orientation: new Quaternion(0.0, 0.0, 0.0, 0.0) });
    expect(function () {
      visualizer.update(time);
    }).toThrowDeveloperError();
    expect(requests.length).toBe(0);

    collection.removeAll();
    addModel({ model: { shadows: ShadowMode.ENABLED } });
    expect(function () {
      visualizer.update(time);
    }).toThrowDeveloperError();
    expect(requests.length).toBe(0);
  });

  it("replaces generations and destroys stale and active models exactly once", async function () {
    const entity = addModel();
    visualizer.update(time);
    const stale = createFakeModel();
    entity.model.uri = "replacement.glb";
    visualizer.update(time);
    expect(requests.length).toBe(2);
    requests[0].deferred.resolve(stale);
    await Promise.resolve();
    await Promise.resolve();
    expect(stale.destroy).toHaveBeenCalledTimes(1);

    const active = createFakeModel();
    requests[1].deferred.resolve(active);
    await Promise.resolve();
    await Promise.resolve();
    visualizer.update(time);
    expect(primitives.length).toBe(1);
    collection.remove(entity);
    expect(active.destroy).toHaveBeenCalledTimes(1);
    expect(primitives.length).toBe(0);
  });

  it("keeps failures stable until the load generation changes", async function () {
    const entity = addModel();
    visualizer.update(time);
    requests[0].deferred.reject(new Error("fixture failure"));
    await Promise.resolve();
    await Promise.resolve();
    visualizer.update(time);
    visualizer.update(time);
    expect(requests.length).toBe(1);
    expect(visualizer.getBoundingSphere(entity, new BoundingSphere())).toBe(
      BoundingSphereState.FAILED,
    );
    entity.model.uri = "retry.glb";
    visualizer.update(time);
    expect(requests.length).toBe(2);
  });

  it("hides and retains active models for outside positions and resident terrain changes", async function () {
    world.getTerrainHeight = jasmine
      .createSpy("getTerrainHeight")
      .and.returnValue(5.0);
    const entity = addModel({
      position: new Cartesian3(1.0, 2.0, 7.0),
      model: { heightReference: HeightReference.RELATIVE_TO_GROUND },
    });
    visualizer.update(time);
    const model = createFakeModel();
    await settle(model);
    visualizer.update(time);
    expect(model.modelMatrix[14]).toBe(12.0);
    entity.position = new Cartesian3(101.0, 2.0, 7.0);
    visualizer.update(time);
    expect(model.show).toBe(false);
    expect(model.destroy).not.toHaveBeenCalled();
    entity.position = new Cartesian3(1.0, 2.0, 7.0);
    world.getTerrainHeight.and.returnValue(8.0);
    visualizer.update(time);
    expect(model.show).toBe(true);
    expect(model.modelMatrix[14]).toBe(15.0);
    expect(requests.length).toBe(1);
  });

  it("rejects invalid mapped values before mutating an active model", async function () {
    const originalCondition = new DistanceDisplayCondition(1.0, 100.0);
    const entity = addModel({
      model: {
        scale: 2.0,
        distanceDisplayCondition: originalCondition,
      },
    });
    visualizer.update(time);
    const model = createFakeModel();
    await settle(model);
    visualizer.update(time);
    const originalMatrix = Matrix4.clone(model.modelMatrix);

    entity.position = new Cartesian3(40.0, 50.0, 60.0);
    entity.model.scale = 7.0;
    entity.model.distanceDisplayCondition = new DistanceDisplayCondition(
      10.0,
      5.0,
    );
    expect(function () {
      visualizer.update(time);
    }).toThrowDeveloperError();
    expect(visualizer._items.get(entity.id).model).toBe(model);
    expect(model.modelMatrix).toEqual(originalMatrix);
    expect(model.scale).toBe(2.0);
    expect(model.distanceDisplayCondition).toEqual(originalCondition);
    expect(model.destroy).not.toHaveBeenCalled();
    expect(requests.length).toBe(1);
  });

  it("cleans a candidate exactly once when property application fails", async function () {
    const entity = addModel();
    visualizer.update(time);
    const candidate = createFakeModel();
    Object.defineProperty(candidate, "scale", {
      configurable: true,
      set: function () {
        throw new Error("fixture apply failure");
      },
    });
    await settle(candidate);

    expect(function () {
      visualizer.update(time);
    }).toThrowError("fixture apply failure");
    const item = visualizer._items.get(entity.id);
    expect(item.candidate).toBeUndefined();
    expect(item.model).toBeUndefined();
    expect(item.failed).toBe(true);
    expect(candidate.destroy).toHaveBeenCalledTimes(1);
    expect(primitives.add).not.toHaveBeenCalled();

    expect(visualizer.update(time)).toBe(true);
    expect(requests.length).toBe(1);
    expect(candidate.destroy).toHaveBeenCalledTimes(1);
    expect(primitives.length).toBe(0);
  });

  it("reports pending and done bounds and cleans late completion after destroy", async function () {
    const entity = addModel();
    visualizer.update(time);
    expect(visualizer.getBoundingSphere(entity, new BoundingSphere())).toBe(
      BoundingSphereState.PENDING,
    );
    const model = createFakeModel();
    await settle(model);
    visualizer.update(time);
    const result = new BoundingSphere();
    expect(visualizer.getBoundingSphere(entity, result)).toBe(
      BoundingSphereState.DONE,
    );
    expect(result).toEqual(model.boundingSphere);

    entity.model.uri = "late.glb";
    visualizer.update(time);
    const lateRequest = requests.at(-1);
    const late = createFakeModel();
    visualizer.destroy();
    visualizer = undefined;
    lateRequest.deferred.resolve(late);
    await Promise.resolve();
    await Promise.resolve();
    expect(late.destroy).toHaveBeenCalledTimes(1);
  });

  it("uses an explicit caller-owned primitive collection without owning it", function () {
    const target = new PrimitiveCollection();
    const targeted = new SceneGISPlanarModelVisualizer(
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

  it("rolls back a post-insertion target event failure", async function () {
    visualizer.destroy();
    visualizer = undefined;
    const target = new PrimitiveCollection();
    const targeted = new SceneGISPlanarModelVisualizer(
      world,
      scene,
      collection,
      target,
    );
    const entity = addModel();
    targeted.update(time);
    const candidate = createFakeModel();
    await settle(candidate);
    const removeListener = target.primitiveAdded.addEventListener(function () {
      throw new Error("fixture target insertion failure");
    });
    try {
      expect(function () {
        targeted.update(time);
      }).toThrowError("fixture target insertion failure");
      expect(target.length).toBe(0);
      expect(candidate.destroy).toHaveBeenCalledTimes(1);
      expect(targeted._items.get(entity.id).failed).toBe(true);
    } finally {
      removeListener();
      targeted.destroy();
      target.destroy();
    }
  });
});
