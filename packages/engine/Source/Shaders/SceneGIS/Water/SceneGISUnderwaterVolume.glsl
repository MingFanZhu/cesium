uniform sampler2D u_edges;
uniform int u_edgeCount;
#ifdef SCENEGIS_ELLIPSOID_UNDERWATER
uniform float u_volumeRadius;
uniform float u_chartRadius;
uniform mat3 u_waterToChart;
uniform vec2 u_chartCamera;
#endif

float sceneGISWaterCross(vec2 a, vec2 b) { return a.x * b.y - a.y * b.x; }

float sceneGISWaterVolumeDepth(vec3 p)
{
    #ifdef SCENEGIS_ELLIPSOID_UNDERWATER
    // Rationalize the radius difference, retaining meter-scale depths at Earth scale.
    float r = u_volumeRadius;
    float numerator = 2.0 * r * p.z + dot(p, p);
    return -numerator / (sqrt(max(r * r + numerator, 0.0)) + r);
    #else
    return -p.z;
    #endif
}

vec3 sceneGISWaterVolumeUp(vec3 p)
{
    #ifdef SCENEGIS_ELLIPSOID_UNDERWATER
    return normalize(p + vec3(0.0, 0.0, u_volumeRadius));
    #else
    return vec3(0.0, 0.0, 1.0);
    #endif
}

#ifdef SCENEGIS_ELLIPSOID_UNDERWATER
float sceneGISWaterShellHit(vec3 origin, vec3 direction, float depth)
{
    float r = u_volumeRadius;
    float b = dot(origin, direction) + r * direction.z;
    float c = dot(origin, origin) + 2.0 * r * origin.z + depth * (2.0 * r - depth);
    float discriminant = b * b - c;
    if (discriminant < 0.0) { return 1e20; }
    // The product of the roots avoids subtracting two almost equal large values.
    float q = -b - (b < 0.0 ? -sqrt(discriminant) : sqrt(discriminant));
    if (q == 0.0) { return 1e20; }
    float a = q, second = c / q;
    return min(a > 0.0 ? a : 1e20, second > 0.0 ? second : 1e20);
}
#endif

bool sceneGISWaterVolumeRay(vec3 origin, vec3 direction, out float distance)
{
    float depth = sceneGISWaterVolumeDepth(origin);
    if (depth <= 0.0 || depth >= u_underwaterDepth) { return false; }
    #ifdef SCENEGIS_ELLIPSOID_UNDERWATER
    vec3 center = u_waterToChart * vec3(0.0, 0.0, u_volumeRadius - u_cameraDepth);
    vec3 shift = u_waterToChart * (origin - vec3(0.0, 0.0, -u_cameraDepth));
    float chartZ = center.z + shift.z;
    if (chartZ <= 0.0) { return false; }
    // Orthographic origins can differ from the camera. Use a relative rational
    // projection rather than subtracting Earth-sized chart products.
    vec2 start = u_chartCamera + (u_chartRadius * shift.xy - u_chartCamera * shift.z) / chartZ;
    vec3 chartDirection = u_waterToChart * direction;
    vec2 velocity = u_chartRadius * chartDirection.xy - start * chartDirection.z;
    distance = min(sceneGISWaterShellHit(origin, direction, 0.0),
        sceneGISWaterShellHit(origin, direction, u_underwaterDepth));
    #else
    vec2 start = origin.xy;
    distance = 1e20;
    if (direction.z > 0.0) { distance = min(distance, -origin.z / direction.z); }
    if (direction.z < 0.0) { distance = min(distance, (-u_underwaterDepth - origin.z) / direction.z); }
    #endif
    bool inside = false;
    for (int i = 0; i < u_edgeCount; ++i) {
        vec4 edge = texelFetch(u_edges, ivec2(i, 0), 0);
        vec2 a = edge.xy, b = edge.zw, segment = b - a;
        if ((a.y > start.y) != (b.y > start.y) &&
            start.x < (b.x - a.x) * (start.y - a.y) / (b.y - a.y) + a.x) { inside = !inside; }
        #ifdef SCENEGIS_ELLIPSOID_UNDERWATER
        float side = sceneGISWaterCross(a - start, segment);
        float denominator = sceneGISWaterCross(velocity, segment) - side * chartDirection.z;
        if (abs(denominator) > 1e-8) {
            float t = side * chartZ / denominator;
            float endZ = chartZ + t * chartDirection.z;
            if (t > 0.0 && t < distance && endZ > 0.0) {
                vec2 hit = start + velocity * t / endZ;
                float u = dot(hit - a, segment) / dot(segment, segment);
                if (u >= 0.0 && u <= 1.0) { distance = t; }
            }
        }
        #else
        float denominator = sceneGISWaterCross(direction.xy, segment);
        if (abs(denominator) > 1e-8) {
            float t = sceneGISWaterCross(a - start, segment) / denominator;
            float u = sceneGISWaterCross(a - start, direction.xy) / denominator;
            if (t > 0.0 && u >= 0.0 && u <= 1.0) { distance = min(distance, t); }
        }
        #endif
    }
    return inside;
}
