uniform vec3 u_waterColor;
uniform bool u_mediumOptics;
uniform vec3 u_scattering;
uniform float u_scatteringAnisotropy;
uniform vec4 u_pickColor;
uniform vec3 u_absorption;
uniform vec3 u_reflectionColor;
uniform samplerCube u_sky;
uniform bool u_hasSky;
uniform mat3 u_skyWorldToLocal;
uniform float u_skyLod;
uniform float u_radianceScale;
uniform float u_roughness;
uniform float u_foamWidth;
uniform float u_foamIntensity;
uniform float u_refractionStrength;
uniform bool u_reflections;
in vec3 v_positionEC;
in vec2 v_waterPosition;
#ifdef SCENEGIS_CURVED_WATER
uniform vec2 u_waterFoamOffset;
#endif
#if defined(SCENEGIS_WIND_WAVES) || defined(SCENEGIS_RIVER_WATER)
in float v_shoreFade;
#endif

float sceneGISWaterNoise(vec2 p)
{
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    vec4 h = fract(sin(vec4(dot(i, vec2(127.1, 311.7)),
        dot(i + vec2(1.0, 0.0), vec2(127.1, 311.7)),
        dot(i + vec2(0.0, 1.0), vec2(127.1, 311.7)),
        dot(i + vec2(1.0), vec2(127.1, 311.7)))) * 43758.5453);
    return mix(mix(h.x, h.y, f.x), mix(h.z, h.w, f.x), f.y);
}

float sceneGISWaterBubbles(vec2 p, float footprint)
{
    vec2 cell = floor(p);
    vec2 local = fract(p);
    float boundary = 2.0;
    for (int y = -1; y <= 1; ++y) {
        for (int x = -1; x <= 1; ++x) {
            vec2 neighbor = vec2(float(x), float(y));
            vec2 seed = cell + neighbor;
            vec2 random = fract(sin(vec2(dot(seed, vec2(127.1, 311.7)),
                dot(seed, vec2(269.5, 183.3)))) * 43758.5453);
            vec2 center = neighbor + 0.15 + random * 0.7;
            float radius = 0.17 + random.x * 0.3;
            boundary = min(boundary, length(center - local) - radius);
        }
    }
    float aa = clamp(footprint * 0.6, 0.025, 0.35);
    float film = smoothstep(-aa, aa, boundary);
    // Preserve mean coverage when individual bubble openings become subpixel.
    return mix(film, 0.65, smoothstep(0.25, 0.9, footprint));
}

float sceneGISWaterFoam(float depth, float footprint, vec2 flow)
{
    if (u_foamWidth == 0.0 || u_foamIntensity == 0.0 || (!u_hasWaterField && depth >= u_foamWidth)) { return 0.0; }
    float shallow = clamp(depth / u_foamWidth, 0.0, 1.0);
    // Drift in local meters; two different velocities gently break up foam clusters.
    float travel = u_time * u_waveLength / czm_twoPi;
    vec2 p = v_waterPosition - flow * travel * 0.08;
    #ifdef SCENEGIS_CURVED_WATER
    // FFT coordinates repeat; procedural shoreline noise uses the shared chart instead.
    p += u_waterFoamOffset;
    #endif
    vec2 across = vec2(-flow.y, flow.x);
    float clusters = mix(0.5, sceneGISWaterNoise(p * 0.75), exp(-footprint * footprint));
    float breakup = mix(0.5, sceneGISWaterNoise(p * 1.9 + across * travel * 0.13),
        exp(-footprint * footprint * 6.0));
    float pattern = mix(clusters, breakup, 0.28);
    float threshold = mix(0.32, 0.7, smoothstep(0.0, 1.0, shallow));
    float aa = min(0.25, 0.055 + footprint * 0.45);
    // Retain large patches at distance instead of fading the entire shore into a white stripe.
    float grain = mix(0.5, sceneGISWaterNoise(p * 23.0 + breakup),
        exp(-footprint * footprint * 400.0));
    vec2 bubblePosition = p * 9.0 + vec2(clusters, breakup) * 2.0 + (grain - 0.5) * 0.35;
    float bubbles = sceneGISWaterBubbles(bubblePosition, footprint * 9.0);
    float coverage = smoothstep(threshold - aa, threshold + aa, pattern + (bubbles - 0.65) * 0.07);
    float fade = 1.0 - smoothstep(0.55, 1.0, shallow);
    if (u_hasWaterField) {
        vec2 uv = (v_waterPosition - u_fieldRectangle.xy) / u_fieldRectangle.zw;
        if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) { return 0.0; }
        return texture(u_shoreFoam, uv).r * bubbles * (0.65 + grain * 0.35);
    }
    return coverage * bubbles * (0.45 + grain * 0.55) * fade * u_foamIntensity;
}

void main()
{
    vec3 view = normalize(-v_positionEC);
    #ifdef SCENEGIS_CURVED_WATER
    vec3 up = normalize(v_waterUpEC);
    #ifdef SCENEGIS_RIVER_WATER
    vec3 meanNormal = normalize(cross(dFdx(v_waterBaseEC), dFdy(v_waterBaseEC)));
    up = dot(meanNormal, up) < 0.0 ? -meanNormal : meanNormal;
    sceneGISRiverUpEC = up;
    #endif
    vec3 east = normalize(v_waterEastEC - up * dot(up, v_waterEastEC));
    mat3 waterFrame = mat3(east, cross(up, east), up);
    #else
    vec3 up = normalize(czm_normal * vec3(0.0, 0.0, 1.0));
    #endif
    vec3 beam = czm_lightColorHdr;
    vec3 diffuseLight = vec3(1.0);
    vec3 skyRadiance = vec3(1.0);
    #ifdef SCENEGIS_WATER_PHYSICAL
    beam = sceneGISModelDirectSource(v_positionEC, beam);
    skyRadiance = sceneGISModelSkyIrradiance(v_positionEC, up);
    diffuseLight = skyRadiance +
        beam * (max(dot(up, czm_lightDirectionEC), 0.0) / czm_pi);
    #endif
    bool belowWater = dot(up, view) <= 0.0;
    if (belowWater && (u_underwaterDepth == 0.0 || u_cameraDepth <= 0.0)) { discard; }
    float footprint = max(length(dFdx(v_waterPosition)), length(dFdy(v_waterPosition)));
    vec2 d = normalize(u_flowDirection);
    float crestFoam = 0.0;
    #ifdef SCENEGIS_WIND_WAVES
    vec4 n0 = texture(u_waveNormal0, v_waterPosition / u_wavePeriod + 0.5 / u_waveResolution);
    vec4 n1 = texture(u_waveNormal1, v_waterPosition / (u_wavePeriod * 4.0) + 0.5 / u_waveResolution);
    vec4 n2 = texture(u_waveNormal2, v_waterPosition / (u_wavePeriod * 0.125) + 0.5 / u_waveResolution);
    vec2 gradient = n0.xy / max(n0.z, 0.1) + n1.xy / max(n1.z, 0.1) + n2.xy / max(n2.z, 0.1);
    #ifdef SCENEGIS_CURVED_WATER
    vec3 normal = normalize(waterFrame * vec3(gradient * v_shoreFade, 1.0));
    #else
    vec3 normal = normalize(czm_normal * vec3(gradient * v_shoreFade, 1.0));
    #endif
    crestFoam = max(max(n0.a, n1.a), n2.a) * v_shoreFade;
    #elif defined(SCENEGIS_RIVER_WATER)
    vec3 normal = up;
    #else
    vec2 slope = sceneGISWaterSlope(v_waterPosition, footprint);
    vec3 normal = normalize(czm_normal * normalize(vec3(-slope, 1.0)));
    #endif
    #ifdef SCENEGIS_RIVER_WATER
    vec2 current = sceneGISRiverCurrent();
    normal = sceneGISRiverNormal(normal, up, current.x * v_shoreFade);
    #endif
    vec2 size = vec2(textureSize(u_depth, 0));
    vec2 uv = gl_FragCoord.xy / size;
    float bottomDepth = texture(u_depth, uv).r;
    float waterDepth = -v_positionEC.z;
    if (belowWater) {
        vec3 inward = -normal;
        float cosine = clamp(dot(inward, view), 0.0, 1.0);
        float fresnel = sceneGISWaterExitFresnel(cosine);
        vec3 outside = u_reflectionColor;
        vec3 transmitted = refract(-view, inward, 1.333);
        if (u_hasSky && fresnel < 1.0) {
            outside = textureLod(u_sky, u_skyWorldToLocal * (czm_inverseViewRotation * transmitted),
                u_roughness * u_skyLod).rgb * u_radianceScale;
        }
        vec3 opaque = sceneGISSSRPosition(gl_FragCoord.xy, bottomDepth);
        if (bottomDepth > waterDepth && dot(opaque - v_positionEC, up) > 0.0) {
            outside = textureLod(u_color, uv, 0.0).rgb;
        }
        vec3 reflected = reflect(-view, inward);
        vec4 hit = u_reflections ? sceneGISSSRTrace(v_positionEC, vec4(reflected, u_roughness)) : vec4(0.0);
        vec3 deep = u_mediumOptics ? u_scattering / max(u_absorption + u_scattering, vec3(1e-8)) * skyRadiance * 0.49 : u_waterColor * skyRadiance;
        vec3 background = mix(outside, mix(deep, hit.rgb, hit.a), fresnel);
        float distance = length(v_positionEC);
        vec3 color;
        if (u_mediumOptics) {
            float eta = 1.0 / 1.333;
            vec3 light = normalize(czm_lightDirectionEC);
            float airCosine = max(dot(up, light), 0.0);
            float lightCosine = sqrt(1.0 - eta * eta * (1.0 - airCosine * airCosine));
            vec3 travel = -eta * (light - up * dot(up, light)) - up * lightCosine;
            vec3 direct = beam * (airCosine / lightCosine) * (1.0 - sceneGISWaterFresnel(airCosine)) *
                sceneGISWaterPhase(dot(travel, view), u_scatteringAnisotropy);
            color = sceneGISWaterUnderwater(background, u_absorption, u_scattering, distance,
                u_cameraDepth, 0.0, direct, skyRadiance * 0.49, lightCosine);
        } else {
            vec3 transmission = exp(-u_absorption * distance);
            color = background * transmission + deep * (vec3(1.0) - transmission);
        }
        out_FragColor = vec4(max(color, vec3(0.0)), 1.0);
        return;
    }
    vec3 bottom = sceneGISSSRPosition(gl_FragCoord.xy, max(bottomDepth, waterDepth));
    bool hasBottom = bottomDepth > waterDepth;
    float pathLength = hasBottom ? length(bottom - v_positionEC) : 0.0;
    #ifdef SCENEGIS_CURVED_WATER
    float verticalDepth = hasBottom ? max(sceneGISWaterMeanOffset(v_positionEC) - sceneGISWaterMeanOffset(bottom), 0.0) : u_foamWidth;
    #else
    float verticalDepth = hasBottom ? max(dot(v_positionEC - bottom, up), 0.0) : u_foamWidth;
    #endif

    // Offset only submerged samples. Foreground objects must never bleed through water.
    vec2 offset = (normal.xy - up.xy) * u_refractionStrength * min(pathLength, 4.0) / max(waterDepth, 1.0);
    vec2 refractedUV = uv + offset;
    float refractedDepth = texture(u_depth, clamp(refractedUV, vec2(0.0), vec2(1.0))).r;
    vec3 refractedPoint = sceneGISSSRPosition(refractedUV * size, refractedDepth);
    #ifdef SCENEGIS_CURVED_WATER
    bool aboveWater = sceneGISWaterMeanOffset(refractedPoint) >= sceneGISWaterMeanOffset(v_positionEC);
    #else
    bool aboveWater = dot(refractedPoint - v_positionEC, up) >= 0.0;
    #endif
    if (any(lessThan(refractedUV, vec2(0.0))) || any(greaterThan(refractedUV, vec2(1.0))) ||
        refractedDepth <= waterDepth || aboveWater) {
        refractedUV = uv;
    } else {
        bottom = refractedPoint;
        hasBottom = true;
        pathLength = length(bottom - v_positionEC);
    }
    vec4 background = textureLod(u_color, refractedUV, 0.0);
    #ifndef SCENEGIS_CURVED_WATER
    if (hasBottom && u_causticsIntensity > 0.0) {
        vec3 receiver = (czm_inverseModelView * vec4(bottom, 1.0)).xyz;
        float pixelSize = max(length(dFdx(receiver.xy)), length(dFdy(receiver.xy)));
        vec3 receiverCross = cross(dFdx(bottom), dFdy(bottom));
        float facing = abs(dot(receiverCross, up)) / max(length(receiverCross), 1e-8);
        float focusing = sceneGISWaterCaustics(receiver.xy, max(-receiver.z, 0.0), pixelSize,
            max(dot(up, czm_lightDirectionEC), 0.0));
        background.rgb *= mix(1.0, focusing, facing * facing);
    }
    #endif
    vec3 water;
    if (u_mediumOptics) {
        vec3 light = normalize(czm_lightDirectionEC);
        float airCosine = max(dot(up, light), 0.0);
        // Refraction of incident light through the mean surface, IOR = 1.333.
        float eta = 1.0 / 1.333;
        float lightCosine = sqrt(1.0 - eta * eta * (1.0 - airCosine * airCosine));
        vec3 lightTravel = -eta * (light - up * dot(up, light)) - up * lightCosine;
        vec3 toSurface = hasBottom && pathLength > 0.0 ? (v_positionEC - bottom) / pathLength : view;
        float phase = sceneGISWaterPhase(dot(lightTravel, toSurface), u_scatteringAnisotropy);
        vec3 directSource = beam * (airCosine / lightCosine) *
            (1.0 - sceneGISWaterFresnel(airCosine)) * phase;
        // Isotropic upper-hemisphere sky approximation; the helper returns irradiance/pi.
        vec3 skySource = skyRadiance * (0.5 * (1.0 - sceneGISWaterFresnel(2.0 / 3.0)));
        water = sceneGISWaterMedium(background.rgb, u_absorption, u_scattering, pathLength,
            hasBottom, max(dot(toSurface, up), 0.0), lightCosine, directSource, skySource);
    } else {
        vec3 transmission = hasBottom ? exp(-u_absorption * pathLength) : vec3(0.0);
        water = background.rgb * transmission + u_waterColor * diffuseLight * (vec3(1.0) - transmission);
    }

    vec3 reflected = reflect(-view, normal);
    vec3 environment = u_reflectionColor;
    if (u_hasSky) {
        vec3 worldDirection = czm_inverseViewRotation * reflected;
        environment = textureLod(u_sky, u_skyWorldToLocal * worldDirection, u_roughness * u_skyLod).rgb * u_radianceScale;
    }
    vec4 hit = u_reflections ? sceneGISSSRTrace(v_positionEC, vec4(reflected, u_roughness)) : vec4(0.0);
    vec3 reflection = mix(environment, hit.rgb, hit.a);
    float nDotV = max(dot(normal, view), 0.001);
    float fresnel = sceneGISWaterFresnel(nDotV);
    vec3 color = mix(water, reflection, fresnel);

    // Dielectric GGX sun highlight; the sky probe excludes the solar disk.
    color += sceneGISWaterHighlight(normal, view, beam, u_roughness);

    #ifdef SCENEGIS_RIVER_WATER
    float currentFoam = smoothstep(0.65, 0.9, current.y);
    float contact = u_foamWidth > 0.0 ? (1.0 - smoothstep(0.0, u_foamWidth, verticalDepth)) * u_foamIntensity : 0.0;
    float foam = currentFoam * max(contact, u_currentFoamIntensity * v_shoreFade);
    #else
    float foam = sceneGISWaterFoam(verticalDepth, footprint, d);
    #endif
    // Break continuous crest masks into rafts and bubble openings, filtered in meters.
    vec2 foamPosition = v_waterPosition - d * u_time * u_waveLength / czm_twoPi * 0.08;
    #ifdef SCENEGIS_CURVED_WATER
    foamPosition += u_waterFoamOffset;
    #endif
    float clusters = mix(0.5, sceneGISWaterNoise(foamPosition * 1.7), exp(-footprint * footprint * 3.0));
    float bubbles = sceneGISWaterBubbles(foamPosition * 12.0 + clusters, footprint * 12.0);
    float crestCoverage = smoothstep(0.04, 0.65, crestFoam) * mix(0.55, 1.0, clusters) * bubbles;
    foam = max(foam, crestCoverage);
    // Foam replaces the wet interface, including its sharp specular lobe.
    color = mix(color, vec3(0.8) * diffuseLight, clamp(foam, 0.0, 1.0));
    out_FragColor = vec4(max(color, vec3(0.0)), 1.0);
}
