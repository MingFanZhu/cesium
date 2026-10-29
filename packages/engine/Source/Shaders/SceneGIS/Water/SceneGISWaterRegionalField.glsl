#ifdef SCENEGIS_REGIONAL_FIELD
uniform sampler2D u_fieldSurface;
uniform sampler2D u_fieldTangent;
uniform sampler2D u_fieldFlow;
uniform vec2 u_fieldChartOrigin;
uniform vec2 u_fieldWindOrigin;
uniform vec3 u_fieldEast;
uniform vec4 u_fieldRectangle;

vec2 sceneGISRegionalUV(vec2 p)
{
    vec2 size = vec2(textureSize(u_fieldSurface, 0));
    vec2 uv = clamp((p - u_fieldRectangle.xy) / u_fieldRectangle.zw, 0.0, 1.0);
    return (uv * (size - 1.0) + 0.5) / size;
}

vec3 sceneGISRegionalPosition(vec2 p, float spacing, bool displaced)
{
    vec2 uv = sceneGISRegionalUV(p);
    vec4 mean = textureLod(u_fieldSurface, uv, 0.0);
    vec3 position = vec3(p, mean.z);
    if (!displaced) { return position; }
    vec3 tangent = textureLod(u_fieldTangent, uv, 0.0).xyz;
    vec3 up = vec3(tangent.xy, sqrt(max(1.0 - dot(tangent.xy, tangent.xy), 0.0)));
    vec2 phase = mean.xy + u_fieldChartOrigin;
    #ifdef SCENEGIS_WIND_WAVES
    vec3 wave, ignored;
    // Same periodic phase as water tiles, without subtracting large chart values
    // to recover centimeter displacements far from the regional chart origin.
    vec2 windPhase = mean.xy + u_fieldWindOrigin;
    sceneGISWaterFieldWave(windPhase, spacing, wave, ignored);
    vec3 east = normalize(u_fieldEast - up * dot(up, u_fieldEast));
    position += mat3(east, cross(up, east), up) * (wave - vec3(windPhase, 0.0)) * tangent.z;
    #endif
    #ifdef SCENEGIS_RIVER_WATER
    vec3 flow = textureLod(u_fieldFlow, uv, 0.0).xyz;
    position += up * (sceneGISRiverHeight(phase, flow.xy, flow.z, spacing) * tangent.z);
    #endif
    return position;
}

void sceneGISRegionalWave(vec2 p, float spacing, bool displaced, out vec3 position, out vec3 normal)
{
    position = sceneGISRegionalPosition(p, spacing, displaced);
    float h = spacing * 0.5;
    vec3 dx = sceneGISRegionalPosition(p + vec2(h, 0.0), spacing, displaced) -
        sceneGISRegionalPosition(p - vec2(h, 0.0), spacing, displaced);
    vec3 dy = sceneGISRegionalPosition(p + vec2(0.0, h), spacing, displaced) -
        sceneGISRegionalPosition(p - vec2(0.0, h), spacing, displaced);
    normal = normalize(cross(dx, dy));
}
#endif
