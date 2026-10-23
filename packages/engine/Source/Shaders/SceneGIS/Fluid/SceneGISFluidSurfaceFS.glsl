flat in vec3 v_centerEC;
flat in mat3 v_inverseShape;
uniform float u_thicknessScale;
uniform sampler2D u_depth;
uniform vec2 u_surfaceSize;
void main() {
    vec2 ndc = gl_FragCoord.xy / u_surfaceSize * 2.0 - 1.0;
    vec3 origin;
    vec3 direction;
    if (czm_projection[3][3] == 0.0) {
        origin = vec3(0.0);
        direction = normalize(vec3((ndc + vec2(czm_projection[2][0], czm_projection[2][1])) /
            vec2(czm_projection[0][0], czm_projection[1][1]), -1.0));
    } else {
        // Cesium deliberately supplies a zero inverseProjection for 3D ortho.
        origin = vec3((ndc - vec2(czm_projection[3][0], czm_projection[3][1])) /
            vec2(czm_projection[0][0], czm_projection[1][1]), -czm_currentFrustum.x);
        direction = vec3(0.0, 0.0, -1.0);
    }
    vec3 o = v_inverseShape * (origin - v_centerEC);
    vec3 d = v_inverseShape * direction;
    float a = dot(d, d);
    float b = dot(o, d);
    // Distance to the closest point avoids subtracting two large quadratic terms.
    float midpoint = -b / a;
    vec3 closest = o + midpoint * d;
    float discriminant = 1.0 - dot(closest, closest);
    if (discriminant <= 0.0) { discard; }
    float halfLength = sqrt(discriminant / a);
    vec3 p = origin + direction * (midpoint - halfLength);
    float depth = -p.z;
    if (depth <= czm_currentFrustum.x || depth >= czm_currentFrustum.y) { discard; }
    float opaque = texture(u_depth, gl_FragCoord.xy / u_surfaceSize).r;
    if (opaque > 0.0 && opaque <= depth) { discard; }
    #ifdef FLUID_THICKNESS
    float thickness = 2.0 * halfLength;
    if (opaque > 0.0) { thickness = min(thickness, (opaque - depth) / -direction.z); }
    out_FragColor = vec4(thickness * u_thicknessScale, 0.0, 0.0, 1.0);
    #else
    vec4 clip = czm_projection * vec4(p, 1.0);
    gl_FragDepth = clip.z / clip.w * 0.5 + 0.5;
    out_FragColor = vec4(depth, 0.0, 0.0, 1.0);
    #endif
}
