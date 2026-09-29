// Shared GPU storage contract. Age and seed are maintained by the scheduler.
struct SceneGISParticle {
    vec3 position;
    vec3 velocity;
    vec4 color;
    vec2 size;
    float rotation;
    float age;
    float life;
    float seed;
};
uniform sampler2D u_sgPosition;
uniform sampler2D u_sgVelocity;
uniform sampler2D u_sgColor;
uniform sampler2D u_sgStyle;

float sceneGISParticleRandom(float seed, float stream) {
    uint x = uint(seed) ^ (uint(stream) * 1597334677u);
    x ^= x >> 16;
    x *= 2246822519u;
    x ^= x >> 13;
    x *= 3266489917u;
    x ^= x >> 16;
    return float(x & 16777215u) / 16777216.0;
}

SceneGISParticle sceneGISReadParticle(ivec2 texel) {
    vec4 a = texelFetch(u_sgPosition, texel, 0);
    vec4 b = texelFetch(u_sgVelocity, texel, 0);
    vec4 d = texelFetch(u_sgStyle, texel, 0);
    SceneGISParticle p;
    p.position = a.xyz; p.age = a.w;
    p.velocity = b.xyz; p.life = b.w;
    p.color = texelFetch(u_sgColor, texel, 0);
    p.size = d.xy; p.rotation = d.z; p.seed = d.w;
    return p;
}
