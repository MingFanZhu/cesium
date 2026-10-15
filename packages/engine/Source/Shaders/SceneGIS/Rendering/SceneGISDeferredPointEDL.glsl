uniform sampler2D u_sceneGISPointDepth;
uniform float u_sceneGISPointRadius;
uniform float u_sceneGISPointStrength;

vec2 sceneGISPointNeighbor(float center, vec2 uv, vec2 offset)
{
    float a = texture(u_sceneGISPointDepth, uv + offset * floor(u_sceneGISPointRadius)).r;
    float b = texture(u_sceneGISPointDepth, uv + offset * ceil(u_sceneGISPointRadius)).r;
    if (a == 0.0 || b == 0.0) { return vec2(0.0); }
    float neighbor = mix(a, b, fract(u_sceneGISPointRadius));
    return vec2(max(0.0, center - log2(neighbor)), 1.0);
}

float sceneGISPointShade()
{
    vec2 size = vec2(textureSize(u_sceneGISPointDepth, 0));
    vec2 uv = gl_FragCoord.xy / size;
    float depth = texture(u_sceneGISPointDepth, uv).r;
    if (depth > 0.0) {
        float center = log2(depth);
        vec2 response = sceneGISPointNeighbor(center, uv, vec2(1.0 / size.x, 0.0));
        response += sceneGISPointNeighbor(center, uv, vec2(-1.0 / size.x, 0.0));
        response += sceneGISPointNeighbor(center, uv, vec2(0.0, 1.0 / size.y));
        response += sceneGISPointNeighbor(center, uv, vec2(0.0, -1.0 / size.y));
        return exp(-300.0 * u_sceneGISPointStrength * response.x / max(response.y, 1.0));
    }
    return 1.0;
}

#ifndef SCENEGIS_POINT_EDL_FUNCTION_ONLY
void main()
{
    sceneGISPointLitMain();
    vec3 shade = vec3(sceneGISPointShade());
    out_FragColor.rgb *= shade;
    #ifdef SCENEGIS_AO_MAIN
    sceneGISScaleIndirect(shade);
    #endif
    #ifdef SCENEGIS_SSR_MAIN
    sceneGISSSRScale(shade);
    #endif
    #ifdef SCENEGIS_SSIL_MAIN
    sceneGISSILScale(shade);
    #endif
}
#endif
