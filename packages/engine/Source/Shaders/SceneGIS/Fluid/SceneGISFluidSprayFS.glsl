in vec2 v_dropUV;
in vec3 v_positionEC;
flat in vec3 v_centerEC;
flat in float v_radius;
flat in float v_opacity;
uniform sampler2D u_depth;
uniform sampler2D u_fluidDepth;
uniform samplerCube u_sky;
uniform bool u_hasSky;
uniform mat3 u_skyWorldToLocal;
uniform float u_skyLod;
uniform float u_radianceScale;
uniform vec3 u_reflectionColor;
void main() {
    float r2 = dot(v_dropUV, v_dropUV);
    if (r2 >= 1.0 || v_opacity <= 0.0) { discard; }
    float hemisphere = sqrt(1.0 - r2);
    vec3 point = v_positionEC + vec3(0.0, 0.0, hemisphere * v_radius);
    float depth = -point.z;
    if (depth <= czm_currentFrustum.x || depth >= czm_currentFrustum.y) { discard; }
    vec2 uv = gl_FragCoord.xy / czm_viewport.zw;
    float opaque = texture(u_depth, uv).r;
    float fluid = texture(u_fluidDepth, uv).r;
    float behind = opaque > 0.0 ? opaque : czm_currentFrustum.y;
    if (fluid > 0.0) { behind = min(behind, fluid); }
    float fade = clamp((behind - depth) / (2.0 * v_radius), 0.0, 1.0);
    vec3 view = czm_projection[3][3] == 0.0 ? normalize(-point) : vec3(0.0, 0.0, 1.0);
    // Approximate a small dielectric drop; the translucent pass supplies transmission.
    vec3 normal = normalize(vec3(v_positionEC.xy - v_centerEC.xy, hemisphere * v_radius));
    vec3 beam = czm_lightColorHdr;
    #ifdef SCENEGIS_WATER_PHYSICAL
    beam = sceneGISModelDirectSource(point, beam);
    #endif
    vec3 environment = u_reflectionColor;
    if (u_hasSky) {
        vec3 direction = u_skyWorldToLocal * (czm_inverseViewRotation * reflect(-view, normal));
        environment = textureLod(u_sky, direction, 0.2 * u_skyLod).rgb * u_radianceScale;
    }
    float fresnel = sceneGISWaterFresnel(max(dot(normal, view), 0.0));
    vec3 highlight = sceneGISWaterHighlight(normal, view, beam, 0.24);
    float edge = 1.0 - smoothstep(max(0.0, 1.0 - fwidth(r2)), 1.0, r2);
    float alpha = (0.18 + 0.65 * fresnel) * v_opacity * edge * fade;
    if (alpha < 0.002) { discard; }
    out_FragColor = vec4(environment + highlight + beam * 0.08, alpha);
    vec4 clip = czm_projection * vec4(point, 1.0);
    gl_FragDepth = clip.z / clip.w * 0.5 + 0.5;
    czm_writeLogDepth(depth - czm_currentFrustum.x + 1.0);
}
