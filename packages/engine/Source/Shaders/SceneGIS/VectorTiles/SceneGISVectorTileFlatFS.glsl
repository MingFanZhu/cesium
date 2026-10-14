#define SCENEGIS_DEFERRED_VECTOR_OVERLAY
uniform float u_sceneGISVectorOpacity;
#ifdef SCENEGIS_VECTOR_GROUND
#define SCENEGIS_VECTOR_INPUT
vec2 groundCoordinates();
uniform bool u_sceneGISGroundLighting;
float groundLight;
#ifdef SCENEGIS_VECTOR_ENVIRONMENT
vec3 groundPositionEC;
vec3 groundNormalEC;
#endif
#else
#define SCENEGIS_VECTOR_INPUT in
#endif
SCENEGIS_VECTOR_INPUT vec4 v_color;
#ifdef SCENEGIS_VECTOR_PATTERN
SCENEGIS_VECTOR_INPUT vec4 v_patternRect;
SCENEGIS_VECTOR_INPUT vec2 v_patternSize;
#endif
#ifdef SCENEGIS_VECTOR_PICKING
SCENEGIS_VECTOR_INPUT vec4 v_pickColor;
#endif
uniform vec4 u_sceneGISVectorTileClip;
uniform vec2 u_sceneGISVectorDepthRange;
#ifdef SCENEGIS_VECTOR_TERRAIN_ANCHOR
in vec2 v_anchorLocal;
in float v_anchorDepth;
in float v_groundVisibility;
#endif

#ifdef SCENEGIS_VECTOR_CIRCLE
SCENEGIS_VECTOR_INPUT vec2 v_circleCoordinate;
SCENEGIS_VECTOR_INPUT vec3 v_dimensions;
SCENEGIS_VECTOR_INPUT vec4 v_strokeColor;
#endif
#ifdef SCENEGIS_VECTOR_FRINGE
SCENEGIS_VECTOR_INPUT float v_fringe;
#endif
#ifdef SCENEGIS_VECTOR_LINE
SCENEGIS_VECTOR_INPUT vec4 v_lineCoordinate;
SCENEGIS_VECTOR_INPUT vec4 v_lineStyle;
SCENEGIS_VECTOR_INPUT vec3 v_lineDash;
SCENEGIS_VECTOR_INPUT vec2 v_lineEnds;
SCENEGIS_VECTOR_INPUT float v_lineProgress;
#ifdef SCENEGIS_VECTOR_DASH
uniform sampler2D u_sceneGISVectorDashTable;
uniform vec2 u_sceneGISVectorDashSize;
#endif

float lineCoverage()
{
    float distanceToLine = length(v_lineCoordinate.xy);
    float outer = v_lineCoordinate.w;
    float aa = max(0.000001, length(vec2(dFdx(distanceToLine), dFdy(distanceToLine))));
    float fade = aa + v_lineStyle.z;
    float coverage = clamp((outer + aa * 0.5 - distanceToLine) / fade, 0.0, 1.0);
    if (v_lineStyle.y > 0.0) {
        coverage = min(coverage, clamp((distanceToLine - v_lineStyle.y + aa * 0.5) / fade, 0.0, 1.0));
    }
    if (v_lineEnds.x >= 0.0 && v_lineEnds.y < 1.5) {
        float endDistance = max(-v_lineCoordinate.z, v_lineCoordinate.z - v_lineEnds.x);
        if (v_lineEnds.y > 0.5) endDistance -= outer;
        float endAA = max(0.000001, length(vec2(dFdx(v_lineCoordinate.z), dFdy(v_lineCoordinate.z))));
        coverage = min(coverage, clamp((endAA * 0.5 - endDistance) / (endAA + v_lineStyle.z), 0.0, 1.0));
    }
#ifdef SCENEGIS_VECTOR_DASH
    if (v_lineDash.y > 0.0) {
        float width = v_lineStyle.x;
        float phase = mod(v_lineProgress / width, v_lineDash.z);
        float dashDistance = 1.0e20;
        for (float i = 0.0; i < v_lineDash.y; i += 1.0) {
            float index = v_lineDash.x + i;
            vec2 uv = (vec2(mod(index, u_sceneGISVectorDashSize.x),
                floor(index / u_sceneGISVectorDashSize.x)) + 0.5) / u_sceneGISVectorDashSize;
            vec2 interval = texture(u_sceneGISVectorDashTable, uv).rg;
            float halfLength = (interval.y - interval.x) * 0.5;
            if (halfLength == 0.0 && v_lineEnds.y < 1.5) continue;
            float center = (interval.x + interval.y) * 0.5;
            float along = (abs(mod(phase - center + v_lineDash.z * 0.5, v_lineDash.z) -
                v_lineDash.z * 0.5) - halfLength) * width;
            float shape = v_lineEnds.y > 1.5 ?
                length(vec2(max(along, 0.0), v_lineCoordinate.y)) - outer : along;
            dashDistance = min(dashDistance, shape);
        }
        float dashAA = max(0.000001, length(vec2(dFdx(v_lineProgress), dFdy(v_lineProgress))));
        coverage = min(coverage, clamp((dashAA * 0.5 - dashDistance) / (dashAA + v_lineStyle.z), 0.0, 1.0));
    }
#endif
    return coverage;
}
#endif

void main()
{
#ifdef SCENEGIS_VECTOR_GROUND
    vec2 local = groundCoordinates();
#elif defined(SCENEGIS_VECTOR_TERRAIN_ANCHOR)
    if (v_groundVisibility < 0.5 || v_anchorDepth <= u_sceneGISVectorDepthRange.x || v_anchorDepth > u_sceneGISVectorDepthRange.y) discard;
    vec2 local = v_anchorLocal;
#else
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
    // Cesium overlaps adjacent opaque frustums. Partition map color exactly once.
    float viewDepth = -(eyeA.z + (eyeB.z - eyeA.z) * t);
    if (viewDepth <= u_sceneGISVectorDepthRange.x || viewDepth > u_sceneGISVectorDepthRange.y) discard;
    vec2 local = a.xy + direction.xy * t;
    if (t < 0.0) discard;
#endif
    if (local.x < u_sceneGISVectorTileClip.x || local.x >= u_sceneGISVectorTileClip.z ||
        local.y > u_sceneGISVectorTileClip.w || local.y <= u_sceneGISVectorTileClip.y) discard;

    vec4 material = v_color;
#ifdef SCENEGIS_VECTOR_PATTERN
#ifdef SCENEGIS_VECTOR_LINE
    vec2 patternPosition = vec2(v_lineProgress * v_patternSize.y / max(v_lineStyle.x, 0.000001),
        (0.5 + v_lineCoordinate.y / max(2.0 * v_lineCoordinate.w, 0.000001)) * v_patternSize.y);
#else
    vec2 patternPosition = vectorPatternPosition(local, v_patternSize);
#endif
    material = vectorPatternSample(v_patternRect, v_patternSize, patternPosition);
    material.a *= v_color.a;
#endif
    vec4 fill = czm_gammaCorrect(material);
#ifndef SCENEGIS_DEFERRED_VECTOR_OVERLAY_CAPTURE
#ifdef SCENEGIS_VECTOR_ENVIRONMENT
#ifdef SCENEGIS_VECTOR_GROUND
    fill.rgb = vectorSurfaceRadiance(fill.rgb, groundPositionEC, groundNormalEC);
#else
    vec3 positionEC = eyeA.xyz + (eyeB.xyz - eyeA.xyz) * t;
    fill.rgb = vectorSurfaceRadiance(fill.rgb, positionEC, czm_viewRotation * vec3(0.0, 0.0, 1.0));
#endif
#elif defined(SCENEGIS_VECTOR_GROUND)
    fill.rgb *= groundLight;
#endif
#endif
    fill.rgb *= fill.a;
#ifdef SCENEGIS_VECTOR_CIRCLE
    float distanceToCenter = length(v_circleCoordinate);
    float outerRadius = v_dimensions.x + v_dimensions.y;
    float aa = 0.5 / czm_pixelRatio;
    float blur = max(aa, outerRadius * v_dimensions.z);
    float fillCoverage = 1.0 - smoothstep(v_dimensions.x - blur, v_dimensions.x + aa, distanceToCenter);
    float outerCoverage = 1.0 - smoothstep(outerRadius - blur, outerRadius + aa, distanceToCenter);
    vec4 stroke = czm_gammaCorrect(v_strokeColor);
    stroke.rgb *= stroke.a;
    out_FragColor = fill * fillCoverage + stroke * max(0.0, outerCoverage - fillCoverage);
#elif defined(SCENEGIS_VECTOR_LINE)
    out_FragColor = fill * lineCoverage();
#elif defined(SCENEGIS_VECTOR_FRINGE)
    out_FragColor = fill * v_fringe;
#else
    out_FragColor = fill;
#endif
    out_FragColor *= u_sceneGISVectorOpacity;
    if (out_FragColor.a == 0.0) discard;
}
