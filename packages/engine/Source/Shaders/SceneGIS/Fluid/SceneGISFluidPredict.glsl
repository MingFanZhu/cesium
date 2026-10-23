uniform bool u_reset;
uniform float u_dt;
uniform vec3 u_gravity;
uniform vec3 u_emitterPosition;
uniform vec3 u_emitterVelocity;
uniform float u_emitterRadius;
uniform float u_lifetime;
uniform vec4 u_spawn;
uniform int u_initialCount;
uniform vec3 u_initialMinimum;
uniform vec3 u_initialDimensions;
layout(location = 0) out vec4 out_position;
layout(location = 1) out vec4 out_velocity;
void main() {
    int id = fluidIndex();
    vec4 p = fluidRead(u_position, id);
    vec3 v = fluidRead(u_velocity, id).xyz;
    if (u_reset) {
        ivec3 n = ivec3(u_initialDimensions);
        ivec3 c = ivec3(id % n.x, (id / n.x) % n.y, id / (n.x * n.y));
        p = vec4(u_initialMinimum + vec3(c) * u_spacing, id < u_initialCount ? u_lifetime : 0.0);
        v = vec3(0.0);
    } else {
        int birth = (id - int(u_spawn.x) + u_capacity) % u_capacity;
        float dt = u_dt;
        if (birth < int(u_spawn.y)) {
            float serial = u_spawn.z + float(birth);
            float angle = serial * 2.39996323;
            float radius = u_emitterRadius * sqrt(fract(serial * 0.754877666 + 0.5));
            p = vec4(u_emitterPosition + vec3(cos(angle), sin(angle), 0.0) * radius, u_lifetime);
            v = u_emitterVelocity;
            dt *= (float(birth) + 0.5) / max(u_spawn.y, 1.0);
        }
        if (p.w > 0.0) {
            v += u_gravity * dt;
            p.xyz += v * dt;
            p.w = max(p.w - dt, 0.0);
        }
    }
    out_position = vec4(fluidCollide(p.xyz), p.w);
    out_velocity = vec4(v, 0.0);
}
