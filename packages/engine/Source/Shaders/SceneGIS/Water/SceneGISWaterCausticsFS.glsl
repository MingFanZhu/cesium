uniform sampler2D u_bathymetry;
uniform vec3 u_fieldLight;
in vec3 v_source;
in vec3 v_receiver;
in vec2 v_sourceUV;
void main()
{
    vec2 size = vec2(textureSize(u_bathymetry, 0));
    vec2 bed = texture(u_bathymetry, (v_sourceUV * (size - 1.0) + 0.5) / size).rg;
    if (bed.x <= 0.0 || bed.y < 0.5 || u_fieldLight.z <= 0.0) { discard; }
    // Conservation of flux under the refracted surface-to-receiver mapping.
    float sourceArea = length(cross(dFdx(v_source), dFdy(v_source)));
    float receiverArea = length(cross(dFdx(v_receiver), dFdy(v_receiver)));
    float focus = min(sourceArea / max(receiverArea, 1e-8), 8.0);
    out_FragColor = vec4(focus, 0.0, 0.0, 1.0);
}
