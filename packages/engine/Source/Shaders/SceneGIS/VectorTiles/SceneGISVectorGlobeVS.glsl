in float prismVertex;
flat out ivec3 v_groundIndices;
flat out int v_groundFrame;
flat out float v_globeLinearError;

void main()
{
    vec4 triangle = groundTriangle(gl_InstanceID);
    ivec3 indices = ivec3(triangle.xyz);
    int frame = int(triangle.w);
    vec2 a = groundPosition(indices.x), b = groundPosition(indices.y), c = groundPosition(indices.z);
    if (groundCross(b - a, c - a) < 0.0) {
        indices.yz = indices.zy;
        vec2 swap = b; b = c; c = swap;
    }
    v_groundIndices = indices;
    v_groundFrame = frame;
    vec4 reference = globeFrame(frame, 0);
    vec2 metric = globeFrame(frame, 3).zw;
#ifdef SCENEGIS_VECTOR_GLOBE_TERRAIN
    v_terrainReference = reference;
    v_terrainFrame = vec4(globeFrame(frame, 3).xy, globeFrame(frame, 1).w, globeFrame(frame, 2).w);
    v_terrainOriginEye = (czm_modelViewRelativeToEye * globeOrigin(frame)).xyz;
    v_terrainAB = vec4(a, b);
    v_terrainC = vec4(c, groundVertex(indices.x, 0).z, 0.0);
#ifndef SCENEGIS_VECTOR_UNIFORM_PAINT
    v_terrainColor = groundVertex(indices.x, 1);
#endif
#ifdef SCENEGIS_VECTOR_FRINGE
    v_terrainFringe = vec3(groundVertex(indices.x, 0).w, groundVertex(indices.y, 0).w, groundVertex(indices.z, 0).w);
#endif
#ifdef SCENEGIS_VECTOR_LINE
    v_terrainMetrics0 = groundVertex(indices.x, 3);
    v_terrainMetrics1 = groundVertex(indices.y, 3);
    v_terrainMetrics2 = groundVertex(indices.z, 3);
    vec2 ends = groundVertex(indices.x, 6).xy;
    v_terrainDash = vec4(groundVertex(indices.x, 5).xyz, ends.x);
    v_terrainC.w = ends.y;
#ifndef SCENEGIS_VECTOR_UNIFORM_PAINT
    v_terrainPaint = groundPaint(indices.x);
#endif
#endif
#endif
    vec2 da = a - reference.xy, db = b - reference.xy, dc = c - reference.xy;
    float radius = max(length(da), max(length(db), length(dc)));
    a = da * metric; b = db * metric; c = dc * metric;
    vec2 edge = b - a;
    if (length(c - b) > length(edge)) edge = c - b;
    if (length(a - c) > length(edge)) edge = a - c;
    vec2 axis = length(edge) > 0.0 ? normalize(edge) : vec2(1.0, 0.0);
    vec2 normal = vec2(-axis.y, axis.x);
    vec2 pa = vec2(dot(a, axis), dot(a, normal));
    vec2 pb = vec2(dot(b, axis), dot(b, normal));
    vec2 pc = vec2(dot(c, axis), dot(c, normal));
    // The Mercator-to-ECEF Hessian bound encloses curvature in all three axes.
    // Height normal variation is bounded separately; neither guard lifts the map.
    float maximumCosine = cos(max(0.0, abs(asin(reference.z)) - radius / globeRadius));
    float height = max(abs(u_sceneGISGroundHeights.x), abs(u_sceneGISGroundHeights.y));
    float guard = 4.0 * maximumCosine * radius * radius / globeRadius + 2.0 * height * radius / globeRadius + 1.0;
    // Bound the inverse linear footprint error in projected metres. This only
    // rejects definite misses; accepted fragments still use the exact inverse.
    v_globeLinearError = 1.414214 * guard / min(metric.x, metric.y);
    vec2 lo = min(pa, min(pb, pc)) - guard;
    vec2 hi = max(pa, max(pb, pc)) + guard;
    int corner = int(prismVertex);
    vec2 xy = vec2((corner & 1) == 0 ? lo.x : hi.x, (corner & 2) == 0 ? lo.y : hi.y);
    float z = (corner & 4) == 0 ? u_sceneGISGroundHeights.x - guard : u_sceneGISGroundHeights.y + guard;
    vec3 local = globeAxes(frame) * vec3(axis * xy.x + normal * xy.y, z);
    vec4 relative = globeOrigin(frame);
    relative.xyz += local;
    gl_Position = czm_depthClamp(czm_modelViewProjectionRelativeToEye * relative);
}
