layout(location = 0) out vec4 out_axis0;
layout(location = 1) out vec4 out_axis1;
layout(location = 2) out vec4 out_axis2;

void fluidDiagonalize(inout mat3 covariance, inout mat3 basis, int p, int q) {
    float offDiagonal = covariance[q][p];
    if (abs(offDiagonal) < 1.0e-7) { return; }
    float tau = (covariance[q][q] - covariance[p][p]) / (2.0 * offDiagonal);
    float t = (tau >= 0.0 ? 1.0 : -1.0) / (abs(tau) + sqrt(1.0 + tau * tau));
    float c = inversesqrt(1.0 + t * t);
    float s = t * c;
    mat3 rotation = mat3(1.0);
    rotation[p][p] = c;
    rotation[q][q] = c;
    rotation[q][p] = s;
    rotation[p][q] = -s;
    covariance = transpose(rotation) * covariance * rotation;
    basis = basis * rotation;
}

void main() {
    int id = fluidIndex();
    vec4 p = fluidRead(u_position, id);
    mat3 axes = mat3(1.0);
    if (p.w > 0.0) {
        // Reuse the conservative prediction grid, evaluating final positions.
        ivec3 cell = fluidCell(fluidRead(u_neighborPosition, id).xyz);
        float weight = 0.0;
        float neighbors = 0.0;
        vec3 mean = vec3(0.0);
        mat3 secondMoment = mat3(0.0);
        for (int z = -1; z <= 1; ++z) {
            for (int y = -1; y <= 1; ++y) {
                for (int x = -1; x <= 1; ++x) {
                    ivec3 c = cell + ivec3(x, y, z);
                    if (any(lessThan(c, ivec3(0))) || any(greaterThanEqual(c, ivec3(u_cells)))) { continue; }
                    vec2 range = fluidRead(u_ranges, fluidKey(c)).xy;
                    for (int k = int(range.x); k < int(range.y); ++k) {
                        int other = int(fluidRead(u_sorted, k).y);
                        vec3 delta = (fluidRead(u_position, other).xyz - p.xyz) / u_radius;
                        float r2 = dot(delta, delta);
                        if (r2 >= 1.0) { continue; }
                        float w = pow(1.0 - r2, 3.0);
                        weight += w;
                        mean += w * delta;
                        secondMoment += w * outerProduct(delta, delta);
                        neighbors += 1.0;
                    }
                }
            }
        }
        if (neighbors > 3.0) {
            mean /= weight;
            mat3 covariance = secondMoment / weight - outerProduct(mean, mean);
            mat3 basis = mat3(1.0);
            for (int sweep = 0; sweep < 5; ++sweep) {
                fluidDiagonalize(covariance, basis, 0, 1);
                fluidDiagonalize(covariance, basis, 0, 2);
                fluidDiagonalize(covariance, basis, 1, 2);
            }
            vec3 eigenvalues = max(vec3(covariance[0][0], covariance[1][1], covariance[2][2]), vec3(1.0e-6));
            float largest = max(max(eigenvalues.x, eigenvalues.y), eigenvalues.z);
            // Limit the axis ratio to two. Unit determinant then bounds every
            // semi-axis by cbrt(4) < 1.6 and preserves the absorption volume.
            vec3 scale = sqrt(max(eigenvalues, vec3(largest * 0.25)));
            scale /= pow(scale.x * scale.y * scale.z, 1.0 / 3.0);
            scale = mix(vec3(1.0), scale, clamp((neighbors - 3.0) / 9.0, 0.0, 1.0));
            scale /= pow(scale.x * scale.y * scale.z, 1.0 / 3.0);
            axes = basis * mat3(scale.x, 0.0, 0.0, 0.0, scale.y, 0.0, 0.0, 0.0, scale.z);
        }
    }
    out_axis0 = vec4(axes[0], 0.0);
    out_axis1 = vec4(axes[1], 0.0);
    out_axis2 = vec4(axes[2], 0.0);
}
