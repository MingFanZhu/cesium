uniform sampler2D u_sceneGISDeferredDiffuse;
uniform sampler2D u_sceneGISDeferredNormal;
uniform sampler2D u_sceneGISDeferredSpecular;
uniform sampler2D u_sceneGISDeferredEmission;
uniform float u_sceneGISDeferredGroup;
#if defined(SCENEGIS_DEFERRED_FEATURE_STYLE) || defined(SCENEGIS_DEFERRED_GLOBE_FABRIC)
uniform sampler2D u_sceneGISDeferredStyle;
#endif

float sceneGISGeometryShadow()
{
    return texelFetch(u_sceneGISDeferredEmission, ivec2(gl_FragCoord.xy), 0).a;
}
