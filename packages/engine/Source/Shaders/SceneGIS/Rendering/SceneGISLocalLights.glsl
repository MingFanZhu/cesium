uniform int u_sceneGISLightCount;
uniform highp usampler2D u_sceneGISLightTable;
uniform int u_sceneGISLightIndexRow;
uniform vec2 u_sceneGISLightGrid;
uniform bool u_sceneGISLightTiled;
uniform int u_sceneGISLightHeaderRow;

ivec2 sceneGISLocalLightSpan()
{
    if (!u_sceneGISLightTiled) { return ivec2(0, u_sceneGISLightCount); }
    vec2 uv = (gl_FragCoord.xy - czm_viewport.xy) / czm_viewport.zw;
    ivec2 tile = clamp(ivec2(uv * u_sceneGISLightGrid), ivec2(0), ivec2(u_sceneGISLightGrid) - 1);
    int header = u_sceneGISLightHeaderRow * 256 + tile.y * int(u_sceneGISLightGrid.x) + tile.x;
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

// LTC reference: Heitz, Dupuy, Hill and Neubelt (SIGGRAPH 2016).
// Fit/license: Assets/SceneGIS/LocalLights/LICENSE.txt; ADR-0186 pins the source.
vec4 sceneGISRectAxis(int index, int column)
{
    int texel = 1024 + index * 2 + column;
    return uintBitsToFloat(texelFetch(u_sceneGISLightTable, ivec2(texel % 256, texel / 256), 0));
}

vec4 sceneGISLtcFetch(ivec2 point, int table)
{
    int texel = 1536 + table * 4096 + point.y * 64 + point.x;
    return uintBitsToFloat(texelFetch(u_sceneGISLightTable, ivec2(texel % 256, texel / 256), 0));
}

vec4 sceneGISLtcLookup(float roughness, float NdotV, int table)
{
    vec2 uv = vec2(clamp(roughness, 0.0, 1.0), sqrt(1.0 - clamp(NdotV, 0.0, 1.0))) * 63.0;
    ivec2 lo = ivec2(uv);
    ivec2 hi = min(lo + 1, ivec2(63));
    vec2 f = fract(uv);
    return mix(mix(sceneGISLtcFetch(lo, table), sceneGISLtcFetch(ivec2(hi.x, lo.y), table), f.x),
        mix(sceneGISLtcFetch(ivec2(lo.x, hi.y), table), sceneGISLtcFetch(hi, table), f.x), f.y);
}

float sceneGISRectIntegral(vec3 center, vec3 right, vec3 up, mat3 transform)
{
    vec3 corners[4];
    corners[0] = transform * (center - right - up);
    corners[1] = transform * (center + right - up);
    corners[2] = transform * (center + right + up);
    corners[3] = transform * (center - right + up);
    // Clip the convex quad against the transformed cosine hemisphere (at most 5 vertices).
    vec3 polygon[5];
    int count = 0;
    for (int i = 0; i < 4; ++i) {
        vec3 a = corners[i];
        vec3 b = corners[(i + 1) % 4];
        if (a.z > 0.0) { polygon[count++] = a; }
        if ((a.z > 0.0) != (b.z > 0.0)) {
            polygon[count++] = mix(a, b, a.z / (a.z - b.z));
        }
    }
    if (count < 3) { return 0.0; }
    float sum = 0.0;
    for (int i = 0; i < count; ++i) {
        vec3 a = normalize(polygon[i]);
        vec3 b = normalize(polygon[(i + 1) % count]);
        float x = clamp(dot(a, b), -1.0, 1.0);
        float y = abs(x);
        // Published rational approximation of theta / (2 PI sin(theta)).
        float v = (0.8543985 + (0.4965155 + 0.0145206 * y) * y) /
            (3.4175940 + (4.1616724 + y) * y);
        float scale = x > 0.0 ? v : 0.5 * inversesqrt(max(1.0 - x * x, 1e-7)) - v;
        sum += cross(a, b).z * scale;
    }
    return abs(sum);
}

mat3 sceneGISRectBasis(vec3 normal, vec3 toEye)
{
    vec3 tangent = toEye - normal * dot(normal, toEye);
    if (dot(tangent, tangent) < 1e-8) {
        // At normal incidence the azimuth is undefined; any orthogonal basis is equivalent.
        tangent = cross(normal, abs(normal.z) < 0.9 ? vec3(0, 0, 1) : vec3(0, 1, 0));
    }
    tangent = normalize(tangent);
    return transpose(mat3(tangent, cross(normal, tangent), normal));
}

bool sceneGISRectLight(int index, vec3 positionEC, out vec3 center, out vec3 right, out vec3 up, out vec3 radiance)
{
    vec4 positionRange = sceneGISLocalParameter(index, 0);
    center = positionRange.xyz - positionEC;
    vec4 axis = sceneGISRectAxis(index, 0);
    right = axis.xyz;
    up = sceneGISRectAxis(index, 1).xyz;
    // cross(up, right) points along the authored emission normal.
    float side = dot(-center, cross(up, right));
    float ratio = dot(center, center) / positionRange.w;
    radiance = vec3(0.0);
    if (ratio >= 1.0 || side == 0.0 || (side < 0.0 && axis.w == 0.0)) { return false; }
    float fade = 1.0 - ratio * ratio;
    radiance = sceneGISLocalParameter(index, 1).rgb * fade * fade;
    return true;
}

vec3 sceneGISRectSpecular(vec3 center, vec3 right, vec3 up, mat3 basis, float NdotV,
    float roughness, vec3 f0, vec3 f90)
{
    vec4 t = sceneGISLtcLookup(roughness, NdotV, 0);
    mat3 inverseLtc = mat3(vec3(t.x, 0, t.y), vec3(0, 1, 0), vec3(t.z, 0, t.w));
    vec4 amplitude = sceneGISLtcLookup(roughness, NdotV, 1);
    return (f0 * amplitude.x + (f90 - f0) * amplitude.y) *
        sceneGISRectIntegral(center, right, up, inverseLtc * basis);
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
    if (coneScale == -2.0) { return false; }
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
        if (sceneGISLocalParameter(i, 3).x == -2.0) {
            vec3 center, right, up, radiance;
            if (sceneGISRectLight(i, positionEC, center, right, up, radiance)) {
                color += diffuse * radiance * sceneGISRectIntegral(center, right, up,
                    sceneGISRectBasis(normalEC, normalEC));
            }
            continue;
        }
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
        if (sceneGISLocalParameter(i, 3).x == -2.0) {
            vec3 center, right, up, radiance;
            if (sceneGISRectLight(i, positionEC, center, right, up, radiance)) {
                mat3 basis = sceneGISRectBasis(normalEC, toEye);
                float diffuseIntegral = sceneGISRectIntegral(center, right, up, basis);
                float roughness = pow(2.0 / (shininess + 2.0), 0.25);
                color += radiance * (diffuse * diffuseIntegral + sceneGISRectSpecular(
                    center, right, up, basis, dot(normalEC, toEye), roughness, vec3(specular), vec3(specular)));
            }
            continue;
        }
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
