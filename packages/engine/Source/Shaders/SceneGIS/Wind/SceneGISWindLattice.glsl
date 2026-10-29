uniform sampler2D u_f0;
uniform sampler2D u_f1;
uniform sampler2D u_f2;
uniform sampler2D u_f3;
uniform sampler2D u_f4;
uniform sampler2D u_solid;
uniform vec3 u_dimensions;
uniform float u_columns;
uniform vec3 u_initial;
uniform float u_tau;
uniform float u_cs;
uniform float u_velocityScale;
uniform sampler2D u_velocity;
uniform vec3 u_wind;
uniform vec3 u_acceleration;
uniform vec3 u_boundaryMin;
uniform vec3 u_boundaryMax;

ivec2 windPixel(ivec3 p) {
    int columns = int(u_columns);
    return ivec2(p.x + (p.z % columns) * int(u_dimensions.x),
                 p.y + (p.z / columns) * int(u_dimensions.y));
}
ivec3 windCell() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    ivec3 n = ivec3(u_dimensions);
    return ivec3(p.x % n.x, p.y % n.y, p.x / n.x + (p.y / n.y) * int(u_columns));
}
float windRead(int i, ivec3 p) {
    ivec2 uv = windPixel(p);
    vec4 v;
    if (i < 4) v = texelFetch(u_f0, uv, 0);
    else if (i < 8) v = texelFetch(u_f1, uv, 0);
    else if (i < 12) v = texelFetch(u_f2, uv, 0);
    else if (i < 16) v = texelFetch(u_f3, uv, 0);
    else v = texelFetch(u_f4, uv, 0);
    return v[i % 4];
}
bool windSolid(ivec3 p) { return texelFetch(u_solid, windPixel(p), 0).r > 0.5; }
float windEquilibrium(int i, float rho, vec3 velocity) {
    float cu = dot(vec3(WIND_C[i]), velocity);
    return WIND_W[i] * (rho - 1.0 + rho * (3.0 * cu + 4.5 * cu * cu - 1.5 * dot(velocity, velocity)));
}

float windForce(int i, float rho, vec3 velocity) {
    vec3 c = vec3(WIND_C[i]);
    return WIND_W[i] * rho * dot(3.0*(c-velocity)+9.0*dot(c,velocity)*c, u_acceleration);
}

float windPull(int i, ivec3 p) {
    ivec3 n = ivec3(u_dimensions);
    ivec3 q = p - WIND_C[i];
    ivec3 reflected = WIND_C[i];
    for (int a = 0; a < 3; ++a) {
        if (q[a] < 0 || q[a] >= n[a]) {
            int mode = int(q[a] < 0 ? u_boundaryMin[a] : u_boundaryMax[a]);
            if (mode == 1) return windRead(WIND_OPP[i], p);
            if (mode == 0) q[a] = (q[a] + n[a]) % n[a];
            else {
                q[a] = clamp(q[a], 0, n[a]-1);
                reflected[a] = -reflected[a];
            }
        }
    }
    if (windSolid(q)) return windRead(WIND_OPP[i], p);
    int source = i;
    for (int j = 0; j < 19; ++j) if (all(equal(WIND_C[j], reflected))) source = j;
    return windRead(source, q);
}

float windOutlet(int i, ivec3 p) {
    ivec3 n = ivec3(u_dimensions);
    float previous = windRead(i, p);
    float value = previous;
    for (int a = 0; a < 3; ++a) {
        int mode = p[a] == 0 ? int(u_boundaryMin[a]) : p[a] == n[a]-1 ? int(u_boundaryMax[a]) : 0;
        if (mode == 4) {
            ivec3 q = p;
            q[a] += p[a] == 0 ? 1 : -1;
            value += abs(u_wind[a]) * (windRead(i, q) - previous);
        }
    }
    return value;
}

// Boundary nodes use old completed distributions; they are not collided twice.
bool windOpen(ivec3 p, out ivec3 neighbor, out bool inlet, out float convection) {
    ivec3 n = ivec3(u_dimensions);
    neighbor = p;
    inlet = false;
    convection = 0.0;
    bool openFace = false;
    for (int a = 0; a < 3; ++a) {
        int mode = p[a] == 0 ? int(u_boundaryMin[a]) : p[a] == n[a]-1 ? int(u_boundaryMax[a]) : 0;
        if (mode >= 3) {
            openFace = true;
            inlet = inlet || mode == 3;
            neighbor[a] += p[a] == 0 ? 1 : -1;
            convection += abs(u_wind[a]);
        }
    }
    return openFace;
}
