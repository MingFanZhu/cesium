in vec2 position;
uniform sampler2D u_bathymetry;
uniform vec4 u_fieldRectangle;
uniform vec3 u_fieldLight;
uniform float u_fieldSpacing;
out vec3 v_source;
out vec3 v_receiver;
out vec2 v_sourceUV;

float bedDepth(vec2 p)
{
    vec2 size = vec2(textureSize(u_bathymetry, 0));
    vec2 uv = (p - u_fieldRectangle.xy) / u_fieldRectangle.zw;
    return max(texture(u_bathymetry, (clamp(uv, 0.0, 1.0) * (size - 1.0) + 0.5) / size).r, 0.0);
}
vec3 projectBed(vec3 p, vec3 direction)
{
    vec3 hit = p;
    for (int i = 0; i < 3; ++i) {
        float travel = (p.z + bedDepth(hit.xy)) / max(-direction.z, 0.05);
        hit = p + direction * max(travel, 0.0);
    }
    return hit;
}
void main()
{
    vec2 p = u_fieldRectangle.xy + position * u_fieldRectangle.zw;
    vec3 displaced, normal;
    sceneGISWaterFieldWave(p, u_fieldSpacing, displaced, normal);
    #ifdef SCENEGIS_WIND_WAVES
    vec2 size = vec2(textureSize(u_bathymetry, 0));
    float fade = texture(u_bathymetry, (position * (size - 1.0) + 0.5) / size).b;
    displaced = mix(vec3(p, 0.0), displaced, fade);
    normal = normalize(vec3(normal.xy * fade, normal.z));
    #endif
    vec3 light = normalize(u_fieldLight);
    v_source = projectBed(vec3(p, 0.0), refract(-light, vec3(0.0, 0.0, 1.0), 1.0 / 1.333));
    v_receiver = projectBed(displaced, refract(-light, normal, 1.0 / 1.333));
    v_sourceUV = position;
    gl_Position = vec4((v_receiver.xy - u_fieldRectangle.xy) / u_fieldRectangle.zw * 2.0 - 1.0, 0.0, 1.0);
}
