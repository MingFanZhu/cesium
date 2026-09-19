import {
  Cartesian2,
  Cartesian3,
  Cartesian4,
  Color,
  Matrix2,
  Matrix3,
  Matrix4,
} from "../../../index.js";
import createContext from "../../../../../Specs/createContext.js";

describe("SceneGIS/Renderer/SceneGISUniformArray", function () {
  let context;
  let command;
  beforeEach(function () {
    context = createContext({}, 1, 1);
  });
  afterEach(function () {
    command?.shaderProgram.destroy();
    context.destroyForSpecs();
  });

  const cases = [
    ["float", "uniform1fv", () => 0.1, "u_values[1]", (v) => (v[1] = 0.6)],
    [
      "vec2",
      "uniform2fv",
      () => new Cartesian2(0.1, 0.2),
      "u_values[1].x",
      (v) => (v[1].x = 0.6),
    ],
    [
      "vec3",
      "uniform3fv",
      () => new Cartesian3(0.1, 0.2, 0.3),
      "u_values[1].x",
      (v) => (v[1].x = 0.6),
    ],
    [
      "vec4",
      "uniform4fv",
      () => new Cartesian4(0.1, 0.2, 0.3, 0.4),
      "u_values[1].x",
      (v) => (v[1].x = 0.6),
    ],
    [
      "vec3",
      "uniform3fv",
      () => new Color(0.1, 0.2, 0.3, 0.4),
      "u_values[1].r",
      (v) => (v[1].red = 0.6),
    ],
    [
      "vec4",
      "uniform4fv",
      () => new Color(0.1, 0.2, 0.3, 0.4),
      "u_values[1].r",
      (v) => (v[1].red = 0.6),
    ],
    [
      "mat2",
      "uniformMatrix2fv",
      () => Matrix2.fromUniformScale(0.1),
      "u_values[1][0][0]",
      (v) => (v[1][0] = 0.6),
    ],
    [
      "mat3",
      "uniformMatrix3fv",
      () => Matrix3.fromUniformScale(0.1),
      "u_values[1][0][0]",
      (v) => (v[1][0] = 0.6),
    ],
    [
      "mat4",
      "uniformMatrix4fv",
      () => Matrix4.fromUniformScale(0.1),
      "u_values[1][0][0]",
      (v) => (v[1][0] = 0.6),
    ],
  ];
  cases.forEach(([type, upload, value, expression, mutate]) => {
    it(`reuses packed ${type} ${value().constructor.name} values and uploads in-place mutations`, function () {
      const values = [value(), value()];
      let callbacks = 0;
      command = context.createViewportQuadCommand(
        `uniform ${type} u_values[2];
         void main() { out_FragColor = vec4(${expression}, 0.0, 0.0, 1.0); }`,
        {
          uniformMap: {
            u_values: () => {
              ++callbacks;
              return values;
            },
          },
        },
      );
      const spy = spyOn(context._gl, upload).and.callThrough();
      command.execute(context);
      const pixel = context.readPixels()[0];
      expect(pixel).toEqualEpsilon(26, 1);
      expect(spy.calls.count()).toBe(1);
      command.execute(context);
      values[1] = value();
      command.execute(context);
      expect(callbacks).toBe(3);
      expect(spy.calls.count()).toBe(1);
      mutate(values);
      command.execute(context);
      expect(spy.calls.count()).toBe(2);
      expect(context.readPixels()[0]).toEqualEpsilon(153, 1);
      values[1] = value();
      command.execute(context);
      expect(spy.calls.count()).toBe(3);
      expect(context.readPixels()[0]).toBe(pixel);
    });
  });
});
