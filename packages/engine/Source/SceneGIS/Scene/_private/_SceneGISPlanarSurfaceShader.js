const unlitVertexShader = `
in vec3 position;
out vec2 v_textureCoordinates;

void main()
{
    v_textureCoordinates = position.xy + vec2(0.5);
    gl_Position = czm_modelViewProjection * vec4(position, 1.0);
}
`;

const geometricLitVertexShader = `
in vec3 position;
out vec2 v_textureCoordinates;
out vec3 v_positionEC;

void main()
{
    v_textureCoordinates = position.xy + vec2(0.5);
    v_positionEC = (czm_modelView * vec4(position, 1.0)).xyz;
    gl_Position = czm_modelViewProjection * vec4(position, 1.0);
}
`;

const smoothLitVertexShader = `
in vec3 position;
in vec2 normal;
out vec2 v_textureCoordinates;
out vec3 v_normalEC;

void main()
{
    v_textureCoordinates = position.xy + vec2(0.5);
    // Worker oct normals are fixed planar world-axis vectors.
    v_normalEC = czm_viewRotation * czm_octDecode(normal);
    gl_Position = czm_modelViewProjection * vec4(position, 1.0);
}
`;

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
        u_translationScale${i}.xy + v_textureCoordinates * u_translationScale${i}.zw,
        vec2(0.0),
        vec2(1.0));
    vec4 sample${i} = texture(u_texture${i}, coordinates${i});
    color.rgb = mix(color.rgb, sample${i}.rgb, sample${i}.a * u_alpha${i});`);
  }
  const lightingDeclarations = enableLighting
    ? `${
        normalMode === "smooth"
          ? "in vec3 v_normalEC;"
          : "in vec3 v_positionEC;"
      }
uniform float u_lambertDiffuseMultiplier;`
    : "";
  const lighting = enableLighting
    ? `
    vec3 normalEC = normalize(${
      normalMode === "smooth"
        ? "v_normalEC"
        : "cross(dFdx(v_positionEC), dFdy(v_positionEC))"
    });
    ${
      normalMode === "smooth"
        ? "// Worker normals use the stable topology-up hemisphere."
        : `// Derivative winding can reverse below a double-sided surface. Keep
    // lighting in the stable planar +Z hemisphere instead of facing the camera.
    vec3 planarUpEC = normalize(czm_normal * vec3(0.0, 0.0, 1.0));
    if (dot(normalEC, planarUpEC) < 0.0) {
        normalEC = -normalEC;
    }`
    }
    float diffuse = czm_getLambertDiffuse(czm_lightDirectionEC, normalEC);
    float intensity = clamp(diffuse * u_lambertDiffuseMultiplier + 0.3, 0.0, 1.0);
    color.rgb *= czm_lightColor * intensity;`
    : "";
  return `
in vec2 v_textureCoordinates;
uniform vec4 u_color;
${declarations.join("\n")}
${lightingDeclarations}

void main()
{
    vec4 color = u_color;
${composition.join("\n")}
${lighting}
    out_FragColor = vec4(color.rgb, 1.0);
}
`;
}

/** @private */
const SceneGISPlanarSurfaceShader = {
  vertexShader: unlitVertexShader,
  createVertexShader,
  createFragmentShader,
};

export default SceneGISPlanarSurfaceShader;
