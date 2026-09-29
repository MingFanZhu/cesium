void initializeParticle(inout SceneGISParticle p) {
    p.position = (vec3(sceneGISParticleRandom(p.seed, 0.0),
        sceneGISParticleRandom(p.seed, 1.0), sceneGISParticleRandom(p.seed, 2.0)) * 2.0 - 1.0) * u_radius;
    p.life = 1.0e12;
}
void updateParticle(inout SceneGISParticle p, float dt) {
    p.position = (u_updateTransform * vec4(p.position, 1.0)).xyz;
    p.velocity = weatherVelocity(p.seed);
    p.position += p.velocity * dt;
    p.position.xy += weatherDrift(p.age, p.seed) - weatherDrift(p.age - dt, p.seed);
    p.position = weatherWrap(p.position);
}
