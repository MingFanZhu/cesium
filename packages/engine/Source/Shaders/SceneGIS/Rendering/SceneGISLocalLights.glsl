uniform int u_sceneGISLightCount;
uniform vec4 u_sceneGISLightPositions[16];
uniform vec4 u_sceneGISLightColors[16];
uniform vec4 u_sceneGISLightDirections[16];
uniform float u_sceneGISLightCones[16];

bool sceneGISLocalLight(int index, vec3 positionEC, out vec3 direction, out vec3 irradiance)
{
    vec3 offset = u_sceneGISLightPositions[index].xyz - positionEC;
    float distanceSquared = dot(offset, offset);
    float rangeSquared = u_sceneGISLightPositions[index].w;
    if (distanceSquared >= rangeSquared || distanceSquared == 0.0) {
        direction = vec3(0.0);
        irradiance = vec3(0.0);
        return false;
    }
    direction = offset * inversesqrt(distanceSquared);
    float ratio = distanceSquared / rangeSquared;
    float falloff = 1.0 - ratio * ratio;
    falloff *= falloff;
    float coneScale = u_sceneGISLightCones[index];
    if (coneScale >= 0.0) {
        float cosine = dot(-direction, u_sceneGISLightDirections[index].xyz);
        float cone = clamp((cosine - u_sceneGISLightDirections[index].w) * coneScale, 0.0, 1.0);
        falloff *= cone * cone * (3.0 - 2.0 * cone);
    }
    irradiance = u_sceneGISLightColors[index].rgb * falloff /
        max(distanceSquared, u_sceneGISLightColors[index].w);
    return falloff > 0.0;
}

vec3 sceneGISLocalLambert(vec3 positionEC, vec3 normalEC, vec3 diffuse)
{
    vec3 color = vec3(0.0);
    for (int i = 0; i < 16; ++i) {
        if (i >= u_sceneGISLightCount) { break; }
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
    for (int i = 0; i < 16; ++i) {
        if (i >= u_sceneGISLightCount) { break; }
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
