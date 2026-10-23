in vec4 position;
uniform sampler2D u_particles;
uniform float u_renderRadius;
out vec2 v_corner;
flat out vec3 v_centerEC;
void main() {
    ivec2 size = textureSize(u_particles, 0);
    int id = gl_InstanceID;
    vec4 p = texelFetch(u_particles, ivec2(id % size.x, id / size.x), 0);
    v_corner = position.xy;
    v_centerEC = (czm_modelView * vec4(p.xyz, 1.0)).xyz;
    gl_Position = p.w > 0.0 ? czm_projection * vec4(v_centerEC + vec3(v_corner * u_renderRadius, 0.0), 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
}
