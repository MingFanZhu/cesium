in vec2 v_corner;
flat in vec3 v_centerEC;
uniform float u_renderRadius;
uniform float u_thicknessScale;
uniform sampler2D u_depth;
uniform vec2 u_surfaceSize;
void main() {
    float r2 = dot(v_corner, v_corner);
    if (r2 >= 1.0) { discard; }
    float halfThickness = sqrt(1.0 - r2) * u_renderRadius;
    vec3 p = v_centerEC + vec3(v_corner * u_renderRadius, halfThickness);
    float depth = -p.z;
    if (depth <= czm_currentFrustum.x || depth >= czm_currentFrustum.y) { discard; }
    float opaque = texture(u_depth, gl_FragCoord.xy / u_surfaceSize).r;
    if (opaque > 0.0 && opaque <= depth) { discard; }
    #ifdef FLUID_THICKNESS
    float thickness = 2.0 * halfThickness;
    if (opaque > 0.0) { thickness = min(thickness, opaque - depth); }
    out_FragColor = vec4(thickness * u_thicknessScale, 0.0, 0.0, 1.0);
    #else
    vec4 clip = czm_projection * vec4(p, 1.0);
    gl_FragDepth = clip.z / clip.w * 0.5 + 0.5;
    out_FragColor = vec4(depth, 0.0, 0.0, 1.0);
    #endif
}
