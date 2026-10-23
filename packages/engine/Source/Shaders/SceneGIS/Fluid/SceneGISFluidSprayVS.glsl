in vec4 position;
uniform sampler2D u_sprayPosition;
uniform sampler2D u_sprayVelocity;
uniform float u_sprayRadius;
out vec2 v_dropUV;
out vec3 v_positionEC;
flat out vec3 v_centerEC;
flat out float v_radius;
flat out float v_opacity;
void main() {
    ivec2 size = textureSize(u_sprayPosition, 0);
    ivec2 uv = ivec2(gl_InstanceID % size.x, gl_InstanceID / size.x);
    vec4 p = texelFetch(u_sprayPosition, uv, 0);
    vec4 velocity = texelFetch(u_sprayVelocity, uv, 0);
    v_dropUV = position.xy;
    v_radius = u_sprayRadius * mix(0.55, 1.0, fract(float(gl_InstanceID) * 0.618033989));
    v_centerEC = (czm_modelView * vec4(p.xyz, 1.0)).xyz;
    v_positionEC = v_centerEC;
    v_opacity = 0.0;
    if (p.w <= 0.0) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        return;
    }
    vec3 speed = mat3(czm_modelView) * velocity.xyz;
    float projectedSpeed = length(speed.xy);
    vec2 tangent = projectedSpeed > 1.0e-5 ? speed.xy / projectedSpeed : vec2(1.0, 0.0);
    // A bounded short exposure keeps fine droplets legible without long ribbons.
    float stretch = min(3.0, 1.0 + projectedSpeed * 0.002 / v_radius);
    vec2 offset = tangent * position.x * stretch + vec2(-tangent.y, tangent.x) * position.y;
    v_positionEC.xy += offset * v_radius;
    v_opacity = smoothstep(0.0, 0.08, p.w) * smoothstep(0.0, 0.025, velocity.w - p.w) / sqrt(stretch);
    gl_Position = czm_projection * vec4(v_positionEC, 1.0);
}
