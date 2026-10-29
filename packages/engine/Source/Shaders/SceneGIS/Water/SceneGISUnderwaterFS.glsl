uniform mat4 u_eyeToWater;
uniform mat3 u_waterToEye;
uniform vec3 u_absorption;
uniform vec3 u_scattering;
uniform bool u_mediumOptics;
uniform vec3 u_waterColor;
uniform float u_scatteringAnisotropy;
in vec2 v_textureCoordinates;

void main()
{
    vec2 pixel = gl_FragCoord.xy;
    // Start at the eye-plane intercept; also supports orthographic rays.
    vec3 originEC = sceneGISSSRPosition(pixel, 0.0);
    vec3 origin = (u_eyeToWater * vec4(originEC, 1.0)).xyz;
    vec3 directionEC = normalize(sceneGISSSRPosition(pixel, 1.0) - originEC);
    vec3 direction = normalize(mat3(u_eyeToWater) * directionEC);
    float distance;
    if (!sceneGISWaterVolumeRay(origin, direction, distance)) { discard; }
    float opaqueDepth = texture(u_depth, v_textureCoordinates).r;
    float opaqueDistance = opaqueDepth > 0.0 ? length(sceneGISSSRPosition(pixel, opaqueDepth) - originEC) : 1e20;
    distance = min(distance, opaqueDistance);
    vec3 end = origin + direction * distance;
    vec3 up = u_waterToEye * sceneGISWaterVolumeUp(origin);
    vec3 beam = czm_lightColorHdr;
    vec3 sky = vec3(1.0);
    #ifdef SCENEGIS_WATER_PHYSICAL
    beam = sceneGISModelDirectSource(originEC, beam);
    sky = sceneGISModelSkyIrradiance(originEC, up);
    #endif
    vec3 background = texture(u_color, v_textureCoordinates).rgb;
    float airCosine = max(dot(up, czm_lightDirectionEC), 0.0);
    float startDepth = sceneGISWaterVolumeDepth(origin);
    float endDepth = max(sceneGISWaterVolumeDepth(end), 0.0);
    #ifdef SCENEGIS_WATER_CAUSTICS
    vec3 receiverEC = originEC + directionEC * distance;
    #ifdef SCENEGIS_ELLIPSOID_UNDERWATER
    vec3 geoUp = normalize(end + vec3(0.0, 0.0, u_volumeRadius));
    vec3 chartEast = vec3(u_waterToChart[0].x, u_waterToChart[1].x, u_waterToChart[2].x);
    vec3 east = normalize(chartEast - geoUp * dot(chartEast, geoUp));
    #else
    vec3 geoUp = vec3(0.0, 0.0, 1.0), east = vec3(1.0, 0.0, 0.0);
    #endif
    vec3 mean = end + geoUp * endDepth;
    vec3 meanEC = receiverEC + u_waterToEye * geoUp * endDepth;
    vec3 meanNormal = u_waterToEye * sceneGISWaterVolumeUp(end);
    mat3 waveFrame = u_waterToEye * mat3(east, cross(geoUp, east), geoUp);
    vec2 phase = sceneGISVolumeChart(mean).xy;
    vec3 flow = vec3(1.0, 0.0, 0.0);
    bool valid = opaqueDepth > 0.0 && opaqueDistance <= distance && endDepth > 0.0;
    #ifdef SCENEGIS_RIVER_WATER
    bool inside = sceneGISProfileFlow(phase, flow);
    valid = valid && inside;
    #endif
    background *= sceneGISWaterCaustics(receiverEC, meanEC, meanNormal, waveFrame,
        phase, phase, flow, 1.0, valid);
    #endif
    vec3 color;
    if (u_mediumOptics) {
        float eta = 1.0 / 1.333;
        float lightCosine = sqrt(1.0 - eta * eta * (1.0 - airCosine * airCosine));
        vec3 light = normalize(czm_lightDirectionEC);
        vec3 travel = -eta * (light - up * dot(up, light)) - up * lightCosine;
        vec3 direct = beam * (airCosine / lightCosine) * (1.0 - sceneGISWaterFresnel(airCosine)) *
            sceneGISWaterPhase(dot(travel, -directionEC), u_scatteringAnisotropy);
        color = sceneGISWaterUnderwater(background, u_absorption, u_scattering, distance,
            startDepth, endDepth, direct, sky * 0.49, lightCosine);
    } else {
        vec3 transmission = exp(-u_absorption * distance);
        color = background * transmission + u_waterColor * sky * (vec3(1.0) - transmission);
    }
    out_FragColor = vec4(max(color, vec3(0.0)), 1.0);
}
