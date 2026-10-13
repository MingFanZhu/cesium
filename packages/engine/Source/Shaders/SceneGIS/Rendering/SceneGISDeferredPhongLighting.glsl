#define SCENEGIS_LOCAL_LIGHT_RECEIVER

vec3 sceneGISLocalPositionEC()
{
    float depth = texelFetch(u_linearDepth, ivec2(gl_FragCoord.xy), 0).r;
    return sceneGISAOPosition(gl_FragCoord.xy, depth);
}

void main()
{
    ivec2 pixel = ivec2(gl_FragCoord.xy);
    vec4 specular = texelFetch(u_sceneGISDeferredSpecular, pixel, 0);
    if (specular.a != u_sceneGISDeferredGroup) {
        discard;
    }
    vec4 diffuse = texelFetch(u_sceneGISDeferredDiffuse, pixel, 0);
    vec4 normal = texelFetch(u_sceneGISDeferredNormal, pixel, 0);
    czm_material material;
    material.diffuse = diffuse.rgb;
    material.alpha = diffuse.a;
    material.normal = normal.xyz;
    material.shininess = normal.w;
    material.specular = specular.r;
    material.emission = texelFetch(u_sceneGISDeferredEmission, pixel, 0).rgb;
    out_FragColor = czm_phong(normalize(-sceneGISLocalPositionEC()), material, czm_lightDirectionEC);
}
