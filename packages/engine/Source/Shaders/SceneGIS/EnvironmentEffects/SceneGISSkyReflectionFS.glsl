precision highp sampler3D;
in vec3 v_textureCoordinates;
uniform vec3 u_sunDirection;
uniform float u_altitude;
uniform sampler2D u_transmittanceTexture;
uniform sampler3D u_scatteringTexture;
uniform sampler2D u_irradianceTexture;

vec3 addNightRadianceFloor(vec3 radiance, float reflectance)
{
    // An isotropic hemisphere with radiance L yields irradiance pi * L.
    return radiance + sceneGISNightAmbientIrradiance(czm_pi * radiance, reflectance) / czm_pi;
}

void main()
{
    vec3 direction = normalize(v_textureCoordinates);
    vec3 origin = vec3(0.0, 0.0, max(u_altitude, 1.0));
    vec3 transmission;
    vec3 radiance;
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
        vec3 beam = sceneGISGlobeSunAndSkyIrradiance(sceneGISAtmosphereParameters(),
            u_transmittanceTexture, u_irradianceTexture, point * 0.001,
            normalize(point), u_sunDirection, sky);
        sky += sceneGISNightAmbientIrradiance(sky, 1.0);
        radiance += transmission * SCENEGIS_GROUND_ALBEDO * (beam + sky) / czm_pi;
    } else {
        radiance = sceneGISGlobeSkyRadiance(u_transmittanceTexture, u_scatteringTexture,
            origin, direction, u_sunDirection, 0.0, transmission);
        radiance = addNightRadianceFloor(radiance, 1.0);
    }
    #else
    bool intersects;
    radiance = sceneGISPlanarRadianceToPoint(u_transmittanceTexture, u_scatteringTexture,
        u_irradianceTexture, origin, direction, u_sunDirection,
        SCENEGIS_PLANAR_BACKGROUND_DISTANCE, true, intersects, transmission);
    float reflectance = direction.z >= 0.0 ? 1.0 : SCENEGIS_GROUND_ALBEDO.r;
    radiance = addNightRadianceFloor(radiance, reflectance);
    #endif
    // The native direct-light BRDF already evaluates the Sun's specular contribution.
    out_FragColor = vec4(sceneGISGuardHdrStorage(max(radiance, vec3(0.0))), 1.0);
}
