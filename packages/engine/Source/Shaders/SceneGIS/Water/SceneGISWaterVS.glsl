in vec3 position;
out vec3 v_positionEC;
out vec2 v_waterPosition;
#ifdef SCENEGIS_WIND_WAVES
in vec2 waveData;
uniform sampler2D u_displacement0;
uniform sampler2D u_displacement1;
uniform float u_wavePeriod;
uniform float u_waveResolution;
uniform float u_waveLodScale;
out float v_shoreFade;
vec3 sceneGISWaveDisplacement(sampler2D wave, float period, float spacing) {
    // Texture texel zero represents local position zero, not the texel corner.
    vec2 uv = position.xy / period + 0.5 / u_waveResolution;
    float lod = max(0.0, log2(spacing * u_waveResolution / period));
    return textureLod(wave, uv, lod).xyz;
}
#endif
void main() {
    vec3 local = position;
    #ifdef SCENEGIS_WIND_WAVES
    vec3 undisplacedEC = (czm_modelView * vec4(position, 1.0)).xyz;
    float eyeDepth = abs(undisplacedEC.z);
    float pixelSpacing = 2.0 * (czm_projection[3][3] == 0.0 ? eyeDepth : 1.0) /
        (czm_viewport.w * abs(czm_projection[1][1]));
    // The closest-point tile distance selects a mesh no coarser than this continuous
    // vertex footprint. Equal positions therefore retain equal wave energy, including
    // across stitched edges; finest-edge filtering would create a visible tile grid.
    float meshSpacing = waveData.y * max(1.0, length(undisplacedEC) * u_waveLodScale);
    float spacing = max(meshSpacing, pixelSpacing);
    local += (sceneGISWaveDisplacement(u_displacement0, u_wavePeriod, spacing) +
        sceneGISWaveDisplacement(u_displacement1, u_wavePeriod * 4.0, spacing)) * waveData.x;
    v_shoreFade = waveData.x;
    #endif
    vec4 p = czm_modelView * vec4(local, 1.0);
    v_positionEC = p.xyz;
    v_waterPosition = position.xy;
    gl_Position = czm_projection * p;
}
