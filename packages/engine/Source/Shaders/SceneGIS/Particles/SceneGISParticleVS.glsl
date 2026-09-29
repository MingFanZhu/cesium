in vec2 a_corner;
out vec2 v_uv;
out vec4 v_color;
void main() {
    int width = textureSize(u_sgPosition, 0).x;
    int index = gl_InstanceID;
    SceneGISParticle p = sceneGISReadParticle(ivec2(index % width, index / width));
    styleParticle(p);
    v_uv = a_corner + 0.5;
    v_color = p.color;
    if (p.age < 0.0 || p.age >= p.life) {
        v_color = vec4(0.0);
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        return;
    }
    float c = cos(p.rotation), s = sin(p.rotation);
    vec2 offset = mat2(c, s, -s, c) * (a_corner * p.size);
    vec4 eye = czm_modelView * vec4(p.position, 1.0);
    eye.xy += offset;
    gl_Position = czm_projection * eye;
}
