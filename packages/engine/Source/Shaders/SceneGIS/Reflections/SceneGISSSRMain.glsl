layout(location = 1) out vec4 sceneGISSSRBaseOutput;
layout(location = 2) out vec4 sceneGISSSRBaseWeightOutput;
layout(location = 3) out vec4 sceneGISSSRBaseEnvironmentOutput;
#ifdef SCENEGIS_SSR_COAT_TARGETS
layout(location = 4) out vec4 sceneGISSSRCoatOutput;
layout(location = 5) out vec4 sceneGISSSRCoatWeightOutput;
layout(location = 6) out vec4 sceneGISSSRCoatEnvironmentOutput;
#endif

vec4 sceneGISSSRBaseRay = vec4(0.0);
vec4 sceneGISSSRCoatRay = vec4(0.0);
vec3 sceneGISSSRBaseWeight = vec3(0.0);
vec3 sceneGISSSRCoatWeight = vec3(0.0);
vec3 sceneGISSSRBaseEnvironment = vec3(0.0);
vec3 sceneGISSSRCoatEnvironment = vec3(0.0);
vec3 sceneGISSSRCoatDirection;

vec3 sceneGISSSR(vec3 environment, vec3 directionEC, float roughness, bool coat)
{
    if (coat) {
        sceneGISSSRCoatRay = vec4(directionEC, roughness);
        sceneGISSSRCoatEnvironment = environment;
    } else {
        sceneGISSSRBaseRay = vec4(directionEC, roughness);
        sceneGISSSRBaseEnvironment = environment;
    }
    return environment;
}

void sceneGISSSRScale(vec3 scale)
{
    sceneGISSSRBaseWeight *= scale;
    sceneGISSSRCoatWeight *= scale;
}

void sceneGISSSRWriteMaterial()
{
    sceneGISSSRBaseOutput = sceneGISSSRBaseRay;
    sceneGISSSRBaseWeightOutput = vec4(sceneGISSSRBaseWeight, 1.0);
    sceneGISSSRBaseEnvironmentOutput = vec4(sceneGISSSRBaseEnvironment * sceneGISSSRBaseWeight, 0.0);
    #ifdef SCENEGIS_SSR_COAT_TARGETS
    sceneGISSSRCoatOutput = sceneGISSSRCoatRay;
    sceneGISSSRCoatWeightOutput = vec4(sceneGISSSRCoatWeight, 0.0);
    sceneGISSSRCoatEnvironmentOutput = vec4(sceneGISSSRCoatEnvironment * sceneGISSSRCoatWeight, 0.0);
    #endif
}
