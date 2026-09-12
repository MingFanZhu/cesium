in vec3 position3DHigh;
in vec3 position3DLow;
in vec4 color;
in float batchId;

out vec4 v_color;

void main()
{
    vec4 position = czm_computePosition();
    v_color = color;
    gl_Position = czm_depthClamp(czm_modelViewProjectionRelativeToEye * position);
}
