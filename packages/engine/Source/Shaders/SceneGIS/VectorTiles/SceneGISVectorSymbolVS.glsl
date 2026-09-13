in vec3 anchorHigh;
in vec3 anchorLow;
in vec2 offset;
in vec2 uv;
in vec4 color;
in vec4 haloColor;
in vec3 parameters;
in vec4 pickColor;
out vec2 v_uv;
out vec4 v_color;
out vec4 v_haloColor;
out vec3 v_parameters;
out vec4 v_pickColor;
out float v_eyeDepth;
void main()
{
    vec4 anchor = czm_translateRelativeToEye(anchorHigh, anchorLow);
    vec4 p = czm_modelViewProjectionRelativeToEye * anchor;
    v_eyeDepth = -(czm_modelViewRelativeToEye * anchor).z;
    p.xy += vec2(offset.x, -offset.y) * czm_pixelRatio * 2.0 / czm_viewport.zw * p.w;
    gl_Position = p;
    gl_Position.z = clamp(p.z, -p.w, p.w);
    v_uv = uv;
    v_color = color;
    v_haloColor = haloColor;
    v_parameters = parameters;
    v_pickColor = pickColor;
}
