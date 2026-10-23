uniform sampler2D u_position;
uniform sampler2D u_velocity;
uniform sampler2D u_sorted;
uniform sampler2D u_ranges;
uniform sampler2D u_lambda;
uniform sampler2D u_neighborPosition;
uniform vec3 u_minimum;
uniform vec3 u_maximum;
uniform vec3 u_cells;
uniform float u_radius;
uniform float u_spacing;
uniform float u_particleRadius;
uniform float u_cellSize;
uniform float u_maximumCorrection;
uniform int u_capacity;

ivec2 fluidUV(int index, sampler2D source) {
    int width = textureSize(source, 0).x;
    return ivec2(index % width, index / width);
}
vec4 fluidRead(sampler2D source, int index) {
    return texelFetch(source, fluidUV(index, source), 0);
}
int fluidIndex() {
    return int(gl_FragCoord.y) * textureSize(u_position, 0).x + int(gl_FragCoord.x);
}
ivec3 fluidCell(vec3 p) {
    return clamp(ivec3(floor((p - u_minimum) / u_cellSize)), ivec3(0), ivec3(u_cells) - 1);
}
int fluidKey(ivec3 c) {
    return c.x + int(u_cells.x) * (c.y + int(u_cells.y) * c.z);
}
float fluidKernel(float r) {
    float q = max(1.0 - r * r / (u_radius * u_radius), 0.0);
    return 315.0 / (64.0 * czm_pi * pow(u_radius, 3.0)) * q * q * q;
}
vec3 fluidGradient(vec3 delta) {
    float r = length(delta);
    if (r <= 1.0e-6 || r >= u_radius) { return vec3(0.0); }
    float q = 1.0 - r / u_radius;
    return -45.0 / (czm_pi * pow(u_radius, 4.0)) * q * q * delta / r;
}
vec3 fluidCollide(vec3 p) {
    return clamp(p, u_minimum + u_particleRadius, u_maximum - u_particleRadius);
}
