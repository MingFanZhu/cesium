in vec3 v_clippingPosition;
uniform sampler2D u_clippingData;
uniform vec2 u_clippingCounts;
uniform bool u_clippingUnion;
uniform bool u_clippingInverse;
uniform vec4 u_clippingEdgeStyle;

vec4 sceneGISClippingRecord(int index)
{
    int width = textureSize(u_clippingData, 0).x;
    return texelFetch(u_clippingData, ivec2(index % width, index / width), 0);
}

float sceneGISClipTerrain()
{
    int planeCount = int(u_clippingCounts.x);
    int polygonCount = int(u_clippingCounts.y);
    bool clipped = !u_clippingUnion;
    float distanceToEdge = u_clippingUnion ? czm_infinity : 0.0;
    for (int i = 0; i < planeCount; ++i) {
        vec4 plane = sceneGISClippingRecord(i);
        float distance = dot(plane.xyz, v_clippingPosition) + plane.w;
        // Interpolation and the dot/add can change the sign on coplanar skirts.
        // Bound Float32 roundoff by the magnitudes of the evaluated terms.
        // Keep this boundary consistent with the CPU terrain query.
        float roundoff = 8.0 * 1.1920928955078125e-7;
        float tolerance = roundoff * (dot(abs(plane.xyz), abs(v_clippingPosition)) + abs(plane.w));
        // Evaluate derivatives before any fragment is discarded.
        float pixelWidth = length(vec2(dFdx(distance), dFdy(distance)));
        float pixelDistance = pixelWidth > 0.0 ? distance / pixelWidth : czm_infinity;
        distanceToEdge = u_clippingUnion
            ? min(distanceToEdge, pixelDistance)
            : max(distanceToEdge, pixelDistance);
        clipped = u_clippingUnion ? (clipped || distance <= tolerance) : (clipped && distance <= tolerance);
    }
    if (planeCount > 0 && clipped) {
        discard;
    }
    bool insideAny = false;
    vec2 point = v_clippingPosition.xy;
    for (int i = 0; i < polygonCount; ++i) {
        vec4 header = sceneGISClippingRecord(planeCount + i);
        int start = int(header.x);
        int count = int(header.y);
        bool inside = false;
        for (int j = 0; j < count; ++j) {
            vec4 edge = sceneGISClippingRecord(start + j);
            vec2 a = edge.xy;
            vec2 b = edge.zw;
            vec2 delta = b - a;
            vec2 relative = point - a;
            float crossProduct = delta.x * relative.y - delta.y * relative.x;
            if (crossProduct == 0.0 && all(greaterThanEqual(point, min(a, b))) &&
                all(lessThanEqual(point, max(a, b)))) {
                inside = true;
                break;
            }
            if ((a.y > point.y) != (b.y > point.y) &&
                point.x < a.x + (point.y - a.y) * (b.x - a.x) / (b.y - a.y)) {
                inside = !inside;
            }
        }
        insideAny = insideAny || inside;
    }
    if (polygonCount > 0 && (u_clippingInverse ? !insideAny : insideAny)) {
        discard;
    }
    return planeCount > 0 ? distanceToEdge : czm_infinity;
}
