import {
  BoundingSphere,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  ComponentDatatype,
  Event,
  HeightReference,
  Material,
  Pass,
  PerInstanceColorAppearance,
  PolylineMaterialAppearance,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarGroundPrimitive,
  SceneGISPlanarPolygonGeometry,
  SceneGISPlanarPolylineGeometry,
  SceneGISPlanarWorld,
} from "../../../index.js";
import createScene from "../../../../../Specs/createScene.js";
import SceneGISPlanarGroundLineShader from "../../../Source/SceneGIS/Scene/_private/_SceneGISPlanarGroundLineShader.js";

describe("SceneGIS/Scene/SceneGISPlanarGroundPrimitive", function () {
  let scene;
  let world;

  beforeEach(function () {
    scene = createScene();
    scene.frameState.scene3DOnly = true;
    world = new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: -10,
          minimumY: -10,
          maximumX: 10,
          maximumY: 10,
        }),
      }),
      maximumLevel: 1,
    });
  });

  afterEach(function () {
    if (!world.isDestroyed()) {
      world.destroy();
    }
    scene.destroyForSpecs();
  });

  function line() {
    return new SceneGISPlanarGroundPrimitive({
      world,
      geometry: new SceneGISPlanarPolylineGeometry({
        positions: [new Cartesian3(-5, 0, 7), new Cartesian3(5, 0, 9)],
        width: 2,
      }),
      appearance: new PolylineMaterialAppearance({
        material: Material.fromType(Material.ColorType, { color: Color.RED }),
      }),
      attributes: {
        marker: {
          componentDatatype: ComponentDatatype.FLOAT,
          componentsPerAttribute: 1,
          normalize: false,
          value: [1],
        },
      },
      id: "line",
    });
  }

  function update(primitive) {
    const frameState = scene.frameState;
    frameState.passes.render = true;
    frameState.passes.pick = false;
    world.update(frameState);
    primitive.update(frameState);
    while (frameState.afterRender.length > 0) {
      frameState.afterRender.shift()();
    }
    return frameState;
  }

  function terrainProvider(minimumHeight, maximumHeight) {
    return {
      tilingScheme: world.tilingScheme,
      minimumHeight,
      maximumHeight,
      maximumLevel: 1,
      errorEvent: new Event(),
      credit: undefined,
      getLevelMaximumGeometricError: (level) => 1 / 2 ** level,
      requestTileGeometry: () => undefined,
      getTileDataAvailable: () => true,
      loadTileDataAvailability: () => undefined,
    };
  }

  it("loads the generated area and line shader modules", function () {
    expect(SceneGISPlanarGroundLineShader.areaVertexShaderSource).toContain(
      "czm_modelViewProjectionRelativeToEye",
    );
    expect(SceneGISPlanarGroundLineShader.areaFragmentShaderSource).toContain(
      "czm_gammaCorrect(v_color)",
    );
    expect(SceneGISPlanarGroundLineShader.vertexShaderSource).toContain(
      "u_sceneGISGroundLineWidth",
    );
    expect(SceneGISPlanarGroundLineShader.vertexShaderSource).toContain(
      "czm_metersPerPixel(positionEC)",
    );
    expect(SceneGISPlanarGroundLineShader.fragmentShaderSource).toContain(
      "czm_writeDepthClamp()",
    );
  });

  it("validates implicit clamp, support, attributes, and non-extruded polygons", function () {
    expect(SceneGISPlanarGroundPrimitive.isSupported(scene)).toBe(
      scene.context.stencilBuffer,
    );
    expect(function () {
      return new SceneGISPlanarGroundPrimitive({
        world,
        geometry: new SceneGISPlanarPolylineGeometry({
          positions: [new Cartesian3(), new Cartesian3(1, 0, 0)],
          width: 1,
        }),
        appearance: new PolylineMaterialAppearance({
          material: Material.fromType(Material.ColorType),
        }),
        heightReference: HeightReference.CLAMP_TO_GROUND,
        id: "legacy",
      });
    }).toThrowDeveloperError();
    const extruded = new SceneGISPlanarPolygonGeometry({
      positions: [
        new Cartesian3(-1, -1, 1),
        new Cartesian3(1, -1, 1),
        new Cartesian3(1, 1, 1),
      ],
      bottomPositions: [
        new Cartesian3(-1, -1, 0),
        new Cartesian3(1, -1, 0),
        new Cartesian3(1, 1, 0),
      ],
    });
    expect(function () {
      return new SceneGISPlanarGroundPrimitive({
        world,
        geometry: extruded,
        appearance: new PerInstanceColorAppearance({ flat: true }),
        attributes: {
          color: ColorGeometryInstanceAttribute.fromColor(Color.BLUE),
        },
        id: "extruded",
      });
    }).toThrowDeveloperError();
    expect(function () {
      return new SceneGISPlanarGroundPrimitive({
        world,
        geometry: new SceneGISPlanarPolylineGeometry({
          positions: [new Cartesian3(), new Cartesian3(1, 0, 0)],
          width: 1,
        }),
        appearance: new PolylineMaterialAppearance({
          material: Material.fromType(Material.ColorType),
        }),
        attributes: {
          invalid: {
            componentDatatype: ComponentDatatype.UNSIGNED_BYTE,
            componentsPerAttribute: 1,
            normalize: false,
            value: [256],
          },
        },
        id: "invalid-attribute",
      });
    }).toThrowDeveloperError();
  });

  it("promotes one stable classification current and preserves it on failure", function () {
    const primitive = line();
    update(primitive);
    update(primitive);
    expect(primitive.ready).toBeTrue();
    const current = primitive._current;
    const commands = primitive._currentCommands.colorCommands.slice();
    const bounds = primitive.getBoundingSphere(new BoundingSphere());
    update(primitive);
    expect(primitive._current).toBe(current);
    expect(primitive._currentCommands.colorCommands).toEqual(commands);
    expect(bounds.radius).toBeGreaterThan(0);

    const replacement = new SceneGISPlanarPolylineGeometry({
      positions: [new Cartesian3(-4, 1, 0), new Cartesian3(4, 1, 0)],
      width: 2,
    });
    primitive.geometry = replacement;
    replacement._getDrapeSource = function () {
      throw new Error("candidate failure");
    };
    expect(() => update(primitive)).toThrowError("candidate failure");
    expect(primitive._current).toBe(current);
    expect(
      BoundingSphere.equals(
        primitive.getBoundingSphere(new BoundingSphere()),
        bounds,
      ),
    ).toBeTrue();
    primitive.destroy();
    expect(primitive.isDestroyed()).toBeTrue();
    expect(current.isDestroyed()).toBeTrue();
  });

  it("queues terrain-classification render and pick commands", function () {
    const primitive = line();
    const frameState = update(primitive);
    update(primitive);
    expect(
      primitive._currentCommands.colorCommands.every(
        (command) => command.pass === Pass.TERRAIN_CLASSIFICATION,
      ),
    ).toBeTrue();
    expect(primitive._currentCommands.stencilCommands.length).toBe(1);
    expect(primitive._currentCommands.colorCommands.length).toBe(1);
    frameState.passes.render = false;
    frameState.passes.pick = true;
    frameState.commandList.length = 0;
    primitive.update(frameState);
    expect(frameState.commandList).toEqual([
      primitive._currentCommands.pickStencilCommands[0],
      primitive._currentCommands.pickColorCommands[0],
    ]);
    frameState.passes.depth = true;
    frameState.commandList.length = 0;
    primitive.update(frameState);
    expect(frameState.commandList.length).toBe(0);
  });

  it("updates provider envelopes without replacing footprint resources", function () {
    const primitive = line();
    update(primitive);
    update(primitive);
    const current = primitive._current;
    const vertexArray = current._va[0];
    const shaderProgram = current._sp;
    const commands = primitive._currentCommands.colorCommands.slice();
    const initialBounds = primitive.getBoundingSphere(new BoundingSphere());
    const attributes = primitive.getGeometryInstanceAttributes();
    attributes.marker = [2];

    world.terrainProvider = terrainProvider(-20, 80);
    update(primitive);
    expect(primitive._current).toBe(current);
    expect(current._va[0]).toBe(vertexArray);
    expect(current._sp).toBe(shaderProgram);
    expect(primitive._currentCommands.colorCommands).toEqual(commands);
    expect(
      BoundingSphere.equals(
        primitive.getBoundingSphere(new BoundingSphere()),
        initialBounds,
      ),
    ).toBeFalse();

    primitive.geometry = new SceneGISPlanarPolylineGeometry({
      positions: [new Cartesian3(-4, 1, 0), new Cartesian3(4, 1, 0)],
      width: 2,
    });
    update(primitive);
    expect(primitive.getGeometryInstanceAttributes().marker[0]).toBe(2);
    const replacement = primitive._current;
    world.terrainProvider = undefined;
    update(primitive);
    expect(primitive._current).toBe(replacement);
    primitive.destroy();
  });

  it("anchors presentation bounds to resident terrain without rebuilding the shadow volume", function () {
    world.terrainProvider = terrainProvider(-450, 8700);
    const terrainHeight = spyOn(world, "getTerrainHeight").and.returnValue(37);
    const primitive = line();
    update(primitive);
    update(primitive);
    const current = primitive._current;
    const vertexArray = current._va[0];
    const shaderProgram = current._sp;
    const commands = primitive._currentCommands.colorCommands.slice();
    const sphere = primitive.getBoundingSphere(new BoundingSphere());
    expect(sphere.center).toEqual(new Cartesian3(0, 0, 37));
    expect(sphere.center.z).not.toBe(4125);
    expect(sphere.radius).toBeCloseTo(Math.hypot(5, 8791.5 - 37), 10);

    terrainHeight.and.returnValue(64);
    primitive.getBoundingSphere(sphere);
    expect(sphere.center).toEqual(new Cartesian3(0, 0, 64));
    expect(primitive._current).toBe(current);
    expect(current._va[0]).toBe(vertexArray);
    expect(current._sp).toBe(shaderProgram);
    expect(primitive._currentCommands.colorCommands).toEqual(commands);

    terrainHeight.and.returnValue(undefined);
    primitive.getBoundingSphere(sphere);
    expect(sphere.center).toEqual(Cartesian3.ZERO);
    expect(Number.isFinite(sphere.radius)).toBe(true);
    expect(sphere.radius).toBeCloseTo(Math.hypot(5, 8791.5), 10);

    world.terrainProvider = undefined;
    primitive.getBoundingSphere(sphere);
    expect(sphere.center).toEqual(Cartesian3.ZERO);
    expect(sphere.radius).toBeCloseTo(Math.hypot(5, 1), 14);
    expect(primitive._current).toBe(current);
    expect(current._va[0]).toBe(vertexArray);
    expect(current._sp).toBe(shaderProgram);
    expect(primitive._currentCommands.colorCommands).toEqual(commands);
    primitive.destroy();
  });

  it("rejects unsupported stencil and a second Context before mutation", function () {
    const primitive = line();
    const frameState = scene.frameState;
    world.update(frameState);
    const context = frameState.context;
    const stencil = context._stencilBits;
    context._stencilBits = 0;
    expect(() => primitive.update(frameState)).toThrowDeveloperError();
    expect(primitive._current).toBeUndefined();
    context._stencilBits = stencil;
    update(primitive);
    expect(function () {
      primitive.update({
        context: {},
        scene3DOnly: true,
        passes: { render: true },
      });
    }).toThrowDeveloperError();
  });
});
