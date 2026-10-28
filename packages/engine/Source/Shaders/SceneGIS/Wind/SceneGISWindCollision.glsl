#ifdef WIND_LAST
layout(location = 0) out vec4 out_FragColor;
#else
layout(location = 0) out vec4 out_FragData_0;
layout(location = 1) out vec4 out_FragData_1;
layout(location = 2) out vec4 out_FragData_2;
layout(location = 3) out vec4 out_FragData_3;
#endif
uniform bool u_reset;

void main() {
    ivec3 p = windCell();
    ivec3 n = ivec3(u_dimensions);
    float g[19];
    for (int i = 0; i < 19; ++i) g[i] = 0.0;
    if (p.z < n.z && !windSolid(p)) {
        if (u_reset) {
            for (int i = 0; i < 19; ++i) g[i] = windEquilibrium(i, 1.0, u_initial) + 0.5*windForce(i, 1.0, u_initial);
        } else {
            ivec3 neighbor;
            bool inlet;
            float convection;
            if (windOpen(p, neighbor, inlet, convection)) {
                vec4 macro = texelFetch(u_velocity, windPixel(neighbor), 0);
                vec3 u = macro.xyz / u_velocityScale;
                for (int i = 0; i < 19; ++i) {
                    float interior = windRead(i, neighbor);
                    g[i] = inlet ? windEquilibrium(i, macro.w, u_wind) + interior - windEquilibrium(i, macro.w, u)
                                 : windOutlet(i, p);
                }
            } else {
            float rho = 1.0;
            vec3 momentum = vec3(0.0);
            for (int i = 0; i < 19; ++i) {
                g[i] = windPull(i, p);
                rho += g[i];
                momentum += vec3(WIND_C[i]) * g[i];
            }
            vec3 velocity = momentum / rho + 0.5*u_acceleration;
            float neq[19];
            vec3 diagonal = vec3(0.0);
            vec3 offDiagonal = vec3(0.0);
            for (int i = 0; i < 19; ++i) {
                float force = windForce(i, rho, velocity);
                neq[i] = g[i] - windEquilibrium(i, rho, velocity) + 0.5*force;
                g[i] += force;
                vec3 c = vec3(WIND_C[i]);
                diagonal += c * c * neq[i];
                offDiagonal += vec3(c.x*c.y, c.y*c.z, c.x*c.z) * neq[i];
            }
            diagonal -= vec3((diagonal.x + diagonal.y + diagonal.z) / 3.0);
            float normPi = sqrt(2.0 * (dot(diagonal, diagonal) + 2.0 * dot(offDiagonal, offDiagonal)));
            float tau = 0.5 * (u_tau + sqrt(u_tau*u_tau + 18.0*u_cs*u_cs*normPi/rho));
            windRelax(g, neq, 1.0 / tau);
            }
        }
    }
#ifdef WIND_LAST
    out_FragColor = vec4(g[16], g[17], g[18], 0.0);
#else
    out_FragData_0 = vec4(g[0], g[1], g[2], g[3]);
    out_FragData_1 = vec4(g[4], g[5], g[6], g[7]);
    out_FragData_2 = vec4(g[8], g[9], g[10], g[11]);
    out_FragData_3 = vec4(g[12], g[13], g[14], g[15]);
#endif
}
