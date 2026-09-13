flat in ivec3 v_groundIndices;

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
    if (u_sceneGISGroundLighting) {
        vec3 normal = normalize(cross(dFdx(eye.xyz), dFdy(eye.xyz)));
        if ((mat3(czm_inverseView) * normal).z < 0.0) normal = -normal;
        groundLight = 0.4 + 0.6 * max(0.0, dot(normal, czm_lightDirectionEC));
    }
    float viewDepth = -eye.z;
    if (viewDepth <= u_sceneGISVectorDepthRange.x || viewDepth > u_sceneGISVectorDepthRange.y) discard;
    vec2 local = (czm_inverseModelView * eye).xy;
    vec2 a = groundPosition(v_groundIndices.x);
    vec2 b = groundPosition(v_groundIndices.y);
    vec2 c = groundPosition(v_groundIndices.z);
    vec3 edges = vec3(groundCross(c - b, local - b), groundCross(a - c, local - c), groundCross(b - a, local - a));
    if (!groundEdge(edges.x, c - b) || !groundEdge(edges.y, a - c) || !groundEdge(edges.z, b - a)) discard;
    float area = groundCross(b - a, c - a);
    if (area <= 0.0) discard;
    vec3 weights = edges / area;
#ifdef SCENEGIS_VECTOR_UNIFORM_PAINT
    v_color = u_sceneGISGroundColor;
#else
    v_color = groundVertex(v_groundIndices.x, 1);
#endif
#ifdef SCENEGIS_VECTOR_PICKING
    int token = int(groundVertex(v_groundIndices.x, 0).z);
    v_pickColor = groundFetch(u_sceneGISGroundPicks, u_sceneGISGroundPickSize, token);
#endif
#ifdef SCENEGIS_VECTOR_FRINGE
    v_fringe = dot(weights, vec3(groundVertex(v_groundIndices.x, 0).w,
        groundVertex(v_groundIndices.y, 0).w, groundVertex(v_groundIndices.z, 0).w));
#endif
#ifdef SCENEGIS_VECTOR_LINE
    vec4 metrics = groundVertex(v_groundIndices.x, 3) * weights.x +
        groundVertex(v_groundIndices.y, 3) * weights.y + groundVertex(v_groundIndices.z, 3) * weights.z;
    vec4 paint = groundPaint(v_groundIndices.x);
    float outside = paint.y * 0.5 + paint.x * (paint.y > 0.0 ? 1.0 : 0.5);
    float envelope = outside + 0.5 / czm_pixelRatio;
    v_lineCoordinate = vec4(metrics.xy * envelope,
        metrics.z / u_sceneGISVectorMetersPerPixel + metrics.w * envelope, outside);
    v_lineStyle = vec4(paint.x, paint.y * 0.5, paint.w, envelope);
    v_lineDash = groundVertex(v_groundIndices.x, 5).xyz;
    v_lineProgress = metrics.z / u_sceneGISVectorMetersPerPixel;
    vec2 ends = groundVertex(v_groundIndices.x, 6).xy;
    v_lineEnds = vec2(ends.x < 0.0 ? -1.0 : ends.x / u_sceneGISVectorMetersPerPixel, ends.y);
#endif
    czm_writeDepthClamp();
    return local;
}
