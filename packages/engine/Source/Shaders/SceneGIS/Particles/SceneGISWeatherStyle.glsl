void styleParticle(inout SceneGISParticle p) {
    p.position = weatherWrap((u_renderTransform * vec4(p.position, 1.0)).xyz);
    float distanceToEye = length(p.position);
    float fade = (1.0 - smoothstep(u_radius * 0.65, u_radius, distanceToEye)) *
        smoothstep(max(2.0, u_innerRadius * 0.45), max(6.0, u_innerRadius), distanceToEye);
    float rank = sceneGISParticleRandom(p.seed, 3.0);
    fade *= clamp((u_intensity - rank) / 0.06, 0.0, 1.0);
    fade *= 1.0 - smoothstep(u_ceilingHeight - 40.0, u_ceilingHeight,
        u_cameraHeight + p.position.z);
    vec4 eye = czm_modelView * vec4(p.position, 1.0);
    if (eye.z >= -0.1 || fade <= 0.0) {
        p.color = vec4(0.0); p.size = vec2(0.0); return;
    }
    float mpp = czm_metersPerPixel(eye, 1.0);
    float variation = 0.7 + 0.6 * sceneGISParticleRandom(p.seed, 6.0);
    float distant = step(1.0, u_innerRadius);
    float width = mix(mix(1.3, 0.9, distant), mix(4.5, 2.0, distant), u_snow);
    float height = mix(mix(18.0, 8.0, distant), width, u_snow);
    p.size = min(vec2(width, height) * mpp * u_particleSize * variation, vec2(40.0));
    vec3 velocityEC = (czm_modelView * vec4(weatherVelocity(p.seed), 0.0)).xyz;
    vec2 screenVelocity = velocityEC.xy;
    if (czm_orthographicIn3D == 0.0) {
        screenVelocity = velocityEC.xy * -eye.z + eye.xy * velocityEC.z;
    }
    // The billboard offset is expressed in the eye plane, like this direction.
    float angle = dot(screenVelocity, screenVelocity) > 1.0e-8 ?
        atan(screenVelocity.y, screenVelocity.x) - 1.5707963 : 0.0;
    p.rotation = mix(angle, p.age * 0.6 + rank * 6.2831853, u_snow);
    p.color = vec4(u_color.rgb, u_color.a * fade * mix(0.7, 0.95, u_snow) *
        mix(1.0, 0.65, distant));
}
