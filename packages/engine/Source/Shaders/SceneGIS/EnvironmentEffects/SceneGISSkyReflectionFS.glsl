precision highp sampler3D;
in vec3 v_textureCoordinates;
uniform vec3 u_sunDirection;
uniform float u_altitude;
uniform sampler2D u_transmittanceTexture;
uniform sampler3D u_scatteringTexture;
uniform sampler2D u_irradianceTexture;

void main()
{
    vec3 direction = normalize(v_textureCoordinates);
    vec3 origin = vec3(0.0, 0.0, max(u_altitude, 1.0));
    vec3 transmission;
    vec3 radiance;
    vec3 night = sceneGISReadableNightSkyIrradiance(vec3(0.0, 0.0, 1.0), u_sunDirection);
    #ifdef SCENEGIS_GLOBE
    float radius = SCENEGIS_BOTTOM_RADIUS + origin.z;
    float b = radius * direction.z;
    float discriminant = b * b - origin.z * (2.0 * SCENEGIS_BOTTOM_RADIUS + origin.z);
    if (b < 0.0 && discriminant >= 0.0) {
        float distance = -b - sqrt(discriminant);
        radiance = sceneGISGlobeSkyRadianceToPoint(u_transmittanceTexture,
            u_scatteringTexture, origin, direction, u_sunDirection, distance, 0.0, transmission);
        vec3 point = vec3(0.0, 0.0, radius) + direction * distance;
        vec3 sky;
        vec3 beam = GetSunAndSkyIrradiance(sceneGISAtmosphereParameters(),
            u_transmittanceTexture, u_irradianceTexture, point * 0.001,
            normalize(point), u_sunDirection, sky);
        radiance += transmission * SCENEGIS_GROUND_ALBEDO * (beam + sky + night) / czm_pi;
    } else {
        radiance = sceneGISGlobeSkyRadiance(u_transmittanceTexture, u_scatteringTexture,
            origin, direction, u_sunDirection, 0.0, transmission);
        radiance += night / czm_pi;
    }
    #else
    bool intersects;
    radiance = sceneGISPlanarRadianceToPoint(u_transmittanceTexture, u_scatteringTexture,
        u_irradianceTexture, origin, direction, u_sunDirection,
        SCENEGIS_PLANAR_BACKGROUND_DISTANCE, true, intersects, transmission);
    radiance += (direction.z >= 0.0 ? vec3(1.0) : SCENEGIS_GROUND_ALBEDO) * night / czm_pi;
    #endif
    // The native direct-light BRDF already evaluates the Sun's specular contribution.
    out_FragColor = vec4(sceneGISGuardHdrStorage(max(radiance, vec3(0.0))), 1.0);
}
