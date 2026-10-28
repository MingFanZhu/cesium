uniform float u_waveAmplitude;
uniform float u_waveLength;
uniform vec2 u_flowDirection;
uniform float u_time;
#ifdef SCENEGIS_WIND_WAVES
uniform sampler2D u_waveNormal0;
uniform sampler2D u_waveNormal1;
uniform sampler2D u_waveNormal2;
uniform sampler2D u_displacement0;
uniform sampler2D u_displacement1;
uniform sampler2D u_displacement2;
uniform float u_wavePeriod;
uniform float u_waveResolution;
#endif

vec2 sceneGISWaterSlopeBand(vec2 p, vec2 direction, float scale, float speed, float phase, float footprint)
{
    float k = czm_twoPi / (u_waveLength * scale);
    float angle = k * dot(direction, p) - u_time * speed + phase;
    return direction * (cos(angle) * k * u_waveAmplitude * scale * exp(-k * k * footprint * footprint));
}

vec2 sceneGISWaterSlope(vec2 p, float footprint)
{
    vec2 d = normalize(u_flowDirection), across = vec2(-d.y, d.x);
    return sceneGISWaterSlopeBand(p, d, 1.0, 1.0, 0.0, footprint) +
        sceneGISWaterSlopeBand(p, normalize(d + across * 0.6), 0.47, 1.7, 1.4, footprint) * 0.5 +
        sceneGISWaterSlopeBand(p, normalize(d - across * 0.8), 0.19, 2.6, 3.2, footprint) * 0.3 +
        sceneGISWaterSlopeBand(p, across, 0.08, 3.9, 0.7, footprint) * 0.15;
}

void sceneGISWaterFieldWave(vec2 p, float spacing, out vec3 position, out vec3 normal)
{
    position = vec3(p, 0.0);
    #ifdef SCENEGIS_WIND_WAVES
    vec3 lod = max(vec3(0.0), log2(spacing * u_waveResolution / (u_wavePeriod * vec3(1.0, 4.0, 0.125))));
    vec2 shift = vec2(0.5 / u_waveResolution);
    vec2 uv0 = p / u_wavePeriod + shift, uv1 = p / (u_wavePeriod * 4.0) + shift, uv2 = p / (u_wavePeriod * 0.125) + shift;
    position += textureLod(u_displacement0, uv0, lod.x).xyz + textureLod(u_displacement1, uv1, lod.y).xyz + textureLod(u_displacement2, uv2, lod.z).xyz;
    vec3 n0 = textureLod(u_waveNormal0, uv0, lod.x).xyz;
    vec3 n1 = textureLod(u_waveNormal1, uv1, lod.y).xyz;
    vec3 n2 = textureLod(u_waveNormal2, uv2, lod.z).xyz;
    normal = normalize(vec3(n0.xy / max(n0.z, 0.1) + n1.xy / max(n1.z, 0.1) + n2.xy / max(n2.z, 0.1), 1.0));
    #else
    normal = normalize(vec3(-sceneGISWaterSlope(p, spacing), 1.0));
    #endif
}
