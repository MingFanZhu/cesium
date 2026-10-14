uniform sampler2D colorTexture;
uniform sampler2D u_diffuse;
uniform sampler2D u_normal;
uniform sampler2D u_specular;
uniform sampler2D u_emission;
uniform sampler2D u_depth;
uniform float u_view;
uniform bool u_ready;
in vec2 v_textureCoordinates;
void main()
{
    if (!u_ready) {
        out_FragColor = texture(colorTexture, v_textureCoordinates);
        return;
    }
    vec4 diffuse = texture(u_diffuse, v_textureCoordinates);
    vec4 normal = texture(u_normal, v_textureCoordinates);
    vec4 specular = texture(u_specular, v_textureCoordinates);
    vec4 emission = texture(u_emission, v_textureCoordinates);
    float depth = texture(u_depth, v_textureCoordinates).r;
    vec3 value = vec3(0.0);
    if (u_view == 1.0) { value = czm_linearToSrgb(max(diffuse.rgb, vec3(0.0))); }
    else if (u_view == 2.0) { value = normal.xyz * 0.5 + 0.5; }
    else if (u_view == 3.0) { value = vec3(normal.w); }
    else if (u_view == 4.0) { value = specular.rgb; }
    else if (u_view == 5.0) { value = vec3(diffuse.a); }
    else if (u_view == 6.0) { value = czm_linearToSrgb(max(emission.rgb, vec3(0.0))); }
    else if (u_view == 7.0) { value = vec3(log2(1.0 + max(depth, 0.0)) / 10.0); }
    else if (u_view == 8.0) { value = vec3(float(specular.a != 0.0)); }
    else { value = fract(specular.a * vec3(0.37, 0.61, 0.83)); }
    if (specular.a == 0.0) { value = vec3(0.0); }
    out_FragColor = vec4(value, 1.0);
}
