void main() {
    ivec3 p = windCell();
    if (p.z >= int(u_dimensions.z) || windSolid(p)) {
        out_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }
    float rho = 1.0;
    vec3 momentum = vec3(0.0);
    for (int i = 0; i < 19; ++i) {
        float g = windRead(i, p);
        rho += g;
        momentum += vec3(WIND_C[i]) * g;
    }
    out_FragColor = vec4(momentum / rho * u_velocityScale, rho);
}
