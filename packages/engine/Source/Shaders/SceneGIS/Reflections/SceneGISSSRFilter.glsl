uniform sampler2D u_depth;
uniform sampler2D u_baseRay;
uniform sampler2D u_coatRay;
uniform sampler2D u_base;
uniform sampler2D u_coat;
uniform vec2 u_axis;
layout(location = 1) out vec4 sceneGISSSRCoat;

vec4 sceneGISSSRFilter(sampler2D radiance, sampler2D rays)
{
    ivec2 pixel = ivec2(gl_FragCoord.xy);
    vec4 ray = texelFetch(rays, pixel, 0);
    if (dot(ray.xyz, ray.xyz) < 0.5) { return vec4(0.0); }
    vec2 size = vec2(textureSize(u_depth, 0));
    float radius = min(24.0, ray.w * ray.w * 64.0) * size.y / 720.0;
    if (radius < 1.0) { return texelFetch(radiance, pixel, 0); }
    float depth = texelFetch(u_depth, pixel, 0).r;
    vec3 sum = vec3(0.0);
    float visibility = 0.0;
    float total = 0.0;
    for (int i = -4; i <= 4; ++i)
    {
        ivec2 tap = clamp(pixel + ivec2(round(u_axis * float(i) * radius / 4.0)), ivec2(0), ivec2(size) - 1);
        vec4 neighborRay = texelFetch(rays, tap, 0);
        float neighborDepth = texelFetch(u_depth, tap, 0).r;
        if (dot(neighborRay.xyz, ray.xyz) < 0.98 || abs(neighborRay.w - ray.w) > 0.05 || abs(neighborDepth - depth) > max(0.05, depth * 0.03)) { continue; }
        float weight = exp(-0.125 * float(i * i));
        vec4 hit = texelFetch(radiance, tap, 0);
        sum += hit.rgb * hit.a * weight;
        visibility += hit.a * weight;
        total += weight;
    }
    return vec4(sum / max(visibility, 0.00001), visibility / max(total, 0.00001));
}

void main()
{
    out_FragColor = sceneGISSSRFilter(u_base, u_baseRay);
    sceneGISSSRCoat = sceneGISSSRFilter(u_coat, u_coatRay);
}
