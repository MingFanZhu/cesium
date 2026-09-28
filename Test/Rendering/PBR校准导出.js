/* global window, document, Blob, URL, btoa */
import * as C from "/Build/CesiumUnminified/index.js";

// Development-only readback. Borrow the actual physical-lighting records without
// changing the renderer or presenting these private records as an application API.
function readFloatTarget(scene, width, height, shader, uniforms) {
  const context = scene.context;
  const texture = new C.Texture({
    context,
    width,
    height,
    pixelFormat: C.PixelFormat.RGBA,
    pixelDatatype: C.PixelDatatype.FLOAT,
  });
  const framebuffer = new C.Framebuffer({
    context,
    colorTextures: [texture],
    destroyAttachments: false,
  });
  let command;
  try {
    command = context.createViewportQuadCommand(shader, {
      framebuffer,
      uniformMap: uniforms,
      renderState: C.RenderState.fromCache({
        viewport: new C.BoundingRectangle(0, 0, width, height),
      }),
    });
    command.execute(context);
    const pixels = context.readPixels({ framebuffer, width, height });
    if (!pixels.every(Number.isFinite)) {
      throw new Error("Calibration readback contains non-finite radiance.");
    }
    return pixels;
  } finally {
    command?.shaderProgram.destroy();
    framebuffer.destroy();
    texture.destroy();
    scene.requestRender();
  }
}

export function captureCalibration(example) {
  const scene = example.viewer.scene;
  const snapshot = example.state.snapshot();
  if (!example.state.ready || snapshot.animate) {
    throw new Error("请等待 Bistro 加载完成并停止时间播放，再导出校准数据。");
  }
  const record = scene.frameState._sceneGISPlanarLighting;
  if (
    snapshot.world !== "planar" ||
    !record?.active ||
    !record.skyReflections?._source
  ) {
    throw new Error(
      "Load the Planar Bistro with physical atmosphere before exporting.",
    );
  }
  if (snapshot.asset !== "scenegis-bistro-v5.2-20260921") {
    throw new Error(
      "This calibration is pinned to the prepared Bistro fixture.",
    );
  }
  const width = 512;
  const height = 256;
  const sky = readFloatTarget(
    scene,
    width,
    height,
    `
    in vec2 v_textureCoordinates;
    uniform samplerCube u_sky;
    uniform mat3 u_worldToLocal;
    uniform float u_scale;
    void main() {
      float longitude = (0.5 - v_textureCoordinates.x) * czm_twoPi;
      float latitude = (v_textureCoordinates.y - 0.5) * czm_pi;
      vec3 direction = vec3(cos(latitude) * cos(longitude),
        cos(latitude) * sin(longitude), sin(latitude));
      out_FragColor = vec4(texture(u_sky, u_worldToLocal * direction).rgb * u_scale, 1.0);
    }`,
    {
      u_sky: () => record.skyReflections._source,
      u_worldToLocal: () => record.skyReflections.worldToLocal,
      u_scale: () => record.surfaceRadianceScale,
    },
  );
  const shader = C._SceneGISModelEnvironmentLighting.surfaceSource(true);
  shader.sources.push(`
    uniform float u_height;
    void main() {
      vec3 beam;
      vec3 sky;
      sceneGISPlanarSurfaceIrradiance(u_height, beam, sky);
      out_FragColor = vec4(beam * u_sceneGISPrimaryLightScale * u_surfaceRadianceScale, 1.0);
    }`);
  const beam = readFloatTarget(scene, 1, 1, shader, {
    ...C._SceneGISModelEnvironmentLighting.surfaceUniforms(
      scene.frameState,
      true,
    ),
    u_height: () => snapshot.camera.position[2],
  });
  const bytes = new Uint8Array(sky.buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return {
    schema: "scenegis-cycles-calibration-v1",
    snapshot,
    model: "../bistro/Bistro.gltf",
    sun: {
      directionToLight: C.Cartesian3.pack(record.primaryLightDirection, []),
      beamIrradiance: Array.from(beam.subarray(0, 3)),
      sampleHeight: snapshot.camera.position[2],
      angularDiameterDegrees: 0.53,
    },
    environment: {
      width,
      height,
      encoding: "float32-le-rgba-bottom-up",
      projection: "u=0.5-atan2(y,x)/(2*pi);v=0.5+asin(z)/pi",
      sourceFaceSize: record.skyReflections._source.width,
      includesSunDisk: false,
      radianceScaleIncluded: record.surfaceRadianceScale,
      data: btoa(binary),
    },
    output: {
      tonemapper: scene.postProcessStages.tonemapper,
      exposure: scene.postProcessStages.exposure,
      gamma: scene.gamma,
      colorSpace: "linear-rec709",
    },
    limitations: [
      "Runtime diffuse sky is hemispherical; Cycles integrates the captured angular sky with geometry visibility.",
      "The sky includes an approximate ground hemisphere, but no local buildings or Sun disk.",
      "Controlled comparisons disable atmospheric perspective and height fog in the runtime.",
      "Cycles transport replaces baked material AO; BRDF, normal-frame and transparency implementations may differ.",
    ],
  };
}

export async function downloadCalibration(example = window.example) {
  const data = captureCalibration(example);
  data.diagnostics = await captureDiagnosticViews(example);
  if (
    data.snapshot.resolution.some(
      (value, i) => value !== example.state.snapshot().resolution[i],
    )
  ) {
    throw new Error("导出期间画布尺寸变化，请固定窗口后重新导出。");
  }
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "bistro-calibration.json";
  link.click();
  URL.revokeObjectURL(url);
  return {
    camera: data.snapshot.camera,
    sun: data.sun,
    output: data.output,
    skySize: [data.environment.width, data.environment.height],
  };
}

function framePng(scene) {
  return new Promise((resolve) => {
    const remove = scene.postRender.addEventListener(() => {
      remove();
      resolve(scene.canvas.toDataURL("image/png"));
    });
    scene.requestRender();
  });
}

// The native unlit branch does not evaluate metallic/roughness. Sample its actual
// bound glTF inputs, including factors and UV transforms. Keep in sync with
// Scene/Model/MaterialPipelineStage.js and Shaders/Model/MaterialStageFS.glsl.
// Source baseline: Cesium 1.144, 6d5d8b1f0725b6f831b336463f4b11c98023427b.
const metallicRoughnessInputs = `
  vec2 calibrationMetallicRoughness() {
    vec2 value = vec2(1.0);
    #ifdef HAS_METALLIC_ROUGHNESS_TEXTURE
      vec2 uv = TEXCOORD_METALLIC_ROUGHNESS;
      #ifdef HAS_METALLIC_ROUGHNESS_TEXTURE_TRANSFORM
        uv = czm_computeTextureTransform(uv, u_metallicRoughnessTextureTransform);
      #endif
      value = clamp(texture(u_metallicRoughnessTexture, uv).bg, 0.0, 1.0);
    #endif
    #ifdef HAS_METALLIC_FACTOR
      value.x = clamp(value.x * u_metallicFactor, 0.0, 1.0);
    #endif
    #ifdef HAS_ROUGHNESS_FACTOR
      value.y = clamp(value.y * u_roughnessFactor, 0.0, 1.0);
    #endif
    return value;
  }
`;

export async function captureDiagnosticViews(example = window.example) {
  const scene = example.viewer.scene;
  const controller = example.viewer.planarCameraController;
  const original = {
    atmosphere: { ...example.atmosphere },
    trial: { ...example.trial },
    comparison: example.state.comparison,
    hdr: scene.highDynamicRange,
    input: controller.enabled,
    custom: example.models.map((model) => model.customShader),
  };
  const result = { schema: "scenegis-calibration-images-v1", images: {} };
  let custom;
  try {
    controller.enabled = false;
    result.images["runtime-original"] = await framePng(scene);
    example.atmosphere.showAerialPerspective = false;
    example.atmosphere.showHeightFog = false;
    example.state.comparison = "实验 B";
    Object.assign(example.trial, {
      ao: false,
      ssr: false,
      antialiasing: "4×MSAA",
    });
    example.state.applyAtmosphere();
    result.images["runtime-controlled"] = await framePng(scene);
    example.trial.antialiasing = "无 AA";
    example.state.apply();
    result.images["runtime-noaa"] = await framePng(scene);
    Object.assign(example.trial, {
      ao: true,
      ssr: true,
      antialiasing: "4×MSAA",
    });
    example.state.apply();
    result.images["runtime-effects"] = await framePng(scene);
    Object.assign(example.trial, { ao: false, ssr: false });
    example.state.apply();
    scene.highDynamicRange = false;
    // Unlit views expose material inputs without direct/indirect lighting.
    const views = {
      "material-basecolor": "material.baseColor.rgb",
      "material-roughness": "vec3(calibrationMetallicRoughness().y)",
      "material-metalness": "vec3(calibrationMetallicRoughness().x)",
      "material-normal":
        "normalize(czm_inverseViewRotation * material.normalEC) * 0.5 + 0.5",
      "material-occlusion": "vec3(material.occlusion)",
    };
    for (const [name, expression] of Object.entries(views)) {
      custom = new C.CustomShader({
        lightingModel: C.LightingModel.UNLIT,
        fragmentShaderText: `${metallicRoughnessInputs}
        void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
          material.diffuse = ${expression};
          material.emissive = vec3(0.0);
        }`,
      });
      for (const model of example.models) {
        model.customShader = custom;
      }
      result.images[name] = await framePng(scene);
      for (const model of example.models) {
        model.customShader = undefined;
      }
      custom.destroy();
      custom = undefined;
    }
    result.controlled = {
      ao: false,
      ssr: false,
      antialiasing: "4×MSAA",
      fog: false,
      aerialPerspective: false,
    };
    result.materialViews =
      "Unlit material inputs; native linear-to-sRGB output, no HDR tone mapping. Metallic/roughness sample the actual bound glTF inputs; base color excludes lighting.";
    return result;
  } finally {
    example.models.forEach((model, i) => {
      model.customShader = original.custom[i];
    });
    custom?.destroy();
    scene.highDynamicRange = original.hdr;
    controller.enabled = original.input;
    Object.assign(example.atmosphere, original.atmosphere);
    Object.assign(example.trial, original.trial);
    example.state.comparison = original.comparison;
    example.state.applyAtmosphere();
    example.gui
      .controllersRecursive()
      .forEach((controller) => controller.updateDisplay());
    await framePng(scene);
  }
}
