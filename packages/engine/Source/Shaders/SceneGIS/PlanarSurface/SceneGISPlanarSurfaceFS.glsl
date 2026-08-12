in vec2 v_textureCoordinates;
uniform vec4 u_color;

#ifdef SCENEGIS_LIGHTING
    #ifdef SCENEGIS_SMOOTH_NORMALS
in vec3 v_normalEC;
    #else
in vec3 v_positionEC;
    #endif
uniform float u_lambertDiffuseMultiplier;
#endif

SCENEGIS_PLANAR_SURFACE_DYNAMIC_LAYERS

void main()
{
    vec4 color = sceneGISComposeLayers(u_color, v_textureCoordinates);
#ifdef SCENEGIS_LIGHTING
    #ifdef SCENEGIS_SMOOTH_NORMALS
    vec3 normalEC = normalize(v_normalEC);
    #else
    vec3 normalEC = normalize(cross(dFdx(v_positionEC), dFdy(v_positionEC)));
    // Derivative winding can reverse below a double-sided surface. Keep
    // lighting in the stable planar +Z hemisphere instead of facing the camera.
    vec3 planarUpEC = normalize(czm_normal * vec3(0.0, 0.0, 1.0));
    if (dot(normalEC, planarUpEC) < 0.0) {
        normalEC = -normalEC;
    }
    #endif
    float diffuse = czm_getLambertDiffuse(czm_lightDirectionEC, normalEC);
    float intensity = clamp(
        diffuse * u_lambertDiffuseMultiplier + 0.3,
        0.0,
        1.0
    );
    color.rgb *= czm_lightColor * intensity;
#endif
    out_FragColor = vec4(color.rgb, 1.0);
}
