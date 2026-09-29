uniform bool u_sgHasImage;
uniform sampler2D u_sgImage;
uniform vec4 u_sgPickColor;
in vec2 v_uv;
in vec4 v_color;
void main() {
    vec4 sprite;
    if (u_sgHasImage) {
        sprite = texture(u_sgImage, v_uv);
    } else {
        float r = length(v_uv * 2.0 - 1.0);
        float aa = max(fwidth(r), 0.001);
        sprite = vec4(1.0, 1.0, 1.0, (1.0 - smoothstep(0.2, 1.0, r)) *
            (1.0 - smoothstep(1.0 - aa, 1.0, r)));
    }
    vec4 color = czm_gammaCorrect(sprite) * czm_gammaCorrect(v_color);
    if (color.a < 0.005) { discard; }
    out_FragColor = color;
}
