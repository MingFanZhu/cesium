import {
  Cartesian3,
  ClockRange,
  CzmlDataSource,
  DataSourceCollection,
  DataSourceDisplay,
  GroundPrimitive,
  JulianDate,
  PrimitiveCollection,
  ReferenceFrame,
  SampledPositionProperty,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
  _SceneGISPlanarVisualizersCallback as createVisualizers,
} from "../../../index.js";
import createScene from "../../../../../Specs/createScene.js";

describe("SceneGIS/DataSources/SceneGISPlanarCzml", function () {
  const epoch = "2026-10-20T04:00:00Z";
  const stop = "2026-10-20T04:01:00Z";
  const interval = `${epoch}/${stop}`;
  const time = JulianDate.fromIso8601(epoch);
  const at = (seconds) =>
    JulianDate.addSeconds(time, seconds, new JulianDate());
  let world;
  let planar;
  const document = () => ({ id: "document", version: "1.0" });
  const point = () => ({
    id: "vehicle",
    availability: interval,
    position: {
      epoch,
      cartesian: [0, 13000000, 4000000, 50, 60, 13000600, 4000120, 110],
      interpolationAlgorithm: "LINEAR",
      interpolationDegree: 1,
    },
    point: { pixelSize: 12, color: { rgba: [255, 200, 0, 255] } },
    path: { leadTime: 10, trailTime: 20, resolution: 5 },
  });
  function createWorld() {
    return new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: -20000000,
          minimumY: -20000000,
          maximumX: 20000000,
          maximumY: 20000000,
        }),
        crs: "OPAQUE:WORLD-METERS",
      }),
      maximumLevel: 0,
    });
  }
  beforeEach(function () {
    world = createWorld();
    planar = { world };
  });
  afterEach(function () {
    if (!world.isDestroyed()) {
      world.destroy();
    }
  });

  it("retains native sampled XYZ, availability, inferred clock and path properties", async function () {
    const source = await CzmlDataSource.load([document(), point()], { planar });
    const entity = source.entities.getById("vehicle");
    expect(entity.position instanceof SampledPositionProperty).toBe(true);
    expect(entity.position.referenceFrame).toBe(ReferenceFrame.FIXED);
    expect(entity.position.getValue(at(30))).toEqual(
      new Cartesian3(13000300, 4000060, 80),
    );
    expect(entity.isAvailable(at(-1))).toBe(false);
    expect(entity.isAvailable(at(30))).toBe(true);
    expect(entity.isAvailable(at(61))).toBe(false);
    expect(source.clock.startTime).toEqual(time);
    expect(source.clock.stopTime).toEqual(at(60));
    expect(entity.path.resolution.getValue(time)).toBe(5);
  });

  it("preserves Hermite derivatives, extrapolation and explicit document clock", async function () {
    const packets = [
      {
        ...document(),
        clock: {
          interval,
          currentTime: epoch,
          multiplier: 4,
          range: "LOOP_STOP",
        },
      },
      {
        id: "p",
        position: {
          epoch,
          referenceFrame: "FIXED",
          cartesianVelocity: [0, 0, 0, 10, 2, 0, 0, 10, 20, 0, 10, 2, 0, 0],
          interpolationAlgorithm: "HERMITE",
          interpolationDegree: 3,
          forwardExtrapolationType: "HOLD",
          forwardExtrapolationDuration: 20,
        },
      },
    ];
    const source = await CzmlDataSource.load(packets, { planar });
    const native = await CzmlDataSource.load(packets);
    const position = source.entities.getById("p").position;
    expect(position.getValue(at(5))).toEqualEpsilon(
      new Cartesian3(10, 0, 10),
      1e-10,
    );
    // Cesium's derivative HOLD branch uses the value stride without derivatives.
    // This integration preserves native behavior; it does not replace the sampler.
    expect(position.getValue(at(15))).toEqual(
      native.entities.getById("p").position.getValue(at(15)),
    );
    expect(position.getValue(at(31))).toBeUndefined();
    expect(source.clock.multiplier).toBe(4);
    expect(source.clock.clockRange).toBe(ClockRange.LOOP_STOP);
    const held = point();
    held.position.forwardExtrapolationType = "HOLD";
    held.position.forwardExtrapolationDuration = 20;
    await source.process(held);
    expect(
      source.entities.getById("vehicle").position.getValue(at(70)),
    ).toEqual(new Cartesian3(13000600, 4000120, 110));
    expect(
      source.entities.getById("vehicle").position.getValue(at(81)),
    ).toBeUndefined();
  });

  it("processes reference and interval properties without flattening time", async function () {
    const source = await CzmlDataSource.load(
      [
        document(),
        point(),
        { id: "linked", position: { reference: "vehicle#position" } },
        {
          id: "intervals",
          position: [
            { interval: `${epoch}/2026-10-20T04:00:29Z`, cartesian: [1, 2, 3] },
            { interval: `2026-10-20T04:00:30Z/${stop}`, cartesian: [4, 5, 6] },
          ],
        },
        {
          id: "line",
          polyline: {
            positions: { references: ["vehicle#position", "linked#position"] },
          },
        },
      ],
      { planar },
    );
    expect(source.entities.getById("linked").position.getValue(at(30))).toEqual(
      source.entities.getById("vehicle").position.getValue(at(30)),
    );
    expect(
      source.entities.getById("intervals").position.getValue(at(10)),
    ).toEqual(new Cartesian3(1, 2, 3));
    expect(
      source.entities.getById("intervals").position.getValue(at(40)),
    ).toEqual(new Cartesian3(4, 5, 6));
    expect(
      source.entities.getById("line").polyline.positions.getValue(at(30))
        .length,
    ).toBe(2);
  });

  it("merges samples and metadata, deletes packets and replaces on load with the same binding", async function () {
    const source = new CzmlDataSource("initial");
    const loading = jasmine.createSpy("loading");
    source.loadingEvent.addEventListener(loading);
    await source.process([document(), point()], { planar });
    const entity = source.entities.getById("vehicle");
    await source.process({
      id: "vehicle",
      name: "updated",
      properties: { cartographicDegrees: { string: "business metadata" } },
      position: { epoch, cartesian: [120, 13001200, 4000240, 170] },
    });
    expect(source.entities.getById("vehicle")).toBe(entity);
    expect(entity.position.getValue(at(90))).toEqual(
      new Cartesian3(13000900, 4000180, 140),
    );
    expect(entity.properties.cartographicDegrees.getValue(time)).toBe(
      "business metadata",
    );
    await source.process({ id: "vehicle", delete: true });
    expect(source.entities.values.length).toBe(0);
    await source.load(
      [document(), { id: "replacement", position: { cartesian: [1, 2, 3] } }],
      { planar },
    );
    expect(source.entities.values.length).toBe(1);
    expect(
      source.entities.getById("replacement").position.getValue(time),
    ).toEqual(new Cartesian3(1, 2, 3));
    expect(loading.calls.count()).toBe(8);
    expect(source.isLoading).toBe(false);
  });

  it("rejects rebinding, invalid worlds and converting an existing globe instance", async function () {
    const source = await CzmlDataSource.load([document()], { planar });
    const other = createWorld();
    expect(() =>
      source.load([document()], { planar: { world: other } }),
    ).toThrowDeveloperError();
    const globe = await CzmlDataSource.load([document()]);
    expect(() => globe.process([], { planar })).toThrowDeveloperError();
    expect(() =>
      CzmlDataSource.load([], { planar: { world: {} } }),
    ).toThrowDeveloperError();
    other.destroy();
    expect(() =>
      CzmlDataSource.load([], { planar: { world: other } }),
    ).toThrowDeveloperError();
  });

  it("rejects incompatible coordinates before replacement and preserves error/loading events", async function () {
    const source = await CzmlDataSource.load([document(), point()], { planar });
    const original = source.entities.getById("vehicle");
    const error = jasmine.createSpy("error");
    source.errorEvent.addEventListener(error);
    const invalid = [
      { position: { cartographicDegrees: [118, 32, 0] } },
      { position: [{ interval, cartographicRadians: [1, 0.5, 0] }] },
      { position: { spherical: [0, 0, 10] } },
      { position: { cartesian: [1, 2, 3], referenceFrame: "INERTIAL" } },
      { position: { cartesian: [1, 2, Infinity] } },
      { position: { epoch, cartesian: [0, 1, 2, 3, 10, 4, NaN, 6] } },
      { position: { cartesian: [1, 2] } },
      { polygon: { holes: { cartographicDegrees: [[0, 0, 0]] } } },
      { polyline: { positions: { cartographicDegrees: [0, 0, 0, 1, 1, 0] } } },
      { orientation: [{ interval, velocityReference: "vehicle#position" }] },
      { rectangle: { coordinates: { wsenDegrees: [0, 0, 1, 1] } } },
    ];
    for (const packet of invalid) {
      await expectAsync(
        source.load([document(), { id: "bad", ...packet }]),
      ).toBeRejected();
      expect(source.entities.getById("vehicle")).toBe(original);
      expect(source.isLoading).toBe(false);
    }
    expect(error.calls.count()).toBe(invalid.length);
  });

  it("revalidates the world when asynchronous input resolves", async function () {
    let resolve;
    const source = new CzmlDataSource();
    const pending = source.load(
      new Promise((r) => {
        resolve = r;
      }),
      { planar },
    );
    world.destroy();
    resolve([document(), point()]);
    await expectAsync(pending).toBeRejected();
    expect(source.entities.values.length).toBe(0);
    expect(source.isLoading).toBe(false);
  });

  it("admits only the bound world into the existing planar visualizer sequence", async function () {
    const source = await CzmlDataSource.load([document()], { planar });
    source._primitives = new PrimitiveCollection();
    const scene = {
      world,
      primitives: new PrimitiveCollection(),
      camera: { changed: { addEventListener() {} } },
      requestRender() {},
    };
    source.clustering._scene = scene;
    const visualizers = createVisualizers(world)(
      scene,
      source.clustering,
      source,
    );
    expect(visualizers[0].update(time)).toBe(false);
    expect(visualizers.length).toBe(9);
    source.clustering.enabled = true;
    expect(() => visualizers[0].update(time)).toThrowDeveloperError();
    source.clustering.enabled = false;
    const other = createWorld();
    const wrong = createVisualizers(other)(
      { ...scene, world: other },
      source.clustering,
      source,
    );
    const unbound = createVisualizers(world)(
      scene,
      source.clustering,
      new CzmlDataSource(),
    );
    expect(() => wrong[0].update(time)).toThrowDeveloperError();
    expect(() => unbound[0].update(time)).toThrowDeveloperError();
    wrong[0].destroy();
    unbound[0].destroy();
    visualizers
      .slice()
      .reverse()
      .forEach((v) => v.destroy());
    source._primitives.destroy();
    scene.primitives.destroy();
    other.destroy();
  });

  it("rejects globe display, including a source bound after being added, before child updates", async function () {
    await GroundPrimitive.initializeTerrainHeights();
    const scene = createScene();
    const collection = new DataSourceCollection();
    const update = jasmine.createSpy("child update").and.returnValue(true);
    const display = new DataSourceDisplay({
      scene,
      dataSourceCollection: collection,
      visualizersCallback: () => [{ update, destroy() {} }],
    });
    try {
      const source = new CzmlDataSource();
      await collection.add(source);
      display.update(time);
      update.calls.reset();
      await source.load([document(), point()], { planar });
      expect(() => display.update(time)).toThrowDeveloperError();
      expect(update).not.toHaveBeenCalled();
      collection.remove(source);
      expect(source._visualizers).toBeUndefined();
      expect(world.isDestroyed()).toBe(false);
    } finally {
      display.destroy();
      collection.destroy();
      scene.destroyForSpecs();
    }
  });

  it("replaces same-ID entities in every planar visualizer while process retains identity", async function () {
    const source = await CzmlDataSource.load([document()], { planar });
    source._primitives = new PrimitiveCollection();
    const scene = {
      world,
      primitives: new PrimitiveCollection(),
      camera: { changed: { addEventListener() {} } },
      requestRender() {},
    };
    source.clustering._scene = scene;
    const listeners = source.entities.collectionChanged.numberOfListeners;
    const visualizers = createVisualizers(world)(
      scene,
      source.clustering,
      source,
    );
    visualizers[0].update(time);
    const packets = () => [
      document(),
      {
        id: "all",
        position: { cartesian: [100, 100, 20] },
        point: { pixelSize: 10 },
        model: { gltf: "local-model.glb" },
        polyline: { positions: { cartesian: [0, 0, 0, 200, 200, 0] } },
        polygon: { positions: { cartesian: [0, 0, 0, 200, 0, 0, 0, 200, 0] } },
        box: { dimensions: { cartesian: [10, 10, 10] } },
        ellipse: { semiMajorAxis: 20, semiMinorAxis: 10 },
        corridor: {
          positions: { cartesian: [0, 0, 0, 200, 200, 0] },
          width: 10,
        },
        path: { leadTime: 10, trailTime: 10 },
      },
    ];
    try {
      await source.load(packets());
      const original = source.entities.getById("all");
      const items = visualizers.slice(1).map((v) => v._items.get("all"));
      expect(items.length).toBe(8);
      for (const item of items) {
        expect(item.entity).toBe(original);
      }
      await source.process({ id: "all", name: "same instance" });
      visualizers.slice(1).forEach((v, i) => {
        expect(v._items.get("all")).toBe(items[i]);
      });
      await source.load(packets());
      const replacement = source.entities.getById("all");
      expect(replacement).not.toBe(original);
      visualizers.slice(1).forEach((v, i) => {
        expect(v._items.get("all").entity).toBe(replacement);
        if (i !== 0) {
          expect(v._items.get("all")).not.toBe(items[i]);
        }
      });
      expect(items[1].live).toBe(false);
    } finally {
      visualizers
        .slice()
        .reverse()
        .forEach((v) => v.destroy());
      source._primitives.destroy();
      scene.primitives.destroy();
    }
    expect(source.entities.collectionChanged.numberOfListeners).toBe(listeners);
  });

  it("keeps default globe coordinates, INERTIAL samples and velocity orientation", async function () {
    const source = await CzmlDataSource.load([
      document(),
      { id: "geo", position: { cartographicDegrees: [118, 32, 25] } },
      {
        id: "orbit",
        position: {
          epoch,
          referenceFrame: "INERTIAL",
          cartesian: [0, 7000000, 0, 0, 60, 7000000, 1000, 0],
        },
        orientation: { velocityReference: "orbit#position" },
      },
    ]);
    expect(source.entities.getById("geo").position.getValue(time)).toEqual(
      Cartesian3.fromDegrees(118, 32, 25),
    );
    expect(source.entities.getById("orbit").position.referenceFrame).toBe(
      ReferenceFrame.INERTIAL,
    );
    expect(source.entities.getById("orbit").orientation).toBeDefined();
  });
});
