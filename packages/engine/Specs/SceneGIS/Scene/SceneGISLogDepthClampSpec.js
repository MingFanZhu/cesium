import {
  ClearCommand,
  DerivedCommand,
  PerspectiveFrustum,
  ShaderProgram,
  ShaderSource,
} from "../../../index.js";
import createContext from "../../../../../Specs/createContext.js";

describe("SceneGIS/Scene/SceneGISLogDepthClamp", function () {
  let context;

  beforeAll(function () {
    context = createContext({}, 1, 1);
    context.uniformState.updateFrustum(
      new PerspectiveFrustum({
        near: 10,
        far: 20,
        fov: Math.PI / 3,
        aspectRatio: 1,
      }),
    );
  });

  afterAll(function () {
    context.destroyForSpecs();
  });

  it("caps automatic depth-clamped volumes and preserves ordinary and explicit clipping", function () {
    const variants = [
      { body: "czm_writeDepthClamp();", visible: [true, true, true] },
      { body: "", visible: [false, true, false] },
      {
        body: "czm_writeDepthClamp(); czm_writeLogDepth();",
        visible: [false, true, false],
      },
    ];
    variants.forEach((variant) => {
      let distance = 15;
      const command = context.createViewportQuadCommand(
        `void main() { out_FragColor = vec4(1.0); ${variant.body} }`,
        { uniformMap: { u_distance: () => distance } },
      );
      const base = command.shaderProgram;
      const vs = base.vertexShaderSource.clone();
      vs.sources = vs.sources.map((source) =>
        ShaderSource.replaceMain(source, "quadMain"),
      );
      vs.sources.push(
        "uniform float u_distance; void main() { quadMain(); gl_Position = czm_depthClamp(gl_Position * u_distance); }",
      );
      command.shaderProgram = ShaderProgram.fromCache({
        context,
        vertexShaderSource: vs,
        fragmentShaderSource: base.fragmentShaderSource,
        attributeLocations: base._attributeLocations,
      });
      base.destroy();
      try {
        const derived = DerivedCommand.createLogDepthCommand(
          command,
          context,
        ).command;
        [5, 15, 25].forEach((value, index) => {
          distance = value;
          ClearCommand.ALL.execute(context);
          derived.execute(context);
          expect(context.readPixels()[0]).toBe(
            variant.visible[index] ? 255 : 0,
          );
        });
        expect(context._gl.getError()).toBe(0);
      } finally {
        command.shaderProgram.destroy();
      }
    });
  });
});
