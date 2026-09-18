uniform sampler2D u_depth;
in vec2 v_textureCoordinates;
void main()
{
    float depth = texture(u_depth, gl_FragCoord.xy / vec2(textureSize(u_depth, 0))).r;
    if (depth >= 1.0) { discard; }
    vec4 eye = czm_windowToEyeCoordinates(gl_FragCoord.xy, depth);
    out_FragColor = vec4(-eye.z / eye.w, 0.0, 0.0, 1.0);
}
