import {
  BoundingSphere,
  BoundingSphereState,
  Cartesian3,
  CesiumWidget,
  Color,
  Entity,
  EntityCollection,
  Event,
  HeadingPitchRange,
  OrthographicFrustum,
  PointGraphics,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarHeightmapTerrainData,
  SceneGISPlanarWorld,
} from "../../../index.js";
import getWebGLStub from "../../../../../Specs/getWebGLStub.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Widget/SceneGISPlanarEntityZoomCesiumWidget", function () {
  let container;
  let widget;

  function createWorld() {
    return new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: -128.0,
          minimumY: -128.0,
          maximumX: 128.0,
          maximumY: 128.0,
        }),
      }),
      maximumLevel: 0,
      baseColor: Color.BLACK,
    });
  }

  function createWidget() {
    const contextOptions = { webgl: { antialias: false } };
    if (!!window.webglStub) {
      contextOptions.getWebGLStub = getWebGLStub;
    }
    widget = new CesiumWidget(container, {
      world: createWorld(),
      useDefaultRenderLoop: false,
      requestRenderMode: true,
      contextOptions,
    });
    widget.scene.rethrowRenderErrors = true;
    return widget;
  }

  function installLocalTerrainAndImagery(world) {
    const terrainData = new SceneGISPlanarHeightmapTerrainData({
      buffer: new Float32Array([0.0, 8.0, 0.0, 8.0]),
      width: 2,
      height: 2,
    });
    world.terrainProvider = {
      tilingScheme: world.tilingScheme,
      minimumHeight: 0.0,
      maximumHeight: 8.0,
      maximumLevel: 0,
      errorEvent: new Event(),
      credit: undefined,
      getLevelMaximumGeometricError: () => 1.0,
      requestTileGeometry: () => Promise.resolve(terrainData),
      getTileDataAvailable: () => undefined,
      loadTileDataAvailability: () => undefined,
    };
    return world.imageryLayers.addImageryProvider({
      tilingScheme: world.tilingScheme,
      minimumLevel: 0,
      maximumLevel: 0,
      tileWidth: 2,
      tileHeight: 2,
      hasAlphaChannel: false,
      errorEvent: new Event(),
      credit: undefined,
      requestImage: () => {
        const canvas = document.createElement("canvas");
        canvas.width = 2;
        canvas.height = 2;
        const context = canvas.getContext("2d");
        context.fillStyle = "white";
        context.fillRect(0, 0, 2, 2);
        return Promise.resolve(canvas);
      },
    });
  }

  function installBoundingSphereStates(states) {
    return spyOn(widget.dataSourceDisplay, "getBoundingSphere").and.callFake(
      function (entity, allowPartial, result) {
        expect(allowPartial).toBe(false);
        const entry = states.get(entity);
        if (entry.state === BoundingSphereState.DONE) {
          BoundingSphere.clone(entry.sphere, result);
        }
        return entry.state;
      },
    );
  }

  async function expectRejectedExactlyOnce(promise, expectedReason) {
    let fulfilledCount = 0;
    let rejectedCount = 0;
    let actualReason;
    await promise.then(
      function () {
        fulfilledCount++;
      },
      function (reason) {
        rejectedCount++;
        actualReason = reason;
      },
    );
    await Promise.resolve();
    expect(fulfilledCount).toBe(0);
    expect(rejectedCount).toBe(1);
    expect(actualReason).toBe(expectedReason);
  }

  beforeEach(function () {
    container = document.createElement("div");
    container.style.width = "96px";
    container.style.height = "96px";
    document.body.appendChild(container);
  });

  afterEach(function () {
    if (widget && !widget.isDestroyed()) {
      widget = widget.destroy();
    }
    widget = undefined;
    document.body.removeChild(container);
  });

  it("validates direct targets and options before replacing the active operation", async function () {
    createWidget();
    const entity = new Entity({ id: "active" });
    const replacementEntity = new Entity({ id: "replacement" });
    const requestRender = spyOn(
      widget.scene,
      "requestRender",
    ).and.callThrough();
    const activePromise = widget.zoomTo(entity);
    const activeOperation = widget._sceneGISPlanarFramingOperation;
    const requestCount = requestRender.calls.count();

    expect(function () {
      widget.zoomTo({});
    }).toThrowDeveloperError();
    expect(function () {
      widget.zoomTo([entity, {}]);
    }).toThrowDeveloperError();
    expect(function () {
      widget.zoomTo(entity, new HeadingPitchRange(0.0, 0.0, -1.0));
    }).toThrowDeveloperError();
    expect(function () {
      widget.flyTo(entity, { duration: Number.NaN });
    }).toThrowDeveloperError();
    expect(function () {
      widget.zoomTo({
        entities: new EntityCollection(),
        isLoading: true,
        loadingEvent: {},
      });
    }).toThrowDeveloperError();
    expect(widget._sceneGISPlanarFramingOperation).toBe(activeOperation);
    expect(requestRender.calls.count()).toBe(requestCount);

    const collection = new EntityCollection();
    collection.add(replacementEntity);
    const replacementPromise = widget.zoomTo(collection);
    collection.add(new Entity({ id: "late" }));
    expect(await activePromise).toBe(false);
    expect(widget._sceneGISPlanarFramingOperation.entities.length).toBe(1);

    installBoundingSphereStates(
      new Map([
        [
          replacementEntity,
          {
            state: BoundingSphereState.DONE,
            sphere: new BoundingSphere(new Cartesian3(10.0, 20.0, 2.0), 4.0),
          },
        ],
      ]),
    );
    const viewBoundingSphere = spyOn(
      widget.camera,
      "viewBoundingSphere",
    ).and.stub();
    spyOn(widget.camera, "lookAtTransform").and.stub();
    widget._postRender();

    expect(await replacementPromise).toBe(true);
    expect(viewBoundingSphere).toHaveBeenCalledTimes(1);
    expect(widget._sceneGISPlanarFramingOperation).toBeUndefined();
  });

  it("supports exact Entity array Collection DataSource and Promise snapshots", async function () {
    createWidget();
    const first = new Entity({ id: "first" });
    const second = new Entity({ id: "second" });
    const collection = new EntityCollection();
    collection.add(first);
    collection.add(second);
    const dataSource = { entities: collection };
    const targets = [
      first,
      [first, second],
      collection,
      dataSource,
      Promise.resolve(first),
    ];
    const states = new Map([
      [
        first,
        {
          state: BoundingSphereState.DONE,
          sphere: new BoundingSphere(new Cartesian3(-10.0, 0.0, 4.0), 3.0),
        },
      ],
      [
        second,
        {
          state: BoundingSphereState.DONE,
          sphere: new BoundingSphere(new Cartesian3(10.0, 0.0, 4.0), 3.0),
        },
      ],
    ]);
    installBoundingSphereStates(states);
    const viewBoundingSphere = spyOn(
      widget.camera,
      "viewBoundingSphere",
    ).and.stub();
    spyOn(widget.camera, "lookAtTransform").and.stub();

    for (let i = 0; i < targets.length; ++i) {
      const promise = widget.zoomTo(targets[i]);
      await Promise.resolve();
      widget._postRender();
      expect(await promise).toBe(true);
    }
    expect(viewBoundingSphere).toHaveBeenCalledTimes(targets.length);
  });

  it("waits for all bounds and merges only DONE spheres", async function () {
    createWidget();
    const pending = new Entity({ id: "pending" });
    const failed = new Entity({ id: "failed" });
    const states = new Map([
      [pending, { state: BoundingSphereState.PENDING }],
      [failed, { state: BoundingSphereState.FAILED }],
    ]);
    installBoundingSphereStates(states);
    const viewBoundingSphere = spyOn(
      widget.camera,
      "viewBoundingSphere",
    ).and.stub();
    spyOn(widget.camera, "lookAtTransform").and.stub();
    const promise = widget.zoomTo([pending, failed]);

    widget._postRender();
    expect(viewBoundingSphere).not.toHaveBeenCalled();
    expect(widget._sceneGISPlanarFramingOperation).toBeDefined();
    states.set(pending, {
      state: BoundingSphereState.DONE,
      sphere: new BoundingSphere(new Cartesian3(8.0, 9.0, 10.0), 2.0),
    });
    widget._postRender();

    expect(await promise).toBe(true);
    expect(viewBoundingSphere).toHaveBeenCalledTimes(1);
    expect(viewBoundingSphere.calls.argsFor(0)[0]).toEqual(
      new BoundingSphere(new Cartesian3(8.0, 9.0, 10.0), 2.0),
    );
  });

  it("resolves empty and all-FAILED snapshots without moving the camera", async function () {
    createWidget();
    const viewBoundingSphere = spyOn(
      widget.camera,
      "viewBoundingSphere",
    ).and.stub();
    const emptyPromise = widget.zoomTo([]);
    widget._postRender();
    expect(await emptyPromise).toBe(false);

    const failed = new Entity({ id: "failed" });
    installBoundingSphereStates(
      new Map([[failed, { state: BoundingSphereState.FAILED }]]),
    );
    const failedPromise = widget.zoomTo(failed);
    widget._postRender();
    expect(await failedPromise).toBe(false);
    expect(viewBoundingSphere).not.toHaveBeenCalled();
  });

  it("removes loading listeners on publication replacement and destroy", async function () {
    createWidget();
    const entity = new Entity({ id: "loading" });
    const entities = new EntityCollection();
    entities.add(entity);
    const loadingEvent = new Event();
    const dataSource = { entities, isLoading: true, loadingEvent };
    const firstPromise = widget.zoomTo(dataSource);
    expect(loadingEvent.numberOfListeners).toBe(1);

    const replacementPromise = widget.zoomTo([]);
    expect(await firstPromise).toBe(false);
    expect(loadingEvent.numberOfListeners).toBe(0);
    widget._postRender();
    expect(await replacementPromise).toBe(false);

    const loadedPromise = widget.zoomTo(dataSource);
    expect(loadingEvent.numberOfListeners).toBe(1);
    dataSource.isLoading = false;
    loadingEvent.raiseEvent(dataSource, false);
    expect(loadingEvent.numberOfListeners).toBe(0);
    installBoundingSphereStates(
      new Map([
        [
          entity,
          {
            state: BoundingSphereState.DONE,
            sphere: new BoundingSphere(Cartesian3.ZERO, 1.0),
          },
        ],
      ]),
    );
    spyOn(widget.camera, "viewBoundingSphere").and.stub();
    spyOn(widget.camera, "lookAtTransform").and.stub();
    widget._postRender();
    expect(await loadedPromise).toBe(true);

    dataSource.isLoading = true;
    const destroyedPromise = widget.zoomTo(dataSource);
    expect(loadingEvent.numberOfListeners).toBe(1);
    widget = widget.destroy();
    expect(await destroyedPromise).toBe(false);
    expect(loadingEvent.numberOfListeners).toBe(0);
  });

  it("isolates Promise rejection async invalid targets and stale resolutions", async function () {
    createWidget();
    const rejection = new Error("input rejected");
    await expectAsync(
      widget.zoomTo(Promise.reject(rejection)),
    ).toBeRejectedWith(rejection);
    expect(widget._sceneGISPlanarFramingOperation).toBeUndefined();
    await expectRejectedExactlyOnce(
      widget.zoomTo(Promise.reject(undefined)),
      undefined,
    );
    expect(widget._sceneGISPlanarFramingOperation).toBeUndefined();
    await expectRejectedExactlyOnce(widget.zoomTo(Promise.reject(null)), null);
    expect(widget._sceneGISPlanarFramingOperation).toBeUndefined();
    await expectAsync(widget.zoomTo(Promise.resolve({}))).toBeRejectedWithError(
      "A planar zoom target must be an Entity, an Entity array, an EntityCollection, or a DataSource with an EntityCollection.",
    );
    expect(widget._sceneGISPlanarFramingOperation).toBeUndefined();

    let resolveStale;
    const staleTarget = new Promise((resolve) => {
      resolveStale = resolve;
    });
    const stalePromise = widget.zoomTo(staleTarget);
    const currentPromise = widget.zoomTo([]);
    expect(await stalePromise).toBe(false);
    resolveStale(new Entity({ id: "stale" }));
    await Promise.resolve();
    expect(widget._sceneGISPlanarFramingOperation.entities).toEqual([]);
    widget._postRender();
    expect(await currentPromise).toBe(false);
  });

  it("settles the current operation when trackedEntity cleanup cancels zoom", async function () {
    createWidget();
    const entity = new Entity({ id: "tracked-cleanup" });
    const promise = widget.zoomTo(entity);
    widget._trackedEntity = entity;
    widget.trackedEntity = undefined;

    expect(await promise).toBe(false);
    expect(widget._sceneGISPlanarFramingOperation).toBeUndefined();
  });

  it("isolates flight callbacks and rejects bounds or Camera failures", async function () {
    createWidget();
    const entity = new Entity({ id: "flight" });
    const replacement = new Entity({ id: "replacement" });
    const tracked = new Entity({
      id: "tracked",
      position: new Cartesian3(3.0, 4.0, 5.0),
    });
    installBoundingSphereStates(
      new Map([
        [
          entity,
          {
            state: BoundingSphereState.DONE,
            sphere: new BoundingSphere(new Cartesian3(1.0, 2.0, 3.0), 4.0),
          },
        ],
        [
          replacement,
          {
            state: BoundingSphereState.DONE,
            sphere: new BoundingSphere(new Cartesian3(5.0, 6.0, 7.0), 2.0),
          },
        ],
      ]),
    );
    const offset = new HeadingPitchRange(0.5, -0.6, 30.0);
    let flightCallbacks;
    const flightToken = {};
    spyOn(widget.camera, "flyToBoundingSphere").and.callFake(
      function (sphere, options) {
        flightCallbacks = options;
        widget.camera._currentFlight = flightToken;
      },
    );
    spyOn(widget.camera, "cancelFlight").and.callFake(function () {
      widget.camera._currentFlight = undefined;
      flightCallbacks.cancel();
    });
    widget.trackedEntity = tracked;
    let replacementPromise;
    let replacementOperation;
    let trackingChanges = 0;
    widget.trackedEntityChanged.addEventListener(function (value) {
      trackingChanges++;
      expect(value).toBeUndefined();
      replacementPromise = widget.zoomTo(replacement);
      replacementOperation = widget._sceneGISPlanarFramingOperation;
    });
    const flightPromise = widget.flyTo(entity, {
      duration: 2.0,
      maximumHeight: 80.0,
      offset,
    });
    offset.range = 999.0;
    widget._postRender();
    expect(flightCallbacks.duration).toBe(2.0);
    expect(flightCallbacks.maximumHeight).toBe(80.0);
    expect(flightCallbacks.offset.range).toBe(30.0);
    expect(widget.trackedEntity).toBeUndefined();
    expect(trackingChanges).toBe(1);
    expect(replacementPromise).toBeDefined();
    expect(widget._sceneGISPlanarFramingOperation).toBe(replacementOperation);
    expect(await flightPromise).toBe(false);
    expect(widget.camera.cancelFlight).toHaveBeenCalledTimes(1);
    flightCallbacks.complete();
    expect(widget._sceneGISPlanarFramingOperation).toBe(replacementOperation);
    expect(trackingChanges).toBe(1);
    const viewBoundingSphere = spyOn(
      widget.camera,
      "viewBoundingSphere",
    ).and.stub();
    spyOn(widget.camera, "lookAtTransform").and.stub();
    widget._postRender();
    expect(await replacementPromise).toBe(true);
    expect(viewBoundingSphere).toHaveBeenCalledTimes(1);
  });

  it("rejects a bounds candidate failure once and clears the operation", async function () {
    createWidget();
    const entity = new Entity({ id: "failure" });
    const failure = new Error("bounds failed");
    const getBoundingSphere = spyOn(
      widget.dataSourceDisplay,
      "getBoundingSphere",
    ).and.throwError(failure);
    const promise = widget.zoomTo(entity);
    widget._postRender();
    await expectAsync(promise).toBeRejectedWith(failure);
    expect(widget._sceneGISPlanarFramingOperation).toBeUndefined();
    widget._postRender();
    expect(getBoundingSphere).toHaveBeenCalledTimes(1);

    getBoundingSphere.and.callFake(function (selected, allowPartial, result) {
      BoundingSphere.clone(new BoundingSphere(Cartesian3.ZERO, 1.0), result);
      return BoundingSphereState.DONE;
    });
    const cameraFailure = new Error("camera failed");
    const viewBoundingSphere = spyOn(
      widget.camera,
      "viewBoundingSphere",
    ).and.throwError(cameraFailure);
    const cameraPromise = widget.zoomTo(entity);
    widget._postRender();
    await expectAsync(cameraPromise).toBeRejectedWith(cameraFailure);
    expect(widget._sceneGISPlanarFramingOperation).toBeUndefined();
    widget._postRender();
    expect(viewBoundingSphere).toHaveBeenCalledTimes(1);
  });

  it("preserves undefined and null throw reasons as rejected settlements", async function () {
    createWidget();
    const entity = new Entity({ id: "empty-throw-reason" });
    const getBoundingSphere = spyOn(
      widget.dataSourceDisplay,
      "getBoundingSphere",
    ).and.callFake(function () {
      throw undefined;
    });
    const undefinedPromise = widget.zoomTo(entity);
    widget._postRender();
    await expectRejectedExactlyOnce(undefinedPromise, undefined);
    expect(widget._sceneGISPlanarFramingOperation).toBeUndefined();
    widget._postRender();
    expect(getBoundingSphere).toHaveBeenCalledTimes(1);

    getBoundingSphere.and.callFake(function (selected, allowPartial, result) {
      BoundingSphere.clone(new BoundingSphere(Cartesian3.ZERO, 1.0), result);
      return BoundingSphereState.DONE;
    });
    const viewBoundingSphere = spyOn(
      widget.camera,
      "viewBoundingSphere",
    ).and.callFake(function () {
      throw null;
    });
    const nullPromise = widget.zoomTo(entity);
    widget._postRender();
    await expectRejectedExactlyOnce(nullPromise, null);
    expect(widget._sceneGISPlanarFramingOperation).toBeUndefined();
    widget._postRender();
    expect(viewBoundingSphere).toHaveBeenCalledTimes(1);
  });

  it("frames actual planar Point bounds in Perspective and Orthographic contexts", async function () {
    createWidget();
    const world = widget.scene.world;
    const imageryLayer = installLocalTerrainAndImagery(world);
    widget.resize();
    const first = widget.entities.add({
      id: "real-point",
      position: new Cartesian3(24.0, -16.0, 10.0),
      point: new PointGraphics({ pixelSize: 12.0, color: Color.RED }),
    });
    widget.camera.setView({
      destination: new Cartesian3(0.0, 0.0, 96.0),
      orientation: {
        direction: Cartesian3.negate(Cartesian3.UNIT_Z, new Cartesian3()),
        up: Cartesian3.UNIT_Y,
      },
    });
    await pollToPromise(function () {
      widget.render();
      return world.tilesLoaded && world._surface._renderCommands.length === 1;
    });
    widget.render();
    const tile = world._surface._quadtree._renderTiles[0];
    const command = world._surface._renderCommands[0];
    const shaderProgram = command.shaderProgram;
    const vertexArray = command.vertexArray;
    const mesh = tile.terrainEntry.activeContent.mesh;
    const imageryBinding = tile.imageryBindings.get(imageryLayer);
    const imageryTexture = imageryBinding.desired.texture;
    const perspectivePromise = widget.zoomTo(
      first,
      new HeadingPitchRange(0.25, -0.8, 48.0),
    );
    widget.render();
    expect(await perspectivePromise).toBe(true);
    expect(widget.camera.positionWC.x).toBeGreaterThan(0.0);

    const orthographic = new OrthographicFrustum();
    orthographic.width = 128.0;
    orthographic.aspectRatio = 1.0;
    orthographic.near = 1.0;
    orthographic.far = 1000.0;
    widget.camera.frustum = orthographic;
    const collection = new EntityCollection();
    collection.add(first);
    const cancelledPromise = widget.flyTo(first, { duration: 1.0 });
    widget.render();
    expect(widget.camera._currentFlight).toBeDefined();
    widget.camera.cancelFlight();
    expect(await cancelledPromise).toBe(false);
    const flightPromise = widget.flyTo(collection, {
      duration: 1.0,
      offset: new HeadingPitchRange(0.0, -Math.PI / 2.0, 64.0),
    });
    widget.render();
    expect(widget.camera._currentFlight).toBeDefined();
    widget.scene.tweens.update(0.0);
    widget.scene.tweens.update(0.5);
    widget.scene.tweens.update(1.0);
    expect(await flightPromise).toBe(true);
    expect(widget.camera._currentFlight).toBeUndefined();
    widget.render();
    expect(world._surface._quadtree._renderTiles[0]).toBe(tile);
    expect(world._surface._renderCommands[0]).toBe(command);
    expect(command.shaderProgram).toBe(shaderProgram);
    expect(command.vertexArray).toBe(vertexArray);
    expect(tile.terrainEntry.activeContent.mesh).toBe(mesh);
    expect(tile.imageryBindings.get(imageryLayer)).toBe(imageryBinding);
    expect(imageryBinding.desired.texture).toBe(imageryTexture);
    if (!window.webglStub) {
      expect(
        widget.scene.context.readPixels().some((value) => value !== 0),
      ).toBe(true);
    }
  });
});
