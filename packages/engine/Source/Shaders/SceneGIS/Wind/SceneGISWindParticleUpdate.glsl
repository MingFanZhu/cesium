uniform float u_windTimeStep;

// At most three voxel faces can be crossed by a sub-cell RK2 step. Check the
// whole segment, including short intersections near corners, rather than endpoints alone.
bool windParticleClear(vec3 start, vec3 end) {
    if (sceneGISWindSolid(start) || sceneGISWindSolid(end)) return false;
    vec3 a = (start - u_sgWindMinimum) / u_sgWindCellSize;
    vec3 b = (end - u_sgWindMinimum) / u_sgWindCellSize;
    vec3 d = b - a;
    ivec3 cell = ivec3(floor(a)), target = ivec3(floor(b));
    ivec3 direction = ivec3(sign(d));
    vec3 inv = 1.0 / max(abs(d), vec3(1e-20));
    vec3 edge = mix(a - floor(a), floor(a) + 1.0 - a, greaterThan(d, vec3(0.0)));
    vec3 next = edge * inv;
    for (int i = 0; i < 4; ++i) {
        if (all(equal(cell, target))) return true;
        int axis = next.x <= next.y && next.x <= next.z ? 0 : next.y <= next.z ? 1 : 2;
        cell[axis] += direction[axis];
        next[axis] += inv[axis];
        if (texelFetch(u_sgWindSolid, sceneGISWindPixel(cell), 0).r > 0.5) return false;
    }
    return false;
}

// Persistent style fields hold recycle age, lifetime and sequence. The render
// function replaces them on a draw-local copy. Randomness changes seed positions only.
void windParticleSeed(inout SceneGISParticle p, bool initial) {
    float stream = p.rotation * 4.0;
    vec3 random = vec3(sceneGISParticleRandom(p.seed, stream),
                       sceneGISParticleRandom(p.seed, stream + 1.0),
                       sceneGISParticleRandom(p.seed, stream + 2.0));
    p.position = u_sgWindMinimum + (0.5 + random * (u_sgWindDimensions - 1.0)) * u_sgWindCellSize;
    p.size.y = 8.0 + 8.0 * sceneGISParticleRandom(p.seed, stream + 3.0);
    p.size.x = initial ? random.x * p.size.y : 0.0;
    p.velocity = sceneGISWindSample(p.position).xyz;
    p.color = vec4(1.0);
}
void initializeParticle(inout SceneGISParticle p) {
    p.life = 1e20;
    p.rotation = 0.0;
    windParticleSeed(p, true);
}
void updateParticle(inout SceneGISParticle p, float dt) {
    // All substeps sample the completed velocity snapshot. These are visual
    // flow markers, not the independently integrated conservative tracer field.
    int steps = max(1, int(ceil(dt / u_windTimeStep - 1e-5)));
    float h = dt / float(steps);
    for (int i = 0; i < steps; ++i) {
        p.size.x += h;
        if (p.size.x >= p.size.y || sceneGISWindSolid(p.position)) {
            p.rotation = mod(p.rotation + 1.0, 1048576.0);
            windParticleSeed(p, false);
        }
        if (sceneGISWindSolid(p.position)) continue;
        vec3 velocity = sceneGISWindSample(p.position).xyz;
        vec3 mid = p.position + 0.5 * h * velocity;
        vec3 next = p.position + h * sceneGISWindSample(mid).xyz;
        if (!windParticleClear(p.position, mid) || !windParticleClear(p.position, next)) {
            p.rotation = mod(p.rotation + 1.0, 1048576.0);
            windParticleSeed(p, false);
        } else {
            p.position = next;
            p.velocity = sceneGISWindSample(next).xyz;
        }
    }
}
