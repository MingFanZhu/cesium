import {
  Cartesian2,
  Cartesian3,
  CustomShader,
  DirectionalLight,
  ImageBasedLighting,
  Model,
  SceneGISSpecularAntialiasing,
  SceneGISScreenSpaceReflections,
  ShaderSource,
  Axis,
} from "../../../index.js";
import filter from "../../../Source/Shaders/SceneGIS/Antialiasing/SceneGISSpecularAntialiasing.js";
import lighting from "../../../Source/Shaders/Model/LightingStageFS.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe(
  "SceneGIS/Scene/SceneGISSpecularAntialiasing",
  function () {
    let scene, effect, command, customShader, ibl;
    beforeEach(function () {
      scene = createScene({ canvas: createCanvas(32, 32) });
      effect = new SceneGISSpecularAntialiasing({ scene });
    });
    afterEach(function () {
      command?.shaderProgram.destroy();
      scene.primitives.removeAll();
      customShader?.destroy();
      ibl?.destroy();
      scene.destroyForSpecs();
      command = customShader = ibl = undefined;
    });

    function draw({
      enabled = true,
      normal = "vec3(0.0, 0.0, 1.0)",
      roughness = 0.02,
      coat = 0.04,
      mode = "pbr",
    } = {}) {
      command?.shaderProgram.destroy();
      command = scene.context.createViewportQuadCommand(
        new ShaderSource({
          defines: [
            mode === "unlit" ? "LIGHTING_UNLIT" : "LIGHTING_PBR",
            ...(mode === "missingNormals" ? [] : ["HAS_NORMALS"]),
            "USE_CLEARCOAT",
            "HDR",
          ],
          sources: [
            `
      uniform bool u_sceneGISSpecularAntialiasing;
      in vec2 v_textureCoordinates;
      struct ProcessedAttributes { vec3 positionEC; vec3 normalEC; };
      ${filter}
      ${lighting}
      void main() {
        ProcessedAttributes attributes;
        attributes.positionEC = vec3(0.0, 0.0, -1.0);
        attributes.normalEC = ${normal};
        czm_modelMaterial material;
        material.roughness = ${Number(roughness).toFixed(5)};
        material.clearcoatRoughness = ${Number(coat).toFixed(5)};
        material.clearcoatNormal = vec3(0.0, 0.0, 1.0);
        material.clearcoatFactor = 1.0;
        material.normalEC = normalize(vec3(0.2, 0.1, 1.0));
        material.diffuse = vec3(0.2);
        material.specular = vec3(0.04);
        material.emissive = vec3(0.1);
        material.occlusion = 1.0;
        material.alpha = 0.6;
        lightingStage(material, attributes);
        out_FragColor = vec4(material.roughness, material.clearcoatRoughness,
          material.normalEC.x, material.alpha);
      }`,
          ],
        }),
        { uniformMap: { u_sceneGISSpecularAntialiasing: () => enabled } },
      );
      command.execute(scene.context);
      return Array.from(
        scene.context.readPixels({ x: 16, y: 16, width: 1, height: 1 }),
      );
    }

    it("defaults off, publishes changes and detaches without owning GPU resources", function () {
      expect(effect.enabled).toBe(false);
      effect.enabled = true;
      scene.updateFrameState();
      expect(scene.frameState._sceneGISSpecularAntialiasingEnabled).toBe(true);
      effect.destroy();
      scene.updateFrameState();
      expect(scene.frameState._sceneGISSpecularAntialiasingEnabled).toBe(false);
      expect(effect.isDestroyed()).toBe(true);
      effect = new SceneGISSpecularAntialiasing({ scene, enabled: true });
      scene.destroyForSpecs();
      expect(effect.isDestroyed()).toBe(true);
      scene = createScene();
    });

    it("rejects invalid configuration without replacing the attached setting", function () {
      expect(() => new SceneGISSpecularAntialiasing()).toThrowDeveloperError();
      expect(
        () => new SceneGISSpecularAntialiasing({ scene }),
      ).toThrowDeveloperError();
      expect(() => {
        effect.enabled = 1;
      }).toThrowDeveloperError();
      expect(scene._sceneGISSpecularAntialiasing).toBe(effect);
      effect.destroy();
      expect(
        () => new SceneGISSpecularAntialiasing({ scene, enabled: "yes" }),
      ).toThrowDeveloperError();
      expect(scene._sceneGISSpecularAntialiasing).toBeUndefined();
    });

    it("preserves flat mirrors and perturbed shading normals exactly", function () {
      const off = draw({ enabled: false, roughness: 0 });
      expect(draw({ roughness: 0 })).toEqual(off);
      expect(off).toEqualEpsilon([0, 10, 50, 255], 1);
    });

    it("broadens both material lobes only when geometry changes within a pixel", function () {
      const normal = "normalize(vec3(v_textureCoordinates * 2.0 - 1.0, 1.0))";
      const off = draw({ normal, enabled: false });
      const on = draw({ normal });
      expect(on[0]).toBeGreaterThan(off[0] + 10);
      expect(on[1] - off[1]).toEqualEpsilon(on[0] - off[0], 1);
      expect(on.slice(2)).toEqual(off.slice(2));
      const coarse = draw({
        normal:
          "normalize(vec3((v_textureCoordinates * 2.0 - 1.0) * 3.0, 1.0))",
      });
      expect(coarse[0]).toBeGreaterThan(on[0]);
    });

    it("caps filtered roughness at one", function () {
      expect(
        draw({
          roughness: 0.99,
          coat: 0.99,
          normal: "normalize(vec3(v_textureCoordinates * 2.0 - 1.0, 1.0))",
        }).slice(0, 2),
      ).toEqual([255, 255]);
    });

    for (const mode of ["unlit", "missingNormals"]) {
      it(`preserves ${mode} materials`, function () {
        const normal = "normalize(vec3(v_textureCoordinates * 2.0 - 1.0, 1.0))";
        expect(draw({ mode, normal })).toEqual(
          draw({ mode, normal, enabled: false }),
        );
      });
    }

    it("filters a real Model after CustomShader without replacing commands, and restores on destroy", async function () {
      scene.fog.enabled = false;
      scene.light = new DirectionalLight({
        direction: new Cartesian3(0, 0, -1),
      });
      scene.camera.setView({
        destination: new Cartesian3(0, 0, 3),
        orientation: {
          direction: new Cartesian3(0, 0, -1),
          up: Cartesian3.UNIT_Y,
        },
      });
      scene.camera.frustum.near = 0.1;
      customShader = new CustomShader({
        fragmentShaderText:
          "void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) { material.diffuse = vec3(0.0); material.specular = vec3(1.0); material.roughness = 0.02; material.clearcoatRoughness = 0.02; material.clearcoatFactor = 1.0; }",
      });
      ibl = new ImageBasedLighting({
        imageBasedLightingFactor: Cartesian2.ZERO,
      });
      const values = new Float32Array([
        -1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0, -0.577, -0.577, 0.577, 0.577,
        -0.577, 0.577, -0.577, 0.577, 0.577, 0.577, 0.577, 0.577,
      ]);
      const gltf = {
        asset: { version: "2.0" },
        extensionsUsed: ["KHR_materials_clearcoat"],
        buffers: [
          {
            byteLength: values.byteLength,
            uri: `data:application/octet-stream;base64,${btoa(String.fromCharCode(...new Uint8Array(values.buffer)))}`,
          },
        ],
        bufferViews: [
          { buffer: 0, byteOffset: 0, byteLength: 48 },
          { buffer: 0, byteOffset: 48, byteLength: 48 },
        ],
        accessors: [
          {
            bufferView: 0,
            componentType: 5126,
            count: 4,
            type: "VEC3",
            min: [-1, -1, 0],
            max: [1, 1, 0],
          },
          { bufferView: 1, componentType: 5126, count: 4, type: "VEC3" },
        ],
        materials: [
          {
            pbrMetallicRoughness: { roughnessFactor: 0.9 },
            extensions: {
              KHR_materials_clearcoat: {
                clearcoatFactor: 1,
                clearcoatRoughnessFactor: 0.9,
              },
            },
          },
        ],
        meshes: [
          {
            primitives: [
              { attributes: { POSITION: 0, NORMAL: 1 }, material: 0, mode: 5 },
            ],
          },
        ],
        nodes: [{ mesh: 0 }],
        scenes: [{ nodes: [0] }],
        scene: 0,
      };
      const model = scene.primitives.add(
        await Model.fromGltfAsync({
          gltf,
          upAxis: Axis.Z,
          forwardAxis: Axis.Y,
          customShader,
          imageBasedLighting: ibl,
          environmentMapOptions: { enabled: false },
        }),
      );
      await pollToPromise(() => {
        scene.renderForSpecs();
        return (
          model.ready &&
          model._drawCommandsBuilt &&
          scene.frameState.commandList.length > 0 &&
          !ibl.shouldRegenerateShaders
        );
      });
      const off = Array.from(scene.context.readPixels());
      const runtimePrimitive =
        model.sceneGraph._runtimeNodes[0].runtimePrimitives[0];
      const draw = runtimePrimitive.drawCommand;
      expect(draw).toBeDefined();
      spyOn(model, "resetDrawCommands").and.callThrough();
      effect.enabled = true;
      scene.renderForSpecs();
      expect(Array.from(scene.context.readPixels())).not.toEqual(off);
      expect(runtimePrimitive.drawCommand).toBe(draw);
      expect(model.resetDrawCommands).not.toHaveBeenCalled();
      effect.destroy();
      scene.renderForSpecs();
      expect(Array.from(scene.context.readPixels())).toEqual(off);

      // Native IBL and main-pass SSR must see the same post-CustomShader roughness.
      scene.highDynamicRange = true;
      scene.msaaSamples = 1;
      ibl.imageBasedLightingFactor = new Cartesian2(0, 1);
      ibl.specularEnvironmentMaps =
        "./Data/EnvironmentMap/kiara_6_afternoon_2k_ibl.ktx2";
      const ssr = new SceneGISScreenSpaceReflections({ scene, enabled: true });
      effect = new SceneGISSpecularAntialiasing({ scene });
      await pollToPromise(() => {
        scene.renderForSpecs();
        return (
          ssr.ready &&
          ibl.useSpecularEnvironmentMaps &&
          ibl._previousSpecularEnvironmentMapLoaded &&
          !ibl.shouldRegenerateShaders
        );
      });
      command = scene.context.createViewportQuadCommand(
        `
      uniform sampler2D u_base;
      uniform sampler2D u_coat;
      void main() {
        out_FragColor = vec4(texelFetch(u_base, ivec2(16), 0).w,
          texelFetch(u_coat, ivec2(16), 0).w, 0.0, 1.0);
      }`,
        {
          uniformMap: {
            u_base: () => ssr._state.raw.getColorTexture(1),
            u_coat: () => ssr._state.raw.getColorTexture(2),
          },
        },
      );
      command.execute(scene.context);
      const originalLobes = Array.from(
        scene.context.readPixels({ width: 1, height: 1 }),
      );
      expect(originalLobes.slice(0, 2)).toEqualEpsilon([5, 5], 1);
      effect.enabled = true;
      scene.renderForSpecs();
      command.execute(scene.context);
      const filteredLobes = Array.from(
        scene.context.readPixels({ width: 1, height: 1 }),
      );
      expect(filteredLobes[0]).toBeGreaterThan(originalLobes[0] + 5);
      expect(filteredLobes[1]).toEqualEpsilon(filteredLobes[0], 1);
      expect(ssr._state.mainPass).toBe(true);
    });
  },
  "WebGL",
);
