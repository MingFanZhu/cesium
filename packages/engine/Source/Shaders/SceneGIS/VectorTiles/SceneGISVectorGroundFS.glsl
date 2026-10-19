flat in ivec3 v_groundIndices;
#ifdef SCENEGIS_VECTOR_GLOBE
flat in float v_globeLinearError;
#endif

bool groundEdge(float edge, vec2 direction)
{
    // Opposite directions own opposite sides of the exact shared boundary.
#ifndef SCENEGIS_VECTOR_GLOBE
    return edge > 0.0 || (edge == 0.0 && (direction.y < 0.0 ||
        (direction.y == 0.0 && direction.x > 0.0)));
#else
    return edge > 0.0 || (edge == 0.0 && (direction.y > 0.0 ||
        (direction.y == 0.0 && direction.x < 0.0)));
#endif
}

#ifdef SCENEGIS_VECTOR_GLOBE
float globeGroundEdge(vec2 a, vec2 b, vec3 eye, int frame, vec2 local)
{
    if (frame != v_groundFrame) {
        local = globeCoordinates(globeLocalPosition(eye, frame), frame);
    }
    // Canonical endpoints also keep the arithmetic identical on both sides.
    bool reversed = a.x > b.x || (a.x == b.x && a.y > b.y);
    vec2 start = reversed ? b : a;
    vec2 end = reversed ? a : b;
    float value = groundCross(end - start, local - start);
    return reversed ? -value : value;
}
#endif

#ifndef SCENEGIS_VECTOR_GLOBE
float planarGroundEdge(vec2 a, vec2 b, vec2 local)
{
    // Both triangles must evaluate the same arithmetic on their shared edge.
    bool reversed = a.x > b.x || (a.x == b.x && a.y > b.y);
    vec2 start = reversed ? b : a;
    vec2 end = reversed ? a : b;
    float value = groundCross(end - start, local - start);
    return reversed ? -value : value;
}
#endif

vec2 groundCoordinates()
{
#ifdef SCENEGIS_VECTOR_FRINGE
#ifdef SCENEGIS_VECTOR_GLOBE_TERRAIN
    vec3 fringe = v_terrainFringe;
#else
    vec3 fringe = vec3(groundVertex(v_groundIndices.x, 0).w,
        groundVertex(v_groundIndices.y, 0).w, groundVertex(v_groundIndices.z, 0).w);
#endif
    // Flat per-triangle attributes make this branch uniform within a primitive.
    // Only varying fringes need derivatives; constant cores retain early culling.
    bool deferDiscard = any(notEqual(fringe, fringe.xxx));
#else
    const bool deferDiscard = false;
#endif
#ifdef SCENEGIS_VECTOR_PLANAR_TRANSPARENT
    float depth = texture(u_sceneGISPlanarVectorDepth, gl_FragCoord.xy / czm_viewport.zw).r;
#else
    float depth = czm_unpackDepth(texture(czm_globeDepthTexture, gl_FragCoord.xy / czm_viewport.zw));
#endif
    bool rejected = depth == 0.0 || depth == 1.0;
    if (rejected && !deferDiscard) discard;
#ifdef SCENEGIS_VECTOR_PLANAR_TRANSPARENT
    vec4 eye = sceneGISPlanarVectorEye(gl_FragCoord.xy, depth);
#else
    vec4 eye = czm_windowToEyeCoordinates(gl_FragCoord.xy, depth);
#endif
    eye /= eye.w;
    groundLight = 1.0;
#ifndef SCENEGIS_DEFERRED_VECTOR_OVERLAY_CAPTURE
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
#endif
    float viewDepth = -eye.z;
    groundViewDepth = viewDepth;
    rejected = rejected || viewDepth <= u_sceneGISVectorDepthRange.x || viewDepth > u_sceneGISVectorDepthRange.y;
    if (rejected && !deferDiscard) discard;
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
    rejected = rejected || groundCross(c - b, approximate - b) < -v_globeLinearError * length(c - b) ||
        groundCross(a - c, approximate - c) < -v_globeLinearError * length(a - c) ||
        groundCross(b - a, approximate - a) < -v_globeLinearError * length(b - a);
    if (rejected && !deferDiscard) discard;
    vec2 local = globeCoordinates(globeLocal, v_groundFrame);
#else
    vec2 local = (czm_inverseModelView * eye).xy;
#endif
#ifdef SCENEGIS_VECTOR_GLOBE
    vec3 edges = vec3(
        globeGroundEdge(b, c, eye.xyz, v_groundEdgeFrames.x, local),
        globeGroundEdge(c, a, eye.xyz, v_groundEdgeFrames.y, local),
        globeGroundEdge(a, b, eye.xyz, v_groundEdgeFrames.z, local));
#else
    vec3 edges = vec3(planarGroundEdge(b, c, local), planarGroundEdge(c, a, local), planarGroundEdge(a, b, local));
#endif
#ifdef SCENEGIS_VECTOR_GLOBE
    rejected = rejected || !groundEdge(edges.x, c - b) || !groundEdge(edges.y, a - c) || !groundEdge(edges.z, b - a);
#else
    // Match the rasterized prism's edge ownership in window coordinates, including camera roll.
    mat2 localToWindow = inverse(mat2(dFdx(local), dFdy(local)));
    rejected = rejected || !groundEdge(edges.x, localToWindow * (c - b)) ||
        !groundEdge(edges.y, localToWindow * (a - c)) ||
        !groundEdge(edges.z, localToWindow * (b - a));
#endif
    if (rejected && !deferDiscard) discard;
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
    // Preserve zero core distance exactly. Independent Globe edge inversions
    // can leave a small residual in the sum of barycentric weights.
    v_fringe = (1.0 - fringe.x) - dot(weights.yz, fringe.yz - fringe.xx);
    groundFringeAA = 1.0;
    if (deferDiscard) {
        groundFringeAA = vectorFringeWidth(v_fringe);
    }
    // Keep helper invocations alive until all coverage derivatives are computed.
    if (rejected) discard;
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
