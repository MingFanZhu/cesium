uniform vec3 u_sceneGISSurfaceOrigin;
uniform vec2 u_sceneGISSurfaceAmounts;
uniform float u_sceneGISSurfaceScale;
uniform vec4 u_sceneGISSurfaceSnowColor;
uniform bool u_sceneGISSurfacePlanar;
uniform vec3 u_sceneGISRippleOrigin;
uniform vec4 u_sceneGISSurfaceRipples;

vec3 sceneGISWeatherUp(vec3 positionEC)
{
    vec3 world = czm_viewerPositionWC + czm_inverseViewRotation * positionEC;
    vec3 up = u_sceneGISSurfacePlanar ? vec3(0.0, 0.0, 1.0) :
        normalize(world * czm_ellipsoidInverseRadii * czm_ellipsoidInverseRadii);
    return czm_viewRotation * up;
}

float sceneGISWeatherHash(vec3 p)
{
    p = fract(mod(p, 256.0) * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.x + p.y) * p.z);
}

float sceneGISWeatherNoise(vec3 p)
{
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = mix(sceneGISWeatherHash(i), sceneGISWeatherHash(i + vec3(1, 0, 0)), f.x);
    float b = mix(sceneGISWeatherHash(i + vec3(0, 1, 0)), sceneGISWeatherHash(i + vec3(1, 1, 0)), f.x);
    float c = mix(sceneGISWeatherHash(i + vec3(0, 0, 1)), sceneGISWeatherHash(i + vec3(1, 0, 1)), f.x);
    float d = mix(sceneGISWeatherHash(i + vec3(0, 1, 1)), sceneGISWeatherHash(i + vec3(1, 1, 1)), f.x);
    return mix(mix(a, b, f.y), mix(c, d, f.y), f.z);
}

// Returns wetness and snow coverage. Geometry normals avoid normal-map speckling.
vec2 sceneGISWeatherCoverage(vec3 positionEC, vec3 geometryNormalEC)
{
    float slope = dot(normalize(geometryNormalEC), sceneGISWeatherUp(positionEC));
    float snow = u_sceneGISSurfaceAmounts.y;
    // Uniform branch: dry, wet-only and fully snowy draws do not evaluate patch noise.
    if (snow > 0.0 && snow < 1.0) {
        vec3 p = czm_inverseViewRotation * positionEC / u_sceneGISSurfaceScale + u_sceneGISSurfaceOrigin;
        float noise = sceneGISWeatherNoise(p);
        float footprint = max(length(dFdx(p)), length(dFdy(p)));
        snow = smoothstep(noise * 0.7 + 0.05, noise * 0.7 + 0.25, snow);
        snow = mix(snow, u_sceneGISSurfaceAmounts.y, smoothstep(0.5, 2.0, footprint));
    }
    snow *= smoothstep(0.25, 0.85, slope);
    float wet = u_sceneGISSurfaceAmounts.x * smoothstep(-0.2, 0.2, slope) *
        mix(0.35, 1.0, smoothstep(0.0, 0.8, slope));
    return vec2(wet * (1.0 - snow), snow);
}

vec3 sceneGISWeatherAlbedo(vec3 albedo, vec2 coverage)
{
    return mix(albedo * (1.0 - 0.38 * coverage.x), u_sceneGISSurfaceSnowColor.rgb, coverage.y);
}

vec3 sceneGISWeatherTerrainNormal(vec3 positionEC)
{
    vec3 n = normalize(cross(dFdx(positionEC), dFdy(positionEC)));
    return dot(n, sceneGISWeatherUp(positionEC)) < 0.0 ? -n : n;
}

vec3 sceneGISWeatherRippleNormal(vec3 positionEC, vec3 normalEC, vec3 geometryNormalEC, float wetness)
{
    if (u_sceneGISSurfaceRipples.x == 0.0) { return normalEC; }
    vec3 upEC = sceneGISWeatherUp(positionEC);
    vec3 up = czm_inverseViewRotation * upEC;
    vec3 p = czm_inverseViewRotation * positionEC / u_sceneGISSurfaceRipples.y + u_sceneGISRippleOrigin;
    // Project onto the dominant world plane; correct distances with its tangent metric.
    vec3 a = abs(up);
    int axis = a.z >= max(a.x, a.y) ? 2 : (a.y >= a.x ? 1 : 0);
    vec2 uv = axis == 2 ? p.xy : (axis == 1 ? p.xz : p.yz);
    vec3 n = axis == 2 ? up : (axis == 1 ? up.xzy : up.yzx);
    float footprint = max(length(dFdx(uv)), length(dFdy(uv)));
    float weight = wetness * smoothstep(0.85, 0.98, dot(normalize(geometryNormalEC), upEC)) *
        (1.0 - smoothstep(0.08, 0.3, footprint));
    if (weight <= 0.0) { return normalEC; }
    vec2 gradient = vec2(0.0);
    vec2 cell = floor(uv);
    for (int y = -1; y <= 1; ++y) {
        for (int x = -1; x <= 1; ++x) {
            vec2 id = cell + vec2(x, y);
            float phase = sceneGISWeatherHash(vec3(id, 0.0));
            float t = u_sceneGISSurfaceRipples.z * 0.5 + phase;
            float cycle = mod(floor(t), 256.0);
            float age = fract(t);
            vec2 jitter = vec2(sceneGISWeatherHash(vec3(id, cycle + 7.0)),
                sceneGISWeatherHash(vec3(id, cycle + 29.0)));
            vec2 d = uv - (id + 0.2 + 0.6 * jitter);
            float dz = -dot(n.xy, d) / n.z;
            float r = length(vec3(d, dz));
            float ring = r - 0.42 * age;
            float rank = sceneGISWeatherHash(vec3(id, cycle + 71.0));
            float density = clamp((u_sceneGISSurfaceRipples.x - rank) / 0.08, 0.0, 1.0);
            float wave = sin(ring * 75.0) * exp(-ring * ring * 450.0) *
                sin(age * czm_pi) * (1.0 - age) * density;
            gradient += (d - n.xy * dz / n.z) / max(r, 0.001) * wave;
        }
    }
    vec3 g = axis == 2 ? vec3(gradient, 0.0) :
        (axis == 1 ? vec3(gradient.x, 0.0, gradient.y) : vec3(0.0, gradient));
    g -= up * dot(g, up);
    return normalize(normalEC - czm_viewRotation * g * weight * u_sceneGISSurfaceRipples.w);
}

// Bounded broad water-film highlight for diffuse-only terrain. No SSR receiver is implied.
float sceneGISWeatherFilm(vec3 positionEC, vec3 normalEC, vec3 lightEC, float wetness)
{
    normalEC = sceneGISWeatherRippleNormal(positionEC, normalEC, normalEC, wetness);
    vec3 view = -normalize(positionEC);
    vec3 halfway = normalize(view + lightEC);
    float nh = max(dot(normalEC, halfway), 0.0);
    float vh = max(dot(view, halfway), 0.0);
    float fresnel = 0.02 + 0.98 * pow(1.0 - vh, 5.0);
    return wetness * fresnel * (66.0 / (8.0 * czm_pi)) * pow(nh, 64.0);
}
