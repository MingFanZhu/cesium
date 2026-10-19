in vec3 position3DHigh;
in vec3 position3DLow;
in vec4 color;
in float batchId;
in vec4 groundExtents;

out vec4 v_color;
out vec4 v_westPlane;
out vec4 v_southPlane;
out vec2 v_inverseExtents;

void main()
{
    vec4 position = czm_computePosition();
    vec3 southwestEC = (czm_modelViewRelativeToEye *
        (position + vec4(groundExtents.xy, 0.0, 0.0))).xyz;
    vec3 eastEC = czm_normal * vec3(1.0, 0.0, 0.0);
    vec3 northEC = czm_normal * vec3(0.0, 1.0, 0.0);
    v_westPlane = vec4(eastEC, -dot(eastEC, southwestEC));
    v_southPlane = vec4(northEC, -dot(northEC, southwestEC));
    v_inverseExtents = 1.0 / groundExtents.zw;
    v_color = color;
    gl_Position = czm_depthClamp(czm_modelViewProjectionRelativeToEye * position);
}
