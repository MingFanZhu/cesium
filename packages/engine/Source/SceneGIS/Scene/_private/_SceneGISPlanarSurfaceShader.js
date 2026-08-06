const vertexShader = `
in vec3 position;
out vec2 v_textureCoordinates;

void main()
{
    v_textureCoordinates = position.xy + vec2(0.5);
    gl_Position = czm_modelViewProjection * vec4(position, 1.0);
}
`;

function createFragmentShader(layerCount) {
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
  return `
in vec2 v_textureCoordinates;
uniform vec4 u_color;
${declarations.join("\n")}

void main()
{
    vec4 color = u_color;
${composition.join("\n")}
    out_FragColor = vec4(color.rgb, 1.0);
}
`;
}

/** @private */
const SceneGISPlanarSurfaceShader = {
  vertexShader,
  createFragmentShader,
};

export default SceneGISPlanarSurfaceShader;
