uniform sampler2D u_linearDepth;

vec3 sceneGISAOPosition(vec2 pixel, float depth)
{
    // Cesium intentionally publishes a zero inverseProjection for orthographic
    // cameras; its reconstruction builtin uses frustum planes in that case.
    vec4 a = czm_windowToEyeCoordinates(vec4(pixel, 0.0, 1.0));
    vec4 b = czm_windowToEyeCoordinates(vec4(pixel, 0.5, 1.0));
    vec3 p = a.xyz / a.w;
    vec3 q = b.xyz / b.w;
    return p + (q - p) * ((-depth - p.z) / (q.z - p.z));
}

float sceneGISAODepth(ivec2 pixel)
{
    ivec2 dimensions = textureSize(u_linearDepth, 0);
    return texelFetch(u_linearDepth, clamp(pixel, ivec2(0), dimensions - 1), 0).r;
}

vec3 sceneGISAONormal(ivec2 pixel, float z, vec3 p)
{
    float l = sceneGISAODepth(pixel - ivec2(1, 0));
    float r = sceneGISAODepth(pixel + ivec2(1, 0));
    float d = sceneGISAODepth(pixel - ivec2(0, 1));
    float u = sceneGISAODepth(pixel + ivec2(0, 1));
    // Select the derivative with the smaller second-order depth residual.
    // This preserves sloping faces at silhouettes instead of crossing the edge.
    float le = l > 0.0 ? abs(2.0 * l - sceneGISAODepth(pixel - ivec2(2, 0)) - z) : czm_infinity;
    float re = r > 0.0 ? abs(2.0 * r - sceneGISAODepth(pixel + ivec2(2, 0)) - z) : czm_infinity;
    float de = d > 0.0 ? abs(2.0 * d - sceneGISAODepth(pixel - ivec2(0, 2)) - z) : czm_infinity;
    float ue = u > 0.0 ? abs(2.0 * u - sceneGISAODepth(pixel + ivec2(0, 2)) - z) : czm_infinity;
    vec2 xy = vec2(pixel) + 0.5;
    vec3 dx = le < re ? p - sceneGISAOPosition(xy - vec2(1, 0), l) : sceneGISAOPosition(xy + vec2(1, 0), r) - p;
    vec3 dy = de < ue ? p - sceneGISAOPosition(xy - vec2(0, 1), d) : sceneGISAOPosition(xy + vec2(0, 1), u) - p;
    vec3 n = cross(dx, dy);
    float magnitude = length(n);
    return magnitude > 1.0e-10 ? n / magnitude : normalize(-p);
}
