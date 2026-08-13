uniform vec4 u_color;
uniform float u_bodyType;

in vec2 v_discCoordinates;

void main()
{
    float radius = length(v_discCoordinates);
    float edge = fwidth(radius);
    float disc = 1.0 - smoothstep(1.0 - edge, 1.0 + edge, radius);
    float alpha;
    vec3 color = u_color.rgb;

    if (u_bodyType < 0.5) {
        float halo = 1.0 - smoothstep(1.0, 1.25, radius);
        alpha = max(disc, halo * 0.28) * u_color.a;
    } else {
        float limb = sqrt(max(0.0, 1.0 - radius * radius));
        color *= mix(0.68, 1.0, limb);
        alpha = disc * u_color.a;
    }

    if (alpha <= 0.0) {
        discard;
    }
    out_FragColor = vec4(color, alpha);
}
