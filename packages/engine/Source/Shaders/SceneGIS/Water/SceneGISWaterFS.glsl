uniform vec3 u_waterColor;
uniform vec4 u_pickColor;
uniform vec3 u_absorption;
uniform vec3 u_reflectionColor;
uniform samplerCube u_sky;
uniform bool u_hasSky;
uniform mat3 u_skyWorldToLocal;
uniform float u_skyLod;
uniform float u_radianceScale;
uniform float u_roughness;
uniform float u_waveAmplitude;
uniform float u_waveLength;
uniform vec2 u_flowDirection;
uniform float u_time;
uniform float u_foamWidth;
uniform float u_foamIntensity;
uniform float u_refractionStrength;
uniform bool u_reflections;
in vec3 v_positionEC;
in vec2 v_waterPosition;
#ifdef SCENEGIS_CURVED_WATER
uniform vec2 u_waterFoamOffset;
#endif
#ifdef SCENEGIS_WIND_WAVES
uniform sampler2D u_waveNormal0;
uniform sampler2D u_waveNormal1;
uniform float u_wavePeriod;
uniform float u_waveResolution;
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

vec2 sceneGISWaterWave(vec2 direction, float scale, float speed, float phase, float footprint)
{
    float k = czm_twoPi / (u_waveLength * scale);
    float bandLimit = exp(-k * k * footprint * footprint);
    float angle = k * dot(direction, v_waterPosition) - u_time * speed + phase;
    return direction * (cos(angle) * k * u_waveAmplitude * scale * bandLimit);
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
    if (u_foamWidth == 0.0 || u_foamIntensity == 0.0 || depth >= u_foamWidth) { return 0.0; }
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
    float threshold = mix(0.43, 0.78, smoothstep(0.0, 1.0, shallow));
    float aa = min(0.25, 0.055 + footprint * 0.45);
    // Retain large patches at distance instead of fading the entire shore into a white stripe.
    float grain = mix(0.5, sceneGISWaterNoise(p * 23.0 + breakup),
        exp(-footprint * footprint * 400.0));
    vec2 bubblePosition = p * 9.0 + vec2(clusters, breakup) * 2.0 + (grain - 0.5) * 0.35;
    float bubbles = sceneGISWaterBubbles(bubblePosition, footprint * 9.0);
    float coverage = smoothstep(threshold - aa, threshold + aa, pattern + (bubbles - 0.65) * 0.07);
    float fade = 1.0 - smoothstep(0.55, 1.0, shallow);
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
    #ifdef SCENEGIS_WATER_PHYSICAL
    beam = sceneGISModelDirectSource(v_positionEC, beam);
    diffuseLight = sceneGISModelSkyIrradiance(v_positionEC, up) +
        beam * (max(dot(up, czm_lightDirectionEC), 0.0) / czm_pi);
    #endif
    // Only the above-water interface is qualified.
    if (dot(up, view) <= 0.0) { discard; }
    float footprint = max(length(dFdx(v_waterPosition)), length(dFdy(v_waterPosition)));
    vec2 d = normalize(u_flowDirection);
    float crestFoam = 0.0;
    #ifdef SCENEGIS_WIND_WAVES
    vec4 n0 = texture(u_waveNormal0, v_waterPosition / u_wavePeriod + 0.5 / u_waveResolution);
    vec4 n1 = texture(u_waveNormal1, v_waterPosition / (u_wavePeriod * 4.0) + 0.5 / u_waveResolution);
    vec2 gradient = n0.xy / max(n0.z, 0.1) + n1.xy / max(n1.z, 0.1);
    #ifdef SCENEGIS_CURVED_WATER
    vec3 normal = normalize(waterFrame * vec3(gradient * v_shoreFade, 1.0));
    #else
    vec3 normal = normalize(czm_normal * vec3(gradient * v_shoreFade, 1.0));
    #endif
    crestFoam = max(n0.a, n1.a) * v_shoreFade;
    #elif defined(SCENEGIS_RIVER_WATER)
    vec3 normal = up;
    #else
    vec2 across = vec2(-d.y, d.x);
    vec2 slope = sceneGISWaterWave(d, 1.0, 1.0, 0.0, footprint);
    slope += sceneGISWaterWave(normalize(d + across * 0.6), 0.47, 1.7, 1.4, footprint) * 0.5;
    slope += sceneGISWaterWave(normalize(d - across * 0.8), 0.19, 2.6, 3.2, footprint) * 0.3;
    slope += sceneGISWaterWave(across, 0.08, 3.9, 0.7, footprint) * 0.15;
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
        refractedDepth <= waterDepth || aboveWater) { refractedUV = uv; }
    vec4 background = textureLod(u_color, refractedUV, 0.0);
    vec3 transmission = hasBottom ? exp(-u_absorption * pathLength) : vec3(0.0);
    vec3 water = background.rgb * transmission + u_waterColor * diffuseLight * (vec3(1.0) - transmission);

    vec3 reflected = reflect(-view, normal);
    vec3 environment = u_reflectionColor;
    if (u_hasSky) {
        vec3 worldDirection = czm_inverseViewRotation * reflected;
        environment = textureLod(u_sky, u_skyWorldToLocal * worldDirection, u_roughness * u_skyLod).rgb * u_radianceScale;
    }
    vec4 hit = u_reflections ? sceneGISSSRTrace(v_positionEC, vec4(reflected, u_roughness)) : vec4(0.0);
    vec3 reflection = mix(environment, hit.rgb, hit.a);
    float nDotV = max(dot(normal, view), 0.001);
    float fresnel = 0.02037 + 0.97963 * pow(1.0 - nDotV, 5.0);
    vec3 color = mix(water, reflection, fresnel);

    // Dielectric GGX sun highlight; the sky probe excludes the solar disk.
    vec3 light = normalize(czm_lightDirectionEC);
    vec3 halfVector = normalize(light + view);
    float nDotL = max(dot(normal, light), 0.0);
    float nDotH = max(dot(normal, halfVector), 0.0);
    float alpha = max(u_roughness * u_roughness, 0.0025);
    float a2 = alpha * alpha;
    float denominator = nDotH * nDotH * (a2 - 1.0) + 1.0;
    float distribution = a2 / (czm_pi * denominator * denominator);
    float visibility = 0.5 / max(nDotL * sqrt(nDotV * nDotV * (1.0 - a2) + a2) +
        nDotV * sqrt(nDotL * nDotL * (1.0 - a2) + a2), 0.001);
    float lightFresnel = 0.02037 + 0.97963 * pow(1.0 - max(dot(view, halfVector), 0.0), 5.0);
    color += beam * (distribution * visibility * lightFresnel * nDotL);

    #ifdef SCENEGIS_RIVER_WATER
    float currentFoam = smoothstep(0.65, 0.9, current.y);
    float contact = u_foamWidth > 0.0 ? (1.0 - smoothstep(0.0, u_foamWidth, verticalDepth)) * u_foamIntensity : 0.0;
    float foam = max(crestFoam, currentFoam * max(contact, u_currentFoamIntensity * v_shoreFade));
    #else
    float foam = max(crestFoam, sceneGISWaterFoam(verticalDepth, footprint, d));
    #endif
    color = mix(color, vec3(0.8) * diffuseLight, clamp(foam, 0.0, 1.0));
    out_FragColor = vec4(max(color, vec3(0.0)), 1.0);
}
