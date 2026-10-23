in vec4 position;
uniform sampler2D u_particles;
uniform sampler2D u_shape0;
uniform sampler2D u_shape1;
uniform sampler2D u_shape2;
uniform float u_surfaceAnisotropy;
uniform float u_renderRadius;
flat out vec3 v_centerEC;
flat out mat3 v_inverseShape;
void main() {
    ivec2 size = textureSize(u_particles, 0);
    int id = gl_InstanceID;
    ivec2 uv = ivec2(id % size.x, id / size.x);
    vec4 p = texelFetch(u_particles, uv, 0);
    if (p.w <= 0.0) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        v_centerEC = vec3(0.0);
        v_inverseShape = mat3(1.0);
        return;
    }
    mat3 axes = mat3(1.0);
    if (u_surfaceAnisotropy > 0.0) {
        axes = mat3(texelFetch(u_shape0, uv, 0).xyz, texelFetch(u_shape1, uv, 0).xyz, texelFetch(u_shape2, uv, 0).xyz);
        vec3 lengths = vec3(length(axes[0]), length(axes[1]), length(axes[2]));
        vec3 scale = mix(vec3(1.0), lengths, u_surfaceAnisotropy);
        scale /= pow(scale.x * scale.y * scale.z, 1.0 / 3.0);
        axes[0] *= scale.x / lengths.x;
        axes[1] *= scale.y / lengths.y;
        axes[2] *= scale.z / lengths.z;
    }
    mat3 shapeEC = mat3(czm_modelView) * axes * u_renderRadius;
    v_inverseShape = inverse(shapeEC);
    v_centerEC = (czm_modelView * vec4(p.xyz, 1.0)).xyz;
    mat3 rows = transpose(shapeEC);
    vec3 extent = vec3(length(rows[0]), length(rows[1]), length(rows[2]));
    vec2 lower = vec2(1.0);
    vec2 upper = vec2(-1.0);
    if (-v_centerEC.z <= extent.z) {
        lower = vec2(-1.0);
        upper = vec2(1.0);
    } else {
        // Project the eye-space bounding box conservatively, including particles
        // near the side of a perspective view. The fragment computes the true hit.
        for (int z = -1; z <= 1; z += 2) {
            for (int corner = -1; corner <= 1; corner += 2) {
                vec4 clip = czm_projection * vec4(v_centerEC + extent * vec3(float(corner), float(corner), float(z)), 1.0);
                lower = min(lower, clip.xy / clip.w);
                upper = max(upper, clip.xy / clip.w);
            }
        }
    }
    gl_Position = vec4(mix(lower, upper, position.xy * 0.5 + 0.5), 0.0, 1.0);
}
