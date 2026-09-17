#ifdef SCENEGIS_VECTOR_PATTERN
uniform sampler2D u_sceneGISPatternAtlas;
uniform vec2 u_sceneGISPatternAtlasSize;
uniform vec4 u_sceneGISPatternOrigin;
uniform float u_sceneGISPatternMetersPerPixel;

vec2 vectorPatternPosition(vec2 local, vec2 size)
{
    // Reduce the split source origin before adding local coordinates.
    vec2 upper = mod(u_sceneGISPatternOrigin.xy, size);
    upper = mod(upper * 256.0, size);
    upper = mod(upper * 256.0, size);
    return mod(upper + u_sceneGISPatternOrigin.zw, size) +
        vec2(local.x, -local.y) / u_sceneGISPatternMetersPerPixel;
}

vec4 vectorPatternSample(vec4 rect, vec2 size, vec2 position)
{
    vec2 pixel = fract(position / size) * rect.zw - 0.5;
    vec2 base = floor(pixel);
    vec2 blend = fract(pixel);
    vec2 a = rect.xy + mod(base, rect.zw) + 0.5;
    vec2 b = rect.xy + mod(base + 1.0, rect.zw) + 0.5;
    // Wrap within this sprite, including its last/first texel interpolation.
    vec4 c00 = texture(u_sceneGISPatternAtlas, a / u_sceneGISPatternAtlasSize);
    vec4 c10 = texture(u_sceneGISPatternAtlas, vec2(b.x, a.y) / u_sceneGISPatternAtlasSize);
    vec4 c01 = texture(u_sceneGISPatternAtlas, vec2(a.x, b.y) / u_sceneGISPatternAtlasSize);
    vec4 c11 = texture(u_sceneGISPatternAtlas, b / u_sceneGISPatternAtlasSize);
    c00.rgb *= c00.a;
    c10.rgb *= c10.a;
    c01.rgb *= c01.a;
    c11.rgb *= c11.a;
    vec4 result = mix(mix(c00, c10, blend.x), mix(c01, c11, blend.x), blend.y);
    // Materials enter the existing color pipeline unpremultiplied.
    if (result.a > 0.0) result.rgb /= result.a;
    return result;
}
#endif
