uniform sampler2D colorTexture;
uniform float u_rainIntensity;
uniform float u_dropletSize;
uniform float u_distortion;
uniform float u_rainTime;
in vec2 v_textureCoordinates;

float rainLensHash(vec2 p) {
    vec3 q = fract(vec3(mod(p, 256.0), 17.0) * vec3(0.1031, 0.1030, 0.0973));
    q += dot(q, q.yxz + 33.33);
    return fract((q.x + q.y) * q.z);
}

// XY: local refraction gradient, Z: affected footprint, W: bead rim.
vec4 rainLensDrops(vec2 pixel, bool falling) {
    vec2 grid = falling ? vec2(5.0, 10.0) : vec2(4.0, 4.0);
    vec2 q = pixel / (u_dropletSize * grid);
    q += falling ? vec2(19.0, u_rainTime * 0.125) : vec2(0.0);
    vec2 id = floor(q);
    float seed = rainLensHash(id);
    vec2 center = vec2(0.25 + 0.5 * rainLensHash(id + 71.0), 0.5);
    if (!falling) { center.y = 0.25 + 0.5 * rainLensHash(id + 39.0); }
    vec2 d = (fract(q) - center) * grid;
    float size = mix(0.3, 0.65, seed);
    vec2 shape = falling ? vec2(0.65, 1.0) : vec2(1.0);
    vec2 local = d / (size * shape);
    float r = length(local);
    float aa = max(fwidth(r), 0.02);
    float bead = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, r);
    float life = falling ? 1.0 : sin(czm_pi * fract(u_rainTime * 0.125 + seed));
    float density = clamp((u_rainIntensity - rainLensHash(id + 137.0)) / 0.15, 0.0, 1.0);
    float trail = 0.0;
    if (falling) {
        float width = 0.08 + 0.03 * sin(d.y * 5.0 + seed * 20.0);
        trail = (1.0 - smoothstep(width, width + 0.07, abs(d.x))) *
            smoothstep(0.1, 0.6, d.y) * (1.0 - smoothstep(0.6, 3.5, d.y));
    }
    float mask = max(bead * life, trail * 0.35) * density;
    vec2 bend = -local * sqrt(max(0.0, 1.0 - min(r * r, 1.0))) * bead * life;
    bend += vec2(-d.x * 2.0, 0.04) * trail;
    float rim = exp(-pow((r - 0.85) * 9.0, 2.0)) * bead * life;
    return vec4(bend * density, mask, rim * density);
}

void main() {
    vec2 uv = v_textureCoordinates;
    vec4 source = texture(colorTexture, uv);
    if (u_rainIntensity == 0.0) { out_FragColor = source; return; }
    vec2 dimensions = vec2(textureSize(colorTexture, 0));
    vec4 drops = rainLensDrops(uv * dimensions, false) + rainLensDrops(uv * dimensions, true);
    float mask = clamp(drops.z, 0.0, 1.0);
    if (mask <= 0.0) { out_FragColor = source; return; }
    vec2 edge = 0.5 / dimensions;
    vec2 sampleUV = clamp(uv + drops.xy * u_distortion / dimensions, edge, 1.0 - edge);
    vec2 blur = vec2(0.7 * mask) / dimensions;
    vec3 refracted = texture(colorTexture, sampleUV).rgb * 0.6;
    refracted += texture(colorTexture, clamp(sampleUV + vec2(blur.x, 0.0), edge, 1.0 - edge)).rgb * 0.1;
    refracted += texture(colorTexture, clamp(sampleUV - vec2(blur.x, 0.0), edge, 1.0 - edge)).rgb * 0.1;
    refracted += texture(colorTexture, clamp(sampleUV + vec2(0.0, blur.y), edge, 1.0 - edge)).rgb * 0.1;
    refracted += texture(colorTexture, clamp(sampleUV - vec2(0.0, blur.y), edge, 1.0 - edge)).rgb * 0.1;
    refracted *= 1.0 - 0.1 * clamp(drops.w, 0.0, 1.0);
    out_FragColor = vec4(mix(source.rgb, refracted, mask), source.a);
}
