const unlitVertexShader = `
in vec3 position;
out vec2 v_textureCoordinates;

void main()
{
    v_textureCoordinates = position.xy + vec2(0.5);
    gl_Position = czm_modelViewProjection * vec4(position, 1.0);
}
`;

const litVertexShader = `
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

function createVertexShader(enableLighting) {
  return enableLighting ? litVertexShader : unlitVertexShader;
}

function createFragmentShader(layerCount, enableLighting = false) {
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
    ? `
in vec3 v_positionEC;
uniform float u_lambertDiffuseMultiplier;`
    : "";
  const lighting = enableLighting
    ? `
    vec3 normalEC = normalize(cross(dFdx(v_positionEC), dFdy(v_positionEC)));
    normalEC = faceforward(normalEC, vec3(0.0, 0.0, 1.0), -normalEC);
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
