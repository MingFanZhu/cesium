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
  PolylineMaterialAppearance,
  SceneGISPlanarBoxGeometry,
  SceneGISPlanarPolygonGeometry,
  SceneGISPlanarPolylineGeometry,
  SceneGISPlanarPolylineVolumeGeometry,
  SceneGISPlanarPrimitive,
  SceneGISPlanarWallGeometry,
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
});
