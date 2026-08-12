import fragmentShaderTemplate from "../../../Shaders/SceneGIS/PlanarSurface/SceneGISPlanarSurfaceFS.js";
import geometricLitVertexShader from "../../../Shaders/SceneGIS/PlanarSurface/SceneGISPlanarSurfaceGeometricLitVS.js";
import smoothLitVertexShader from "../../../Shaders/SceneGIS/PlanarSurface/SceneGISPlanarSurfaceSmoothLitVS.js";
import unlitVertexShader from "../../../Shaders/SceneGIS/PlanarSurface/SceneGISPlanarSurfaceUnlitVS.js";

const dynamicLayersToken = "SCENEGIS_PLANAR_SURFACE_DYNAMIC_LAYERS";

function createVertexShader(enableLighting, normalMode = "geometric") {
  if (!enableLighting) {
    return unlitVertexShader;
  }
  return normalMode === "smooth"
    ? smoothLitVertexShader
    : geometricLitVertexShader;
}

function createFragmentShader(
  layerCount,
  enableLighting = false,
  normalMode = "geometric",
) {
  const declarations = [];
  const composition = [];
  for (let i = 0; i < layerCount; ++i) {
    declarations.push(`uniform sampler2D u_texture${i};`);
    declarations.push(`uniform vec4 u_translationScale${i};`);
    declarations.push(`uniform float u_alpha${i};`);
    composition.push(`
    vec2 coordinates${i} = clamp(
        u_translationScale${i}.xy + textureCoordinates * u_translationScale${i}.zw,
        vec2(0.0),
        vec2(1.0));
    vec4 sample${i} = texture(u_texture${i}, coordinates${i});
    color.rgb = mix(color.rgb, sample${i}.rgb, sample${i}.a * u_alpha${i});`);
  }
  const dynamicLayers = `${declarations.join("\n")}

vec4 sceneGISComposeLayers(vec4 color, vec2 textureCoordinates)
{
${composition.join("\n")}
    return color;
}`;
  const defines = enableLighting
    ? `#define SCENEGIS_LIGHTING
${normalMode === "smooth" ? "#define SCENEGIS_SMOOTH_NORMALS\n" : ""}`
    : "";

  return `${defines}${fragmentShaderTemplate.replace(
    dynamicLayersToken,
    dynamicLayers,
  )}`;
}

/** @private */
const SceneGISPlanarSurfaceShader = {
  vertexShader: unlitVertexShader,
  createVertexShader,
  createFragmentShader,
};

export default SceneGISPlanarSurfaceShader;
