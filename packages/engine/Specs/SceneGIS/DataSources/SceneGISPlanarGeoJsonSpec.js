import {
  ArcType,
  Cartesian3,
  Cartographic,
  Color,
  GeoJsonDataSource,
  HeightReference,
  JulianDate,
  PrimitiveCollection,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
  WebMercatorProjection,
  _SceneGISPlanarVisualizersCallback as createVisualizers,
} from "../../../index.js";

describe("SceneGIS/DataSources/SceneGISPlanarGeoJson", function () {
  const time = JulianDate.fromIso8601("2026-10-20T04:00:00Z");
  const projection = new WebMercatorProjection();
  let world;
  let planar;

  function createWorld() {
    return new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: -20037508.34,
          minimumY: -20037508.34,
          maximumX: 20037508.34,
          maximumY: 20037508.34,
        }),
        crs: "OPAQUE:NOT-A-PROJECTION",
      }),
      maximumLevel: 0,
    });
  }

  function projectCoordinates(coordinates) {
    return projection.project(Cartographic.fromDegrees(...coordinates));
  }

  function feature(id, type, coordinates, properties = {}) {
    return { type: "Feature", id, properties, geometry: { type, coordinates } };
  }

  function collection(features) {
    return { type: "FeatureCollection", features };
  }

  const outer = [
    [118, 32],
    [118.1, 32],
    [118.1, 32.1],
    [118, 32.1],
    [118, 32],
  ];
  const hole = [
    [118.02, 32.02],
    [118.02, 32.04],
    [118.04, 32.04],
    [118.04, 32.02],
    [118.02, 32.02],
  ];

  beforeEach(function () {
    world = createWorld();
    planar = { world, projectCoordinates };
  });

  afterEach(function () {
    if (!world.isDestroyed()) {
      world.destroy();
    }
  });

  it("projects native geometries, holes, styles and metadata without mutating input", async function () {
    const data = collection([
      feature("point", "Point", [118, 32, 25], {
        title: "Projected point",
        code: 7,
        "marker-color": "#ff0000",
      }),
      feature(
        "line",
        "LineString",
        [
          [118, 32, 20],
          [118.1, 32.1, 30],
        ],
        {
          stroke: "#00ffff",
          "stroke-width": 4,
        },
      ),
      feature("area", "Polygon", [outer, hole], {
        fill: "#00ff00",
        "fill-opacity": 0.5,
        "stroke-opacity": 0.25,
      }),
    ]);
    const snapshot = JSON.stringify(data);
    const source = await GeoJsonDataSource.load(data, { planar });
    expect(source instanceof GeoJsonDataSource).toBe(true);
    expect(source.entities.values.length).toBe(3);
    const point = source.entities.getById("point");
    expect(point.position.getValue(time)).toEqual(
      projectCoordinates([118, 32, 25]),
    );
    expect(point.name).toBe("Projected point");
    expect(point.properties.code.getValue(time)).toBe(7);
    expect(point.billboard.image.getValue(time)).toBeDefined();
    const line = source.entities.getById("line").polyline;
    expect(line.arcType.getValue(time)).toBe(ArcType.NONE);
    expect(line.positions.getValue(time)[1]).toEqual(
      projectCoordinates([118.1, 32.1, 30]),
    );
    expect(line.material.color.getValue(time)).toEqual(Color.CYAN);
    expect(line.width.getValue(time)).toBe(4);
    const area = source.entities.getById("area").polygon;
    expect(area.arcType.getValue(time)).toBe(ArcType.NONE);
    expect(area.height.getValue(time)).toBe(0);
    expect(area.hierarchy.getValue(time).holes[0].positions[0]).toEqual(
      projectCoordinates(hole[0]),
    );
    expect(area.material.color.getValue(time)).toEqual(new Color(0, 1, 0, 0.5));
    expect(area.outlineColor.getValue(time).alpha).toBe(0.25);
    expect(JSON.stringify(data)).toBe(snapshot);
  });

  it("preserves native 2D clamp and explicit 3D altitude semantics", async function () {
    const source = await GeoJsonDataSource.load(
      collection([
        feature("p2", "Point", [118, 32]),
        feature("p3", "Point", [118, 32, 35]),
        feature("l3", "LineString", [
          [118, 32, 50],
          [118.1, 32.1, 60],
        ]),
        feature("a2", "Polygon", [outer]),
        feature("a3", "Polygon", [outer.map((c) => [...c, 45])]),
      ]),
      { planar, clampToGround: true },
    );
    expect(
      source.entities.getById("p2").billboard.heightReference.getValue(time),
    ).toBe(HeightReference.CLAMP_TO_GROUND);
    expect(
      source.entities.getById("p3").billboard.heightReference,
    ).toBeUndefined();
    expect(source.entities.getById("p3").position.getValue(time).z).toBe(35);
    expect(
      source.entities.getById("l3").polyline.clampToGround.getValue(time),
    ).toBe(true);
    expect(
      source.entities.getById("a2").polygon.heightReference.getValue(time),
    ).toBe(HeightReference.CLAMP_TO_GROUND);
    const a3 = source.entities.getById("a3").polygon;
    expect(a3.perPositionHeight.getValue(time)).toBe(true);
    expect(a3.heightReference).toBeUndefined();
    expect(a3.hierarchy.getValue(time).positions[0].z).toBe(45);
  });

  it("routes collections and multi geometries through the same projection", async function () {
    const source = await GeoJsonDataSource.load(
      collection([
        feature("points", "MultiPoint", [
          [118, 32],
          [118.1, 32.1],
        ]),
        feature("lines", "MultiLineString", [
          outer.slice(0, 2),
          hole.slice(0, 2),
        ]),
        feature("areas", "MultiPolygon", [[outer, hole], [outer]]),
        {
          type: "Feature",
          id: "collection",
          properties: {},
          geometry: {
            type: "GeometryCollection",
            geometries: [{ type: "Point", coordinates: [118.2, 32.2] }],
          },
        },
        {
          type: "Feature",
          id: "null",
          properties: { code: 9 },
          geometry: null,
        },
      ]),
      { planar },
    );
    expect(source.entities.values.length).toBe(8);
    expect(source.entities.getById("points_2").position.getValue(time)).toEqual(
      projectCoordinates([118.1, 32.1]),
    );
    expect(
      source.entities.getById("lines_2").polyline.arcType.getValue(time),
    ).toBe(ArcType.NONE);
    expect(
      source.entities.getById("areas_2").polygon.hierarchy.getValue(time).holes
        .length,
    ).toBe(0);
    expect(
      source.entities.getById("collection").position.getValue(time),
    ).toEqual(projectCoordinates([118.2, 32.2]));
    expect(source.entities.getById("null").properties.code.getValue(time)).toBe(
      9,
    );
  });

  it("copies scratch results and passes CRS metadata without global handlers", async function () {
    const scratch = new Cartesian3();
    const crs = { type: "name", properties: { name: "LOCAL:METERS" } };
    const convert = jasmine.createSpy("convert").and.callFake((c, inputCrs) => {
      expect(inputCrs).toBe(crs);
      return Cartesian3.fromElements(c[0], c[1], c[2] ?? 0, scratch);
    });
    const source = await GeoJsonDataSource.load(
      {
        type: "LineString",
        coordinates: [
          [1, 2, 3],
          [4, 5, 6],
        ],
        crs,
      },
      { planar: { world, projectCoordinates: convert } },
    );
    const positions =
      source.entities.values[0].polyline.positions.getValue(time);
    expect(positions).toEqual([
      new Cartesian3(1, 2, 3),
      new Cartesian3(4, 5, 6),
    ]);
    expect(positions[0]).not.toBe(positions[1]);
    expect(positions[1]).not.toBe(scratch);
    expect(convert).toHaveBeenCalledTimes(2);
    expect(GeoJsonDataSource.crsNames["LOCAL:METERS"]).toBeUndefined();
    await source.load({ type: "Point", coordinates: [0, 0], crs: null });
    expect(source.entities.values.length).toBe(0);
    expect(convert).toHaveBeenCalledTimes(2);
  });

  it("reuses the native TopoJSON decoder before planar projection", async function () {
    const source = await GeoJsonDataSource.load(
      {
        type: "Topology",
        transform: { scale: [0.01, 0.01], translate: [118, 32] },
        arcs: [
          [
            [0, 0],
            [10, 0],
            [0, 10],
          ],
        ],
        objects: { route: { type: "LineString", arcs: [0] } },
      },
      { planar },
    );
    expect(source.entities.values[0].polyline.positions.getValue(time)).toEqual(
      [
        projectCoordinates([118, 32]),
        projectCoordinates([118.1, 32]),
        projectCoordinates([118.1, 32.1]),
      ],
    );
  });

  it("inherits the coordinate binding for append and replacement and retains native loading events", async function () {
    const source = new GeoJsonDataSource();
    const loading = [];
    source.loadingEvent.addEventListener((dataSource, value) =>
      loading.push(value),
    );
    await source.load(feature("a", "Point", [118, 32]), { planar });
    await source.process(feature("b", "Point", [119, 33]));
    expect(source.entities.values.length).toBe(2);
    expect(source.entities.getById("b").position.getValue(time)).toEqual(
      projectCoordinates([119, 33]),
    );
    await source.load(feature("c", "Point", [120, 34]));
    expect(source.entities.values.length).toBe(1);
    expect(source.entities.getById("c").position.getValue(time)).toEqual(
      projectCoordinates([120, 34]),
    );
    expect(loading).toEqual([true, false, true, false, true, false]);
  });

  it("rejects domain changes before clearing data or entering loading", async function () {
    const data = feature("point", "Point", [118, 32]);
    const globe = await GeoJsonDataSource.load(data);
    expect(() => globe.load(data, { planar })).toThrowDeveloperError();
    const source = await GeoJsonDataSource.load(data, { planar });
    const entity = source.entities.values[0];
    const other = createWorld();
    try {
      expect(() =>
        source.process(data, {
          planar: { world: other, projectCoordinates },
        }),
      ).toThrowDeveloperError();
      expect(() =>
        source.load(data, {
          planar: { world, projectCoordinates: (c) => projectCoordinates(c) },
        }),
      ).toThrowDeveloperError();
      expect(source.isLoading).toBe(false);
      expect(source.entities.values[0]).toBe(entity);
    } finally {
      other.destroy();
    }
  });

  it("rejects invalid configuration, asynchronous or nonfinite projected positions and reports load errors", async function () {
    const data = {
      type: "LineString",
      coordinates: [
        [1, 2],
        [3, 4],
      ],
    };
    expect(() =>
      GeoJsonDataSource.load(data, { planar: { world } }),
    ).toThrowDeveloperError();
    expect(() =>
      GeoJsonDataSource.load(data, {
        planar: { world: {}, projectCoordinates },
      }),
    ).toThrowDeveloperError();
    for (const result of [
      new Cartesian3(NaN, 0, 0),
      { x: 0, y: 0, z: 0 },
      Promise.resolve(Cartesian3.ZERO),
    ]) {
      const source = new GeoJsonDataSource();
      const error = jasmine.createSpy("error");
      source.errorEvent.addEventListener(error);
      await expectAsync(
        source.load(data, {
          planar: { world, projectCoordinates: () => result },
        }),
      ).toBeRejected();
      expect(error).toHaveBeenCalledTimes(1);
      expect(source.isLoading).toBe(false);
    }
  });

  it("rejects a world destroyed while input is pending", async function () {
    let resolve;
    const data = new Promise((r) => {
      resolve = r;
    });
    const source = new GeoJsonDataSource();
    const pending = source.load(data, { planar });
    world.destroy();
    resolve({ type: "Point", coordinates: [118, 32] });
    await expectAsync(pending).toBeRejected();
    expect(source.isLoading).toBe(false);
    expect(source.entities.values.length).toBe(0);
  });

  it("admits only GeoJSON bound to the display world and retains clustering checks", async function () {
    const source = await GeoJsonDataSource.load(collection([]), { planar });
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
      new GeoJsonDataSource(),
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
    expect(world.isDestroyed()).toBe(false);
  });

  it("keeps native globe projection and rhumb defaults when planar is omitted", async function () {
    const source = await GeoJsonDataSource.load(
      collection([
        feature("p", "Point", [118, 32, 25]),
        feature("l", "LineString", [
          [118, 32],
          [119, 33],
        ]),
        feature("a", "Polygon", [outer]),
      ]),
    );
    expect(source.entities.getById("p").position.getValue(time)).toEqual(
      Cartesian3.fromDegrees(118, 32, 25),
    );
    expect(source.entities.getById("l").polyline.arcType.getValue(time)).toBe(
      ArcType.RHUMB,
    );
    expect(source.entities.getById("a").polygon.arcType.getValue(time)).toBe(
      ArcType.RHUMB,
    );
  });
});
