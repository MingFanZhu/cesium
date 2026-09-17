uniform float u_sceneGISVectorOpacity;
uniform vec4 u_color;
uniform vec2 u_depthRange;
uniform bool u_lighting;
#ifdef SCENEGIS_VECTOR_PATTERN
uniform vec4 u_patternRect;
uniform vec2 u_patternSize;
uniform vec2 u_patternRoot;
#endif
void main()
{
    float depth = czm_unpackDepth(texture(czm_globeDepthTexture, gl_FragCoord.xy / czm_viewport.zw));
    if (depth == 0.0 || depth == 1.0) discard;
    vec4 eye = czm_windowToEyeCoordinates(gl_FragCoord.xy, depth);
    eye /= eye.w;
    if (-eye.z <= u_depthRange.x || -eye.z > u_depthRange.y) discard;
    vec4 material = u_color;
#ifdef SCENEGIS_VECTOR_PATTERN
    vec3 worldPattern = (czm_inverseView * eye).xyz;
    float radial = length(worldPattern.xy);
    float latitude = atan(worldPattern.z, radial * (1.0 - 0.0066943799901413165));
    for (int i = 0; i < 3; i++) {
        float sine = sin(latitude);
        float n = 6378137.0 / sqrt(1.0 - 0.0066943799901413165 * sine * sine);
        latitude = atan(worldPattern.z + 0.0066943799901413165 * n * sine, radial);
    }
    latitude = clamp(latitude, -1.4844222297453324, 1.4844222297453324);
    vec2 projected = 6378137.0 * vec2(atan(worldPattern.y, worldPattern.x), log(tan(czm_piOverFour + latitude * 0.5)));
    material = vectorPatternSample(u_patternRect, u_patternSize,
        vectorPatternPosition(projected - u_patternRoot, u_patternSize));
    material.a *= u_color.a;
#endif
    vec4 color = czm_gammaCorrect(material);
    bool lighting = u_lighting;
#ifdef SCENEGIS_VECTOR_ENVIRONMENT
    lighting = true;
#endif
    if (lighting) {
        vec3 normal = normalize(cross(dFdx(eye.xyz), dFdy(eye.xyz)));
        vec3 world = (czm_inverseView * eye).xyz;
        if (dot(mat3(czm_inverseView) * normal, world) < 0.0) normal = -normal;
#ifdef SCENEGIS_VECTOR_ENVIRONMENT
        color.rgb = vectorSurfaceRadiance(color.rgb, eye.xyz, normal);
#else
        color.rgb *= 0.4 + 0.6 * max(0.0, dot(normal, czm_lightDirectionEC));
#endif
    }
    color.rgb *= color.a;
    out_FragColor = color * u_sceneGISVectorOpacity;
}
