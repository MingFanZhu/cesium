uniform mat4 u_updateTransform;
uniform mat4 u_renderTransform;
uniform vec2 u_wind;
uniform float u_snow;
uniform float u_radius;
uniform float u_innerRadius;
uniform float u_intensity;
uniform float u_particleSize;
uniform float u_cameraHeight;
uniform float u_ceilingHeight;
uniform vec4 u_color;

vec3 weatherWrap(vec3 p) {
    return mod(p + u_radius, 2.0 * u_radius) - u_radius;
}
vec3 weatherVelocity(float seed) {
    float r = sceneGISParticleRandom(seed, 4.0);
    return vec3(u_wind, -mix(16.0 + 6.0 * r, 0.9 + 1.2 * r, u_snow));
}
vec2 weatherDrift(float age, float seed) {
    float phase = sceneGISParticleRandom(seed, 5.0) * 6.2831853;
    return vec2(sin(age * 0.8 + phase), cos(age * 0.57 + phase)) * mix(0.12, 1.6, u_snow);
}
