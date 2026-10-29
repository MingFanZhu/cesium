uniform sampler2D u_position;
uniform vec2 u_tile;
void main() {
    vec4 p = texelFetch(u_position, ivec2(gl_FragCoord.xy - u_tile), 0);
    if (sceneGISWindSolid(p.xyz)) p.w = -1.0;
    out_FragColor = p;
}
