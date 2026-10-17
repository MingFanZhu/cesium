precision highp float;
precision highp sampler3D;

flat in vec2 v_pixelCenter;
flat in vec3 v_worldDirection;
flat in vec3 v_starRadiance;

uniform vec3 u_east;
uniform vec3 u_north;
uniform vec3 u_vertical;
uniform vec3 u_sunDirection;
uniform float u_altitude;
uniform float u_starIntensity;
uniform bool u_showHeightFog;
uniform float u_heightFogDensity;
uniform float u_heightFogHeightFalloff;
uniform float u_heightFogBaseHeight;
uniform float u_heightFogStartDistance;
uniform float u_heightFogMaximumOpacity;
uniform sampler2D u_transmittanceTexture;
uniform sampler3D u_scatteringTexture;
uniform sampler2D u_irradianceTexture;

// Cubic B-spline samples sum to one at every subpixel phase. This preserves
// integrated star energy under motion without noise or a temporal history.
float starFilter(float distanceInPixels)
{
    float x = abs(distanceInPixels);
    if (x < 1.0) {
        return (4.0 - 6.0 * x * x + 3.0 * x * x * x) / 6.0;
    }
    float tail = max(2.0 - x, 0.0);
    return tail * tail * tail / 6.0;
}

void main()
{
    vec2 offset = gl_FragCoord.xy - v_pixelCenter;
    float weight = starFilter(offset.x) * starFilter(offset.y);
    if (weight == 0.0) {
        discard;
    }
    vec3 rayOrigin = vec3(0.0, 0.0, u_altitude);
    vec3 viewDirection = normalize(vec3(
        dot(v_worldDirection, u_east), dot(v_worldDirection, u_north), dot(v_worldDirection, u_vertical)));
    vec3 sunDirection = normalize(vec3(
        dot(u_sunDirection, u_east), dot(u_sunDirection, u_north), dot(u_sunDirection, u_vertical)));
    float visibility = 1.0 - smoothstep(-0.2079116908, -0.1045284633, sunDirection.z);
    visibility = mix(visibility, 1.0, smoothstep(30000.0, 60000.0, u_altitude));
    #ifdef SCENEGIS_GLOBE
    // Sky scattering clamps rays at the horizon; star visibility must use the
    // actual optical ground intersection instead of the clamped transmittance.
    AtmosphereParameters atmosphere = sceneGISAtmosphereParameters();
    vec3 opticalOrigin = vec3(0.0, 0.0, atmosphere.bottom_radius + u_altitude * 0.001);
    if (RayIntersectsGround(atmosphere, length(opticalOrigin), viewDirection.z)) {
        discard;
    }
    #else
    if (viewDirection.z <= 0.0) {
        discard;
    }
    #endif
    if (visibility == 0.0) {
        discard;
    }
    vec3 transmittance;
    #ifdef SCENEGIS_GLOBE
    sceneGISGlobeSkyRadiance(u_transmittanceTexture, u_scatteringTexture,
        rayOrigin, viewDirection, sunDirection, 0.0, transmittance);
    #else
    bool intersectsAtmosphere;
    sceneGISPlanarRadianceToPoint(u_transmittanceTexture, u_scatteringTexture, u_irradianceTexture,
        rayOrigin, viewDirection, sunDirection, SCENEGIS_PLANAR_BACKGROUND_DISTANCE,
        false, intersectsAtmosphere, transmittance);
    #endif
    vec3 radiance = v_starRadiance * transmittance * (weight * visibility * u_starIntensity);
    #ifndef SCENEGIS_GLOBE
    if (u_showHeightFog) {
        // The background already includes fog inscattering. Attenuate stars only.
        radiance = sceneGISApplyExponentialHeightFog(
            u_transmittanceTexture, u_irradianceTexture, radiance, rayOrigin, viewDirection, sunDirection,
            SCENEGIS_PLANAR_BACKGROUND_DISTANCE, 0.0,
            u_heightFogDensity, u_heightFogHeightFalloff, u_heightFogBaseHeight,
            u_heightFogStartDistance, u_heightFogMaximumOpacity, 0.0, 0.0, 0.0, 1.0);
    }
    #endif
    out_FragColor = vec4(sceneGISGuardHdrStorage(radiance), 0.0);
}
