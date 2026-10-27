#ifdef SCENEGIS_VECTOR_PBR
uniform sampler2D u_vectorMaterialColor;
uniform sampler2D u_vectorMaterialNormal;
uniform sampler2D u_vectorMaterialMetallicRoughness;
uniform sampler2D u_vectorMaterialEmissive;
uniform sampler2D u_vectorMaterialParameters;
in vec3 v_materialCoordinate;

vec4 vectorMaterialParameter(int material, int column)
{
    return texelFetch(u_vectorMaterialParameters, ivec2(column, material), 0);
}

vec4 vectorMaterialSample(sampler2D atlas, vec4 a, vec4 b, vec2 uv, float blend)
{
    vec2 size = vec2(textureSize(atlas, 0));
    return mix(texture(atlas, (a.xy + uv * a.zw) / size),
               texture(atlas, (b.xy + uv * b.zw) / size), blend);
}

vec3 vectorMaterialLinear(vec3 color)
{
    return mix(pow((color + 0.055) / 1.055, vec3(2.4)), color / 12.92,
               lessThanEqual(color, vec3(0.04045)));
}

void vectorMaterial(vec3 positionEC, inout vec3 normalEC, out vec3 color,
                    out float roughness, out float metallic, out vec3 emissive)
{
    int index = int(v_materialCoordinate.z + 0.5);
    vec2 uv = v_materialCoordinate.xy;
    vec4 base = vectorMaterialParameter(index, 0);
    vec4 emission = vectorMaterialParameter(index, 1);
    vec4 info = vectorMaterialParameter(index, 2);
    vec2 dx = dFdx(uv), dy = dFdy(uv);
    vec2 dxPixels = dx * info.yz, dyPixels = dy * info.yz;
    float lod = clamp(0.5 * log2(max(max(dot(dxPixels, dxPixels), dot(dyPixels, dyPixels)), 1.0)), 0.0, info.w);
    vec4 a = vectorMaterialParameter(index, 3 + int(floor(lod)));
    vec4 b = vectorMaterialParameter(index, 3 + int(min(ceil(lod), info.w)));
    // Image rows are top down. The material's positive V axis is upward.
    vec2 wrapped = fract(uv * vec2(1.0, -1.0));
    float blend = fract(lod);
    color = base.rgb * vectorMaterialLinear(vectorMaterialSample(u_vectorMaterialColor, a, b, wrapped, blend).rgb);
    vec3 n = vectorMaterialSample(u_vectorMaterialNormal, a, b, wrapped, blend).xyz * 2.0 - 1.0;
    vec4 rm = vectorMaterialSample(u_vectorMaterialMetallicRoughness, a, b, wrapped, blend);
    metallic = clamp(base.a * rm.b, 0.0, 1.0);
    float r = emission.a * rm.g;
    // Normal mip length carries unresolved surface variation into roughness.
    roughness = clamp(sqrt(r * r + max(0.0, 1.0 - length(n))), 0.04, 1.0);
    n.xy *= info.x;
    vec3 px = dFdx(positionEC), py = dFdy(positionEC);
    float handedness = sign(dx.x * dy.y - dx.y * dy.x);
    vec3 tangent = normalize((px * dy.y - py * dx.y) * handedness);
    tangent = normalize(tangent - normalEC * dot(normalEC, tangent));
    vec3 bitangent = normalize((py * dx.x - px * dy.x) * handedness);
    bitangent = cross(normalEC, tangent) * sign(dot(cross(normalEC, tangent), bitangent));
    normalEC = normalize(mat3(tangent, bitangent, normalEC) * normalize(n));
    emissive = emission.rgb * vectorMaterialLinear(vectorMaterialSample(u_vectorMaterialEmissive, a, b, wrapped, blend).rgb);
}
#endif
