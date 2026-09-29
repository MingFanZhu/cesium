uniform vec3 u_sceneGISSurfaceOrigin;
uniform vec2 u_sceneGISSurfaceAmounts;
uniform float u_sceneGISSurfaceScale;
uniform vec4 u_sceneGISSurfaceSnowColor;
uniform bool u_sceneGISSurfacePlanar;

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

// Bounded broad water-film highlight for diffuse-only terrain. No SSR receiver is implied.
float sceneGISWeatherFilm(vec3 positionEC, vec3 normalEC, vec3 lightEC, float wetness)
{
    vec3 view = -normalize(positionEC);
    vec3 halfway = normalize(view + lightEC);
    float nh = max(dot(normalEC, halfway), 0.0);
    float vh = max(dot(view, halfway), 0.0);
    float fresnel = 0.02 + 0.98 * pow(1.0 - vh, 5.0);
    return wetness * fresnel * (66.0 / (8.0 * czm_pi)) * pow(nh, 64.0);
}
