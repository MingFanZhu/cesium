void main() {
    int id = fluidIndex();
    vec4 p = fluidRead(u_position, id);
    if (p.w <= 0.0) { out_FragColor = vec4(0.0); return; }
    // The grid is built at prediction. Its cell width includes the maximum
    // relative displacement of both particles across all projection iterations.
    ivec3 cell = fluidCell(fluidRead(u_neighborPosition, id).xyz);
    float volume = pow(u_spacing, 3.0);
    float density = 0.0;
    float gradientSquared = 0.0;
    vec3 gradient = vec3(0.0);
    vec3 correction = vec3(0.0);
    float neighbors = 0.0;
    #ifdef FLUID_PROJECT
    float lambda = fluidRead(u_lambda, id).x;
    #endif
    for (int z = -1; z <= 1; ++z) {
        for (int y = -1; y <= 1; ++y) {
            for (int x = -1; x <= 1; ++x) {
                ivec3 c = cell + ivec3(x, y, z);
                if (any(lessThan(c, ivec3(0))) || any(greaterThanEqual(c, ivec3(u_cells)))) { continue; }
                vec2 range = fluidRead(u_ranges, fluidKey(c)).xy;
                for (int k = int(range.x); k < int(range.y); ++k) {
                    int other = int(fluidRead(u_sorted, k).y);
                    vec3 delta = p.xyz - fluidRead(u_position, other).xyz;
                    float r = length(delta);
                    if (r >= u_radius) { continue; }
                    vec3 g = volume * fluidGradient(delta);
                    #ifdef FLUID_PROJECT
                    correction += (lambda + fluidRead(u_lambda, other).x) * g;
                    #else
                    density += volume * fluidKernel(r);
                    gradient += g;
                    gradientSquared += dot(g, g);
                    neighbors += 1.0;
                    #endif
                }
            }
        }
    }
    #ifdef FLUID_PROJECT
    float distance = length(correction);
    if (distance > u_maximumCorrection) { correction *= u_maximumCorrection / distance; }
    out_FragColor = vec4(fluidCollide(p.xyz + correction), p.w);
    #else
    float denominator = gradientSquared + dot(gradient, gradient) + 0.01 / (u_radius * u_radius);
    out_FragColor = vec4(-max(density - 1.0, 0.0) / denominator, density, neighbors, 0.0);
    #endif
}
