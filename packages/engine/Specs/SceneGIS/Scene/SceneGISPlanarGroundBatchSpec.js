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
  SceneGISPlanarPolygonGeometry,
  SceneGISPlanarPolylineGeometry,
  SceneGISPlanarWorld,
  ShowGeometryInstanceAttribute,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";

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
    primitive.getGeometryInstanceAttributes("horizontal").color =
      ColorGeometryInstanceAttribute.toValue(Color.CYAN);
    const pixel = render();
    expect(pixel[1]).toBeGreaterThan(pixel[0]);
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
