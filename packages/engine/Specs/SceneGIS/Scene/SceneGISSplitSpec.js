import {
  ClearCommand,
  Color,
  ShaderSource,
  SplitDirection,
  Splitter,
} from "../../../index.js";
import ModelSplitterStageFS from "../../../Source/Shaders/Model/ModelSplitterStageFS.js";
import PrimitiveGaussianSplatFS from "../../../Source/Shaders/PrimitiveGaussianSplatFS.js";
import createContext from "../../../../../Specs/createContext.js";
import createFrameState from "../../../../../Specs/createFrameState.js";

describe(
  "SceneGIS/Scene/SceneGISSplit",
  function () {
    let context;
    let frameState;
    beforeAll(function () {
      context = createContext(undefined, 48, 32);
      frameState = createFrameState(context);
    });
    afterAll(function () {
      frameState.creditDisplay.destroy();
      context.destroyForSpecs();
    });

    it("retains native enum values and exposes distinct vertical directions", function () {
      expect([
        SplitDirection.LEFT,
        SplitDirection.NONE,
        SplitDirection.RIGHT,
      ]).toEqual([-1, 0, 1]);
      expect(SplitDirection.TOP).toBe(-2);
      expect(SplitDirection.BOTTOM).toBe(2);
    });

    const white = "void main() { out_FragColor = vec4(1.0); }";
    const model = `uniform float model_splitDirection;
    ${ModelSplitterStageFS}
    void main() { modelSplitterStage(); out_FragColor = vec4(1.0); }`;
    const gaussian = `uniform float v_splitDirection;
    const vec2 v_vertPos = vec2(0.0);
    const vec4 v_splatColor = vec4(1.0);
    ${PrimitiveGaussianSplatFS}`;

    [
      ["Model", model, "model_splitDirection"],
      ["Splitter", Splitter.modifyFragmentShader(white), "czm_splitDirection"],
      ["native Gaussian", gaussian, "v_splitDirection"],
    ].forEach(([name, source, uniform]) => {
      it(`${name} clips both axes in drawing-buffer pixels`, function () {
        let direction = SplitDirection.NONE;
        const command = context.createViewportQuadCommand(source, {
          uniformMap: { [uniform]: () => direction },
        });
        const pixel = (x, y) =>
          Array.from(context.readPixels({ x, y, width: 1, height: 1 }));
        const render = (value, position) => {
          direction = value;
          frameState.splitPosition = position;
          context.uniformState.update(frameState);
          new ClearCommand({ color: Color.BLACK }).execute(context);
          command.execute(context);
        };
        try {
          for (const [value, position, expected] of [
            [SplitDirection.NONE, 0.3, [true, true, true, true]],
            [SplitDirection.LEFT, 0.5, [true, false, true, false]],
            [SplitDirection.RIGHT, 0.5, [false, true, false, true]],
            [SplitDirection.TOP, 0.5, [true, true, false, false]],
            [SplitDirection.BOTTOM, 0.5, [false, false, true, true]],
            [SplitDirection.TOP, 0.2, [false, false, false, false]],
            [SplitDirection.BOTTOM, 0.8, [false, false, false, false]],
            [SplitDirection.TOP, 0, [false, false, false, false]],
            [SplitDirection.TOP, 1, [true, true, true, true]],
            [SplitDirection.BOTTOM, 0, [true, true, true, true]],
            [SplitDirection.BOTTOM, 1, [false, false, false, false]],
          ]) {
            render(value, position);
            [
              [12, 23],
              [36, 23],
              [12, 8],
              [36, 8],
            ].forEach(([x, y], i) => {
              expect(pixel(x, y))
                .withContext(
                  `${name} direction=${value} position=${position} pixel=${x},${y}`,
                )
                .toEqual(expected[i] ? [255, 255, 255, 255] : [0, 0, 0, 255]);
            });
          }
        } finally {
          command.shaderProgram.destroy();
        }
      });
    });

    [
      ["Model", model, "model_splitDirection"],
      ["Splitter", Splitter.modifyFragmentShader(white), "czm_splitDirection"],
    ].forEach(([name, source, uniform]) => {
      it(`${name} still excludes shadow-map rendering from splitting`, function () {
        const command = context.createViewportQuadCommand(
          new ShaderSource({
            defines: ["SHADOW_MAP"],
            sources: [source],
          }),
          { uniformMap: { [uniform]: () => SplitDirection.TOP } },
        );
        try {
          frameState.splitPosition = 0;
          context.uniformState.update(frameState);
          new ClearCommand({ color: Color.BLACK }).execute(context);
          command.execute(context);
          expect(
            Array.from(
              context.readPixels({ x: 24, y: 8, width: 1, height: 1 }),
            ),
          ).toEqual([255, 255, 255, 255]);
        } finally {
          command.shaderProgram.destroy();
        }
      });
    });
  },
  "WebGL",
);
