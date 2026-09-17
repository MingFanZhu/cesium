in vec3 position3DHigh;
in vec3 position3DLow;
in vec4 color;
in vec2 lineExtrude;
in vec2 lineOffset;
in vec4 lineMetrics;
in vec4 linePaint;
in vec3 lineDash;
in vec2 lineEnds;
uniform float u_sceneGISVectorMetersPerPixel;
out vec4 v_color;
#ifdef SCENEGIS_VECTOR_PATTERN
in vec4 patternRect;
in vec2 patternSize;
out vec4 v_patternRect;
out vec2 v_patternSize;
#endif
out vec4 v_lineCoordinate;
out vec4 v_lineStyle;
out vec3 v_lineDash;
out vec2 v_lineEnds;
out float v_lineProgress;
#ifdef SCENEGIS_VECTOR_PICKING
in vec4 pickColor;
out vec4 v_pickColor;
#endif

void main()
{
    float outside = linePaint.y * 0.5 + linePaint.x * (linePaint.y > 0.0 ? 1.0 : 0.5);
    float envelope = outside + 0.5 / czm_pixelRatio;
    vec4 p = czm_translateRelativeToEye(position3DHigh, position3DLow);
    p.xy += (lineExtrude * envelope - lineOffset * linePaint.z) * u_sceneGISVectorMetersPerPixel;
    gl_Position = czm_modelViewProjectionRelativeToEye * p;
    gl_Position.z = clamp(gl_Position.z, -gl_Position.w, gl_Position.w);
    v_color = color;
#ifdef SCENEGIS_VECTOR_PATTERN
    v_patternRect = patternRect;
    v_patternSize = patternSize;
#endif
    v_lineCoordinate = vec4(lineMetrics.xy * envelope,
        lineMetrics.z / u_sceneGISVectorMetersPerPixel + lineMetrics.w * envelope, outside);
    v_lineStyle = vec4(linePaint.x, linePaint.y * 0.5, linePaint.w, envelope);
    v_lineDash = lineDash;
    v_lineProgress = lineMetrics.z / u_sceneGISVectorMetersPerPixel;
    v_lineEnds = vec2(lineEnds.x < 0.0 ? -1.0 : lineEnds.x / u_sceneGISVectorMetersPerPixel, lineEnds.y);
#ifdef SCENEGIS_VECTOR_PICKING
    v_pickColor = pickColor;
#endif
}
