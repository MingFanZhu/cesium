import { Texture } from "../../../index.js";
import MaterialStageFS from "../../../Source/Shaders/Model/MaterialStageFS.js";
import createContext from "../../../../../Specs/createContext.js";

describe(
  "SceneGIS/Scene/SceneGISModelNormalMapping",
  function () {
    let context;
    let texture;
    let command;

    beforeAll(function () {
      context = createContext({}, 32, 32);
      texture = new Texture({
        context: context,
        source: {
          width: 1,
          height: 1,
          arrayBufferView: new Uint8Array([191, 128, 238, 255]),
        },
      });
    });

    afterEach(function () {
      if (command) {
        command.shaderProgram.destroy();
        command = undefined;
      }
    });

    afterAll(function () {
      texture.destroy();
      context.destroyForSpecs();
    });

    function drawNormal(uv, options = {}) {
      // Compile the production normal functions, stopping before unrelated
      // material fields that require the rest of the model pipeline.
      const functions = MaterialStageFS.slice(
        0,
        MaterialStageFS.indexOf("#ifdef HAS_BASE_COLOR_TEXTURE"),
      );
      const expression = options.anisotropy
        ? "getNormalInfo(attributes).normal"
        : options.clearcoat
          ? "getClearcoatNormalFromTexture(attributes, attributes.normalEC)"
          : "getNormalFromTexture(attributes, attributes.normalEC)";
      command = context.createViewportQuadCommand(
        `
      #define HAS_NORMAL_TEXTURE
      #define TEXCOORD_NORMAL ${uv}
      ${options.clearcoat ? "#define HAS_CLEARCOAT_NORMAL_TEXTURE" : ""}
      #define TEXCOORD_CLEARCOAT_NORMAL ${uv}
      ${options.anisotropy ? "#define USE_ANISOTROPY" : ""}
      ${options.tangents ? "#define HAS_BITANGENTS" : ""}
      in vec2 v_textureCoordinates;
      uniform sampler2D u_normalTexture;
      uniform sampler2D u_clearcoatNormalTexture;
      struct ProcessedAttributes {
          vec3 positionEC;
          vec3 normalEC;
          vec3 tangentEC;
          vec3 bitangentEC;
      };
      ${functions}
      void main() {
          ProcessedAttributes attributes;
          attributes.positionEC = vec3(v_textureCoordinates * 2.0 - 1.0, -1.0);
          attributes.normalEC = vec3(0.0, 0.0, 1.0);
          attributes.tangentEC = vec3(1.0, 0.0, 0.0);
          attributes.bitangentEC = vec3(0.0, 1.0, 0.0);
          vec3 normal = ${expression};
          ${
            options.anisotropy
              ? `
          NormalInfo info = getNormalInfo(attributes);
          bool validFrame = abs(length(info.tangent) - 1.0) < 0.0001
              && abs(length(info.bitangent) - 1.0) < 0.0001
              && abs(dot(info.tangent, info.bitangent)) < 0.0001
              && abs(dot(info.tangent, info.geometryNormal)) < 0.0001;
          if (!validFrame) {
              normal = vec3(-1.0);
          }
          `
              : ""
          }
          out_FragColor = vec4(normal * 0.5 + 0.5, 1.0);
      }`,
        {
          uniformMap: {
            u_normalTexture: function () {
              return texture;
            },
            u_clearcoatNormalTexture: function () {
              return texture;
            },
          },
        },
      );
      command.execute(context);
      return context.readPixels({ x: 16, y: 16, width: 1, height: 1 });
    }

    function expectGeometryNormal(pixel) {
      expect(pixel).toEqualEpsilon([128, 128, 255, 255], 1);
    }

    it("uses geometry normals for constant UVs", function () {
      expectGeometryNormal(drawNormal("vec2(0.0)"));
    });

    it("uses geometry normals for collinear UVs", function () {
      expectGeometryNormal(
        drawNormal(
          "vec2(v_textureCoordinates.x, v_textureCoordinates.x * 2.0)",
        ),
      );
    });

    it("keeps normal mapping for regular UVs", function () {
      expect(drawNormal("v_textureCoordinates")).toEqualEpsilon(
        [191, 128, 238, 255],
        1,
      );
    });

    it("keeps normal mapping for small but nonsingular UVs", function () {
      expect(drawNormal("(v_textureCoordinates * 0.000001)")).toEqualEpsilon(
        [191, 128, 238, 255],
        1,
      );
    });

    it("preserves mirrored texture orientation", function () {
      expect(
        drawNormal("vec2(-v_textureCoordinates.x, v_textureCoordinates.y)"),
      ).toEqualEpsilon([64, 127, 238, 255], 1);
    });

    it("uses provided tangents even with constant UVs", function () {
      expect(drawNormal("vec2(0.0)", { tangents: true })).toEqualEpsilon(
        [191, 128, 238, 255],
        1,
      );
    });

    it("uses geometry normals for a singular clearcoat UV frame", function () {
      expectGeometryNormal(drawNormal("vec2(0.0)", { clearcoat: true }));
    });

    it("keeps anisotropic normals and their basis finite on singular UVs", function () {
      expectGeometryNormal(drawNormal("vec2(0.0)", { anisotropy: true }));
    });

    it("keeps anisotropic normal mapping for regular UVs", function () {
      expect(
        drawNormal("v_textureCoordinates", { anisotropy: true }),
      ).toEqualEpsilon([191, 128, 238, 255], 1);
    });
  },
  "WebGL",
);
