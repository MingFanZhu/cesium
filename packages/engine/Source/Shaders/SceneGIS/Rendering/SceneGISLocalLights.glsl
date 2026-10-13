uniform int u_sceneGISLightCount;
uniform highp usampler2D u_sceneGISLightTable;
uniform int u_sceneGISLightIndexRow;
uniform vec2 u_sceneGISLightGrid;
uniform bool u_sceneGISLightTiled;

ivec2 sceneGISLocalLightSpan()
{
    if (!u_sceneGISLightTiled) { return ivec2(0, u_sceneGISLightCount); }
    vec2 uv = (gl_FragCoord.xy - czm_viewport.xy) / czm_viewport.zw;
    ivec2 tile = clamp(ivec2(uv * u_sceneGISLightGrid), ivec2(0), ivec2(u_sceneGISLightGrid) - 1);
    int header = 1024 + tile.y * int(u_sceneGISLightGrid.x) + tile.x;
    return ivec2(texelFetch(u_sceneGISLightTable, ivec2(header % 256, header / 256), 0).rg);
}

int sceneGISLocalLightIndex(ivec2 span, int candidate)
{
    if (!u_sceneGISLightTiled || span.y == u_sceneGISLightCount) { return candidate; }
    int offset = span.x + candidate;
    int texel = offset / 4;
    uvec4 packed = texelFetch(u_sceneGISLightTable, ivec2(texel % 256, u_sceneGISLightIndexRow + texel / 256), 0);
    return int(packed[offset % 4]);
}

vec4 sceneGISLocalParameter(int index, int column)
{
    int texel = index * 4 + column;
    return uintBitsToFloat(texelFetch(u_sceneGISLightTable, ivec2(texel % 256, texel / 256), 0));
}

bool sceneGISLocalLight(int index, vec3 positionEC, out vec3 direction, out vec3 irradiance)
{
    vec4 positionRange = sceneGISLocalParameter(index, 0);
    vec3 offset = positionRange.xyz - positionEC;
    float distanceSquared = dot(offset, offset);
    float rangeSquared = positionRange.w;
    if (distanceSquared >= rangeSquared || distanceSquared == 0.0) {
        direction = vec3(0.0);
        irradiance = vec3(0.0);
        return false;
    }
    direction = offset * inversesqrt(distanceSquared);
    float ratio = distanceSquared / rangeSquared;
    float falloff = 1.0 - ratio * ratio;
    falloff *= falloff;
    float coneScale = sceneGISLocalParameter(index, 3).x;
    if (coneScale >= 0.0) {
        vec4 spot = sceneGISLocalParameter(index, 2);
        float cosine = dot(-direction, spot.xyz);
        float cone = clamp((cosine - spot.w) * coneScale, 0.0, 1.0);
        falloff *= cone * cone * (3.0 - 2.0 * cone);
    }
    vec4 colorRadius = sceneGISLocalParameter(index, 1);
    irradiance = colorRadius.rgb * falloff / max(distanceSquared, colorRadius.w);
    return falloff > 0.0;
}

vec3 sceneGISLocalLambert(vec3 positionEC, vec3 normalEC, vec3 diffuse)
{
    vec3 color = vec3(0.0);
    ivec2 span = sceneGISLocalLightSpan();
    for (int candidate = 0; candidate < span.y; ++candidate) {
        int i = sceneGISLocalLightIndex(span, candidate);
        vec3 direction;
        vec3 irradiance;
        if (sceneGISLocalLight(i, positionEC, direction, irradiance)) {
            color += diffuse * irradiance * max(dot(normalEC, direction), 0.0) / czm_pi;
        }
    }
    return color;
}

vec3 sceneGISLocalPhong(vec3 positionEC, vec3 normalEC, vec3 toEye, vec3 diffuse, float specular, float shininess)
{
    vec3 color = vec3(0.0);
    ivec2 span = sceneGISLocalLightSpan();
    for (int candidate = 0; candidate < span.y; ++candidate) {
        int i = sceneGISLocalLightIndex(span, candidate);
        vec3 direction;
        vec3 irradiance;
        if (sceneGISLocalLight(i, positionEC, direction, irradiance)) {
            float NdotL = max(dot(normalEC, direction), 0.0);
            if (NdotL > 0.0) {
                color += irradiance * (diffuse * NdotL / czm_pi +
                    specular * czm_getSpecular(direction, toEye, normalEC, shininess));
            }
        }
    }
    return color;
}
