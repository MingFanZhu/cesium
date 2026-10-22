#ifdef SCENEGIS_SSR_MAIN
uniform sampler2D u_base;
uniform sampler2D u_baseWeight;
uniform sampler2D u_baseEnvironment;
#ifdef SCENEGIS_SSR_COAT_TARGETS
uniform sampler2D u_coat;
uniform sampler2D u_coatWeight;
uniform sampler2D u_coatEnvironment;
#endif
#endif
#ifdef SCENEGIS_AO_MAIN
uniform sampler2D u_indirect;
uniform sampler2D u_occlusion;
uniform bool u_directionalOcclusion;
#endif
#ifdef SCENEGIS_SSIL_MAIN
uniform sampler2D u_ssil;
#endif

vec3 replaceEnvironment(vec4 hit, vec3 weight, vec3 environment)
{
    // Material-weighted replacement, preserving the original contribution on a miss.
    return hit.a * (weight * hit.rgb - environment);
}

void main()
{
    ivec2 pixel = ivec2(gl_FragCoord.xy);
    vec3 correction = vec3(0.0);
    #ifdef SCENEGIS_SSR_MAIN
    correction = replaceEnvironment(texelFetch(u_base, pixel, 0),
        texelFetch(u_baseWeight, pixel, 0).rgb, texelFetch(u_baseEnvironment, pixel, 0).rgb);
    #ifdef SCENEGIS_SSR_COAT_TARGETS
    correction += replaceEnvironment(texelFetch(u_coat, pixel, 0),
        texelFetch(u_coatWeight, pixel, 0).rgb, texelFetch(u_coatEnvironment, pixel, 0).rgb);
    #endif
    #endif
    #ifdef SCENEGIS_AO_MAIN
    float visibility = texelFetch(u_occlusion, pixel, 0).r;
    // Directional PBR already occludes its environment at lighting, and SSR hits
    // replace that environment without reapplying screen-space ambient visibility.
    correction *= u_directionalOcclusion ? 1.0 : visibility;
    correction += (visibility - 1.0) * texelFetch(u_indirect, pixel, 0).rgb;
    #endif
    // Apply the signed replacement delta without flattening native MSAA color samples.
    #ifdef SCENEGIS_SSIL_MAIN
    correction += texelFetch(u_ssil, pixel, 0).rgb;
    #endif
    #ifdef SCENEGIS_POINT_COLOR_CORRECTION
    correction = sceneGISPointColorCorrection(correction, pixel);
    #endif
    out_FragColor = vec4(correction, 0.0);
}
