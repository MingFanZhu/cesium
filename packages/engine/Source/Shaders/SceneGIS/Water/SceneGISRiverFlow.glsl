#ifdef SCENEGIS_RIVER_WATER
uniform float u_riverTime;
uniform float u_currentSpeedScale;
uniform float u_currentRippleLength;
uniform float u_currentRippleAmplitude;
uniform float u_currentFoamIntensity;
uniform sampler2D u_riverDisplacement0;
uniform sampler2D u_riverDisplacement1;

vec2 sceneGISRiverRotate(vec2 p, vec2 direction)
{
    return vec2(dot(p, direction), dot(p, vec2(-direction.y, direction.x)));
}

float sceneGISRiverSample(sampler2D field, vec2 p, vec2 direction, float period, float spacing)
{
    vec2 uv = sceneGISRiverRotate(p, direction) / period + 0.5 / 128.0;
    #ifdef SCENEGIS_RIVER_VERTEX
    float lod = max(0.0, log2(spacing * 128.0 / period));
    return textureLod(field, uv, lod).z;
    #else
    // Differentiate advected metric coordinates, not the discrete sector index.
    // The two sectors agree at a boundary even when their unused UVs jump.
    vec2 dx = sceneGISRiverRotate(dFdx(p), direction) / period;
    vec2 dy = sceneGISRiverRotate(dFdy(p), direction) / period;
    return textureGrad(field, uv, dx, dy).z;
    #endif
}

float sceneGISRiverBand(sampler2D field, vec2 p, vec2 first, vec2 second,
    float blend, float period, float spacing)
{
    float a = sceneGISRiverSample(field, p, first, period, spacing);
    float b = sceneGISRiverSample(field, p, second, period, spacing);
    float height = mix(a, b, blend);
    // The random field has unit variance, not a finite peak amplitude. A smooth
    // bound preserves the public maximum displacement and has no clipped plateaus.
    return height * inversesqrt(1.0 + height * height);
}

float sceneGISRiverField(vec2 p, vec2 first, vec2 second, float blend, float spacing)
{
    float agitation = sceneGISRiverBand(u_riverDisplacement0, p, first, second,
        blend, u_currentRippleLength * 8.0, spacing);
    float ripples = sceneGISRiverBand(u_riverDisplacement1, p, first, second,
        blend, u_currentRippleLength * 2.0, spacing);
    return 0.86 * agitation + 0.14 * ripples;
}

float sceneGISRiverHeight(vec2 position, vec2 flow, float speed, float spacing)
{
    vec2 direction = normalize(flow);
    float sector = atan(direction.y, direction.x) * (4.0 / czm_pi);
    float angle = floor(sector) * (czm_pi * 0.25);
    vec2 first = vec2(cos(angle), sin(angle));
    vec2 second = vec2(cos(angle + czm_pi * 0.25), sin(angle + czm_pi * 0.25));
    float blend = smoothstep(0.0, 1.0, fract(sector));
    float phase = fract(u_riverTime / 32.0);
    float other = fract(phase + 0.5);
    float weight = 0.5 + 0.5 * cos(czm_twoPi * phase);
    vec2 travel = direction * (speed * u_currentSpeedScale * 32.0);
    float a = sceneGISRiverField(position - phase * travel, first, second, blend, spacing);
    float b = sceneGISRiverField(position - other * travel, first, second, blend, spacing);
    return u_currentRippleAmplitude * mix(a, b, weight);
}

#ifndef SCENEGIS_RIVER_VERTEX
in vec3 v_riverData;
in vec2 v_riverFlow;
in vec2 v_riverPosition;

vec2 sceneGISRiverCurrent()
{
    float height = sceneGISRiverHeight(v_riverPosition, v_riverFlow, v_riverData.z, 0.0);
    // Optional artistic foam follows the random crests rather than channel-wide sine stripes.
    float foam = 0.5 + 0.5 * height / max(u_currentRippleAmplitude, 1.0e-6);
    return vec2(height, foam);
}

vec3 sceneGISRiverNormal(vec3 normal, vec3 up, float height)
{
    vec3 dx = dFdx(v_waterBaseEC), dy = dFdy(v_waterBaseEC);
    vec3 r1 = cross(dy, up), r2 = cross(up, dx);
    float determinant = dot(dx, r1);
    vec3 gradient = (dFdx(height) * r1 + dFdy(height) * r2) /
        (sign(determinant) * max(abs(determinant), 1.0e-12));
    return normalize(normal - gradient);
}
#endif
#endif
