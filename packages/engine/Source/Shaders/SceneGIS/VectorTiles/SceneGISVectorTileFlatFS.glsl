in vec4 v_color;
uniform vec4 u_sceneGISVectorTileClip;

#ifdef SCENEGIS_VECTOR_CIRCLE
in vec2 v_circleCoordinate;
in vec2 v_dimensions;
in vec4 v_strokeColor;
#endif

void main()
{
    vec4 eyeA = czm_windowToEyeCoordinates(vec4(gl_FragCoord.xy, 0.0, 1.0));
    vec4 eyeB = czm_windowToEyeCoordinates(vec4(gl_FragCoord.xy, 0.5, 1.0));
    eyeA /= eyeA.w;
    eyeB /= eyeB.w;
    vec3 a = (czm_inverseModelView * eyeA).xyz;
    // Subtract in eye space before introducing the large camera translation.
    vec3 direction = mat3(czm_inverseModelView) * (eyeB.xyz - eyeA.xyz);
    float dz = direction.z;
    if (dz == 0.0) discard;
    float t = -a.z / dz;
    vec2 local = a.xy + direction.xy * t;
    if (t < 0.0 || local.x < u_sceneGISVectorTileClip.x || local.x >= u_sceneGISVectorTileClip.z ||
        local.y > u_sceneGISVectorTileClip.w || local.y <= u_sceneGISVectorTileClip.y) discard;

    vec4 fill = czm_gammaCorrect(v_color);
    fill.rgb *= fill.a;
#ifdef SCENEGIS_VECTOR_CIRCLE
    float distanceToCenter = length(v_circleCoordinate);
    float fillCoverage = 1.0 - smoothstep(v_dimensions.x - 0.5, v_dimensions.x + 0.5, distanceToCenter);
    float outerRadius = v_dimensions.x + v_dimensions.y;
    float outerCoverage = 1.0 - smoothstep(outerRadius - 0.5, outerRadius + 0.5, distanceToCenter);
    vec4 stroke = czm_gammaCorrect(v_strokeColor);
    stroke.rgb *= stroke.a;
    out_FragColor = fill * fillCoverage + stroke * max(0.0, outerCoverage - fillCoverage);
#else
    out_FragColor = fill;
#endif
    if (out_FragColor.a == 0.0) discard;
}
