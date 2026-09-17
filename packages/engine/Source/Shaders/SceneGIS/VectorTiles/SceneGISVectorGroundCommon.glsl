uniform sampler2D u_sceneGISGroundData;
uniform sampler2D u_sceneGISGroundPicks;
uniform vec2 u_sceneGISGroundDataSize;
uniform vec2 u_sceneGISGroundOffsets;
uniform vec2 u_sceneGISGroundPickSize;
uniform vec2 u_sceneGISGroundHeights;
#ifdef SCENEGIS_VECTOR_GLOBE_TERRAIN
#ifdef SCENEGIS_VECTOR_GLOBE_VERTEX
#define SCENEGIS_TERRAIN_VARYING out
#else
#define SCENEGIS_TERRAIN_VARYING in
#endif
flat SCENEGIS_TERRAIN_VARYING vec4 v_terrainReference;
flat SCENEGIS_TERRAIN_VARYING vec4 v_terrainFrame;
flat SCENEGIS_TERRAIN_VARYING vec3 v_terrainOriginEye;
flat SCENEGIS_TERRAIN_VARYING vec4 v_terrainAB;
flat SCENEGIS_TERRAIN_VARYING vec4 v_terrainC;
#ifndef SCENEGIS_VECTOR_UNIFORM_PAINT
flat SCENEGIS_TERRAIN_VARYING vec4 v_terrainColor;
#endif
#ifdef SCENEGIS_VECTOR_FRINGE
flat SCENEGIS_TERRAIN_VARYING vec3 v_terrainFringe;
#endif
#ifdef SCENEGIS_VECTOR_LINE
flat SCENEGIS_TERRAIN_VARYING vec4 v_terrainMetrics0;
flat SCENEGIS_TERRAIN_VARYING vec4 v_terrainMetrics1;
flat SCENEGIS_TERRAIN_VARYING vec4 v_terrainMetrics2;
flat SCENEGIS_TERRAIN_VARYING vec4 v_terrainDash;
#ifndef SCENEGIS_VECTOR_UNIFORM_PAINT
flat SCENEGIS_TERRAIN_VARYING vec4 v_terrainPaint;
#endif
#endif
#endif
uniform float u_sceneGISVectorMetersPerPixel;
#ifdef SCENEGIS_VECTOR_UNIFORM_PAINT
uniform vec4 u_sceneGISGroundColor;
uniform vec4 u_sceneGISGroundPaint;
#endif

vec4 groundFetch(sampler2D table, vec2 size, int index)
{
    return texelFetch(table, ivec2(index % int(size.x), index / int(size.x)), 0);
}
vec4 groundVertex(int index, int field)
{
#ifdef SCENEGIS_VECTOR_LINE
    int stride = 7;
#else
    int stride = 3;
#endif
#ifdef SCENEGIS_VECTOR_PATTERN
    stride += 2;
#endif
    return groundFetch(u_sceneGISGroundData, u_sceneGISGroundDataSize, index * stride + field);
}
vec4 groundTriangle(int index)
{
    return groundFetch(u_sceneGISGroundData, u_sceneGISGroundDataSize, int(u_sceneGISGroundOffsets.x) + index);
}
vec4 groundPaint(int index)
{
#ifdef SCENEGIS_VECTOR_UNIFORM_PAINT
    return u_sceneGISGroundPaint;
#else
    return groundVertex(index, 4);
#endif
}
vec2 groundPosition(int index)
{
    vec2 p = groundVertex(index, 0).xy;
    vec4 extra = groundVertex(index, 2);
#ifdef SCENEGIS_VECTOR_LINE
    vec4 paint = groundPaint(index);
    float outside = paint.y * 0.5 + paint.x * (paint.y > 0.0 ? 1.0 : 0.5);
    float envelope = outside + 0.5 / czm_pixelRatio;
    p += (extra.xy * envelope - extra.zw * paint.z) * u_sceneGISVectorMetersPerPixel;
#elif defined(SCENEGIS_VECTOR_FRINGE)
    p += extra.xy * u_sceneGISVectorMetersPerPixel / czm_pixelRatio;
#endif
    return p;
}
float groundCross(vec2 a, vec2 b)
{
    return a.x * b.y - a.y * b.x;
}
