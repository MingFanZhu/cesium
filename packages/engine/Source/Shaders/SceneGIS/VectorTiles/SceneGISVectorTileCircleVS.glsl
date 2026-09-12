in vec3 position3DHigh;
in vec3 position3DLow;
in vec4 color;
in float batchId;
in vec2 corner;
in vec2 dimensions;
in vec4 strokeColor;
out vec4 v_color;
out vec2 v_circleCoordinate;
out vec2 v_dimensions;
out vec4 v_strokeColor;

void main()
{
    vec4 p = czm_modelViewProjectionRelativeToEye * czm_computePosition();
    float extent = dimensions.x + dimensions.y + 1.0;
    p.xy += corner * extent * czm_pixelRatio * 2.0 / czm_viewport.zw * p.w;
    gl_Position = p;
    v_color = color;
    v_circleCoordinate = corner * extent;
    v_dimensions = dimensions;
    v_strokeColor = strokeColor;
}

