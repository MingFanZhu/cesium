uniform sampler2D u_base;
uniform sampler2D u_coat;
uniform sampler2D u_metadata;
uniform float u_maximumRoughness;
layout(location = 1) out vec4 sceneGISSSRCoat;

vec4 sceneGISSSRReconstruct(sampler2D radiance, sampler2D rays, vec3 position)
{
    ivec2 pixel = ivec2(gl_FragCoord.xy);
    vec4 ray = texelFetch(rays, pixel, 0);
    if (dot(ray.xyz, ray.xyz) < 0.5 || ray.w >= u_maximumRoughness) { return vec4(0.0); }
    vec3 normal = sceneGISSSRNormal(position, ray.xyz);
    float tolerance = max(0.005, length(sceneGISSSRPosition(gl_FragCoord.xy + vec2(1.0, 0.0), -position.z) - position));
    vec3 sum = vec3(0.0);
    float visibility = 0.0;
    float total = 0.0;
    float radius = max(float(u_stride), min(12.0, ray.w * ray.w * 32.0));
    ivec2 center = pixel / u_stride;
    for (int y = -1; y <= 1; ++y) {
        for (int x = -1; x <= 1; ++x) {
            ivec2 tap = center + ivec2(round(vec2(x, y) * radius / float(u_stride)));
            if (any(lessThan(tap, ivec2(0))) || any(greaterThanEqual(tap, textureSize(radiance, 0)))) { continue; }
            ivec2 source = sceneGISSSRSourcePixel(tap, texelFetch(u_metadata, tap, 0).z);
            float depth = texelFetch(u_depth, source, 0).r;
            vec4 neighbor = texelFetch(rays, source, 0);
            if (depth <= 0.0 || dot(neighbor.xyz, neighbor.xyz) < 0.5 || abs(neighbor.w - ray.w) > 0.05) { continue; }
            vec3 p = sceneGISSSRPosition(vec2(source) + 0.5, depth);
            float similarity = dot(sceneGISSSRNormal(p, neighbor.xyz), normal);
            float plane = abs(dot(p - position, normal));
            if (similarity < 0.95 || plane > tolerance) { continue; }
            vec2 delta = (vec2(source - pixel)) / radius;
            float weight = exp(-2.0 * dot(delta, delta)) * smoothstep(0.95, 1.0, similarity) * (1.0 - smoothstep(tolerance * 0.5, tolerance, plane));
            vec4 hit = texelFetch(radiance, tap, 0);
            sum += hit.rgb * hit.a * weight;
            visibility += hit.a * weight;
            total += weight;
        }
    }
    return vec4(sum / max(visibility, 0.00001), visibility / max(total, 0.00001));
}

void main()
{
    float depth = texelFetch(u_depth, ivec2(gl_FragCoord.xy), 0).r;
    out_FragColor = vec4(0.0);
    sceneGISSSRCoat = vec4(0.0);
    if (depth <= 0.0) { return; }
    vec3 position = sceneGISSSRPosition(gl_FragCoord.xy, depth);
    out_FragColor = sceneGISSSRReconstruct(u_base, u_baseRay, position);
    sceneGISSSRCoat = sceneGISSSRReconstruct(u_coat, u_coatRay, position);
}
