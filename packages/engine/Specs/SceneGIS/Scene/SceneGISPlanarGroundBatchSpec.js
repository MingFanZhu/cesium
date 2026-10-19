import {
  BoundingSphere,
  Cartesian2,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  Event,
  Material,
  Matrix4,
  PerInstanceColorAppearance,
  PolylineColorAppearance,
  PolylineMaterialAppearance,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarGroundPrimitive,
  SceneGISPlanarHeightmapTerrainData,
  SceneGISPlanarPolygonGeometry,
  SceneGISPlanarPolylineGeometry,
  SceneGISPlanarWorld,
  SceneTransforms,
  ShowGeometryInstanceAttribute,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISPlanarGroundBatch", function () {
  const center = 20000000;
  let scene;
  let world;
  beforeEach(function () {
    scene = createScene({ canvas: createCanvas(128, 128) });
    world = new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: center - 100,
          minimumY: center - 100,
          maximumX: center + 100,
          maximumY: center + 100,
        }),
      }),
      maximumLevel: 0,
      baseColor: Color.BLACK,
    });
    scene._initializeWorld(world);
    scene.frameState.scene3DOnly = true;
    view(0, 0);
  });
  afterEach(function () {
    scene.destroyForSpecs();
  });

  function view(x, y, tilted = false) {
    scene.camera.setView({
      destination: new Cartesian3(
        center + x,
        center + y - (tilted ? 8 : 0),
        tilted ? 6 : 8,
      ),
      orientation: {
        direction: new Cartesian3(0, tilted ? 0.8 : 0, tilted ? -0.6 : -1),
        up: new Cartesian3(0, tilted ? 0.6 : 1, tilted ? 0.8 : 0),
      },
    });
    scene.camera.frustum.near = 0.01;
    scene.camera.frustum.far = 100;
  }
  function attributes(color) {
    return {
      color: ColorGeometryInstanceAttribute.fromColor(color),
      show: new ShowGeometryInstanceAttribute(true),
    };
  }
  function ring(x, y, size) {
    return [
      new Cartesian3(center + x - size, center + y - size, 30),
      new Cartesian3(center + x + size, center + y - size, 50),
      new Cartesian3(center + x + size, center + y + size, 10),
      new Cartesian3(center + x - size, center + y + size, 40),
    ];
  }
  function polygon(id, x = 0, color = Color.RED, holes) {
    return {
      id,
      geometry: new SceneGISPlanarPolygonGeometry({
        positions: ring(x, 0, 2),
        holes,
      }),
      attributes: attributes(color),
    };
  }
  function line(id, positions, width = 8, color = Color.RED) {
    return {
      id,
      geometry: new SceneGISPlanarPolylineGeometry({
        positions: positions.map(
          ([x, y]) => new Cartesian3(center + x, center + y, 40),
        ),
        width,
      }),
      attributes: attributes(color),
    };
  }
  function add(
    instances,
    appearance = new PerInstanceColorAppearance({ flat: true }),
  ) {
    return scene.primitives.add(
      new SceneGISPlanarGroundPrimitive({
        world,
        geometryInstances: instances,
        appearance,
      }),
    );
  }
  function render() {
    scene.renderForSpecs();
    return Array.from(
      scene.context.readPixels({ x: 64, y: 64, width: 1, height: 1 }),
    );
  }
  function pick() {
    return scene.pick(new Cartesian2(64, 64));
  }
  function baseline(instances, appearance) {
    const primitives = instances.map((instance) =>
      scene.primitives.add(
        new SceneGISPlanarGroundPrimitive({
          world,
          ...instance,
          appearance:
            appearance ?? new PerInstanceColorAppearance({ flat: true }),
        }),
      ),
    );
    const pixel = render();
    for (const primitive of primitives) {
      scene.primitives.remove(primitive);
    }
    return pixel;
  }

  it("matches ordered overlapping colors and preserves per-instance pick, show, and updates", function () {
    const a = { business: "a" };
    const b = { business: "b" };
    const instances = [polygon(a), polygon(b, 1, Color.BLUE)];
    view(0.5, 0, true);
    const expected = baseline(instances);
    const primitive = add(instances);
    expect(render()).toEqual(expected);
    expect(pick()).toEqual({ primitive, id: b });
    const internal = primitive._current;
    const va = internal._va[0];
    expect(internal._va.length).toBe(1);
    expect(primitive._currentCommands.colorCommands.length).toBe(2);
    primitive.getGeometryInstanceAttributes(b).show = new Uint8Array([0]);
    expect(render()[0]).toBeGreaterThan(render()[2]);
    expect(pick()).toEqual({ primitive, id: a });
    primitive.getGeometryInstanceAttributes(a).color =
      ColorGeometryInstanceAttribute.toValue(Color.CYAN);
    const cyan = render();
    expect(cyan[1]).toBeGreaterThan(cyan[0]);
    expect(primitive._current).toBe(internal);
    expect(internal._va[0]).toBe(va);
    expect(primitive.getBoundingSphere(new BoundingSphere(), b).center.x).toBe(
      center + 1,
    );
    expect(() =>
      primitive.getGeometryInstanceAttributes(),
    ).toThrowDeveloperError();
    expect(primitive.getGeometryInstanceAttributes("missing")).toBeUndefined();
    expect(() =>
      primitive.getBoundingSphere(new BoundingSphere(), "missing"),
    ).toThrowDeveloperError();
    const destroy = spyOn(internal, "destroy").and.callThrough();
    scene.primitives.remove(primitive);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(va.isDestroyed()).toBeTrue();
  });

  it("keeps holes unclassified and matches translucent overlap", function () {
    const hole = polygon(1, 0, Color.RED, [ring(0, 0, 0.75).reverse()]);
    const outside = polygon(2, 8, Color.BLUE);
    const expectedHole = baseline([hole, outside]);
    const holed = add([hole, outside]);
    expect(render()).toEqual(expectedHole);
    expect(pick()?.primitive).not.toBe(holed);
    view(1.5, 0, true);
    render();
    expect(pick()).toEqual({ primitive: holed, id: 1 });
    scene.primitives.remove(holed);
    view(0, 0);
    const instances = [
      polygon(1, 0, Color.RED.withAlpha(0.5)),
      polygon(2, 0, Color.BLUE.withAlpha(0.5)),
    ];
    const expected = baseline(instances);
    const primitive = add(instances);
    expect(render()).toEqual(expected);
    expect(primitive._currentCommands.colorCommands.length).toBe(2);
  });

  it("bounds same-color area runs by the stencil counter capacity and replans only after mutation", function () {
    const instances = Array.from({ length: 32 }, (_, i) => polygon(i));
    const primitive = add(instances);
    const pixel = render();
    expect(pixel[0]).toBeGreaterThan(pixel[2]);
    expect(primitive._currentCommands.colorCommands.length).toBe(3);
    expect(pick()).toEqual({ primitive, id: 31 });
    expect(primitive._currentCommands.pickColorCommands.length).toBe(32);
    const command = primitive._currentCommands.colorCommands[0];
    const read = spyOn(
      primitive._current,
      "getGeometryInstanceAttributes",
    ).and.callThrough();
    for (let i = 0; i < 5; i++) {
      render();
    }
    expect(read).not.toHaveBeenCalled();
    expect(primitive._currentCommands.colorCommands[0]).toBe(command);
    primitive.getGeometryInstanceAttributes(31).color =
      ColorGeometryInstanceAttribute.toValue(Color.BLUE);
    const blue = render();
    expect(blue[2]).toBeGreaterThan(blue[0]);
    expect(primitive._currentCommands.colorCommands.length).toBe(4);
    expect(primitive._current._va.length).toBe(1);
  });

  it("renders and picks 1024 disjoint colored areas in one stencil/fill pair", function () {
    const instances = Array.from({ length: 1024 }, (_, id) => ({
      id,
      geometry: new SceneGISPlanarPolygonGeometry({
        positions: ring(
          ((id % 32) - 16) * 5,
          (Math.floor(id / 32) - 16) * 5,
          1.5,
        ),
      }),
      attributes: attributes(
        (id % 2 === 0 ? Color.RED : Color.BLUE).withAlpha(0.5),
      ),
    }));
    const expected = baseline([instances[528]]);
    const primitive = add(instances);
    expect(render()).toEqual(expected);
    expect(pick()).toEqual({ primitive, id: 528 });
    const commands = primitive._currentCommands;
    expect(commands.colorCommands.length).toBe(1);
    expect(commands.stencilCommands.length).toBe(1);
    expect(commands.pickColorCommands.length).toBe(1);
    expect(commands.pickStencilCommands.length).toBe(1);
    const current = primitive._current;
    const va = current._va[0];
    const command = commands.colorCommands[0];
    expect(current._va.length).toBe(1);
    primitive.getGeometryInstanceAttributes(528).color =
      ColorGeometryInstanceAttribute.toValue(Color.CYAN);
    expect(render()[1]).toBeGreaterThan(100);
    primitive.getGeometryInstanceAttributes(528).show = new Uint8Array([0]);
    expect(render().slice(0, 3)).toEqual([0, 0, 0]);
    expect(pick()?.primitive).not.toBe(primitive);
    view(5, 0, true);
    expect(render()[2]).toBeGreaterThan(100);
    expect(pick()).toEqual({ primitive, id: 529 });
    expect(primitive._current).toBe(current);
    expect(current._va[0]).toBe(va);
    expect(commands.colorCommands[0]).toBe(command);
    expect(commands.colorCommands.length).toBe(1);
    scene.primitives.remove(primitive);
    expect(va.isDestroyed()).toBeTrue();
  });

  it("batches 512 nonconsecutive two-layer stacks and retains ID updates across rebuilding", function () {
    const instances = Array.from({ length: 1024 }, (_, id) => {
      const cell = Math.floor(id / 2);
      return {
        id,
        geometry: new SceneGISPlanarPolygonGeometry({
          positions: ring(
            ((cell % 32) - 16) * 5 + (id % 2) * 0.5,
            (Math.floor(cell / 32) - 8) * 5,
            1.5,
          ),
        }),
        attributes: attributes(
          (id % 2 === 0 ? Color.RED : Color.BLUE).withAlpha(0.5),
        ),
      };
    });
    view(0, 0, true);
    const expected = baseline([instances[544], instances[545]]);
    const primitive = add(instances);
    expect(render()).toEqual(expected);
    expect(pick()).toEqual({ primitive, id: 545 });
    const commands = primitive._currentCommands;
    expect(commands.colorCommands.length).toBe(2);
    expect(commands.stencilCommands.length).toBe(2);
    expect(commands.pickColorCommands.length).toBe(2);
    expect(commands.pickStencilCommands.length).toBe(2);
    const current = primitive._current;
    const va = current._va[0];
    const command = commands.colorCommands[0];
    expect(current._va.length).toBe(1);
    expect(current.geometryInstances).toBeUndefined();
    expect(instances.map((instance) => instance.id)).toEqual(
      Array.from({ length: 1024 }, (_, id) => id),
    );
    primitive.getGeometryInstanceAttributes(545).show = new Uint8Array([0]);
    expect(render()[0]).toBeGreaterThan(render()[2]);
    expect(pick()).toEqual({ primitive, id: 544 });
    primitive.getGeometryInstanceAttributes(544).color =
      ColorGeometryInstanceAttribute.toValue(Color.CYAN);
    const changed = render();
    expect(changed[1]).toBeGreaterThan(200);
    view(5, 0, true);
    expect(render()).toEqual(expected);
    expect(pick()).toEqual({ primitive, id: 547 });
    expect(primitive._current).toBe(current);
    expect(current._va[0]).toBe(va);
    expect(commands.colorCommands[0]).toBe(command);
    expect(commands.colorCommands.length).toBe(2);
    primitive.appearance = new PerInstanceColorAppearance({ flat: true });
    view(0, 0, true);
    expect(render()).toEqual(changed);
    expect(pick()).toEqual({ primitive, id: 544 });
    expect(current.isDestroyed()).toBeTrue();
    expect(va.isDestroyed()).toBeTrue();
  });

  it("preserves transitive overlap order when a later area is disjoint from the first", function () {
    const instances = [
      polygon("a", -3, Color.RED.withAlpha(0.5)),
      polygon("b", 0, Color.GREEN),
      polygon("c", 3, Color.BLUE.withAlpha(0.5)),
      polygon("d", 9, Color.CYAN.withAlpha(0.5)),
    ];
    const samples = [-1.5, 1.5, 9];
    const expected = samples.map((x) => {
      view(x, 0, true);
      return baseline(instances);
    });
    const primitive = add(instances);
    for (let i = 0; i < samples.length; i++) {
      view(samples[i], 0, true);
      expect(render()).toEqual(expected[i]);
      expect(pick()).toEqual({ primitive, id: ["b", "c", "d"][i] });
    }
    expect(primitive._currentCommands.colorCommands.length).toBe(3);
    expect(primitive._currentCommands.pickColorCommands.length).toBe(3);
  });

  it("retains larger predecessors when only part of their extent is covered", function () {
    const instances = [
      {
        ...polygon("large", 0, Color.RED.withAlpha(0.5)),
        geometry: new SceneGISPlanarPolygonGeometry({
          positions: ring(0, 0, 4),
        }),
      },
      polygon("left", -3, Color.BLUE.withAlpha(0.5)),
      polygon("right", 3, Color.CYAN.withAlpha(0.5)),
      polygon("disjoint", 10, Color.GREEN),
    ];
    view(3, 0, true);
    const expected = baseline(instances);
    const primitive = add(instances);
    expect(render()).toEqual(expected);
    expect(pick()).toEqual({ primitive, id: "right" });
    expect(primitive._currentCommands.colorCommands.length).toBe(2);
    expect(primitive._currentCommands.pickColorCommands.length).toBe(2);
  });

  it("keeps projected volumes isolated through low views and linear/log depth on sloped terrain", async function () {
    const instances = [
      polygon(1),
      {
        ...polygon(2, 0, Color.BLUE),
        geometry: new SceneGISPlanarPolygonGeometry({
          positions: ring(0, 6, 2),
        }),
      },
    ];
    const primitive = add(instances);
    render();
    const va = primitive._current._va[0];
    const data = new SceneGISPlanarHeightmapTerrainData({
      buffer: new Float32Array([-20, 20, -20, 20]),
      width: 2,
      height: 2,
    });
    world.terrainProvider = {
      tilingScheme: world.tilingScheme,
      minimumHeight: -80,
      maximumHeight: 80,
      maximumLevel: 0,
      errorEvent: new Event(),
      getLevelMaximumGeometricError: () => 1,
      requestTileGeometry: () => Promise.resolve(data),
      getTileDataAvailable: () => true,
      loadTileDataAvailability: () => undefined,
    };
    await pollToPromise(() => {
      render();
      return (
        world.getTerrainHeight(new Cartesian3(center, center, 0)) !== undefined
      );
    });
    for (const logarithmic of [false, true]) {
      scene.logarithmicDepthBuffer = logarithmic;
      for (const degrees of [85, 45, 10]) {
        const angle = (degrees * Math.PI) / 180;
        const s = Math.sin(angle);
        const c = Math.cos(angle);
        for (const [y, id, channel] of [
          [0, 1, 0],
          [6, 2, 2],
        ]) {
          scene.camera.setView({
            destination: new Cartesian3(center, center + y - 10 * c, 10 * s),
            orientation: {
              direction: new Cartesian3(0, c, -s),
              up: new Cartesian3(0, s, c),
            },
          });
          const pixel = render();
          expect(pixel[channel]).toBeGreaterThan(200);
          expect(pixel[2 - channel]).toBeLessThan(10);
          expect(pick()).toEqual({ primitive, id });
        }
      }
    }
    expect(primitive._currentCommands.colorCommands.length).toBe(1);
    expect(primitive._currentCommands.pickColorCommands.length).toBe(1);
    expect(primitive._current._va[0]).toBe(va);
  });

  it("keeps concavities, holes, adjacent edges and transparent layers with independent picking", function () {
    const concave = {
      id: 1,
      geometry: new SceneGISPlanarPolygonGeometry({
        positions: [
          [-3, -3],
          [3, -3],
          [3, -1],
          [-1, -1],
          [-1, 3],
          [-3, 3],
        ].map(([x, y]) => new Cartesian3(center + x, center + y, 0)),
      }),
      attributes: attributes(Color.RED.withAlpha(0.5)),
    };
    const adjacent = {
      ...polygon(2, 5, Color.BLUE.withAlpha(0.5)),
      geometry: new SceneGISPlanarPolygonGeometry({ positions: ring(5, 0, 2) }),
    };
    const holed = polygon(3, -8, Color.GREEN, [ring(-8, 0, 0.75).reverse()]);
    const primitive = add([concave, adjacent, holed]);
    for (const [x, y, id] of [
      [0, 0, undefined],
      [-2, 0, 1],
      [4, 0, 2],
      [-8, 0, undefined],
      [-9.5, 0, 3],
    ]) {
      view(x, y, true);
      render();
      if (id === undefined) {
        expect(pick()?.id)
          .withContext(`Outside footprint at ${x}, ${y}`)
          .toBeUndefined();
      } else {
        expect(pick()).toEqual({ primitive, id });
      }
    }
    expect(primitive._currentCommands.colorCommands.length).toBe(1);
    expect(primitive._currentCommands.pickColorCommands.length).toBe(1);
    scene.primitives.remove(primitive);
    view(0, 0, true);
    const instances = [
      polygon(1, 0, Color.RED.withAlpha(0.5)),
      polygon(2, 4, Color.GREEN.withAlpha(0.5)),
      polygon(3, 1, Color.BLUE.withAlpha(0.5)),
    ];
    const expected = baseline(instances);
    const layered = add(instances);
    expect(render()).toEqual(expected);
    expect(layered._currentCommands.colorCommands.length).toBe(2);
    expect(pick()).toEqual({ primitive: layered, id: 3 });
  });

  it("keeps a single area's hole empty from an oblique view for either ring winding", function () {
    view(0, 0, true);
    for (const reverseOuter of [false, true]) {
      for (const reverseHole of [false, true]) {
        const outer = ring(0, 0, 2);
        const hole = ring(0, 0, 0.75);
        const primitive = scene.primitives.add(
          new SceneGISPlanarGroundPrimitive({
            world,
            geometry: new SceneGISPlanarPolygonGeometry({
              positions: reverseOuter ? outer.reverse() : outer,
              holes: [reverseHole ? hole.reverse() : hole],
            }),
            id: "hole",
            appearance: new PerInstanceColorAppearance({ flat: true }),
            attributes: attributes(Color.GREEN),
          }),
        );
        expect(render().slice(0, 3))
          .withContext(`${reverseOuter},${reverseHole}`)
          .toEqual([0, 0, 0]);
        expect(pick()?.id)
          .withContext(`${reverseOuter},${reverseHole}`)
          .toBeUndefined();
        scene.primitives.remove(primitive);
      }
    }
  });

  it("batches crossing lines with different origins, widths, and colors", function () {
    const lines = [
      {
        id: "horizontal",
        geometry: new SceneGISPlanarPolylineGeometry({
          positions: [
            new Cartesian3(center - 3, center, 99),
            new Cartesian3(center + 3, center, 99),
          ],
          width: 4,
        }),
        attributes: attributes(Color.RED),
      },
      {
        id: "vertical",
        geometry: new SceneGISPlanarPolylineGeometry({
          positions: [
            new Cartesian3(center, center - 3, -99),
            new Cartesian3(center, center + 3, -99),
          ],
          width: 12,
        }),
        attributes: attributes(Color.BLUE),
      },
    ];
    const appearance = new PolylineColorAppearance({ translucent: false });
    view(0, 0, true);
    const expected = baseline(lines, appearance);
    const primitive = add(lines, appearance);
    expect(render()).toEqual(expected);
    expect(pick()).toEqual({ primitive, id: "vertical" });
    view(1.5, 0, true);
    render();
    expect(pick()).toEqual({ primitive, id: "horizontal" });
    expect(primitive._current._va.length).toBe(1);
    expect(primitive._currentCommands.colorCommands.length).toBe(1);
    expect(primitive._currentCommands.pickColorCommands.length).toBe(1);
    expect(primitive._currentCommands.stencilCommands.length).toBe(0);
    primitive.getGeometryInstanceAttributes("horizontal").color =
      ColorGeometryInstanceAttribute.toValue(Color.CYAN);
    const pixel = render();
    expect(pixel[1]).toBeGreaterThan(pixel[0]);
  });

  it("renders and picks 1024 independent lines with one command and stable warm resources", function () {
    const instances = Array.from({ length: 1024 }, (_, id) => {
      const x = ((id % 32) - 16) * 5;
      const y = (Math.floor(id / 32) - 16) * 5;
      return line(
        id,
        [
          [x, y],
          [x + 3, y],
        ],
        4 + (id % 3) * 2,
      );
    });
    const primitive = add(
      instances,
      new PolylineColorAppearance({ translucent: false }),
    );
    view(1, 0);
    expect(render()[0]).toBeGreaterThan(100);
    const current = primitive._current;
    const va = current._va[0];
    const command = primitive._currentCommands.colorCommands[0];
    expect(scene.context.uniformState.globeDepthTexture).toBeDefined();
    expect(current._va.length).toBe(1);
    expect(primitive._currentCommands.colorCommands.length).toBe(1);
    expect(primitive._currentCommands.stencilCommands.length).toBe(0);
    expect(pick()).toEqual({ primitive, id: 528 });
    expect(primitive._currentCommands.pickColorCommands.length).toBe(1);
    primitive.getGeometryInstanceAttributes(528).color =
      ColorGeometryInstanceAttribute.toValue(Color.BLUE);
    expect(render()[2]).toBeGreaterThan(100);
    primitive.getGeometryInstanceAttributes(528).show = new Uint8Array([0]);
    render();
    expect(pick()?.primitive).not.toBe(primitive);
    for (let i = 0; i < 5; i++) {
      render();
    }
    expect(primitive._current).toBe(current);
    expect(current._va[0]).toBe(va);
    expect(primitive._currentCommands.colorCommands[0]).toBe(command);
  });

  it("keeps distinct pixel widths and ordered translucent overlap in a single line draw", function () {
    const appearance = new PolylineColorAppearance();
    const widths = add(
      [
        line(
          1,
          [
            [-3, 0],
            [3, 0],
          ],
          4,
        ),
        line(
          2,
          [
            [-3, 2],
            [3, 2],
          ],
          12,
          Color.BLUE,
        ),
      ],
      appearance,
    );
    render();
    const strip = scene.context.readPixels({
      x: 64,
      y: 0,
      width: 1,
      height: 128,
    });
    let red = 0;
    let blue = 0;
    for (let i = 0; i < strip.length; i += 4) {
      red += Number(strip[i] > strip[i + 2] + 50);
      blue += Number(strip[i + 2] > strip[i] + 50);
    }
    expect(Math.abs(red - 4)).toBeLessThanOrEqual(1);
    expect(Math.abs(blue - 12)).toBeLessThanOrEqual(1);
    scene.primitives.remove(widths);
    const overlap = [
      line(
        1,
        [
          [-3, 0],
          [3, 0],
        ],
        12,
        Color.RED.withAlpha(0.5),
      ),
      line(
        2,
        [
          [0, -3],
          [0, 3],
        ],
        8,
        Color.BLUE.withAlpha(0.5),
      ),
    ];
    const expected = baseline(overlap, appearance);
    const primitive = add(overlap, appearance);
    expect(render()).toEqual(expected);
    expect(pick()).toEqual({ primitive, id: 2 });
    expect(primitive._currentCommands.colorCommands.length).toBe(1);
  });

  it("clips line caps and sky and keeps joins through linear/log depth and low views", function () {
    const primitive = add(
      [
        line(
          1,
          [
            [-3, 0],
            [0, 0],
            [0, 3],
          ],
          10,
        ),
      ],
      new PolylineColorAppearance(),
    );
    for (const logarithmic of [false, true]) {
      scene.logarithmicDepthBuffer = logarithmic;
      for (const degrees of [85, 45, 10]) {
        const angle = (degrees * Math.PI) / 180;
        const s = Math.sin(angle);
        const c = Math.cos(angle);
        scene.camera.setView({
          destination: new Cartesian3(center, center - 10 * c, 10 * s),
          orientation: {
            direction: new Cartesian3(0, c, -s),
            up: new Cartesian3(0, s, c),
          },
        });
        expect(render()[0]).toBeGreaterThan(100);
        expect(pick()).toEqual({ primitive, id: 1 });
      }
    }
    view(-3.5, 0);
    render();
    expect(pick()?.primitive).not.toBe(primitive);
    scene.primitives.remove(primitive);
    view(105, 0);
    const sky = render();
    const outside = add(
      [
        line(
          2,
          [
            [95, 0],
            [110, 0],
          ],
          12,
        ),
      ],
      new PolylineColorAppearance(),
    );
    expect(render()).toEqual(sky);
    expect(pick()?.primitive).not.toBe(outside);
  });

  it("classifies the current sloped terrain depth while keeping the line mesh", async function () {
    const primitive = add(
      [
        line(
          1,
          [
            [-5, 0],
            [5, 0],
          ],
          12,
        ),
      ],
      new PolylineColorAppearance(),
    );
    render();
    const va = primitive._current._va[0];
    const data = new SceneGISPlanarHeightmapTerrainData({
      buffer: new Float32Array([-20, 20, -20, 20]),
      width: 2,
      height: 2,
    });
    world.terrainProvider = {
      tilingScheme: world.tilingScheme,
      minimumHeight: -20,
      maximumHeight: 20,
      maximumLevel: 0,
      errorEvent: new Event(),
      getLevelMaximumGeometricError: () => 1,
      requestTileGeometry: () => Promise.resolve(data),
      getTileDataAvailable: () => true,
      loadTileDataAvailability: () => undefined,
    };
    await pollToPromise(() => {
      render();
      return (
        world.getTerrainHeight(new Cartesian3(center + 2, center, 0)) !==
        undefined
      );
    });
    view(0, 0, true);
    render();
    const point = SceneTransforms.worldToWindowCoordinates(
      scene,
      new Cartesian3(center + 2, center, 0.4),
    );
    expect(scene.pick(point)).toEqual({ primitive, id: 1 });
    expect(primitive._current._va[0]).toBe(va);
    expect(primitive._currentCommands.colorCommands.length).toBe(1);
  });

  it("updates shared line material colors without replacing the batch", function () {
    const instances = [0, 2].map((y, id) => ({
      id,
      geometry: new SceneGISPlanarPolylineGeometry({
        positions: [
          new Cartesian3(center - 2, center + y, 0),
          new Cartesian3(center + 2, center + y, 0),
        ],
        width: 8,
      }),
    }));
    const appearance = new PolylineMaterialAppearance({
      material: Material.fromType(Material.ColorType, { color: Color.RED }),
      translucent: false,
    });
    const primitive = add(instances, appearance);
    render();
    const va = primitive._current._va[0];
    appearance.material.uniforms.color = Color.BLUE;
    expect(render()[2]).toBeGreaterThan(0);
    view(0, 2);
    expect(render()[2]).toBeGreaterThan(0);
    expect(primitive._current._va[0]).toBe(va);
  });

  it("preserves current attributes and commands when a batch candidate fails", function () {
    const instances = [polygon(1), polygon(2, 6)];
    const primitive = add(instances);
    render();
    primitive.getGeometryInstanceAttributes(1).color =
      ColorGeometryInstanceAttribute.toValue(Color.BLUE);
    primitive.appearance = new PerInstanceColorAppearance({
      flat: true,
      translucent: false,
    });
    const current = primitive._current;
    const create = spyOn(
      instances[1].geometry,
      "_getDrapeSource",
    ).and.throwError("batch failure");
    expect(() => render()).toThrowError("batch failure");
    expect(primitive._current).toBe(current);
    create.and.callThrough();
    expect(render()[2]).toBeGreaterThan(0);
    expect(current.isDestroyed()).toBeTrue();
    expect(() => {
      primitive.geometry = instances[0].geometry;
    }).toThrowDeveloperError();
  });

  it("shares a large uint-index batch and keeps buffers and commands across provider replacement", function () {
    // Eight vertices per closed footprint put this batch just above the uint16 limit.
    const source = polygon("source");
    const instances = Array.from({ length: 8192 }, (_, id) => ({
      ...source,
      id,
    }));
    const primitive = add(instances);
    const frameState = scene.frameState;
    frameState.passes.render = true;
    world.update(frameState);
    const context = scene.context;
    const uint = context._elementIndexUint;
    const webgl2 = context._webgl2;
    try {
      context._elementIndexUint = context._webgl2 = false;
      expect(() => primitive.update(frameState)).toThrowDeveloperError();
      expect(primitive._current).toBeUndefined();
    } finally {
      context._elementIndexUint = uint;
      context._webgl2 = webgl2;
    }
    function update() {
      frameState.commandList.length = 0;
      world.update(frameState);
      primitive.update(frameState);
      while (frameState.afterRender.length > 0) {
        frameState.afterRender.shift()();
      }
    }
    update();
    const current = primitive._current;
    const va = current._va[0];
    const shader = current._sp;
    const command = primitive._currentCommands.colorCommands[0];
    expect(current._va.length).toBe(1);
    expect(current.geometryInstances).toBeUndefined();
    expect(current._pickOffsets.length).toBe(8192);
    expect(primitive._currentCommands.colorCommands.length).toBe(
      Math.ceil(8192 / 15),
    );
    const provider = {
      tilingScheme: world.tilingScheme,
      minimumHeight: -20,
      maximumHeight: 80,
      maximumLevel: 0,
      errorEvent: new Event(),
      getLevelMaximumGeometricError: () => 1,
      requestTileGeometry: () => undefined,
      getTileDataAvailable: () => true,
      loadTileDataAvailability: () => undefined,
    };
    const originalMatrix = Matrix4.clone(current.modelMatrix);
    const terrainHeight = spyOn(world, "getTerrainHeight").and.returnValue(37);
    world.terrainProvider = provider;
    update();
    expect(Matrix4.equals(current.modelMatrix, originalMatrix)).toBeFalse();
    expect(
      primitive.getBoundingSphere(new BoundingSphere(), 8191).center.z,
    ).toBe(37);
    world.terrainProvider = { ...provider, maximumHeight: 100 };
    update();
    world.terrainProvider = undefined;
    terrainHeight.and.returnValue(undefined);
    update();
    expect(current.modelMatrix).toEqual(originalMatrix);
    expect(primitive._current).toBe(current);
    expect(current._va[0]).toBe(va);
    expect(current._sp).toBe(shader);
    expect(primitive._currentCommands.colorCommands[0]).toBe(command);
  });

  it("rejects incompatible batch inputs before GPU allocation", function () {
    const first = polygon(1);
    expect(() => add([])).toThrowDeveloperError();
    expect(() => add([first, first])).toThrowDeveloperError();
    expect(() =>
      add([{ ...first, modelMatrix: Matrix4.IDENTITY }]),
    ).toThrowDeveloperError();
    expect(
      () =>
        new SceneGISPlanarGroundPrimitive({
          world,
          geometryInstances: [first],
          geometry: first.geometry,
          appearance: new PerInstanceColorAppearance({ flat: true }),
        }),
    ).toThrowDeveloperError();
    const second = polygon(2);
    delete second.attributes.show;
    expect(() => add([first, second])).toThrowDeveloperError();
  });
});
