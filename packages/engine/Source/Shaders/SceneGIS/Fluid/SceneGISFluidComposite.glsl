uniform sampler2D u_fluidDepth;
uniform sampler2D u_fluidThickness;
uniform vec3 u_waterColor;
uniform vec3 u_absorption;
uniform vec3 u_reflectionColor;
uniform float u_roughness;
uniform float u_refractionStrength;
uniform samplerCube u_sky;
uniform bool u_hasSky;
uniform mat3 u_skyWorldToLocal;
uniform float u_skyLod;
uniform float u_radianceScale;
uniform bool u_reflections;
// The shared WaterFrame derived shader reads this reconstructed eye position.
vec3 v_positionEC;
vec4 fluidSurfacePoint(vec2 uv, float fallback) {
    float depth = texture(u_fluidDepth, clamp(uv, vec2(0.0), vec2(1.0))).r;
    return vec4(sceneGISSSRPosition(uv * vec2(textureSize(u_depth, 0)), depth > 0.0 ? depth : fallback), depth);
}
void main() {
    vec2 size = vec2(textureSize(u_depth, 0));
    vec2 uv = gl_FragCoord.xy / size;
    float depth = texture(u_fluidDepth, uv).r;
    float opaque = texture(u_depth, uv).r;
    if (depth <= czm_currentFrustum.x || depth >= czm_currentFrustum.y || (opaque > 0.0 && opaque <= depth)) { discard; }
    v_positionEC = sceneGISSSRPosition(gl_FragCoord.xy, depth);
    vec2 texel = 1.0 / vec2(textureSize(u_fluidDepth, 0));
    vec4 rightPoint = fluidSurfacePoint(uv + vec2(texel.x, 0.0), depth);
    vec4 leftPoint = fluidSurfacePoint(uv - vec2(texel.x, 0.0), depth);
    vec4 abovePoint = fluidSurfacePoint(uv + vec2(0.0, texel.y), depth);
    vec4 belowPoint = fluidSurfacePoint(uv - vec2(0.0, texel.y), depth);
    vec3 right = rightPoint.xyz - v_positionEC;
    vec3 left = v_positionEC - leftPoint.xyz;
    vec3 above = abovePoint.xyz - v_positionEC;
    vec3 below = v_positionEC - belowPoint.xyz;
    // A missing silhouette neighbor must not flatten the surface normal.
    vec3 dx = rightPoint.w > 0.0 && (leftPoint.w <= 0.0 || abs(right.z) < abs(left.z)) ? right : left;
    vec3 dy = abovePoint.w > 0.0 && (belowPoint.w <= 0.0 || abs(above.z) < abs(below.z)) ? above : below;
    vec3 normal = normalize(cross(dx, dy));
    vec3 view = normalize(-v_positionEC);
    if (dot(normal, view) < 0.0) { normal = -normal; }
    float thickness = texture(u_fluidThickness, uv).r;
    if (opaque > depth) { thickness = min(thickness, opaque - depth); }
    vec2 refractedUV = uv + normal.xy * u_refractionStrength * min(thickness, 1.0) / max(depth, 0.1);
    float refractedDepth = texture(u_depth, clamp(refractedUV, vec2(0.0), vec2(1.0))).r;
    if (any(lessThan(refractedUV, vec2(0.0))) || any(greaterThan(refractedUV, vec2(1.0))) ||
        (refractedDepth > 0.0 && refractedDepth <= depth)) { refractedUV = uv; }
    vec3 beam = czm_lightColorHdr;
    vec3 diffuseLight = vec3(1.0);
    #ifdef SCENEGIS_WATER_PHYSICAL
    beam = sceneGISModelDirectSource(v_positionEC, beam);
    diffuseLight = sceneGISModelSkyIrradiance(v_positionEC, normal) +
        beam * (max(dot(normal, czm_lightDirectionEC), 0.0) / czm_pi);
    #endif
    vec3 water = sceneGISWaterTransmission(textureLod(u_color, refractedUV, 0.0).rgb,
        u_waterColor * diffuseLight, u_absorption, thickness);
    vec3 reflected = reflect(-view, normal);
    vec3 environment = u_reflectionColor;
    if (u_hasSky) {
        vec3 direction = u_skyWorldToLocal * (czm_inverseViewRotation * reflected);
        environment = textureLod(u_sky, direction, u_roughness * u_skyLod).rgb * u_radianceScale;
    }
    vec4 hit = u_reflections ? sceneGISSSRTrace(v_positionEC, vec4(reflected, u_roughness)) : vec4(0.0);
    vec3 color = mix(water, mix(environment, hit.rgb, hit.a), sceneGISWaterFresnel(dot(normal, view)));
    color += sceneGISWaterHighlight(normal, view, beam, u_roughness);
    out_FragColor = vec4(max(color, vec3(0.0)), 1.0);
    vec4 clip = czm_projection * vec4(v_positionEC, 1.0);
    gl_FragDepth = clip.z / clip.w * 0.5 + 0.5;
    czm_writeLogDepth(depth - czm_currentFrustum.x + 1.0);
}
