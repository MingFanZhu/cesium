in vec3 position;
out vec3 v_positionEC;
out vec2 v_waterPosition;
#ifdef SCENEGIS_CURVED_WATER
in vec3 waterNormal;
in vec3 waterEast;
in vec2 wavePosition;
uniform vec2 u_waterOffset;
out vec3 v_waterBaseEC;
out vec3 v_waterUpEC;
out vec3 v_waterEastEC;
#endif
#ifdef SCENEGIS_RIVER_WATER
in vec3 riverData;
in vec2 riverFlow;
uniform vec2 u_riverOffset;
out vec3 v_riverData;
out vec2 v_riverFlow;
out vec2 v_riverPosition;
#endif
#if defined(SCENEGIS_WIND_WAVES) || defined(SCENEGIS_RIVER_WATER)
in vec2 waveData;
out float v_shoreFade;
#endif
#ifdef SCENEGIS_WIND_WAVES
uniform sampler2D u_displacement0;
uniform sampler2D u_displacement1;
uniform sampler2D u_displacement2;
uniform float u_wavePeriod;
uniform float u_waveResolution;
uniform float u_waveLodScale;
vec3 sceneGISWaveDisplacement(sampler2D wave, float period, float spacing) {
    // Texture texel zero represents local position zero, not the texel corner.
    #ifdef SCENEGIS_CURVED_WATER
    vec2 uv = (wavePosition + u_waterOffset) / period + 0.5 / u_waveResolution;
    #else
    vec2 uv = position.xy / period + 0.5 / u_waveResolution;
    #endif
    float lod = max(0.0, log2(spacing * u_waveResolution / period));
    return textureLod(wave, uv, lod).xyz;
}
#endif
void main() {
    vec3 local = position;
    #if defined(SCENEGIS_WIND_WAVES) || defined(SCENEGIS_CURVED_WATER)
    vec3 undisplacedEC = (czm_modelView * vec4(position, 1.0)).xyz;
    #endif
    #if defined(SCENEGIS_WIND_WAVES) || defined(SCENEGIS_RIVER_WATER)
    float eyeDepth = abs(undisplacedEC.z);
    float pixelSpacing = 2.0 * (czm_projection[3][3] == 0.0 ? eyeDepth : 1.0) /
        (czm_viewport.w * abs(czm_projection[1][1]));
    // The closest-point tile distance selects a mesh no coarser than this continuous
    // vertex footprint. Equal positions therefore retain equal wave energy, including
    // across stitched edges; finest-edge filtering would create a visible tile grid.
    #ifdef SCENEGIS_CURVED_WATER
    float meshSpacing = max(waveData.y, pixelSpacing * 8.0);
    #else
    float meshSpacing = waveData.y * max(1.0, length(undisplacedEC) * u_waveLodScale);
    #endif
    float spacing = max(meshSpacing, pixelSpacing);
    #endif
    #ifdef SCENEGIS_WIND_WAVES
    vec3 displacement = (sceneGISWaveDisplacement(u_displacement0, u_wavePeriod, spacing) +
        sceneGISWaveDisplacement(u_displacement1, u_wavePeriod * 4.0, spacing) +
        sceneGISWaveDisplacement(u_displacement2, u_wavePeriod * 0.125, spacing)) * waveData.x;
    #ifdef SCENEGIS_CURVED_WATER
    vec3 waterNorth = normalize(cross(waterNormal, waterEast));
    local += mat3(waterEast, waterNorth, waterNormal) * displacement;
    #else
    local += displacement;
    #endif
    #endif
    #if defined(SCENEGIS_WIND_WAVES) || defined(SCENEGIS_RIVER_WATER)
    v_shoreFade = waveData.x;
    #endif
    #ifdef SCENEGIS_CURVED_WATER
    v_waterBaseEC = undisplacedEC;
    v_waterUpEC = czm_normal * waterNormal;
    v_waterEastEC = czm_normal * waterEast;
    #endif
    #ifdef SCENEGIS_RIVER_WATER
    vec2 riverPosition = wavePosition + u_riverOffset;
    local += waterNormal * (sceneGISRiverHeight(riverPosition, riverFlow, riverData.z, spacing) * waveData.x);
    v_riverData = riverData;
    v_riverFlow = riverFlow;
    v_riverPosition = riverPosition;
    #endif
    vec4 p = czm_modelView * vec4(local, 1.0);
    v_positionEC = p.xyz;
    #ifdef SCENEGIS_CURVED_WATER
    v_waterPosition = wavePosition + u_waterOffset;
    #else
    v_waterPosition = position.xy;
    #endif
    gl_Position = czm_projection * p;
}
