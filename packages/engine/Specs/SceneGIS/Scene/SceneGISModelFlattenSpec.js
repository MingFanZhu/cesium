import {
  BoundingSphere,
  Cartesian3,
  CustomShader,
  Matrix4,
  PolygonHierarchy,
  PrimitiveType,
  SceneGISModelFlatten,
  TileBoundingSphere,
  Transforms,
} from "../../../index.js";

describe("SceneGIS/Scene/SceneGISModelFlatten", function () {
  let shaders;
  beforeEach(function () {
    shaders = [];
  });
  afterEach(function () {
    shaders.forEach((s) => {
      if (!s.isDestroyed()) {
        s.destroy();
      }
    });
  });
  function ring(points) {
    return new PolygonHierarchy(points.map((p) => new Cartesian3(...p, 0)));
  }
  function make(options = {}) {
    const s = new SceneGISModelFlatten({
      modelMatrix: Matrix4.IDENTITY,
      height: 0,
      polygonHierarchy: ring([
        [-10, -10],
        [10, -10],
        [10, 10],
        [-10, 10],
      ]),
      ...options,
    });
    shaders.push(s);
    return s;
  }
  it("is an explicit CustomShader with copied frame and validated polygon data", function () {
    const matrix = Matrix4.fromTranslation(
      new Cartesian3(13000000, 4000000, 0),
    );
    const polygon = ring([
      [-10, -10],
      [10, -10],
      [10, 10],
      [-10, 10],
    ]);
    const s = make({ modelMatrix: matrix, polygonHierarchy: polygon });
    expect(s instanceof CustomShader).toBe(true);
    expect(s.inverse).toBe(false);
    matrix[12] = 0;
    polygon.positions[0].x = 400;
    expect(s.modelMatrix[12]).toBe(13000000);
    expect(s.uniforms.u_sgFlattenBounds.value.x).toBe(-10);
    s.modelMatrix[12] = 0;
    expect(s.modelMatrix[12]).toBe(13000000);
  });
  it("accepts concavity and direct holes and rejects invalid topology before publication", function () {
    const outer = ring([
      [-10, -10],
      [10, -10],
      [10, 0],
      [0, 0],
      [0, 10],
      [-10, 10],
    ]);
    outer.holes = [
      ring([
        [-8, -8],
        [-2, -8],
        [-2, -2],
        [-8, -2],
      ]),
    ];
    const s = make({ polygonHierarchy: outer });
    expect(s.uniforms.u_sgFlattenCount.value).toBe(10);
    const data = s.uniforms.u_sgFlattenEdges.value.typedArray;
    expect(data[256 * 4]).toBe(1);
    expect(data[(256 + 6) * 4]).toBe(0);
    expect(() =>
      make({
        polygonHierarchy: ring([
          [0, 0],
          [10, 10],
          [0, 10],
          [10, 0],
        ]),
      }),
    ).toThrowDeveloperError();
    outer.holes = [
      ring([
        [20, 20],
        [30, 20],
        [30, 30],
      ]),
    ];
    expect(() => make({ polygonHierarchy: outer })).toThrowDeveloperError();
  });
  it("rejects invalid height, transforms, nesting and edge counts", function () {
    expect(() => make({ height: NaN })).toThrowDeveloperError();
    expect(() =>
      make({ modelMatrix: Matrix4.fromUniformScale(2) }),
    ).toThrowDeveloperError();
    const p = ring([
      [-10, -10],
      [10, -10],
      [10, 10],
      [-10, 10],
    ]);
    p.holes = [new PolygonHierarchy([], [new PolygonHierarchy()])];
    expect(() => make({ polygonHierarchy: p })).toThrowDeveloperError();
    expect(() =>
      make({
        polygonHierarchy: new PolygonHierarchy(
          new Array(257).fill(Cartesian3.ZERO),
        ),
      }),
    ).toThrowDeveloperError();
    const s = make();
    expect(() => {
      s.enabled = 1;
    }).toThrowDeveloperError();
    expect(() => {
      s.height = Infinity;
    }).toThrowDeveloperError();
    expect(s.height).toBe(0);
  });
  it("validates inverse mode atomically and preserves shader resources on toggles", function () {
    expect(() => make({ inverse: 1 })).toThrowDeveloperError();
    const s = make({ inverse: true });
    const edges = s.uniforms.u_sgFlattenEdges.value;
    const vertexShader = s.vertexShaderText;
    expect(s.inverse).toBe(true);
    expect(() => {
      s.inverse = "false";
    }).toThrowDeveloperError();
    expect(s.inverse).toBe(true);
    s.inverse = false;
    expect(s.inverse).toBe(false);
    expect(s.uniforms.u_sgFlattenEdges.value).toBe(edges);
    expect(s.vertexShaderText).toBe(vertexShader);
  });
  it("updates inverse tile bounds outside the polygon and restores cached exact volumes", function () {
    const s = make({ height: -100 });
    const source = new TileBoundingSphere(new Cartesian3(100, 0, 40), 5);
    expect(SceneGISModelFlatten._tileBounds(s, source)).toBe(source);
    s.inverse = true;
    const expanded = SceneGISModelFlatten._tileBounds(s, source);
    expect(expanded).not.toBe(source);
    expect(
      Cartesian3.distance(expanded.center, new Cartesian3(100, 0, -100)),
    ).toBeLessThan(expanded.radius);
    expect(SceneGISModelFlatten._tileBounds(s, source)).toBe(expanded);
    s.height = 150;
    expect(
      Cartesian3.distance(
        SceneGISModelFlatten._tileBounds(s, source).center,
        new Cartesian3(100, 0, 150),
      ),
    ).toBeLessThan(expanded.radius);
    s.inverse = false;
    expect(SceneGISModelFlatten._tileBounds(s, source)).toBe(source);
    s.inverse = true;
    expect(SceneGISModelFlatten._tileBounds(s, source)).not.toBe(source);
    s.enabled = false;
    expect(SceneGISModelFlatten._tileBounds(s, source)).toBe(source);
    expect(source.center).toEqual(new Cartesian3(100, 0, 40));
    expect(source.radius).toBe(5);
  });
  it("covers lowered and raised vertices without mutating source tile bounds", function () {
    const s = make({ height: -100 });
    const original = new TileBoundingSphere(new Cartesian3(0, 0, 40), 5);
    const lower = SceneGISModelFlatten._tileBounds(s, original);
    expect(
      Cartesian3.distance(lower.center, new Cartesian3(0, 0, -100)),
    ).toBeLessThanOrEqual(lower.radius);
    expect(original.center.z).toBe(40);
    expect(original.radius).toBe(5);
    expect(SceneGISModelFlatten._tileBounds(s, original)).toBe(lower);
    s.height = 150;
    const higher = SceneGISModelFlatten._tileBounds(s, original);
    expect(
      Cartesian3.distance(higher.center, new Cartesian3(0, 0, 150)),
    ).toBeLessThanOrEqual(higher.radius);
    s.enabled = false;
    expect(SceneGISModelFlatten._tileBounds(s, original)).toBe(original);
    expect(SceneGISModelFlatten._tileBounds(undefined, original)).toBe(
      original,
    );
    const ordinary = new CustomShader();
    shaders.push(ordinary);
    expect(SceneGISModelFlatten._tileBounds(ordinary, original)).toBe(original);
  });
  it("retains exact volumes outside the polygon extent and tracks transformed sources", function () {
    const s = make();
    const source = new TileBoundingSphere(new Cartesian3(100, 0, 40), 5);
    expect(SceneGISModelFlatten._tileBounds(s, source)).toBe(source);
    source.update(new Cartesian3(0, 0, 40), 5);
    expect(SceneGISModelFlatten._tileBounds(s, source)).not.toBe(source);
  });
  it("projects conservatively in a globe ENU frame", function () {
    const frame = Transforms.eastNorthUpToFixedFrame(
      Cartesian3.fromDegrees(118.8, 32),
    );
    const point = (z) =>
      Matrix4.multiplyByPoint(frame, new Cartesian3(0, 0, z), new Cartesian3());
    const s = make({ modelMatrix: frame, height: -50 });
    const source = new TileBoundingSphere(point(100), 10);
    const expanded = SceneGISModelFlatten._tileBounds(s, source);
    expect(Cartesian3.distance(expanded.center, point(-50))).toBeLessThan(
      expanded.radius,
    );
    expect(Cartesian3.distance(source.center, point(100))).toBeLessThan(1e-8);
    const outside = (z) =>
      Matrix4.multiplyByPoint(
        frame,
        new Cartesian3(200, 100, z),
        new Cartesian3(),
      );
    const exterior = new TileBoundingSphere(outside(100), 10);
    expect(SceneGISModelFlatten._tileBounds(s, exterior)).toBe(exterior);
    s.inverse = true;
    const inverseBounds = SceneGISModelFlatten._tileBounds(s, exterior);
    expect(
      Cartesian3.distance(inverseBounds.center, outside(-50)),
    ).toBeLessThan(inverseBounds.radius);
  });
  it("restores command bounds on disable, replacement and model movement", function () {
    const s = make({ height: -100 });
    const command = {
      model: { customShader: s },
      runtimePrimitive: {
        boundingSphere: new BoundingSphere(new Cartesian3(0, 0, 40), 5),
        node: {},
        primitive: { primitiveType: PrimitiveType.TRIANGLES },
      },
      modelMatrix: Matrix4.clone(Matrix4.IDENTITY),
      boundingVolume: new BoundingSphere(new Cartesian3(0, 0, 40), 5),
    };
    const result = command.boundingVolume;
    SceneGISModelFlatten._updateCommandBounds(command);
    expect(command.boundingVolume).toBe(result);
    expect(result.radius).toBeGreaterThan(5);
    command.model.customShader = undefined;
    SceneGISModelFlatten._updateCommandBounds(command);
    expect(result.radius).toBe(5);
    expect(result.center.z).toBe(40);
    command.model.customShader = s;
    command.modelMatrix[12] = 200;
    SceneGISModelFlatten._updateCommandBounds(command);
    expect(result.radius).toBe(5);
    expect(result.center.x).toBe(200);
    s.inverse = true;
    SceneGISModelFlatten._updateCommandBounds(command);
    expect(
      Cartesian3.distance(result.center, new Cartesian3(200, 0, -100)),
    ).toBeLessThan(result.radius);
    s.inverse = false;
    SceneGISModelFlatten._updateCommandBounds(command);
    expect(result.radius).toBe(5);
    expect(result.center).toEqual(new Cartesian3(200, 0, 40));
    command.runtimePrimitive.node.instances = { transformInWorldSpace: true };
    expect(() =>
      SceneGISModelFlatten._updateCommandBounds(command),
    ).toThrowDeveloperError();
  });
});
