uniform float u_sgCapacity;
uniform float u_sgDeltaTime;
uniform bool u_sgReset;
// First slot, birth count, age of first birth, interval between births.
uniform vec4 u_sgSpawn;
uniform float u_sgSerial;
uniform float u_sgSeed;
layout(location=0) out vec4 out_position;
layout(location=1) out vec4 out_velocity;
layout(location=2) out vec4 out_color;
layout(location=3) out vec4 out_style;

SceneGISParticle sceneGISNewParticle() {
    SceneGISParticle p;
    p.position = vec3(0.0); p.velocity = vec3(0.0);
    p.color = vec4(1.0); p.size = vec2(1.0); p.rotation = 0.0;
    p.age = -1.0; p.life = 5.0; p.seed = 0.0;
    return p;
}
void main() {
    ivec2 texel = ivec2(gl_FragCoord.xy);
    int width = textureSize(u_sgPosition, 0).x;
    float index = float(texel.y * width + texel.x);
    SceneGISParticle p = sceneGISNewParticle();
    if (!u_sgReset && index < u_sgCapacity) {
        p = sceneGISReadParticle(texel);
        float offset = mod(index - u_sgSpawn.x + u_sgCapacity, u_sgCapacity);
        float dt = u_sgDeltaTime;
        if (offset < u_sgSpawn.y) {
            p = sceneGISNewParticle();
            p.seed = float((uint(u_sgSerial) + uint(offset) + uint(u_sgSeed)) & 16777215u);
            float seed = p.seed;
            p.age = 0.0;
            initializeParticle(p);
            p.seed = seed;
            p.age = 0.0;
            dt = max(0.0, u_sgSpawn.z - offset * u_sgSpawn.w);
        }
        if (p.age >= 0.0) {
            float age = p.age + dt;
            float seed = p.seed;
            p.age = age;
            if (age < p.life) { updateParticle(p, dt); }
            p.seed = seed;
            p.age = age < p.life ? age : -1.0;
        }
    }
    out_position = vec4(p.position, p.age);
    out_velocity = vec4(p.velocity, p.life);
    out_color = p.color;
    out_style = vec4(p.size, p.rotation, p.seed);
}
