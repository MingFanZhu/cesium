bool sgFlattenContains(vec2 p)
{
    vec4 b = u_sgFlattenBounds;
    if (p.x < b.x || p.y < b.y || p.x > b.z || p.y > b.w) {
        return false;
    }
    bool inside = false;
    for (int i = 0; i < 256; ++i) {
        if (i >= u_sgFlattenCount) {
            break;
        }
        vec4 edge = texelFetch(u_sgFlattenEdges, ivec2(i, 0), 0);
        vec2 a = edge.xy;
        vec2 d = edge.zw - a;
        vec2 q = p - a;
        float crossValue = d.x * q.y - d.y * q.x;
        float along = dot(q, d);
        if (abs(crossValue) <= 0.0001 * length(d) &&
            along >= 0.0 && along <= dot(d, d)) {
            return texelFetch(u_sgFlattenEdges, ivec2(i, 1), 0).r > 0.5;
        }
        if ((a.y > p.y) != (edge.w > p.y) &&
            p.x < a.x + (p.y - a.y) * d.x / d.y) {
            inside = !inside;
        }
    }
    return inside;
}

void vertexMain(VertexInput vsInput, inout czm_modelVertexOutput vsOutput)
{
    v_sgFlattened = 0.0;
    if (!u_sgFlattenEnabled) {
        return;
    }
    vec3 local = (u_sgModelToFlatten * vec4(vsOutput.positionMC, 1.0)).xyz;
    if (sgFlattenContains(local.xy) != u_sgFlattenInverse) {
        v_sgFlattened = abs(local.z - u_sgFlattenHeight) > 0.00001 ? 1.0 : 0.0;
        local.z = u_sgFlattenHeight;
        vsOutput.positionMC = (u_sgFlattenToModel * vec4(local, 1.0)).xyz;
    }
}
