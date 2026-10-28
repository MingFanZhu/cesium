uniform sampler2D u_bathymetry;
uniform vec3 u_fieldLight;
in float v_focus;
in vec2 v_sourceUV;
void main()
{
    vec2 size = vec2(textureSize(u_bathymetry, 0));
    vec2 bed = texture(u_bathymetry, (v_sourceUV * (size - 1.0) + 0.5) / size).rg;
    if (bed.x <= 0.0 || bed.y < 0.5 || u_fieldLight.z <= 0.0) { discard; }
    out_FragColor = vec4(v_focus, 0.0, 0.0, 1.0);
}
