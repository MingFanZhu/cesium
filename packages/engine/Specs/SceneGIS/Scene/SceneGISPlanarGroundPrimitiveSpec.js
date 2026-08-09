import {
  BoundingSphere,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  ComponentDatatype,
  HeightReference,
  Material,
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

describe("SceneGIS/Scene/SceneGISPlanarGroundPrimitive", function () {
  let scene;
  let world;
  let snapshot;

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
    snapshot = [
      {
        key: "0/0/0",
        source: "FLAT",
        revision: 0,
        extent: world.coordinateSystem.extent,
        mesh: undefined,
      },
    ];
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
        positions: [new Cartesian3(-5, 0, 0), new Cartesian3(5, 0, 0)],
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
      heightReference: HeightReference.CLAMP_TO_GROUND,
      id: "line",
    });
  }

  it("validates the ground-only construction contract", function () {
    expect(function () {
      return new SceneGISPlanarGroundPrimitive({
        world,
        geometry: new SceneGISPlanarPolylineGeometry({
          positions: [new Cartesian3(), new Cartesian3(1, 0, 0)],
          width: 1,
        }),
        appearance: new PolylineMaterialAppearance(),
        heightReference: HeightReference.NONE,
        id: "absolute",
      });
    }).toThrowDeveloperError();
    function expectInvalidAttribute(invalid) {
      expect(function () {
        return new SceneGISPlanarGroundPrimitive({
          world,
          geometry: new SceneGISPlanarPolylineGeometry({
            positions: [new Cartesian3(), new Cartesian3(1, 0, 0)],
            width: 1,
          }),
          appearance: new PolylineMaterialAppearance(),
          attributes: { invalid },
          heightReference: HeightReference.CLAMP_TO_GROUND,
          id: "malformed-attribute",
        });
      }).toThrowDeveloperError();
    }
    for (const invalid of [
      null,
      {
        componentDatatype: ComponentDatatype.UNSIGNED_BYTE,
        componentsPerAttribute: 1,
        normalize: "false",
        value: [1],
      },
      {
        componentDatatype: ComponentDatatype.UNSIGNED_BYTE,
        componentsPerAttribute: 1,
        normalize: false,
        value: new DataView(new ArrayBuffer(1)),
      },
    ]) {
      expectInvalidAttribute(invalid);
    }
    expect(function () {
      return new SceneGISPlanarGroundPrimitive({
        world,
        geometry: new SceneGISPlanarPolylineGeometry({
          positions: [new Cartesian3(), new Cartesian3(1, 0, 0)],
          width: 1,
        }),
        appearance: new PolylineMaterialAppearance(),
        attributes: {
          invalid: {
            componentDatatype: ComponentDatatype.UNSIGNED_BYTE,
            componentsPerAttribute: 1,
            normalize: false,
            value: [256],
          },
        },
        heightReference: HeightReference.CLAMP_TO_GROUND,
        id: "invalid-attribute",
      });
    }).toThrowDeveloperError();
    const polygon = new SceneGISPlanarPolygonGeometry({
      positions: [
        new Cartesian3(-1, -1, 1),
        new Cartesian3(1, -1, 1),
        new Cartesian3(1, 1, 1),
        new Cartesian3(-1, 1, 1),
      ],
    });
    const offsetBottom = new SceneGISPlanarPolygonGeometry({
      positions: polygon._getDrapeSource().top,
      bottomPositions: polygon
        ._getDrapeSource()
        .top.map((position) => new Cartesian3(position.x + 0.5, position.y, 0)),
    });
    expect(function () {
      return new SceneGISPlanarGroundPrimitive({
        world,
        geometry: offsetBottom,
        appearance: new PerInstanceColorAppearance({ flat: true }),
        attributes: {
          color: ColorGeometryInstanceAttribute.fromColor(Color.BLUE),
        },
        heightReference: HeightReference.CLAMP_TO_GROUND,
        extrudedHeightReference: HeightReference.NONE,
        id: "offset-bottom",
      });
    }).toThrowDeveloperError();
    expect(scene.primitives.length).toBe(0);
    expect(function () {
      return new SceneGISPlanarGroundPrimitive({
        world,
        geometry: polygon,
        appearance: new PerInstanceColorAppearance({ flat: true }),
        attributes: {
          color: ColorGeometryInstanceAttribute.fromColor(Color.BLUE),
        },
        heightReference: HeightReference.CLAMP_TO_GROUND,
        extrudedHeightReference: HeightReference.NONE,
        id: "polygon",
      });
    }).toThrowDeveloperError();
  });

  it("promotes one logical current, preserves warm identity, and destroys once", function () {
    const primitive = line();
    const frameState = scene.frameState;
    frameState.passes.render = true;
    world.update(frameState);
    primitive.update(frameState);
    expect(world._groundPrimitives).toEqual([primitive]);
    primitive._updateGround(frameState, snapshot, 1, "flat");
    while (frameState.afterRender.length > 0) {
      frameState.afterRender.shift()();
    }
    primitive._updateGround(frameState, snapshot, 1, "flat");
    expect(primitive.ready).toBeTrue();
    const current = primitive._current;
    const command = current._colorCommands[0];
    primitive._updateGround(frameState, snapshot, 1, "flat");
    expect(primitive._current).toBe(current);
    expect(current._colorCommands[0]).toBe(command);
    expect(
      primitive.getBoundingSphere(new BoundingSphere()).radius,
    ).toBeGreaterThan(0);
    expect(primitive.getGeometryInstanceAttributes()).toBeDefined();

    const oldBounds = primitive.getBoundingSphere(new BoundingSphere());
    const oldAttributes = primitive.getGeometryInstanceAttributes();
    oldAttributes.marker = new Float32Array([7]);
    const replacement = new SceneGISPlanarPolylineGeometry({
      positions: [new Cartesian3(-4, 1, 0), new Cartesian3(4, 1, 0)],
      width: 2,
    });
    primitive.geometry = replacement;
    replacement._getDrapeSource = function () {
      throw new Error("candidate failure");
    };
    expect(() =>
      primitive._updateGround(frameState, snapshot, 1, "flat"),
    ).toThrowError("candidate failure");
    expect(primitive._current).toBe(current);
    expect(primitive.getGeometryInstanceAttributes().marker).toEqual(
      new Float32Array([7]),
    );
    expect(
      BoundingSphere.equals(
        primitive.getBoundingSphere(new BoundingSphere()),
        oldBounds,
      ),
    ).toBeTrue();
    primitive.destroy();
    expect(primitive.isDestroyed()).toBeTrue();
    expect(current.isDestroyed()).toBeTrue();
  });

  it("keeps pick/depth passes allocation-free and rejects a second Context", function () {
    const primitive = line();
    scene.frameState.passes.render = true;
    primitive._updateGround(scene.frameState, snapshot, 1, "flat");
    const current = primitive._current;
    const passes = scene.frameState.passes;
    passes.render = false;
    passes.pick = true;
    passes.depth = true;
    scene.frameState.commandList.length = 0;
    primitive._updateGround(scene.frameState, snapshot, 1, "flat");
    expect(scene.frameState.commandList.length).toBeGreaterThan(0);
    const replayCommands = scene.frameState.commandList.slice();

    scene.frameState.commandList.length = 0;
    primitive._updateGround(scene.frameState, [], 0, "");
    expect(primitive._current).toBe(current);
    expect(scene.frameState.commandList.length).toBe(0);
    const revisedSnapshot = [{ ...snapshot[0], revision: 1 }];
    primitive._updateGround(scene.frameState, revisedSnapshot, 1, "revised");
    expect(scene.frameState.commandList.length).toBe(0);

    passes.render = true;
    passes.pick = false;
    passes.depth = false;
    primitive._updateGround(scene.frameState, revisedSnapshot, 1, "revised");
    passes.render = false;
    passes.pick = true;
    passes.depth = true;
    scene.frameState.commandList.length = 0;
    primitive._updateGround(scene.frameState, revisedSnapshot, 1, "revised");
    expect(scene.frameState.commandList.length).toBe(replayCommands.length);

    primitive.show = false;
    scene.frameState.commandList.length = 0;
    primitive._updateGround(scene.frameState, revisedSnapshot, 1, "revised");
    expect(scene.frameState.commandList.length).toBe(0);
    expect(function () {
      primitive.update({
        context: {},
        scene3DOnly: true,
        passes: { render: true },
      });
    }).toThrowDeveloperError();
  });
});
