in vec2 position;
uniform sampler2D u_bathymetry;
#ifndef SCENEGIS_REGIONAL_FIELD
uniform vec4 u_fieldRectangle;
#endif
uniform vec3 u_fieldLight;
uniform float u_fieldSpacing;
out float v_focus;
out vec2 v_sourceUV;

float bedLevel(vec2 p)
{
    vec2 size = vec2(textureSize(u_bathymetry, 0));
    vec2 uv = (p - u_fieldRectangle.xy) / u_fieldRectangle.zw;
    float mean = 0.0;
    #ifdef SCENEGIS_REGIONAL_FIELD
    mean = textureLod(u_fieldSurface, sceneGISRegionalUV(p), 0.0).z;
    #endif
    return mean - max(textureLod(u_bathymetry, (clamp(uv, 0.0, 1.0) * (size - 1.0) + 0.5) / size, 0.0).r, 0.0);
}
vec3 projectBed(vec3 p, vec3 direction)
{
    vec3 hit = p;
    for (int i = 0; i < 3; ++i) {
        float travel = (p.z - bedLevel(hit.xy)) / max(-direction.z, 0.05);
        hit = p + direction * max(travel, 0.0);
    }
    return hit;
}
void refractedPair(vec2 p, out vec3 source, out vec3 receiver)
{
    vec3 displaced, normal;
    #ifdef SCENEGIS_REGIONAL_FIELD
    vec3 mean, meanNormal;
    sceneGISRegionalWave(p, u_fieldSpacing, false, mean, meanNormal);
    sceneGISRegionalWave(p, u_fieldSpacing, true, displaced, normal);
    vec3 light = normalize(u_fieldLight);
    source = projectBed(mean, refract(-light, meanNormal, 1.0 / 1.333));
    receiver = projectBed(displaced, refract(-light, normal, 1.0 / 1.333));
    #else
    sceneGISWaterFieldWave(p, u_fieldSpacing, displaced, normal);
    #ifdef SCENEGIS_WIND_WAVES
    vec2 size = vec2(textureSize(u_bathymetry, 0));
    vec2 uv = (p - u_fieldRectangle.xy) / u_fieldRectangle.zw;
    float fade = texture(u_bathymetry, (uv * (size - 1.0) + 0.5) / size).b;
    displaced = mix(vec3(p, 0.0), displaced, fade);
    normal = normalize(vec3(normal.xy * fade, normal.z));
    #endif
    vec3 light = normalize(u_fieldLight);
    source = projectBed(vec3(p, 0.0), refract(-light, vec3(0.0, 0.0, 1.0), 1.0 / 1.333));
    receiver = projectBed(displaced, refract(-light, normal, 1.0 / 1.333));
    #endif
}
void main()
{
    vec2 p = u_fieldRectangle.xy + position * u_fieldRectangle.zw;
    vec3 source, receiver, sx0, sx1, sy0, sy1, rx0, rx1, ry0, ry1;
    refractedPair(p, source, receiver);
    float h = u_fieldSpacing * 0.5;
    refractedPair(p - vec2(h, 0.0), sx0, rx0);
    refractedPair(p + vec2(h, 0.0), sx1, rx1);
    refractedPair(p - vec2(0.0, h), sy0, ry0);
    refractedPair(p + vec2(0.0, h), sy1, ry1);
    // Sample the continuous refraction Jacobian at vertices, then interpolate.
    // Fragment derivatives of triangle positions give a visible constant per face.
    float sourceArea = length(cross(sx1 - sx0, sy1 - sy0));
    float receiverArea = length(cross(rx1 - rx0, ry1 - ry0));
    v_focus = min(sourceArea / max(receiverArea, 1e-8), 8.0);
    v_sourceUV = position;
    gl_Position = vec4((receiver.xy - u_fieldRectangle.xy) / u_fieldRectangle.zw * 2.0 - 1.0, 0.0, 1.0);
}
