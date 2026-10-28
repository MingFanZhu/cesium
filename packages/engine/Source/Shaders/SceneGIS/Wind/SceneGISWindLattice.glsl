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
