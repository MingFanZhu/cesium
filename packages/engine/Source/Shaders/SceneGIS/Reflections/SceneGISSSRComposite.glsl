uniform sampler2D u_base;
uniform sampler2D u_baseWeight;
uniform sampler2D u_baseEnvironment;
#ifdef SCENEGIS_SSR_COAT_TARGETS
uniform sampler2D u_coat;
uniform sampler2D u_coatWeight;
uniform sampler2D u_coatEnvironment;
#endif

vec3 replaceEnvironment(vec4 hit, vec3 weight, vec3 environment)
{
    // Material-weighted replacement, preserving the original contribution on a miss.
    return hit.a * (weight * hit.rgb - environment);
}

void main()
{
    ivec2 pixel = ivec2(gl_FragCoord.xy);
    vec3 correction = replaceEnvironment(texelFetch(u_base, pixel, 0),
        texelFetch(u_baseWeight, pixel, 0).rgb, texelFetch(u_baseEnvironment, pixel, 0).rgb);
    #ifdef SCENEGIS_SSR_COAT_TARGETS
    correction += replaceEnvironment(texelFetch(u_coat, pixel, 0),
        texelFetch(u_coatWeight, pixel, 0).rgb, texelFetch(u_coatEnvironment, pixel, 0).rgb);
    #endif
    // Apply the signed replacement delta without flattening native MSAA color samples.
    out_FragColor = vec4(correction, 0.0);
}
