uniform sampler2D u_sceneGISTransmittanceTexture;
uniform sampler2D u_sceneGISIrradianceTexture;
uniform float u_surfaceRadianceScale;
uniform vec3 u_sceneGISActualSunDirection;
uniform vec3 u_sceneGISPrimaryLightScale;
uniform vec3 u_sceneGISCameraRelativePosition;

vec3 sceneGISPlanarLightPosition(vec3 positionEC)
{
    // The CPU origin is horizontal only: receiver Z remains absolute height.
    return czm_inverseViewRotation * positionEC + u_sceneGISCameraRelativePosition;
}

void sceneGISPlanarSurfaceIrradiance(
    float height,
    out vec3 beam,
    out vec3 sky)
{
    vec3 sun = normalize(u_sceneGISActualSunDirection);
    beam = vec3(0.0);
    sky = vec3(0.0);
    // Sample the lower boundary continuously, including receiver reconstruction
    // roundoff at Z = 0. The LUT already clamps below-ground heights to zero.
    if (height >= SCENEGIS_PLANAR_TOP) {
        beam = sun.z > 0.0 ? SCENEGIS_SOLAR_IRRADIANCE : vec3(0.0);
        return;
    }
    if (sun.z > 0.0) {
        beam = SCENEGIS_SOLAR_IRRADIANCE * sceneGISPlanarTransmittanceToBoundary(
            u_sceneGISTransmittanceTexture, height, sun.z);
    }
    // The flat LUT stores total horizontal irradiance. Remove its direct
    // cosine term before using it as a diffuse hemispherical source.
    sky = max(sceneGISPlanarIrradiance(
        u_sceneGISIrradianceTexture, height, sun.z) - beam * max(sun.z, 0.0), vec3(0.0));
    sky += sceneGISReadableNightSkyIrradiance(vec3(0.0, 0.0, 1.0), sun);
}

vec3 sceneGISPlanarDirectSource(vec3 positionEC)
{
    vec3 beam;
    vec3 sky;
    sceneGISPlanarSurfaceIrradiance(sceneGISPlanarLightPosition(positionEC).z, beam, sky);
    return beam * u_sceneGISPrimaryLightScale * u_surfaceRadianceScale;
}

vec3 sceneGISPlanarSkySource(vec3 positionEC, vec3 normalEC)
{
    vec3 beam;
    vec3 sky;
    sceneGISPlanarSurfaceIrradiance(sceneGISPlanarLightPosition(positionEC).z, beam, sky);
    vec3 normalWC = normalize(czm_inverseViewRotation * normalEC);
    return sky * (0.5 * (1.0 + normalWC.z)) * (u_surfaceRadianceScale / czm_pi);
}

float sceneGISPlanarCloudTransmittance(vec3 positionEC)
{
    return u_sceneGISShowCloudShadows
        ? exp(-sceneGISCloudShadowOpticalDepth(
            sceneGISPlanarLightPosition(positionEC), max(-positionEC.z, 0.0)))
        : 1.0;
}

vec3 sceneGISPlanarSurfaceRadiance(vec3 albedo, vec3 positionEC, vec3 normalEC)
{
    float cosine = max(dot(normalize(czm_inverseViewRotation * normalEC),
        normalize(u_sceneGISActualSunDirection)), 0.0);
    return albedo * (sceneGISPlanarDirectSource(positionEC) *
        (cosine / czm_pi) * sceneGISPlanarCloudTransmittance(positionEC) +
        sceneGISPlanarSkySource(positionEC, normalEC));
}
