import {
  BoundingSphere,
  Cartesian3,
  DeveloperError,
  Event,
  Intersect,
  Matrix4,
  Model,
  PerspectiveFrustum,
  Resource,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
  SceneGISS3MLayer,
  SceneMode,
} from "../../../index.js";

describe("SceneGIS/Scene/SceneGISS3MLayer", function () {
  let world;
  let layer;
  let config;
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
      maximumLevel: 0,
    });
    config = {
      version: 1,
      lodType: "Replace",
      extensions: { "s3m:FileType": "OSGBCacheFile" },
      position: { units: "Degree", x: 119, y: 41, z: 0 },
      tiles: [
        {
          url: "./root/root.s3mb",
          boundingbox: {
            min: { x: -1, y: -1, z: -1 },
            max: { x: 1, y: 1, z: 1 },
          },
        },
      ],
    };
    spyOn(Resource.prototype, "fetchJson").and.callFake(() =>
      Promise.resolve(config),
    );
  });
  afterEach(function () {
    if (layer && !layer.isDestroyed()) {
      layer.destroy();
    }
    if (!world.isDestroyed()) {
      world.destroy();
    }
  });

  async function create(
    options = {},
    url = "https://example.invalid/data/example.scp?key=abc",
  ) {
    layer = await SceneGISS3MLayer.fromUrl(
      new Resource({ url, headers: { Authorization: "test" } }),
      {
        world,
        modelMatrix: Matrix4.IDENTITY,
        ...options,
      },
    );
    return layer;
  }

  function frame() {
    const scene = {
      world,
      isDestroyed: () => false,
      requestRender: jasmine.createSpy("requestRender"),
    };
    const frustum = new PerspectiveFrustum({
      fov: Math.PI / 3,
      aspectRatio: 1,
      near: 0.1,
      far: 10000,
    });
    return {
      camera: { _scene: scene, frustum, positionWC: new Cartesian3(0, 0, 10) },
      context: { drawingBufferWidth: 500, drawingBufferHeight: 500 },
      mode: SceneMode.SCENE3D,
      passes: { render: true },
      afterRender: [],
      cullingVolume: { computeVisibility: () => Intersect.INSIDE },
    };
  }
  function model() {
    return {
      ready: true,
      modelMatrix: Matrix4.clone(Matrix4.IDENTITY),
      errorEvent: new Event(),
      get boundingSphere() {
        return BoundingSphere.transform(
          new BoundingSphere(Cartesian3.ZERO, 1),
          this.modelMatrix,
        );
      },
      update: jasmine.createSpy("update"),
      statistics: { geometryByteLength: 10, texturesByteLength: 20 },
      isDestroyed: () => false,
      destroy: jasmine.createSpy("destroy"),
    };
  }
  function parentAndChild(rangeMode = 1, range = 1) {
    const parent = layer._roots[0];
    const parentModel = model();
    const childResource = parent.resource.getDerivedResource({
      url: "child.s3mb",
    });
    const child = {
      resource: childResource,
      localSphere: new BoundingSphere(Cartesian3.ZERO, 1),
      sphere: new BoundingSphere(Cartesian3.ZERO, 1),
      state: "loading",
      generation: 0,
      depth: 1,
      pages: [],
      lastUsed: 0,
    };
    const page = {
      model: parentModel,
      localSphere: new BoundingSphere(Cartesian3.ZERO, 1),
      sphere: new BoundingSphere(Cartesian3.ZERO, 1),
      rangeMode,
      range,
      localRange: range,
      child: childResource,
    };
    parent.pages = [page];
    parent.state = "ready";
    layer._tiles.set(childResource.url, child);
    return { parent, page, parentModel, child };
  }

  it("requires explicit planar placement before fetching and enforces World identity before requests", async function () {
    await expectAsync(
      SceneGISS3MLayer.fromUrl("a.scp", { world }),
    ).toBeRejectedWithError(DeveloperError);
    expect(Resource.prototype.fetchJson).not.toHaveBeenCalled();
    await create();
    const f = frame();
    f.camera._scene.world = undefined;
    spyOn(layer, "_request");
    expect(() => layer.update(f)).toThrowError(DeveloperError);
    expect(layer._request).not.toHaveBeenCalled();
  });

  it("exposes complete live placement and immediate bounds without publishing a pick transform", async function () {
    await create();
    const f = frame();
    const { parentModel } = parentAndChild();
    layer.update(f);
    const requested = Matrix4.fromScale(new Cartesian3(2, 3, 4));
    requested[12] = 30;
    layer.modelMatrix = requested;
    requested[12] = 90;
    expect(layer.modelMatrix[12]).toBe(30);
    expect(layer.tilesLoaded).toBe(false);
    expect(f.camera._scene.requestRender).toHaveBeenCalled();
    layer.show = false;
    expect(layer.boundingSphere.center).toEqual(new Cartesian3(30, 0, 0));
    expect(layer.boundingSphere.radius).toBeCloseTo(Math.sqrt(3) * 4, 10);
    layer.show = true;
    layer.modelMatrix[13] = 20;
    expect(layer.boundingSphere.center).toEqual(new Cartesian3(30, 20, 0));
    f.passes = { pick: true };
    layer.update(f);
    expect(parentModel.modelMatrix).toEqual(Matrix4.IDENTITY);
    f.passes = { render: true };
    layer.update(f);
    expect(parentModel.modelMatrix).toEqual(layer.modelMatrix);
    expect(layer._roots[0].sphere.center).toEqual(new Cartesian3(30, 20, 0));
    expect(layer._selected[0].model).toBe(parentModel);
    expect(parentModel.destroy).not.toHaveBeenCalled();
    // Repeated changes always recompute from local source bounds.
    layer.modelMatrix = Matrix4.IDENTITY;
    layer.update(f);
    expect(layer.boundingSphere.radius).toBeCloseTo(Math.sqrt(3), 10);
    expect(layer._roots[0].sphere.center).toEqual(Cartesian3.ZERO);
    const publishedSphere = layer._roots[0].pages[0].sphere;
    layer.update(f);
    expect(layer._roots[0].pages[0].sphere).toBe(publishedSphere);
  });

  it("rescales authored metric ranges and uses new bounds for main and observer culling", async function () {
    await create();
    const f = frame();
    const { page, parentModel, child } = parentAndChild(0, 2);
    const observer = {
      camera: f.camera,
      cullingVolume: {
        computeVisibility: (sphere) =>
          sphere.center.x > 10 ? Intersect.INSIDE : Intersect.OUTSIDE,
      },
      resolution: 128,
      sources: [layer],
      sourceStates: new Map(),
    };
    f._sceneGISViewsheds = [observer];
    f.cullingVolume = { computeVisibility: () => Intersect.OUTSIDE };
    layer.update(f);
    expect(observer.sourceStates.get(layer).selected.length).toBe(0);
    const placement = Matrix4.fromUniformScale(3);
    placement[12] = 20;
    layer.modelMatrix = placement;
    layer.update(f);
    expect(observer.sourceStates.get(layer).selected[0].model).toBe(
      parentModel,
    );
    expect(page.sphere.center.x).toBe(20);
    expect(child.sphere.center.x).toBe(20);
    expect(page.range).toBe(6);
    expect(layer._selected.length).toBe(0);
    for (const [mode, expected] of [
      [1, 2],
      [2, 8],
    ]) {
      page.rangeMode = mode;
      layer.modelMatrix = Matrix4.fromUniformScale(4);
      layer.update(f);
      expect(page.range).toBe(expected);
      layer.modelMatrix = Matrix4.IDENTITY;
      layer.update(f);
      expect(page.range).toBe(2);
    }
    expect(layer.statistics.requests).toBe(0);
  });

  it("applies the latest placement to Models completed after a transform change", async function () {
    await create();
    let resolve;
    spyOn(Model, "fromGltfAsync").and.returnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const tile = layer._roots[0];
    tile.decoded = {
      pages: [
        {
          glb: new Uint8Array(1),
          center: [0, 0, 0],
          radius: 1,
          range: 2,
          rangeMode: 0,
        },
      ],
    };
    const preparation = layer._prepareModels(tile);
    const placement = Matrix4.fromUniformScale(2);
    placement[12] = 40;
    layer.modelMatrix = placement;
    const f = frame();
    layer.update(f);
    const candidate = model();
    resolve(candidate);
    await preparation;
    // An in-place edit after promise completion must be applied on publication too.
    layer.modelMatrix[13] = 25;
    layer.update(f);
    expect(candidate.modelMatrix).toEqual(layer.modelMatrix);
    expect(tile.pages[0].sphere.center).toEqual(new Cartesian3(40, 25, 0));
    expect(tile.pages[0].sphere.radius).toBe(2);
    expect(tile.pages[0].range).toBe(4);
    expect(layer._selected[0].model).toBe(candidate);
    expect(Model.fromGltfAsync).toHaveBeenCalledTimes(1);
    expect(layer.statistics.requests).toBe(0);
    expect(candidate.destroy).not.toHaveBeenCalled();
  });

  it("rejects invalid matrix assignment and validates in-place edits before render mutation", async function () {
    await create();
    const instance = layer;
    for (const invalid of [
      undefined,
      new Matrix4(),
      Object.assign(Matrix4.clone(Matrix4.IDENTITY), { 3: 1 }),
      Object.assign(Matrix4.clone(Matrix4.IDENTITY), { 12: NaN }),
    ]) {
      expect(() => {
        instance.modelMatrix = invalid;
      }).toThrowDeveloperError();
      expect(layer.modelMatrix).toEqual(Matrix4.IDENTITY);
    }
    layer.modelMatrix[0] = NaN;
    spyOn(layer, "_advance");
    expect(() => layer.update(frame())).toThrowDeveloperError();
    expect(layer._advance).not.toHaveBeenCalled();
    expect(() => layer.boundingSphere).toThrowDeveloperError();
    expect(layer._appliedMatrix).toEqual(Matrix4.IDENTITY);
  });

  it("derives direct and iServer URLs while preserving headers and query parameters", async function () {
    await create();
    expect(layer._roots[0].resource.url).toBe(
      "https://example.invalid/data/root/root.s3mb?key=abc",
    );
    expect(layer._roots[0].resource.headers.Authorization).toBe("test");
    layer.destroy();
    await create(
      {},
      "https://example.invalid/realspace/services/a/rest/realspace/datas/b/config?key=abc",
    );
    expect(layer._roots[0].resource.url).toContain(
      "/datas/b/data/path/root/root.s3mb?key=abc",
    );
    layer.destroy();
    await create(
      {},
      "https://example.invalid/rest/realspace/datas/b/config/?key=abc",
    );
    expect(layer._roots[0].resource.url).toBe(
      "https://example.invalid/rest/realspace/datas/b/data/path/root/root.s3mb?key=abc",
    );
  });

  it("retains the parent until all child content is ready, then replays the same selection for pick", async function () {
    await create();
    const f = frame();
    const { parentModel, child } = parentAndChild();
    const childModel = model();
    const pendingModel = model();
    pendingModel.ready = false;
    child.pages = [
      { model: childModel, sphere: childModel.boundingSphere },
      { model: pendingModel, sphere: pendingModel.boundingSphere },
    ];
    child.state = "processing";
    layer.update(f);
    expect(layer._selected.map((p) => p.model)).toEqual([parentModel]);
    pendingModel.ready = true;
    layer.update(f);
    expect(layer._selected.map((p) => p.model)).toEqual([
      childModel,
      pendingModel,
    ]);
    spyOn(layer, "_select").and.callThrough();
    f.passes = { pick: true };
    layer.update(f);
    expect(layer._select).not.toHaveBeenCalled();
    expect(childModel.update).toHaveBeenCalledTimes(2);
  });

  it("honors all authored range modes and an explicit depth cap", async function () {
    await create({ maximumDepth: 0 });
    const f = frame();
    const { parentModel } = parentAndChild();
    layer.update(f);
    expect(layer._selected[0].model).toBe(parentModel);
    expect(layer.tilesLoaded).toBe(true);
    layer._maximumDepth = Infinity;
    const page = layer._roots[0].pages[0];
    for (const [mode, coarse, fine] of [
      [0, 1, 100],
      [1, 1000, 1],
      [2, 0.01, 10],
    ]) {
      page.rangeMode = mode;
      page.range = coarse;
      layer.update(f);
      expect(layer.tilesLoaded).toBe(true);
      page.range = fine;
      layer.update(f);
      expect(layer.tilesLoaded).toBe(false);
    }
  });

  it("retains coverage after a failed child and reports it once", async function () {
    await create();
    const { parentModel, child } = parentAndChild();
    child.failure = new Error("broken content");
    const listener = jasmine.createSpy("tileFailed");
    layer.tileFailed.addEventListener(listener);
    const f = frame();
    layer.update(f);
    layer.update(f);
    expect(layer._selected[0].model).toBe(parentModel);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(layer.statistics.failedTiles).toBe(1);
  });

  it("discards a late fetch after destroy without starting a Worker or destroying the World", async function () {
    await create();
    let resolve;
    spyOn(Resource.prototype, "fetchArrayBuffer").and.returnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    layer._request(layer._roots[0]);
    layer.destroy();
    resolve(new ArrayBuffer(16));
    await Promise.resolve();
    await Promise.resolve();
    expect(layer.isDestroyed()).toBe(true);
    expect(layer._worker).toBeUndefined();
    expect(world.isDestroyed()).toBe(false);
  });

  it("destroys a late native Model after layer disposal", async function () {
    await create();
    let resolve;
    spyOn(Model, "fromGltfAsync").and.returnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const tile = layer._roots[0];
    tile.decoded = {
      pages: [
        {
          glb: new Uint8Array(1),
          center: [0, 0, 0],
          radius: 1,
          rangeMode: 1,
          range: 0,
        },
      ],
    };
    const preparation = layer._prepareModels(tile);
    layer.destroy();
    const candidate = model();
    resolve(candidate);
    await preparation;
    expect(candidate.destroy).toHaveBeenCalledTimes(1);
  });

  it("keeps authored pixel ranges in framebuffer pixels and geometric error in logical pixels", async function () {
    await create();
    const f = frame();
    f.pixelRatio = 2;
    const { page } = parentAndChild(1, 30);
    // At 9 metres from a radius-one sphere: about 48 framebuffer pixels, 24 logical.
    layer.update(f);
    expect(layer.tilesLoaded).toBe(false);
    page.rangeMode = 2;
    page.range = 1;
    layer.maximumScreenSpaceError = 30;
    layer.update(f);
    expect(layer.tilesLoaded).toBe(true);
  });

  it("protects offscreen observer LOD without replacing main selection or readiness", async function () {
    await create({ maximumCachedTiles: 1 });
    const f = frame();
    const { parent, child, parentModel } = parentAndChild();
    const observer = {
      camera: f.camera,
      cullingVolume: f.cullingVolume,
      resolution: 128,
      sources: [layer],
      sourceStates: new Map(),
    };
    f.cullingVolume = { computeVisibility: () => Intersect.OUTSIDE };
    f._sceneGISViewsheds = [observer];
    layer.update(f);
    const selection = observer.sourceStates.get(layer);
    expect(selection.ready).toBe(false);
    expect(selection.selected[0].model).toBe(parentModel);
    expect(layer._protected.has(parent)).toBe(true);
    expect(layer._protected.has(child)).toBe(true);
    expect(layer.tilesLoaded).toBe(true);
    expect(layer._selected.length).toBe(0);
    const childModel = model();
    child.pages = [{ model: childModel, sphere: childModel.boundingSphere }];
    child.state = "ready";
    layer.update(f);
    expect(selection.ready).toBe(true);
    expect(selection.selected[0].model).toBe(childModel);
    expect(childModel.destroy).not.toHaveBeenCalled();
    child.state = "failed";
    layer.update(f);
    expect(selection.ready).toBe(false);
    expect(selection.error.message).toContain("S3M observer content failed");
    expect(layer.tilesLoaded).toBe(true);
    child.state = "ready";
    f._sceneGISViewsheds = [];
    layer.update(f);
    expect(layer.statistics.cachedTiles).toBe(1);
  });
});
