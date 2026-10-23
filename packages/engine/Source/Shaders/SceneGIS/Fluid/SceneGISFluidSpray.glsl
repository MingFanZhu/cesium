uniform sampler2D u_sprayPosition;
uniform sampler2D u_sprayVelocity;
uniform sampler2D u_beforeVelocity;
uniform float u_dt;
uniform vec3 u_gravity;
uniform float u_sprayIntensity;
uniform int u_sprayStep;
uniform bool u_sprayReset;
layout(location = 0) out vec4 out_position;
layout(location = 1) out vec4 out_velocity;

uint fluidSprayHash(uint value) {
    value ^= value >> 16;
    value *= 0x7feb352du;
    value ^= value >> 15;
    value *= 0x846ca68bu;
    return value ^ (value >> 16);
}
float fluidSprayRandom(inout uint seed) {
    seed = fluidSprayHash(seed);
    return float(seed >> 8) / 16777216.0;
}

float fluidSprayDensity(vec3 p) {
    // The prediction grid includes the bounded final-position corrections.
    ivec3 cell = fluidCell(p);
    float density = 0.0;
    for (int z = -1; z <= 1; ++z) {
        for (int y = -1; y <= 1; ++y) {
            for (int x = -1; x <= 1; ++x) {
                ivec3 c = cell + ivec3(x, y, z);
                if (any(lessThan(c, ivec3(0))) || any(greaterThanEqual(c, ivec3(u_cells)))) { continue; }
                vec2 range = fluidRead(u_ranges, fluidKey(c)).xy;
                for (int k = int(range.x); k < int(range.y); ++k) {
                    int other = int(fluidRead(u_sorted, k).y);
                    density += pow(u_spacing, 3.0) * fluidKernel(length(p - fluidRead(u_position, other).xyz));
                }
            }
        }
    }
    return density;
}

void main() {
    if (u_sprayReset) {
        out_position = vec4(0.0);
        out_velocity = vec4(0.0);
        return;
    }
    int id = fluidIndex();
    vec4 p = fluidRead(u_sprayPosition, id);
    vec4 v = fluidRead(u_sprayVelocity, id);
    if (p.w > 0.0) {
        v.xyz = (v.xyz + u_gravity * u_dt) * exp(-0.7 * u_dt);
        p.xyz += v.xyz * u_dt;
        p.w = max(p.w - u_dt, 0.0);
        if (any(lessThanEqual(p.xyz, u_minimum)) || any(greaterThanEqual(p.xyz, u_maximum))) {
            p.w = 0.0;
        } else if (fluidSprayDensity(p.xyz) > 0.8) {
            // Reabsorbed by the main liquid. No passive particles accumulate in the pool.
            p.w = 0.0;
        }
    } else if (u_sprayIntensity > 0.0) {
        vec4 source = fluidRead(u_position, id);
        vec3 velocity = fluidRead(u_velocity, id).xyz;
        vec3 incoming = fluidRead(u_beforeVelocity, id).xyz;
        float density = fluidRead(u_lambda, id).y;
        float speed = length(velocity);
        vec3 impact = vec3(0.0);
        for (int axis = 0; axis < 3; ++axis) {
            if (source[axis] <= u_minimum[axis] + u_particleRadius + 1.0e-5 && incoming[axis] < 0.0) {
                impact[axis] = -incoming[axis];
            } else if (source[axis] >= u_maximum[axis] - u_particleRadius - 1.0e-5 && incoming[axis] > 0.0) {
                impact[axis] = -incoming[axis];
            }
        }
        float impulse = length(impact);
        float surface = 1.0 - smoothstep(0.45, 0.85, density);
        float rate = surface * max(speed - 1.5, 0.0) * 3.0 + max(impulse - 1.0, 0.0) * 12.0;
        uint seed = fluidSprayHash(uint(id) + uint(u_sprayStep) * 747796405u + 1u);
        if (source.w > 0.0 && fluidSprayRandom(seed) < 1.0 - exp(-rate * u_sprayIntensity * u_dt)) {
            float z = fluidSprayRandom(seed) * 2.0 - 1.0;
            float angle = fluidSprayRandom(seed) * czm_twoPi;
            vec3 outward = vec3(sqrt(max(1.0 - z * z, 0.0)) * vec2(cos(angle), sin(angle)), z);
            if (impulse > 0.0) {
                vec3 normal = impact / impulse;
                outward = normalize(outward - normal * min(dot(outward, normal), 0.0) + normal);
            }
            float life = mix(0.35, 0.9, fluidSprayRandom(seed));
            p = vec4(clamp(source.xyz + outward * u_spacing * 0.7,
                u_minimum + u_spacing * 0.1, u_maximum - u_spacing * 0.1), life);
            // Passive sub-grid detail; it never feeds energy or mass into PBF.
            v = vec4(velocity + outward * min(0.15 * speed + 0.4 * impulse, 2.5), life);
        }
    }
    out_position = p;
    out_velocity = v;
}
