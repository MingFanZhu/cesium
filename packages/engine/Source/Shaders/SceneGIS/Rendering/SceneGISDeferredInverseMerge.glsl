uniform sampler2D u_diffuse;
uniform sampler2D u_normal;
uniform sampler2D u_specular;
uniform sampler2D u_emission;
uniform sampler2D u_mask;
uniform sampler2D u_depth;
#ifndef SCENEGIS_DEFERRED_EXTENSION_ONLY
layout(location = 1) out vec4 normal;
layout(location = 2) out vec4 specular;
layout(location = 3) out vec4 emission;
#ifdef SCENEGIS_DEFERRED_VECTOR_OVERLAY_LOCATION
layout(location = SCENEGIS_DEFERRED_VECTOR_OVERLAY_LOCATION) out vec4 vectorAlbedo;
#endif
#ifdef SCENEGIS_DEFERRED_STYLE_TARGET
uniform sampler2D u_style;
layout(location = 4) out vec4 style;
#endif
#ifdef SCENEGIS_DEFERRED_OCEAN_LOCATION
layout(location = SCENEGIS_DEFERRED_OCEAN_LOCATION) out vec4 ocean;
#endif
#ifdef SCENEGIS_DEFERRED_CLASSIFICATION_LOCATION
layout(location = SCENEGIS_DEFERRED_CLASSIFICATION_LOCATION) out vec4 classification;
#endif
#ifdef SCENEGIS_DEFERRED_DEPTH_LOCATION
uniform float u_frustumTag;
layout(location = SCENEGIS_DEFERRED_DEPTH_LOCATION) out vec2 surfaceDepth;
#endif

#endif
void main()
{
    ivec2 p = ivec2(gl_FragCoord.xy);
    vec4 material = texelFetch(u_specular, p, 0);
    if (material.a == 0.0 || texelFetch(u_mask, p, 0).r == 0.0) {
        discard;
    }
    #ifdef SCENEGIS_DEFERRED_EXTENSIONS
    sceneGISCopyExtensions(p);
    #endif
    #ifndef SCENEGIS_DEFERRED_EXTENSION_ONLY
    out_FragColor = texelFetch(u_diffuse, p, 0);
    normal = texelFetch(u_normal, p, 0);
    specular = material;
    emission = texelFetch(u_emission, p, 0);
    #ifdef SCENEGIS_DEFERRED_VECTOR_OVERLAY_LOCATION
    vectorAlbedo = vec4(0.0);
    #endif
    #ifdef SCENEGIS_DEFERRED_STYLE_TARGET
    style = texelFetch(u_style, p, 0);
    #endif
    #ifdef SCENEGIS_DEFERRED_OCEAN_LOCATION
    ocean = vec4(0.0);
    #endif
    #ifdef SCENEGIS_DEFERRED_CLASSIFICATION_LOCATION
    classification = vec4(0.0);
    #endif
    #endif
    gl_FragDepth = texelFetch(u_depth, p, 0).r;
    #ifdef SCENEGIS_DEFERRED_DEPTH_LOCATION
    vec4 eye = czm_windowToEyeCoordinates(gl_FragCoord.xy, gl_FragDepth);
    surfaceDepth = vec2(-eye.z / eye.w, u_frustumTag);
    #endif
}
