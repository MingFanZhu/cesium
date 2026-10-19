import {
  BoundingSphere,
  Cartesian2,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  ComponentDatatype,
  Material,
  Matrix4,
  PerInstanceColorAppearance,
  PolylineColorAppearance,
  PolylineMaterialAppearance,
  SceneGISPlanarBoxGeometry,
  SceneGISPlanarCylinderGeometry,
  SceneGISPlanarPolygonGeometry,
  SceneGISPlanarPolylineGeometry,
  SceneGISPlanarPolylineVolumeGeometry,
  SceneGISPlanarPrimitive,
  SceneGISPlanarWallGeometry,
  ShowGeometryInstanceAttribute,
} from "../../../index.js";
import createScene from "../../../../../Specs/createScene.js";

describe("SceneGIS/Scene/SceneGISPlanarPrimitive", function () {
  let scene;
  beforeEach(function () {
    scene = createScene();
    scene.frameState.scene3DOnly = true;
  });
  afterEach(function () {
    scene.destroyForSpecs();
  });

  it("renders, reports bounds, reuses warm resources, and destroys", function () {
    const id = { name: "line" };
    const geometry = new SceneGISPlanarPolylineGeometry({
      positions: [new Cartesian3(-10, 0, 0), new Cartesian3(10, 0, 0)],
      width: 4.5,
    });
    const primitive = new SceneGISPlanarPrimitive({
      geometry,
      appearance: new PolylineMaterialAppearance({
        material: Material.fromType(Material.ColorType, { color: Color.RED }),
        translucent: false,
      }),
      id,
    });
    scene.primitives.add(primitive);
    scene.renderForSpecs();
    scene.renderForSpecs();
    expect(primitive.ready).toBeTrue();
    const internal = primitive._current;
    const command = internal._colorCommands[0];
    scene.renderForSpecs();
    expect(primitive._current).toBe(internal);
    expect(internal._colorCommands[0]).toBe(command);
    const sphere = primitive.getBoundingSphere(new BoundingSphere());
    expect(sphere.radius).toBeGreaterThan(0);
    primitive.geometry = new SceneGISPlanarPolylineGeometry({
      positions: [new Cartesian3(-20, 0, 0), new Cartesian3(20, 0, 0)],
      width: 4.5,
    });
    scene.renderForSpecs();
    expect(primitive._current).not.toBe(internal);
    expect(internal.isDestroyed()).toBeTrue();
    scene.primitives.remove(primitive);
    expect(primitive.isDestroyed()).toBeTrue();
  });

  it("renders and exposes polygon instance color attributes", function () {
    const primitive = new SceneGISPlanarPrimitive({
      geometry: new SceneGISPlanarPolygonGeometry({
        positions: [
          new Cartesian3(-1, -1, 0),
          new Cartesian3(1, -1, 0),
          new Cartesian3(1, 1, 0),
          new Cartesian3(-1, 1, 0),
        ],
      }),
      appearance: new PerInstanceColorAppearance({ flat: true }),
      attributes: {
        color: ColorGeometryInstanceAttribute.fromColor(Color.GREEN),
      },
      id: "polygon",
    });
    scene.primitives.add(primitive);
    scene.renderForSpecs();
    scene.renderForSpecs();
    expect(primitive.getGeometryInstanceAttributes().color).toBeDefined();
  });

  it("renders closed volume geometry and enforces its appearance pair", function () {
    const geometry = new SceneGISPlanarBoxGeometry({
      center: new Cartesian3(100, 200, 30),
      dimensions: new Cartesian3(10, 20, 30),
    });
    const attributes = {
      color: ColorGeometryInstanceAttribute.fromColor(Color.BLUE),
    };
    expect(function () {
      return new SceneGISPlanarPrimitive({
        geometry,
        appearance: new PerInstanceColorAppearance({ flat: true }),
        attributes,
        id: "flat-volume",
      });
    }).toThrowDeveloperError();
    const primitive = new SceneGISPlanarPrimitive({
      geometry,
      appearance: new PerInstanceColorAppearance({
        flat: false,
        closed: true,
      }),
      attributes,
      id: "volume",
    });
    scene.primitives.add(primitive);
    scene.renderForSpecs();
    expect(primitive.ready).toBeTrue();
    expect(primitive.getBoundingSphere(new BoundingSphere()).center).toEqual(
      geometry.center,
    );
  });

  it("renders open wall and closed polyline-volume appearance pairs", function () {
    const attributes = {
      color: ColorGeometryInstanceAttribute.fromColor(Color.BLUE),
    };
    const wall = new SceneGISPlanarWallGeometry({
      positions: [new Cartesian3(-10, 0, 5), new Cartesian3(10, 0, 8)],
    });
    expect(function () {
      return new SceneGISPlanarPrimitive({
        geometry: wall,
        appearance: new PerInstanceColorAppearance({
          flat: false,
          closed: true,
        }),
        attributes,
        id: "closed-wall",
      });
    }).toThrowDeveloperError();
    const wallPrimitive = scene.primitives.add(
      new SceneGISPlanarPrimitive({
        geometry: wall,
        appearance: new PerInstanceColorAppearance({
          flat: false,
          closed: false,
        }),
        attributes,
        id: "wall",
      }),
    );
    const volumePrimitive = scene.primitives.add(
      new SceneGISPlanarPrimitive({
        geometry: new SceneGISPlanarPolylineVolumeGeometry({
          polylinePositions: [
            new Cartesian3(-10, 10, 4),
            new Cartesian3(10, 10, 4),
          ],
          shapePositions: [
            new Cartesian2(-1, -1),
            new Cartesian2(1, -1),
            new Cartesian2(1, 1),
            new Cartesian2(-1, 1),
          ],
        }),
        appearance: new PerInstanceColorAppearance({
          flat: false,
          closed: true,
        }),
        attributes,
        id: "volume",
      }),
    );
    scene.renderForSpecs();
    expect(wallPrimitive.ready).toBeTrue();
    expect(volumePrimitive.ready).toBeTrue();
  });

  it("rejects incompatible inputs before Context mutation", function () {
    const geometry = new SceneGISPlanarPolylineGeometry({
      positions: [Cartesian3.ZERO, Cartesian3.UNIT_X],
      width: 1,
    });
    expect(function () {
      return new SceneGISPlanarPrimitive({
        geometry,
        appearance: new PerInstanceColorAppearance({ flat: true }),
        id: "wrong-appearance",
      });
    }).toThrowDeveloperError();
    expect(function () {
      return new SceneGISPlanarPrimitive({
        geometry: {},
        appearance: new PolylineMaterialAppearance(),
        id: "wrong-geometry",
      });
    }).toThrowDeveloperError();
    expect(function () {
      return new SceneGISPlanarPrimitive({
        geometry,
        appearance: new PolylineMaterialAppearance(),
      });
    }).toThrowDeveloperError();
    expect(function () {
      return new SceneGISPlanarPrimitive({
        geometry,
        appearance: new PolylineMaterialAppearance(),
        attributes: {
          malformed: {
            componentDatatype: -1,
            componentsPerAttribute: 5,
            normalize: "yes",
            value: [1],
          },
        },
        id: "malformed-attribute",
      });
    }).toThrowDeveloperError();

    const createPickIdSpy = spyOn(
      scene.context,
      "createPickId",
    ).and.callThrough();
    const invalidIntegerAttributes = [
      [ComponentDatatype.UNSIGNED_BYTE, 256],
      [ComponentDatatype.BYTE, 128],
      [ComponentDatatype.UNSIGNED_SHORT, 1.5],
    ];
    for (const [componentDatatype, value] of invalidIntegerAttributes) {
      expect(function () {
        return new SceneGISPlanarPrimitive({
          geometry,
          appearance: new PolylineMaterialAppearance(),
          attributes: {
            integer: {
              componentDatatype,
              componentsPerAttribute: 1,
              normalize: false,
              value: [value],
            },
          },
          id: `invalid-integer-${componentDatatype}-${value}`,
        });
      }).toThrowDeveloperError();
    }
    const validIntegerAttributes = [
      [ComponentDatatype.UNSIGNED_BYTE, 255],
      [ComponentDatatype.BYTE, -128],
      [ComponentDatatype.UNSIGNED_SHORT, 65535],
    ];
    for (const [componentDatatype, value] of validIntegerAttributes) {
      const primitive = new SceneGISPlanarPrimitive({
        geometry,
        appearance: new PolylineMaterialAppearance(),
        attributes: {
          integer: {
            componentDatatype,
            componentsPerAttribute: 1,
            normalize: false,
            value: [value],
          },
        },
        id: `valid-integer-${componentDatatype}-${value}`,
      });
      primitive.destroy();
    }
    expect(createPickIdSpy).not.toHaveBeenCalled();
    expect(scene.primitives.length).toBe(0);
  });

  it("keeps last-successful origin and bounds until replacement succeeds", function () {
    const original = new SceneGISPlanarPolylineGeometry({
      positions: [new Cartesian3(100, 0, 0), new Cartesian3(120, 0, 0)],
      width: 2,
    });
    const primitive = new SceneGISPlanarPrimitive({
      geometry: original,
      appearance: new PolylineMaterialAppearance(),
      id: "origin",
    });
    scene.primitives.add(primitive);
    scene.renderForSpecs();
    const current = primitive._current;
    const originalSphere = primitive.getBoundingSphere(new BoundingSphere());
    const replacement = new SceneGISPlanarPolylineGeometry({
      positions: [new Cartesian3(1000, 0, 0), new Cartesian3(1040, 0, 0)],
      width: 2,
    });
    primitive.geometry = replacement;
    primitive.modelMatrix = Matrix4.fromTranslation(
      new Cartesian3(5, 0, 0),
      new Matrix4(),
    );
    expect(current.modelMatrix[12]).toBe(105);
    const pendingSphere = primitive.getBoundingSphere(new BoundingSphere());
    expect(pendingSphere.center.x).toBe(originalSphere.center.x + 5);

    const updateSpy = spyOn(current, "update").and.callThrough();
    scene.frameState.passes.render = false;
    scene.frameState.passes.pick = true;
    primitive.update(scene.frameState);
    scene.frameState.passes.pick = false;
    scene.frameState.passes.render = true;
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(primitive._current).toBe(current);

    const createSpy = spyOn(replacement, "_createGeometry").and.throwError(
      "candidate failure",
    );
    expect(function () {
      scene.renderForSpecs();
    }).toThrowError("candidate failure");
    expect(primitive._current).toBe(current);
    expect(primitive.getBoundingSphere(new BoundingSphere())).toEqual(
      pendingSphere,
    );
    createSpy.and.callThrough();
    scene.renderForSpecs();
    expect(primitive._current).not.toBe(current);
    expect(primitive.getBoundingSphere(new BoundingSphere()).center.x).toBe(
      1025,
    );
  });

  it("preserves mutable instance attributes across same-kind replacement", function () {
    const primitive = new SceneGISPlanarPrimitive({
      geometry: new SceneGISPlanarPolygonGeometry({
        positions: [
          new Cartesian3(-1, -1, 0),
          new Cartesian3(1, -1, 0),
          new Cartesian3(1, 1, 0),
          new Cartesian3(-1, 1, 0),
        ],
      }),
      appearance: new PerInstanceColorAppearance({ flat: true }),
      attributes: {
        color: ColorGeometryInstanceAttribute.fromColor(Color.RED),
      },
      id: "attributes",
    });
    scene.primitives.add(primitive);
    scene.renderForSpecs();
    primitive.getGeometryInstanceAttributes().color = new Uint8Array([
      12, 34, 56, 78,
    ]);
    primitive.geometry = new SceneGISPlanarPolygonGeometry({
      positions: [
        new Cartesian3(-2, -2, 0),
        new Cartesian3(2, -2, 0),
        new Cartesian3(2, 2, 0),
        new Cartesian3(-2, 2, 0),
      ],
    });
    scene.renderForSpecs();
    expect(Array.from(primitive.getGeometryInstanceAttributes().color)).toEqual(
      [12, 34, 56, 78],
    );
  });

  it("fixes geometry kind at construction", function () {
    const primitive = new SceneGISPlanarPrimitive({
      geometry: new SceneGISPlanarPolylineGeometry({
        positions: [Cartesian3.ZERO, Cartesian3.UNIT_X],
        width: 1,
      }),
      appearance: new PolylineMaterialAppearance(),
      id: "kind",
    });
    const polygon = new SceneGISPlanarPolygonGeometry({
      positions: [Cartesian3.ZERO, Cartesian3.UNIT_X, Cartesian3.UNIT_Y],
    });
    expect(function () {
      primitive.geometry = polygon;
    }).toThrowDeveloperError();
    expect(function () {
      primitive.appearance = new PerInstanceColorAppearance({ flat: true });
    }).toThrowDeveloperError();
    expect(primitive.geometry).toBeInstanceOf(SceneGISPlanarPolylineGeometry);
  });

  it("rejects a second Context before changing the current primitive", function () {
    const primitive = new SceneGISPlanarPrimitive({
      geometry: new SceneGISPlanarPolylineGeometry({
        positions: [Cartesian3.ZERO, Cartesian3.UNIT_X],
        width: 1,
      }),
      appearance: new PolylineMaterialAppearance(),
      id: "second-context",
    });
    scene.primitives.add(primitive);
    scene.renderForSpecs();
    const current = primitive._current;
    scene.primitives.destroyPrimitives = false;
    scene.primitives.remove(primitive);
    scene.primitives.destroyPrimitives = true;
    const secondScene = createScene();
    secondScene.frameState.scene3DOnly = true;
    secondScene.primitives.add(primitive);
    expect(function () {
      secondScene.renderForSpecs();
    }).toThrowDeveloperError();
    expect(primitive._current).toBe(current);
    secondScene.destroyForSpecs();
  });

  function polygonInstance(id, x, color) {
    return {
      id,
      geometry: new SceneGISPlanarPolygonGeometry({
        positions: [
          new Cartesian3(x - 0.5, 20000000 - 0.5, 5),
          new Cartesian3(x + 0.5, 20000000 - 0.5, 5),
          new Cartesian3(x + 0.5, 20000000 + 0.5, 5),
          new Cartesian3(x - 0.5, 20000000 + 0.5, 5),
        ],
      }),
      attributes: {
        color: ColorGeometryInstanceAttribute.fromColor(color),
        show: new ShowGeometryInstanceAttribute(true),
      },
    };
  }

  function viewAt(x, y = 20000000, z = 5) {
    scene.camera.setView({
      destination: new Cartesian3(x, y, z + 2),
      orientation: {
        direction: new Cartesian3(0, 0, -1),
        up: Cartesian3.UNIT_Y,
      },
    });
    scene.camera.frustum.near = 0.01;
    scene.camera.frustum.far = 100;
  }

  function batch(instances, options = {}) {
    return scene.primitives.add(
      new SceneGISPlanarPrimitive({
        geometryInstances: instances,
        appearance: new PerInstanceColorAppearance({
          flat: true,
          translucent: false,
        }),
        ...options,
      }),
    );
  }

  it("batches large-coordinate polygons with independent picks, colors, and visibility", function () {
    const firstId = { business: 1 };
    const secondId = { business: 2 };
    const first = polygonInstance(firstId, 20000000, Color.RED);
    const second = polygonInstance(secondId, 20000004, Color.GREEN);
    second.modelMatrix = Matrix4.fromTranslation(new Cartesian3(0.25, 0, 0));
    const inputs = [first, second];
    const primitive = batch(inputs);
    inputs.pop();
    first.attributes.color.value.fill(0);
    second.modelMatrix[12] = 100;
    viewAt(20000000);
    expect(scene).toRender([255, 0, 0, 255]);
    expect(scene.pick(new Cartesian2(0, 0))).toEqual({
      primitive,
      id: firstId,
    });
    const internal = primitive._current;
    const va = internal._va[0];
    const command = internal._colorCommands[0];
    expect(internal._numberOfInstances).toBe(2);
    expect(internal.geometryInstances).toBeUndefined();
    expect(internal._va.length).toBe(1);
    expect(internal._colorCommands.length).toBe(1);
    expect(primitive.getGeometryInstanceAttributes("missing")).toBeUndefined();
    expect(() =>
      primitive.getGeometryInstanceAttributes(),
    ).toThrowDeveloperError();
    expect(
      primitive.getBoundingSphere(new BoundingSphere(), secondId).center,
    ).toEqualEpsilon(new Cartesian3(20000004.25, 20000000, 5), 1e-8);
    viewAt(20000004.25);
    expect(scene).toRender([0, 128, 0, 255]);
    expect(scene.pick(new Cartesian2(0, 0))).toEqual({
      primitive,
      id: secondId,
    });
    primitive.getGeometryInstanceAttributes(secondId).color =
      ColorGeometryInstanceAttribute.toValue(Color.BLUE);
    expect(scene).toRender([0, 0, 255, 255]);
    primitive.getGeometryInstanceAttributes(secondId).show = new Uint8Array([
      0,
    ]);
    expect(scene).toRender([0, 0, 0, 255]);
    expect(scene.pick(new Cartesian2(0, 0))).toBeUndefined();
    viewAt(20000000);
    expect(scene).toRender([255, 0, 0, 255]);
    expect(primitive._current).toBe(internal);
    expect(internal._va[0]).toBe(va);
    expect(internal._colorCommands[0]).toBe(command);
    const destroy = spyOn(internal, "destroy").and.callThrough();
    scene.primitives.remove(primitive);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(va.isDestroyed()).toBeTrue();
  });

  it("updates the entire batch matrix without folding shared origins twice", function () {
    const first = polygonInstance("one", 20000000, Color.RED);
    const second = polygonInstance("two", 20000000, Color.BLUE);
    second.modelMatrix = Matrix4.fromTranslation(new Cartesian3(4, 0, 0));
    const primitive = batch([first, second]);
    viewAt(20000000);
    expect(scene).toRender([255, 0, 0, 255]);
    const internal = primitive._current;
    primitive.modelMatrix = Matrix4.fromTranslation(
      new Cartesian3(0.125, 3, 0),
    );
    viewAt(20000000.125, 20000003);
    expect(scene).toRender([255, 0, 0, 255]);
    expect(primitive._current).toBe(internal);
    expect(
      primitive.getBoundingSphere(new BoundingSphere(), "one").center,
    ).toEqualEpsilon(new Cartesian3(20000000.125, 20000003, 5), 1e-8);
    expect(() =>
      primitive.getBoundingSphere(new BoundingSphere(), "missing"),
    ).toThrowDeveloperError();
    expect(
      primitive.getBoundingSphere(new BoundingSphere()).radius,
    ).toBeGreaterThan(2);
    expect(() => {
      primitive.geometry = first.geometry;
    }).toThrowDeveloperError();
    primitive.show = false;
    expect(scene).toRender([0, 0, 0, 255]);
    primitive.show = true;
    expect(scene).toRender([255, 0, 0, 255]);
  });

  it("batches polylines with independent colors and transformed adjacent positions", function () {
    const instances = [0, 4].map((offset, i) => ({
      id: i,
      geometry: new SceneGISPlanarPolylineGeometry({
        positions: [
          new Cartesian3(20000000 + offset - 0.5, 20000000, 5),
          new Cartesian3(20000000 + offset + 0.5, 20000000, 5),
        ],
        width: 4,
      }),
      modelMatrix: Matrix4.fromTranslation(new Cartesian3(0.125, 0, 0)),
      attributes: {
        color: ColorGeometryInstanceAttribute.fromColor(
          i === 0 ? Color.RED : Color.BLUE,
        ),
      },
    }));
    const primitive = batch(instances, {
      appearance: new PolylineColorAppearance({ translucent: false }),
    });
    viewAt(20000000.125);
    expect(scene).toRender([255, 0, 0, 255]);
    expect(scene.pick(new Cartesian2(0, 0))).toEqual({ primitive, id: 0 });
    viewAt(20000004.125);
    expect(scene).toRender([0, 0, 255, 255]);
    expect(scene.pick(new Cartesian2(0, 0))).toEqual({ primitive, id: 1 });
    expect(primitive._current._va.length).toBe(1);
  });

  it("combines compatible solid kinds and rejects incompatible appearance groups", function () {
    const box = new SceneGISPlanarBoxGeometry({
      center: new Cartesian3(20000000, 20000000, 4),
      dimensions: new Cartesian3(1, 1, 2),
    });
    const cylinder = new SceneGISPlanarCylinderGeometry({
      center: new Cartesian3(20000004, 20000000, 4),
      length: 2,
      topRadius: 0.5,
      bottomRadius: 0.5,
    });
    const instances = [box, cylinder].map((geometry, id) => ({
      geometry,
      id,
      attributes: {
        color: ColorGeometryInstanceAttribute.fromColor(Color.RED),
      },
    }));
    const primitive = batch(instances, {
      appearance: new PerInstanceColorAppearance({
        closed: true,
        translucent: false,
      }),
    });
    viewAt(20000000);
    scene.renderForSpecs();
    expect(scene.pick(new Cartesian2(0, 0))).toEqual({ primitive, id: 0 });
    viewAt(20000004);
    scene.renderForSpecs();
    expect(scene.pick(new Cartesian2(0, 0))).toEqual({ primitive, id: 1 });
    expect(primitive._current._va.length).toBe(1);
    expect(() => batch(instances)).toThrowDeveloperError();
  });

  it("preserves all instance attributes across appearance rebuild and failed candidates", function () {
    const instances = [
      polygonInstance(1, 20000000, Color.RED),
      polygonInstance(2, 20000004, Color.BLUE),
    ];
    const primitive = batch(instances);
    viewAt(20000000);
    scene.renderForSpecs();
    primitive.getGeometryInstanceAttributes(1).color = new Uint8Array([
      12, 34, 56, 255,
    ]);
    primitive.getGeometryInstanceAttributes(2).show = new Uint8Array([0]);
    const current = primitive._current;
    primitive.appearance = new PerInstanceColorAppearance({
      flat: true,
      translucent: true,
    });
    const create = spyOn(
      instances[1].geometry,
      "_createGeometry",
    ).and.throwError("batch candidate failure");
    expect(() => scene.renderForSpecs()).toThrowError(
      "batch candidate failure",
    );
    expect(primitive._current).toBe(current);
    expect(current.isDestroyed()).toBeFalse();
    create.and.callThrough();
    scene.renderForSpecs();
    expect(current.isDestroyed()).toBeTrue();
    expect(
      Array.from(primitive.getGeometryInstanceAttributes(1).color),
    ).toEqual([12, 34, 56, 255]);
    expect(Array.from(primitive.getGeometryInstanceAttributes(2).show)).toEqual(
      [0],
    );
  });

  it("rejects ambiguous inputs, duplicate ids, and attribute schema loss before GPU work", function () {
    const first = polygonInstance(1, 20000000, Color.RED);
    const second = polygonInstance(2, 20000004, Color.BLUE);
    const appearance = new PerInstanceColorAppearance({ flat: true });
    const make = (geometryInstances, extra) =>
      new SceneGISPlanarPrimitive({ geometryInstances, appearance, ...extra });
    const pick = spyOn(scene.context, "createPickId").and.callThrough();
    expect(() => make([])).toThrowDeveloperError();
    expect(() =>
      make([first], { geometry: first.geometry }),
    ).toThrowDeveloperError();
    expect(() => make([first], { id: 3 })).toThrowDeveloperError();
    expect(() => make([first, first])).toThrowDeveloperError();
    delete second.attributes.show;
    expect(() => make([first, second])).toThrowDeveloperError();
    second.attributes.show = {
      componentDatatype: ComponentDatatype.FLOAT,
      componentsPerAttribute: 1,
      value: [1],
    };
    expect(() => make([first, second])).toThrowDeveloperError();
    expect(pick).not.toHaveBeenCalled();
  });

  it("keeps a 1024-object static batch at one native primitive and one warm vertex array", function () {
    const instances = Array.from({ length: 1024 }, (_, id) =>
      polygonInstance(id, 20000000 + id * 2, Color.RED),
    );
    const primitive = batch(instances, { allowPicking: false });
    viewAt(20000000);
    scene.renderForSpecs();
    const internal = primitive._current;
    const va = internal._va[0];
    const command = internal._colorCommands[0];
    expect(internal._numberOfInstances).toBe(1024);
    expect(internal.geometryInstances).toBeUndefined();
    expect(internal._va.length).toBe(1);
    expect(internal._colorCommands.length).toBe(1);
    const pick = spyOn(scene.context, "createPickId").and.callThrough();
    for (let i = 0; i < 20; i++) {
      scene.renderForSpecs();
    }
    primitive.getGeometryInstanceAttributes(512).show = new Uint8Array([0]);
    scene.renderForSpecs();
    expect(primitive._current).toBe(internal);
    expect(internal._va[0]).toBe(va);
    expect(internal._colorCommands[0]).toBe(command);
    expect(pick).not.toHaveBeenCalled();
    expect(scene.pick(new Cartesian2(0, 0))).toBeUndefined();
    scene.primitives.remove(primitive);
    expect(va.isDestroyed()).toBeTrue();
  });
});
