uniform sampler2D u_sceneGISAmbientOcclusion;
float sceneGISAmbientOcclusion()
{
    return texelFetch(u_sceneGISAmbientOcclusion, ivec2(gl_FragCoord.xy), 0).r;
}
