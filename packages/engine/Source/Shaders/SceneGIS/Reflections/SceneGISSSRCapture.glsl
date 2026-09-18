layout(location = 1) out vec4 sceneGISSSRBaseOutput;
layout(location = 2) out vec4 sceneGISSSRCoatOutput;
vec4 sceneGISSSRBaseRay = vec4(0.0);
vec4 sceneGISSSRCoatRay = vec4(0.0);
vec3 sceneGISSSRCoatDirection;

vec3 sceneGISSSR(vec3 environment, vec3 directionEC, float roughness, bool coat)
{
    if (coat) { sceneGISSSRCoatRay = vec4(directionEC, roughness); }
    else { sceneGISSSRBaseRay = vec4(directionEC, roughness); }
    return environment;
}
