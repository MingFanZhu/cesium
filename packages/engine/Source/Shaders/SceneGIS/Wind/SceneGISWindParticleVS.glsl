void main() {
    ivec2 pixel = windHeadPixel(gl_InstanceID);
    vec3 p = texelFetch(u_position, pixel, 0).xyz;
    if (sceneGISWindSolid(p)) { windHidden(); return; }
    vec4 field = sceneGISWindSample(p), style = texelFetch(u_style, pixel, 0);
    float fade = smoothstep(0.0, 0.8, style.x) * smoothstep(0.0, 1.2, style.y - style.x);
    vec4 eye = czm_modelView * vec4(p, 1.0);
    vec3 direction = mat3(czm_modelView) * field.xyz;
    vec2 screen = direction.xy * (-eye.z) + eye.xy * direction.z;
    vec2 axis = length(screen) > 1e-8 ? normalize(screen) : vec2(1.0, 0.0);
    eye.xy += axis * a_corner.x * u_length;
    vec4 clip = czm_projection * eye;
    windWidth(clip, axis * vec2(czm_projection[0][0], czm_projection[1][1]) * czm_viewport.zw);
    gl_Position = clip;
    v_uv = a_corner + 0.5;
    v_color = vec4(windDisplayColor(field), u_opacity * fade);
}
