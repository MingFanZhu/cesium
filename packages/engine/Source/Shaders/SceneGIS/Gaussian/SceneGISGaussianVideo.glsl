// Approximate receiver position: maximum Gaussian density along the display ray.
vec3 sceneGIS_gaussianVideoPosition()
{
    vec3 origin = u_gvPerspective ? vec3(0.0) : vec3(v_gvRay.xy, 0.0);
    vec3 ray = u_gvPerspective ? v_gvRay : vec3(0.0, 0.0, -1.0);
    float distanceAlongRay = dot(ray, v_gvPrecision * (v_gvCenter - origin)) /
        dot(ray, v_gvPrecision * ray);
    return origin + ray * distanceAlongRay;
}

#ifndef SCENEGIS_GAUSSIAN_VIDEO_DEPTH
vec3 sceneGIS_gaussianProjectVideo(vec3 color, vec3 position,
    sampler2D video, sampler2D depthTexture, mat4 viewToObserver, mat4 projection,
    vec4 range, vec4 media, bool ready)
{
    if (!ready) return color;
    vec3 observer = (viewToObserver * vec4(position, 1.0)).xyz;
    float depth = -observer.z;
    if (depth < range.x || depth > range.y || length(observer) > range.y) return color;
    vec4 clip = projection * vec4(observer, 1.0);
    vec2 uv = clip.xy / clip.w * 0.5 + 0.5;
    if (any(lessThan(uv, vec2(0.0))) || any(greaterThanEqual(uv, vec2(1.0)))) return color;
    float stored = texture(depthTexture, uv).r;
    float blocker = exp2(stored * log2(range.y - range.x + 1.0)) + range.x - 1.0;
    if (depth > blocker + range.z) return color;
    vec2 scale = vec2(max(media.y / media.x, 1.0), max(media.x / media.y, 1.0));
    uv = (uv - 0.5) * scale + 0.5;
    if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return color;
    if (media.w > 0.5) uv.y = 1.0 - uv.y;
    return mix(color, texture(video, uv).rgb, media.z);
}
#endif
