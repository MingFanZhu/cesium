uniform float u_windParticleSize;
uniform float u_windParticleOpacity;
void styleParticle(inout SceneGISParticle p) {
    vec4 field = sceneGISWindSample(p.position);
    float speed = length(field.xyz);
    float fade = smoothstep(0.0, 0.8, p.size.x) * smoothstep(0.0, 1.2, p.size.y - p.size.x);
    vec4 eye = czm_modelView * vec4(p.position, 1.0);
    vec3 direction = mat3(czm_modelView) * field.xyz;
    // Perspective differential, so the stroke follows the projected local flow.
    vec2 screen = direction.xy * (-eye.z) + eye.xy * direction.z;
    float projected = length(screen) / max(1.0, -eye.z);
    p.rotation = projected > 1e-6 ? atan(screen.y, screen.x) : 0.0;
    float elongation = mix(1.0, 5.0, clamp(projected / max(speed, 1e-6), 0.0, 1.0));
    p.size = u_windParticleSize * vec2(elongation, 1.0);
    p.color = vec4(windDisplayColor(field), u_windParticleOpacity * fade);
    if (sceneGISWindSolid(p.position)) p.color.a = 0.0;
}
