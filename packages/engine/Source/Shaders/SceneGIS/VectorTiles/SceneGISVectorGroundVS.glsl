in float prismVertex;
flat out ivec3 v_groundIndices;

void main()
{
    ivec3 indices = ivec3(groundTriangle(gl_InstanceID).xyz);
    vec2 a = groundPosition(indices.x);
    vec2 b = groundPosition(indices.y);
    vec2 c = groundPosition(indices.z);
    // Keep every convex volume outward-facing, including dynamic stroke triangles.
    if (groundCross(b - a, c - a) < 0.0) indices.yz = indices.zy;
    v_groundIndices = indices;
    const int corners[24] = int[24](0, 2, 1, 3, 4, 5, 0, 1, 4, 0, 4, 3,
        1, 2, 5, 1, 5, 4, 2, 0, 3, 2, 3, 5);
    int corner = corners[int(prismVertex)];
    vec2 xy = groundPosition(indices[corner % 3]);
    float height = corner < 3 ? u_sceneGISGroundHeights.x : u_sceneGISGroundHeights.y;
    vec4 relative = czm_translateRelativeToEye(vec3(0.0), vec3(xy, height));
    gl_Position = czm_depthClamp(czm_modelViewProjectionRelativeToEye * relative);
}
