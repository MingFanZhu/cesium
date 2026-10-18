import {
  Cartesian3,
  Cesium3DTileset,
  CesiumWidget,
  DeveloperError,
  HeadingPitchRange,
  Matrix4,
  PrimitiveCollection,
  Scene,
  SceneGISPlanarCameraController,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
  _SceneGISPlanarEntityFraming as framing,
} from "../../../index.js";

describe("SceneGIS/Widget/SceneGISPlanarTilesetZoomCesiumWidget", function () {
  let container;
  let widget;

  beforeEach(function () {
    container = document.createElement("div");
    container.style.width = "96px";
    container.style.height = "96px";
    document.body.appendChild(container);
    widget = new CesiumWidget(container, {
      world: new SceneGISPlanarWorld({
        coordinateSystem: new SceneGISPlanarCoordinateSystem({
          extent: new SceneGISPlanarExtent({
            minimumX: -1000,
            minimumY: -1000,
            maximumX: 1000,
            maximumY: 1000,
          }),
        }),
        maximumLevel: 0,
      }),
      useDefaultRenderLoop: false,
    });
    widget.resize();
  });

  afterEach(function () {
    if (widget && !widget.isDestroyed()) {
      widget.destroy();
    }
    document.body.removeChild(container);
  });

  async function createTileset(
    collection = widget.scene.primitives,
    boundingVolume = { sphere: [10, 20, 30, 5] },
  ) {
    const header = {
      asset: { version: "1.1" },
      geometricError: 0,
      root: {
        boundingVolume,
        geometricError: 0,
      },
    };
    const tileset = await Cesium3DTileset.fromUrl(
      `data:application/json,${encodeURIComponent(JSON.stringify(header))}`,
    );
    return collection.add(tileset);
  }

  function startFlight(tileset) {
    const result = widget.flyTo(tileset, {
      duration: 1,
      offset: new HeadingPitchRange(0, -Math.PI / 2, 100),
    });
    widget._postRender();
    expect(widget.camera._currentFlight).toBeDefined();
    return result;
  }

  it("frames a native tileset using current public root and model transforms", async function () {
    const tileset = await createTileset();
    const offset = new HeadingPitchRange(0, -Math.PI / 2, 100);
    const initial = widget.zoomTo(tileset, offset);
    widget._postRender();
    expect(await initial).toBe(true);
    expect(widget.camera.positionWC).toEqualEpsilon(
      new Cartesian3(10, 20, 130),
      1e-9,
    );

    const moved = widget.zoomTo(tileset, offset);
    tileset.root.transform = Matrix4.fromTranslation(
      new Cartesian3(40, 50, 60),
    );
    tileset.modelMatrix = Matrix4.fromUniformScale(2);
    widget._postRender();
    expect(await moved).toBe(true);
    expect(tileset.boundingSphere.radius).toBe(10);
    expect(widget.camera.positionWC).toEqualEpsilon(
      new Cartesian3(100, 140, 280),
      1e-9,
    );
  });

  it("flies to transformed box bounds and settles once after real tween completion", async function () {
    const tileset = await createTileset(widget.scene.primitives, {
      box: [10, 20, 30, 3, 0, 0, 0, 4, 0, 0, 0, 5],
    });
    const controller = new SceneGISPlanarCameraController({
      world: widget.scene.world,
    });
    widget.scene.screenSpaceCameraController.enableInputs = false;
    widget.addController(controller);
    const removed = widget.scene.primitives.primitiveRemoved;
    const update = widget.scene.preUpdate;
    const removedCount = removed.numberOfListeners;
    const updateCount = update.numberOfListeners;
    const promise = widget.flyTo(tileset, {
      duration: 1,
      offset: new HeadingPitchRange(0, -Math.PI / 2, 100),
    });
    tileset.root.transform = Matrix4.fromTranslation(
      new Cartesian3(40, 50, 60),
    );
    tileset.modelMatrix = Matrix4.fromUniformScale(2);
    widget._postRender();
    expect(controller._flightSuspensionCount).toBe(1);
    const flight = widget.camera._currentFlight;
    widget._postRender();
    expect(widget.camera._currentFlight).toBe(flight);
    let count = 0;
    promise.then(() => count++);
    widget.scene.tweens.update(0);
    widget.scene.tweens.update(0.5);
    widget.scene.tweens.update(1);
    expect(await promise).toBe(true);
    expect(count).toBe(1);
    expect(widget.camera.positionWC).toEqualEpsilon(
      new Cartesian3(100, 140, 280),
      1e-9,
    );
    expect(tileset.boundingSphere.radius).toEqualEpsilon(Math.sqrt(200), 1e-12);
    expect(controller._flightSuspensionCount).toBe(0);
    expect(removed.numberOfListeners).toBe(removedCount);
    expect(update.numberOfListeners).toBe(updateCount);
  });

  it("waits for native async readiness and ignores an obsolete target promise", async function () {
    let resolveOld;
    const old = widget.flyTo(
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
    );
    const before = Cartesian3.clone(widget.camera.positionWC);
    widget._postRender();
    expect(widget.camera.positionWC).toEqual(before);
    const ready = createTileset();
    const current = widget.flyTo(ready, {
      duration: 0,
      offset: new HeadingPitchRange(0, -Math.PI / 2, 100),
    });
    expect(await old).toBe(false);
    const tileset = await ready;
    await Promise.resolve();
    resolveOld(tileset);
    await Promise.resolve();
    widget._postRender();
    expect(await current).toBe(true);
    expect(widget.camera.positionWC).toEqualEpsilon(
      new Cartesian3(10, 20, 130),
      1e-9,
    );
    expect(widget._sceneGISPlanarFramingOperation).toBeUndefined();
  });

  it("cancels and replaces flights without leaking controller suspension or listeners", async function () {
    const tileset = await createTileset();
    const controller = new SceneGISPlanarCameraController({
      world: widget.scene.world,
    });
    widget.addController(controller);
    const event = widget.scene.preUpdate;
    const initial = event.numberOfListeners;
    const first = startFlight(tileset);
    widget.camera.cancelFlight();
    expect(await first).toBe(false);
    expect(controller._flightSuspensionCount).toBe(0);
    const second = startFlight(tileset);
    const replacement = widget.zoomTo(
      tileset,
      new HeadingPitchRange(0, -Math.PI / 2, 150),
    );
    widget._postRender();
    expect(await second).toBe(false);
    expect(await replacement).toBe(true);
    expect(controller._flightSuspensionCount).toBe(0);
    expect(event.numberOfListeners).toBe(initial);
  });

  it("allows attachment after promise resolution but before framing dispatch", async function () {
    const staging = new PrimitiveCollection({ destroyPrimitives: false });
    const ready = createTileset(staging);
    const promise = widget.flyTo(ready, { duration: 0 });
    const tileset = await ready;
    // The target continuation was registered before this attachment continuation.
    expect(widget._sceneGISPlanarFramingOperation).toBeDefined();
    staging.remove(tileset);
    staging.destroy();
    widget.scene.primitives.add(tileset);
    widget._postRender();
    expect(await promise).toBe(true);
  });

  it("returns false for detached targets and cancels removal before dispatch", async function () {
    const collection = widget.scene.primitives;
    collection.destroyPrimitives = false;
    const tileset = await createTileset();
    try {
      const pending = widget.zoomTo(tileset);
      collection.remove(tileset);
      expect(await pending).toBe(false);
      const detached = widget.flyTo(tileset);
      widget._postRender();
      expect(await detached).toBe(false);
      expect(widget.camera._currentFlight).toBeUndefined();
    } finally {
      tileset.destroy();
      collection.destroyPrimitives = true;
    }
  });

  it("rejects invalid bounds without moving the camera or retaining target listeners", async function () {
    const tileset = await createTileset();
    const removed = widget.scene.primitives.primitiveRemoved;
    const update = widget.scene.preUpdate;
    const removedCount = removed.numberOfListeners;
    const updateCount = update.numberOfListeners;
    const before = Cartesian3.clone(widget.camera.positionWC);
    tileset.modelMatrix = Matrix4.fromScale(new Cartesian3(NaN, 1, 1));
    const promise = widget.flyTo(tileset);
    widget._postRender();
    await expectAsync(promise).toBeRejectedWithError(DeveloperError);
    expect(widget.camera.positionWC).toEqual(before);
    expect(widget.camera._currentFlight).toBeUndefined();
    expect(removed.numberOfListeners).toBe(removedCount);
    expect(update.numberOfListeners).toBe(updateCount);
  });

  it("cancels flight when its target is removed and destroyed", async function () {
    const tileset = await createTileset();
    const promise = startFlight(tileset);
    widget.scene.primitives.remove(tileset);
    expect(tileset.isDestroyed()).toBe(true);
    expect(await promise).toBe(false);
    expect(widget.camera._currentFlight).toBeUndefined();
  });

  it("tracks nested ownership, including an alternate collection and removeAll", async function () {
    const first = widget.scene.primitives.add(
      new PrimitiveCollection({ destroyPrimitives: false }),
    );
    const second = widget.scene.primitives.add(
      new PrimitiveCollection({ destroyPrimitives: false }),
    );
    const tileset = await createTileset(first);
    second.add(tileset);
    try {
      const promise = startFlight(tileset);
      widget.scene.primitives.remove(first);
      expect(widget.camera._currentFlight).toBeDefined();
      expect(second.primitiveRemoved.numberOfListeners).toBe(1);
      second.removeAll();
      expect(await promise).toBe(false);
      expect(second.primitiveRemoved.numberOfListeners).toBe(0);
    } finally {
      tileset.destroy();
    }
  });

  it("detects direct destruction before update or explicit completion", async function () {
    const collection = widget.scene.primitives;
    collection.destroyPrimitives = false;
    try {
      const tileset = await createTileset();
      const promise = startFlight(tileset);
      tileset.destroy();
      widget.scene.preUpdate.raiseEvent(widget.scene);
      expect(await promise).toBe(false);
      expect(widget.camera._currentFlight).toBeUndefined();
      collection.remove(tileset);
      const another = await createTileset();
      const completion = startFlight(another);
      another.destroy();
      widget.camera.completeFlight();
      expect(await completion).toBe(false);
      collection.remove(another);
    } finally {
      collection.destroyPrimitives = true;
    }
  });

  it("settles flying operations on Widget destruction", async function () {
    const tileset = await createTileset();
    const promise = startFlight(tileset);
    const event = widget.scene.preUpdate;
    widget.destroy();
    expect(await promise).toBe(false);
    expect(event.numberOfListeners).toBe(0);
    expect(tileset.isDestroyed()).toBe(true);
  });

  it("settles pending async targets on Widget destruction and ignores late readiness", async function () {
    const tileset = await createTileset();
    let resolveTarget;
    const target = new Promise((resolve) => {
      resolveTarget = resolve;
    });
    const promise = widget.flyTo(target);
    widget.destroy();
    expect(await promise).toBe(false);
    resolveTarget(tileset);
    await Promise.resolve();
    expect(tileset.isDestroyed()).toBe(true);
  });

  it("settles flight on standalone Scene teardown", async function () {
    const canvas = document.createElement("canvas");
    container.appendChild(canvas);
    const scene = new Scene({
      canvas,
      world: new SceneGISPlanarWorld({
        coordinateSystem: new SceneGISPlanarCoordinateSystem({
          extent: new SceneGISPlanarExtent({
            minimumX: -1000,
            minimumY: -1000,
            maximumX: 1000,
            maximumY: 1000,
          }),
        }),
        maximumLevel: 0,
      }),
    });
    try {
      const tileset = await createTileset(scene.primitives);
      const host = { scene };
      const promise = framing.start(host, tileset, { duration: 1 }, true);
      framing.update(host);
      expect(scene.camera._currentFlight).toBeDefined();
      scene.destroy();
      expect(await promise).toBe(false);
      expect(host._sceneGISPlanarFramingOperation).toBeUndefined();
    } finally {
      if (!scene.isDestroyed()) {
        scene.destroy();
      }
    }
  });
});
