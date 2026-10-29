void main() {
    int particle = gl_InstanceID % u_particleCount;
    int segment = gl_InstanceID / u_particleCount;
    if (segment >= u_historyCount || u_historyHead < 0) { windHidden(); return; }
    int newer = (u_historyHead - segment + 1 + WIND_HISTORY_CAPACITY) % WIND_HISTORY_CAPACITY;
    int older = (u_historyHead - segment + WIND_HISTORY_CAPACITY) % WIND_HISTORY_CAPACITY;
    vec4 head = texelFetch(u_position, windHeadPixel(particle), 0);
    vec4 a = segment == 0 ? head : windHistory(particle, newer);
    vec4 b = windHistory(particle, older);
    float ageA = segment == 0 ? 0.0 : u_historyAges[newer];
    float ageB = u_historyAges[older];
    if (a.w < 0.0 || a.w != b.w || a.w != head.w || ageA >= u_trailDuration ||
        !windParticleClear(a.xyz, b.xyz)) { windHidden(); return; }
    if (ageB > u_trailDuration) {
        b.xyz = mix(a.xyz, b.xyz, (u_trailDuration - ageA) / max(ageB - ageA, 1e-9));
        ageB = u_trailDuration;
    }
    vec4 clipA = czm_modelViewProjection * vec4(a.xyz, 1.0);
    vec4 clipB = czm_modelViewProjection * vec4(b.xyz, 1.0);
    // Do not bridge the eye/near plane. Native clipping handles remaining geometry.
    if (clipA.w <= 0.0 || clipB.w <= 0.0) { windHidden(); return; }
    vec2 direction = windPixelDirection(clipA, clipB);
    if (length(direction) < 1e-6) { windHidden(); return; }
    float t = a_corner.x + 0.5;
    vec4 clip = mix(clipA, clipB, t);
    windWidth(clip, direction);
    gl_Position = clip;
    float age = mix(ageA, ageB, t);
    float fade = u_trailFade == 0.0 ? 1.0 : pow(max(0.0, 1.0 - age / u_trailDuration), u_trailFade);
    vec4 field = sceneGISWindSample(mix(a.xyz, b.xyz, t));
    v_color = vec4(windDisplayColor(field), u_opacity * fade);
    v_uv = vec2(t, a_corner.y + 0.5);
}
