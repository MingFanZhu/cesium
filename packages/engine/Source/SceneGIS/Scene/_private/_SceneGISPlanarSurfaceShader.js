import fragmentShaderTemplate from "../../../Shaders/SceneGIS/PlanarSurface/SceneGISPlanarSurfaceFS.js";
import geometricLitVertexShader from "../../../Shaders/SceneGIS/PlanarSurface/SceneGISPlanarSurfaceGeometricLitVS.js";
import smoothLitVertexShader from "../../../Shaders/SceneGIS/PlanarSurface/SceneGISPlanarSurfaceSmoothLitVS.js";
import unlitVertexShader from "../../../Shaders/SceneGIS/PlanarSurface/SceneGISPlanarSurfaceUnlitVS.js";
import planarLighting from "./_SceneGISPlanarEnvironmentLighting.js";
import clippingSource from "../../../Shaders/SceneGIS/PlanarSurface/SceneGISPlanarClippingFS.js";

const dynamicLayersToken = "SCENEGIS_PLANAR_SURFACE_DYNAMIC_LAYERS";
const materialSourceToken = "SCENEGIS_PLANAR_SURFACE_MATERIAL_SOURCE";

function createVertexShader(
  enableLighting,
  normalMode = "geometric",
  enableMaterial = false,
  advancedLighting = false,
  clipping = false,
) {
  const clippingDefine = clipping ? "#define SCENEGIS_CLIPPING\n" : "";
  if (!enableLighting && !enableMaterial && !advancedLighting) {
    return `${clippingDefine}${unlitVertexShader}`;
  }
  const shader =
    normalMode === "smooth" ? smoothLitVertexShader : geometricLitVertexShader;
  const defines = `${enableMaterial ? "#define SCENEGIS_MATERIAL\n" : ""}${advancedLighting ? "#define SCENEGIS_ADVANCED_LIGHTING\n" : ""}`;
  return `${clippingDefine}${defines}${shader}`;
}

function createFragmentShader(
  layerCount,
  enableLighting = false,
  normalMode = "geometric",
  materialSource,
  advancedLighting = false,
  translucent = false,
  clipping = false,
) {
  const declarations = [];
  const composition = [];
  for (let i = 0; i < layerCount; ++i) {
    declarations.push(`uniform sampler2D u_texture${i};`);
    declarations.push(`uniform vec4 u_translationScale${i};`);
    declarations.push(`uniform vec4 u_coverage${i};`);
    declarations.push(`uniform float u_alpha${i};`);
    declarations.push(`uniform float u_brightness${i};`);
    declarations.push(`uniform float u_contrast${i};`);
    declarations.push(`uniform float u_hue${i};`);
    declarations.push(`uniform float u_saturation${i};`);
    declarations.push(`uniform float u_gamma${i};`);
    declarations.push(`uniform vec4 u_colorToAlpha${i};`);
    declarations.push(`uniform float u_colorToAlphaThreshold${i};`);
    composition.push(`
    vec2 coordinates${i} = clamp(
        u_translationScale${i}.xy + textureCoordinates * u_translationScale${i}.zw,
        vec2(0.0),
        vec2(1.0));
    vec4 sample${i} = texture(u_texture${i}, coordinates${i});
    vec2 inside${i} = step(u_coverage${i}.xy, textureCoordinates) *
        step(textureCoordinates, u_coverage${i}.zw);
    sample${i}.a *= inside${i}.x * inside${i}.y;
    if (u_colorToAlpha${i}.a > 0.5 &&
        max(max(abs(sample${i}.r - u_colorToAlpha${i}.r),
                abs(sample${i}.g - u_colorToAlpha${i}.g)),
            abs(sample${i}.b - u_colorToAlpha${i}.b)) <
            u_colorToAlphaThreshold${i}) {
        sample${i}.a = 0.0;
    }
    if (u_gamma${i} != 1.0) {
        sample${i}.rgb = pow(sample${i}.rgb, vec3(1.0 / u_gamma${i}));
    }
    if (u_brightness${i} != 1.0) {
        sample${i}.rgb = mix(vec3(0.0), sample${i}.rgb, u_brightness${i});
    }
    if (u_contrast${i} != 1.0) {
        sample${i}.rgb = mix(vec3(0.5), sample${i}.rgb, u_contrast${i});
    }
    if (u_hue${i} != 0.0) {
        sample${i}.rgb = czm_hue(sample${i}.rgb, u_hue${i});
    }
    if (u_saturation${i} != 1.0) {
        sample${i}.rgb = czm_saturation(sample${i}.rgb, u_saturation${i});
    }
    color.rgb = mix(color.rgb, sample${i}.rgb, sample${i}.a * u_alpha${i});`);
  }
  const dynamicLayers = `${declarations.join("\n")}

vec4 sceneGISComposeLayers(vec4 color, vec2 textureCoordinates)
{
${composition.join("\n")}
    return color;
}`;
  const enableMaterial = materialSource !== undefined;
  let defines =
    enableLighting || advancedLighting ? "#define SCENEGIS_LIGHTING\n" : "";
  if (
    normalMode === "smooth" &&
    (enableLighting || enableMaterial || advancedLighting)
  ) {
    defines += "#define SCENEGIS_SMOOTH_NORMALS\n";
  }
  if (enableMaterial) {
    defines += "#define SCENEGIS_MATERIAL\n";
  }
  if (translucent) {
    defines += "#define SCENEGIS_SURFACE_TRANSLUCENCY\n";
  }
  if (clipping) {
    defines += `#define SCENEGIS_CLIPPING\n${clippingSource}\n`;
  }
  if (advancedLighting) {
    defines += `#define SCENEGIS_ADVANCED_LIGHTING\n${planarLighting.source}\n`;
  }

  return `${defines}${fragmentShaderTemplate
    .replace(dynamicLayersToken, dynamicLayers)
    .replace(materialSourceToken, materialSource ?? "")}`;
}

/** @private */
const SceneGISPlanarSurfaceShader = {
  vertexShader: unlitVertexShader,
  createVertexShader,
  createFragmentShader,
};

export default SceneGISPlanarSurfaceShader;
