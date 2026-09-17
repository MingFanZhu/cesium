import {
  Cartesian2,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  PerInstanceColorAppearance,
  OrthographicFrustum,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
  SceneGISPlanarPrimitive,
  SceneGISPlanarPolygonGeometry,
  SceneGISVectorTileLayer,
  SceneGISVectorTileSource,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISVectorTileStyles", function () {
  let scene;
  let source;
  let layer;
  beforeEach(function () {
    scene = createScene({ canvas: createCanvas(128, 128) });
    scene.frameState.scene3DOnly = true;
    const world = new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        crs: "local-metres",
        extent: new SceneGISPlanarExtent({
          minimumX: -2048,
          minimumY: -2048,
          maximumX: 2048,
          maximumY: 2048,
        }),
      }),
      maximumLevel: 0,
      baseColor: Color.BLACK,
    });
    scene._initializeWorld(world);
    scene.msaaSamples = 1;
    scene.postProcessStages.fxaa.enabled = false;
    scene.camera.position = new Cartesian3(0, 0, 1000);
    scene.camera.direction = new Cartesian3(0, 0, -1);
    scene.camera.up = new Cartesian3(0, 1, 0);
    scene.camera.right = new Cartesian3(1, 0, 0);
    scene.camera.frustum = new OrthographicFrustum({
      width: 128,
      aspectRatio: 1,
      near: 1,
      far: 2000,
    });
    source = new SceneGISVectorTileSource({
      url: "https://example.invalid/{z}/{x}/{y}",
      tilingScheme: world.tilingScheme,
      maximumLevel: 0,
    });
  });
  afterEach(function () {
    scene.destroyForSpecs();
  });
  function feature(id, points, type = 2, properties = {}) {
    return {
      id,
      type,
      properties,
      geometry: {
        parts: points.map(
          (part) =>
            new Float64Array(part.flatMap(([x, y]) => [2048 + x, 2048 - y])),
        ),
        polygonStarts: type === 3 ? new Uint32Array([0]) : new Uint32Array(),
      },
    };
  }
  function definition(type, paint, layout = {}) {
    return {
      id: "style",
      type,
      source: "test",
      "source-layer": "data",
      paint,
      layout,
    };
  }
  async function draw(features, definition) {
    if (layer !== undefined) {
      scene.primitives.remove(layer);
    }
    const decoded = {
      layers: [{ name: "data", version: 2, extent: 4096, features }],
    };
    source.requestTile = () => Promise.resolve(decoded);
    layer = scene.primitives.add(
      new SceneGISVectorTileLayer({
        scene,
        sources: { test: source },
        style: {
          version: 8,
          sources: { test: { type: "vector", tiles: ["/{z}/{x}/{y}"] } },
          layers: [definition],
        },
      }),
    );
    await pollToPromise(() => {
      scene.renderForSpecs();
      return layer.ready && layer.tilesLoaded;
    });
    expect(layer.statistics.failedTiles).toBe(0);
  }
  function sample(x, y) {
    scene.renderForSpecs();
    const color = Array.from(
      scene.context.readPixels({ x: 64 + x, y: 64 + y, width: 1, height: 1 }),
    );
    const pick = scene.pick(new Cartesian2(64 + x + 0.5, 64 - y - 0.5), 1, 1);
    return {
      color,
      id: pick?.primitive === layer ? pick.id.featureId : undefined,
    };
  }

  it("distinguishes butt, square and round caps with analytic coverage and matching picks", async function () {
    const data = [
      feature("road", [
        [
          [-20, 0],
          [20, 0],
        ],
      ]),
    ];
    for (const cap of ["butt", "square", "round"]) {
      await draw(
        data,
        definition(
          "line",
          { "line-color": "#ff0000", "line-width": 12 },
          { "line-cap": cap },
        ),
      );
      expect(sample(0, 0).color[0]).toBe(255);
      expect(sample(24, 0).id).toBe(cap === "butt" ? undefined : "road");
      const corner = sample(24, 4);
      if (cap === "square") {
        expect(corner.color[0]).toBe(255);
      } else {
        expect(corner.color[0]).toBeLessThan(100);
      }
      expect(sample(30, 0).id).toBeUndefined();
      const edge = sample(0, 5).color[0];
      expect(edge).toBeGreaterThan(0);
    }
  });

  it("distinguishes miter, bevel and round joins without double alpha at an ordinary corner", async function () {
    const data = [
      feature("bend", [
        [
          [-35, 0],
          [0, 0],
          [0, 35],
        ],
      ]),
    ];
    for (const join of ["miter", "bevel", "round"]) {
      await draw(
        data,
        definition(
          "line",
          {
            "line-color": "#ff0000",
            "line-width": 20,
            "line-opacity": 0.5,
          },
          { "line-join": join },
        ),
      );
      expect(sample(-3, 3).color[0]).toEqualEpsilon(128, 1);
      if (join === "miter") {
        expect(sample(8, -9).color[0]).toEqualEpsilon(128, 1);
      } else {
        expect(sample(8, -9).color[0]).toBeLessThan(30);
      }
      if (join === "round") {
        expect(sample(6, -7).color[0]).toEqualEpsilon(128, 3);
      }
      if (join === "bevel") {
        expect(sample(6, -7).color[0]).toBeLessThan(30);
      }
    }
  });

  it("batches different dash arrays, discards gaps for picking, and retains the numeric texture on warm frames", async function () {
    await draw(
      [
        feature(
          "short",
          [
            [
              [-48, 20],
              [48, 20],
            ],
          ],
          2,
          { long: false },
        ),
        feature(
          "long",
          [
            [
              [-48, -20],
              [48, -20],
            ],
          ],
          2,
          { long: true },
        ),
      ],
      definition("line", {
        "line-color": "#ff0000",
        "line-width": 6,
        "line-dasharray": [
          "case",
          ["get", "long"],
          ["literal", [4, 2]],
          ["literal", [2, 2]],
        ],
      }),
    );
    expect(sample(-43, 20).id).toBe("short");
    expect(sample(-30, 20).id).toBeUndefined();
    expect(sample(-30, -20).id).toBe("long");
    expect(sample(-20, -20).id).toBeUndefined();
    expect(layer.statistics.drawCommands).toBe(1);
    const resources = layer._drawOrder[0]._resources;
    const texture = resources._dashTexture;
    const uploads = layer.statistics.uploads;
    expect(texture).toBeDefined();
    for (let i = 0; i < 3; i++) {
      scene.renderForSpecs();
    }
    sample(-43, 20);
    expect(resources._dashTexture).toBe(texture);
    expect(layer.statistics.uploads).toBe(uploads);
    scene.primitives.remove(layer);
    layer = undefined;
    expect(texture.isDestroyed()).toBeTrue();
  });

  it("renders zero-length round dashes as dots and gap-width as two offset rails", async function () {
    const data = [
      feature("road", [
        [
          [-48, 0],
          [48, 0],
        ],
      ]),
    ];
    await draw(
      data,
      definition(
        "line",
        {
          "line-color": "#ff0000",
          "line-width": 8,
          "line-dasharray": [0, 3],
        },
        { "line-cap": "round" },
      ),
    );
    expect(sample(-24, 0).id).toBe("road");
    expect(sample(-12, 0).id).toBeUndefined();
    await draw(
      data,
      definition("line", {
        "line-color": "#ff0000",
        "line-width": 6,
        "line-gap-width": 8,
        "line-offset": 10,
      }),
    );
    expect(sample(0, 0).color[0]).toBeLessThan(150);
    expect(sample(0, -10).id).toBeUndefined();
    expect(sample(0, -17).id).toBe("road");
    expect(sample(0, -3).id).toBe("road");
    expect(sample(0, -23).id).toBeUndefined();
  });

  it("keeps a round dash centered on a bend continuous through the join", async function () {
    await draw(
      [
        feature("dot", [
          [
            [-40, 0],
            [0, 0],
            [0, 40],
          ],
        ]),
      ],
      definition(
        "line",
        {
          "line-color": "#ff0000",
          "line-width": 8,
          "line-dasharray": [0, 5],
        },
        { "line-cap": "round", "line-join": "round" },
      ),
    );
    for (const [x, y] of [
      [1, 1],
      [-2, 1],
      [1, -2],
      [-2, -2],
    ]) {
      expect(sample(x, y).color[0]).toBeGreaterThan(220);
      expect(sample(x, y).id).toBe("dot");
    }
  });

  it("scales line width with DPR and changes reference scale without uploading constant paint", async function () {
    await draw(
      [
        feature("road", [
          [
            [-48, 0],
            [48, 0],
          ],
        ]),
      ],
      definition("line", {
        "line-color": "#ff0000",
        "line-width": 8,
      }),
    );
    expect(sample(0, 6).id).toBeUndefined();
    const resources = layer._drawOrder[0]._resources;
    const uploads = layer.statistics.uploads;
    scene.pixelRatio = 2;
    expect(sample(0, 6).id).toBe("road");
    expect(sample(0, 10).id).toBeUndefined();
    scene.camera.frustum.width = 256;
    scene.renderForSpecs();
    expect(layer._drawOrder[0]._resources).toBe(resources);
    expect(layer.statistics.uploads).toBe(uploads);
  });

  it("softens line and circle edges without changing their opaque colors", async function () {
    const line = [
      feature("road", [
        [
          [-48, 0],
          [48, 0],
        ],
      ]),
    ];
    await draw(
      line,
      definition("line", { "line-color": "#ff0000", "line-width": 16 }),
    );
    const hard = sample(0, 6).color[0];
    await draw(
      line,
      definition("line", {
        "line-color": "#ff0000",
        "line-width": 16,
        "line-blur": 4,
      }),
    );
    expect(sample(0, 6).color[0]).toBeLessThan(hard);
    expect(sample(0, 0).color[0]).toBe(255);
    await draw(
      [feature("point", [[[0, 0]]], 1)],
      definition("circle", {
        "circle-radius": 20,
        "circle-color": "#ff0000",
        "circle-blur": 0.6,
      }),
    );
    expect(sample(0, 0).color[0]).toBe(255);
    expect(sample(14, 0).color[0]).toBeGreaterThan(0);
    expect(sample(14, 0).color[0]).toBeLessThan(255);
    expect(sample(24, 0).id).toBeUndefined();
  });

  it("keeps foreground geometry above map color across frustum boundaries", async function () {
    await draw(
      [
        feature(
          "map",
          [
            [
              [-40, -40],
              [40, -40],
              [40, 40],
              [-40, 40],
            ],
          ],
          3,
        ),
      ],
      definition("fill", { "fill-color": "#ff0000", "fill-opacity": 0.5 }),
    );
    scene.camera.position.z = 1100;
    const front = scene.primitives.add(
      new SceneGISPlanarPrimitive({
        geometry: new SceneGISPlanarPolygonGeometry({
          positions: [
            new Cartesian3(-10, -10, 200),
            new Cartesian3(10, -10, 200),
            new Cartesian3(10, 10, 200),
            new Cartesian3(-10, 10, 200),
          ],
        }),
        appearance: new PerInstanceColorAppearance({
          flat: true,
          translucent: false,
        }),
        id: "foreground",
        attributes: {
          color: ColorGeometryInstanceAttribute.fromColor(Color.BLUE),
        },
      }),
    );
    await pollToPromise(() => {
      scene.renderForSpecs();
      return front.ready;
    });
    expect(sample(0, 0).color).toEqual([0, 0, 255, 255]);
    expect(sample(20, 0).color[0]).toEqualEpsilon(128, 1);
    const picked = scene.pick(new Cartesian2(64.5, 63.5), 1, 1);
    expect(picked.id).toBe("foreground");
  });

  it("adds an exterior fill fringe, preserves feature order, and disables the fringe with antialias false", async function () {
    const area = feature(
      "red",
      [
        [
          [-20, -20],
          [20, -20],
          [20, 20],
          [-20, 20],
        ],
      ],
      3,
    );
    const paint = { "fill-color": "#ff0000", "fill-opacity": 0.5 };
    await draw([area], definition("fill", paint));
    expect(sample(0, 0).color[0]).toEqualEpsilon(128, 1);
    expect(scene.frameState.frustumSplits.length).toBeGreaterThan(2);
    scene.camera.position.z = 1100;
    expect(sample(0, 0).color[0]).toEqualEpsilon(128, 1);
    expect(sample(-21, 0).color[0]).toBeGreaterThan(0);
    expect(sample(-21, 0).color[0]).toBeLessThan(128);
    expect(sample(-21, 0).id).toBe("red");
    await draw(
      [area],
      definition("fill", { ...paint, "fill-antialias": false }),
    );
    expect(sample(-21, 0).id).toBeUndefined();
    expect(sample(0, 0).color[0]).toEqualEpsilon(128, 1);
    const blue = feature(
      "blue",
      [
        [
          [-30, -30],
          [30, -30],
          [30, 30],
          [-30, 30],
        ],
      ],
      3,
    );
    area.properties.color = "#ff0000";
    blue.properties.color = "#0000ff";
    await draw(
      [area, blue],
      definition("fill", { "fill-color": ["get", "color"] }),
    );
    expect(sample(-21, 0).color).toEqual([0, 0, 255, 255]);
    expect(sample(-21, 0).id).toBe("blue");
    expect(layer.statistics.drawCommands).toBe(1);
  });
});
