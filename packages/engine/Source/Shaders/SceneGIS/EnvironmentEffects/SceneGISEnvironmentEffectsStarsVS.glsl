in vec2 position;
in vec3 starDirection;
in vec3 starRadiance;

uniform mat3 u_worldToStars;
uniform vec4 u_frustum;
uniform vec3 u_cameraDirection;
uniform vec3 u_cameraRight;
uniform vec3 u_cameraUp;

flat out vec2 v_pixelCenter;
flat out vec3 v_worldDirection;
flat out vec3 v_starRadiance;

void main()
{
    vec3 direction = transpose(u_worldToStars) * starDirection;
    float forward = dot(direction, u_cameraDirection);
    if (forward <= 0.0) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        return;
    }
    vec2 plane = vec2(dot(direction, u_cameraRight), dot(direction, u_cameraUp)) / forward;
    vec2 uv = (plane - u_frustum.xz) / (u_frustum.yw - u_frustum.xz);
    v_pixelCenter = czm_viewport.xy + uv * czm_viewport.zw;
    v_worldDirection = direction;
    v_starRadiance = starRadiance;
    // Five-pixel quads cover the continuous four-pixel filter at every subpixel phase.
    gl_Position = vec4(uv * 2.0 - 1.0 + position * 5.0 / czm_viewport.zw, 0.0, 1.0);
}
