uniform sampler2D u_predicted;
uniform float u_dt;
uniform float u_restitution;
uniform float u_damping;
layout(location = 0) out vec4 out_position;
layout(location = 1) out vec4 out_velocity;
void main() {
    int id = fluidIndex();
    vec4 p = fluidRead(u_position, id);
    vec3 predicted = fluidRead(u_predicted, id).xyz;
    vec3 v = fluidRead(u_velocity, id).xyz;
    p.xyz = fluidCollide(p.xyz);
    if (u_dt > 0.0 && p.w > 0.0) {
        v += (p.xyz - predicted) / u_dt;
        for (int axis = 0; axis < 3; ++axis) {
            if ((p[axis] <= u_minimum[axis] + u_particleRadius + 1.0e-6 && v[axis] < 0.0) ||
                (p[axis] >= u_maximum[axis] - u_particleRadius - 1.0e-6 && v[axis] > 0.0)) {
                v[axis] *= -u_restitution;
            }
        }
        v *= exp(-u_damping * u_dt);
    }
    out_position = p;
    out_velocity = vec4(v, 0.0);
}
