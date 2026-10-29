uniform sampler2D u_position;
uniform sampler2D u_style;
uniform sampler2D u_history;
uniform int u_historyColumns;
uniform int u_historyHead;
uniform int u_historyCount;
uniform float u_historyAges[WIND_HISTORY_CAPACITY];
uniform float u_trailDuration;
uniform float u_trailFade;
uniform int u_particleCount;
uniform float u_width;
uniform bool u_widthPixels;
uniform float u_length;
uniform float u_opacity;
in vec2 a_corner;
out vec2 v_uv;
out vec4 v_color;

ivec2 windHeadPixel(int index) {
    int width = textureSize(u_position, 0).x;
    return ivec2(index % width, index / width);
}
vec4 windHistory(int particle, int sampleIndex) {
    ivec2 size = textureSize(u_position, 0);
    ivec2 tile = ivec2(sampleIndex % u_historyColumns, sampleIndex / u_historyColumns);
    return texelFetch(u_history, tile * size + windHeadPixel(particle), 0);
}
void windHidden() {
    v_color = vec4(0.0);
    v_uv = vec2(0.5);
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
vec2 windPixelDirection(vec4 a, vec4 b) {
    return (b.xy / b.w - a.xy / a.w) * czm_viewport.zw;
}
void windWidth(inout vec4 clip, vec2 pixelDirection) {
    vec2 axis = pixelDirection / max(length(pixelDirection), 1e-12);
    vec2 across = vec2(-axis.y, axis.x);
    if (u_widthPixels) {
        clip.xy += across * (2.0 * u_width * a_corner.y / czm_viewport.zw) * clip.w;
    } else {
        vec2 projection = vec2(czm_projection[0][0], czm_projection[1][1]);
        vec2 eyeAcross = normalize(across / (czm_viewport.zw * projection));
        clip.xy += eyeAcross * projection * u_width * a_corner.y;
    }
}
