in vec2 v_uv;
in vec4 v_color;
void main() {
    #ifdef WIND_TRAIL
    float coverage = 1.0 - smoothstep(0.3, 0.5, abs(v_uv.y - 0.5));
    #else
    float coverage = 1.0 - smoothstep(0.35, 0.5, length(v_uv - 0.5));
    #endif
    out_FragColor = vec4(v_color.rgb, v_color.a * coverage);
    if (out_FragColor.a < 0.001) discard;
}
