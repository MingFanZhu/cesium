uniform sampler2D u_position;
uniform sampler2D u_style;
uniform bool u_reset;
uniform float u_dt;
layout(location = 0) out vec4 out_position;
layout(location = 1) out vec4 out_style;
void main() {
    ivec2 pixel = ivec2(gl_FragCoord.xy);
    SceneGISParticle p;
    p.seed = float(pixel.x + pixel.y * textureSize(u_position, 0).x + 1);
    p.age = 0.0;
    p.life = 1e20;
    if (u_reset) {
        initializeParticle(p);
    } else {
        vec4 a = texelFetch(u_position, pixel, 0), b = texelFetch(u_style, pixel, 0);
        p.position = a.xyz;
        p.size = b.xy;
        p.rotation = b.z;
        updateParticle(p, u_dt);
    }
    out_position = vec4(p.position, p.rotation);
    out_style = vec4(p.size, p.rotation, p.seed);
}
