flat in ivec3 v_groundIndices;
#ifdef SCENEGIS_VECTOR_GLOBE
flat in int v_groundFrame;
flat in float v_globeLinearError;
#endif

bool groundEdge(float edge, vec2 direction)
{
    // Opposite directions own opposite sides of the exact shared boundary.
    return edge > 0.0 || (edge == 0.0 && (direction.y > 0.0 ||
        (direction.y == 0.0 && direction.x < 0.0)));
}

vec2 groundCoordinates()
{
    float depth = czm_unpackDepth(texture(czm_globeDepthTexture, gl_FragCoord.xy / czm_viewport.zw));
    if (depth == 0.0 || depth == 1.0) discard;
    vec4 eye = czm_windowToEyeCoordinates(gl_FragCoord.xy, depth);
    eye /= eye.w;
    groundLight = 1.0;
    bool lighting = u_sceneGISGroundLighting;
#ifdef SCENEGIS_VECTOR_ENVIRONMENT
    lighting = true;
    groundPositionEC = eye.xyz;
#endif
    if (lighting) {
        vec3 normal = normalize(cross(dFdx(eye.xyz), dFdy(eye.xyz)));
        vec3 worldNormal = mat3(czm_inverseView) * normal;
#ifdef SCENEGIS_VECTOR_GLOBE
        if (dot(worldNormal, globeAxes(v_groundFrame)[2]) < 0.0) normal = -normal;
#else
        if (worldNormal.z < 0.0) normal = -normal;
#endif
        groundLight = 0.4 + 0.6 * max(0.0, dot(normal, czm_lightDirectionEC));
#ifdef SCENEGIS_VECTOR_ENVIRONMENT
        groundNormalEC = normal;
#endif
    }
    float viewDepth = -eye.z;
    if (viewDepth <= u_sceneGISVectorDepthRange.x || viewDepth > u_sceneGISVectorDepthRange.y) discard;
#ifdef SCENEGIS_VECTOR_GLOBE_TERRAIN
    vec2 a = v_terrainAB.xy, b = v_terrainAB.zw, c = v_terrainC.xy;
#else
    vec2 a = groundPosition(v_groundIndices.x);
    vec2 b = groundPosition(v_groundIndices.y);
    vec2 c = groundPosition(v_groundIndices.z);
#endif
#ifdef SCENEGIS_VECTOR_GLOBE
    vec3 globeLocal = globeLocalPosition(eye.xyz, v_groundFrame);
    vec2 approximate = globeFrame(v_groundFrame, 0).xy + globeLocal.xy / globeFrame(v_groundFrame, 3).zw;
    if (groundCross(c - b, approximate - b) < -v_globeLinearError * length(c - b) ||
        groundCross(a - c, approximate - c) < -v_globeLinearError * length(a - c) ||
        groundCross(b - a, approximate - a) < -v_globeLinearError * length(b - a)) discard;
    vec2 local = globeCoordinates(globeLocal, v_groundFrame);
#else
    vec2 local = (czm_inverseModelView * eye).xy;
#endif
    vec3 edges = vec3(groundCross(c - b, local - b), groundCross(a - c, local - c), groundCross(b - a, local - a));
    if (!groundEdge(edges.x, c - b) || !groundEdge(edges.y, a - c) || !groundEdge(edges.z, b - a)) discard;
    float area = groundCross(b - a, c - a);
    if (area <= 0.0) discard;
    vec3 weights = edges / area;
#ifdef SCENEGIS_VECTOR_PATTERN
#ifdef SCENEGIS_VECTOR_LINE
    const int patternOffset = 7;
#else
    const int patternOffset = 3;
#endif
    v_patternRect = groundVertex(v_groundIndices.x, patternOffset);
    v_patternSize = groundVertex(v_groundIndices.x, patternOffset + 1).xy;
#endif
#ifdef SCENEGIS_VECTOR_UNIFORM_PAINT
    v_color = u_sceneGISGroundColor;
#elif defined(SCENEGIS_VECTOR_GLOBE_TERRAIN)
    v_color = v_terrainColor;
#else
    v_color = groundVertex(v_groundIndices.x, 1);
#endif
#ifdef SCENEGIS_VECTOR_PICKING
#ifdef SCENEGIS_VECTOR_GLOBE_TERRAIN
    int token = int(v_terrainC.z);
#else
    int token = int(groundVertex(v_groundIndices.x, 0).z);
#endif
    v_pickColor = groundFetch(u_sceneGISGroundPicks, u_sceneGISGroundPickSize, token);
#endif
#ifdef SCENEGIS_VECTOR_FRINGE
#ifdef SCENEGIS_VECTOR_GLOBE_TERRAIN
    v_fringe = dot(weights, v_terrainFringe);
#else
    v_fringe = dot(weights, vec3(groundVertex(v_groundIndices.x, 0).w,
        groundVertex(v_groundIndices.y, 0).w, groundVertex(v_groundIndices.z, 0).w));
#endif
#endif
#ifdef SCENEGIS_VECTOR_LINE
#ifdef SCENEGIS_VECTOR_GLOBE_TERRAIN
    vec4 metrics = v_terrainMetrics0 * weights.x + v_terrainMetrics1 * weights.y + v_terrainMetrics2 * weights.z;
#ifdef SCENEGIS_VECTOR_UNIFORM_PAINT
    vec4 paint = u_sceneGISGroundPaint;
#else
    vec4 paint = v_terrainPaint;
#endif
#else
    vec4 metrics = groundVertex(v_groundIndices.x, 3) * weights.x +
        groundVertex(v_groundIndices.y, 3) * weights.y + groundVertex(v_groundIndices.z, 3) * weights.z;
    vec4 paint = groundPaint(v_groundIndices.x);
#endif
    float outside = paint.y * 0.5 + paint.x * (paint.y > 0.0 ? 1.0 : 0.5);
    float envelope = outside + 0.5 / czm_pixelRatio;
    v_lineCoordinate = vec4(metrics.xy * envelope,
        metrics.z / u_sceneGISVectorMetersPerPixel + metrics.w * envelope, outside);
    v_lineStyle = vec4(paint.x, paint.y * 0.5, paint.w, envelope);
#ifdef SCENEGIS_VECTOR_GLOBE_TERRAIN
    v_lineDash = v_terrainDash.xyz;
    vec2 ends = vec2(v_terrainDash.w, v_terrainC.w);
#else
    v_lineDash = groundVertex(v_groundIndices.x, 5).xyz;
    vec2 ends = groundVertex(v_groundIndices.x, 6).xy;
#endif
    v_lineProgress = metrics.z / u_sceneGISVectorMetersPerPixel;
    v_lineEnds = vec2(ends.x < 0.0 ? -1.0 : ends.x / u_sceneGISVectorMetersPerPixel, ends.y);
#endif
    czm_writeDepthClamp();
    return local;
}
