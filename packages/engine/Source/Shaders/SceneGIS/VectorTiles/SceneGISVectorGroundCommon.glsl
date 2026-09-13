uniform sampler2D u_sceneGISGroundVertices;
uniform sampler2D u_sceneGISGroundTriangles;
uniform sampler2D u_sceneGISGroundPicks;
uniform vec2 u_sceneGISGroundVertexSize;
uniform vec2 u_sceneGISGroundTriangleSize;
uniform vec2 u_sceneGISGroundPickSize;
uniform vec2 u_sceneGISGroundHeights;
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
    const int stride = 7;
#else
    const int stride = 3;
#endif
    return groundFetch(u_sceneGISGroundVertices, u_sceneGISGroundVertexSize, index * stride + field);
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
