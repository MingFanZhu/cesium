/**
 * Shader sources for eye-space expansion of stable planar ground-line segment
 * volumes.
 *
 * The segment/end-plane role follows the algorithmic structure of Cesium's
 * GroundPolylinePrimitive and PolylineShadowVolume shaders at upstream
 * baseline 6d5d8b1f0725b6f831b336463f4b11c98023427b. Recheck those sources
 * when their eye-space width convention or terrain-classification pass
 * changes. This shader contains no ellipsoid, map projection, or terrain-tile
 * dependency.
 *
 * @private
 */
const SceneGISPlanarGroundLineShader = {
  areaVertexShaderSource: `
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
`,
  areaFragmentShaderSource: `
in vec4 v_color;

void main()
{
    out_FragColor = czm_gammaCorrect(v_color);
    out_FragColor.rgb *= out_FragColor.a;
    czm_writeDepthClamp();
}
`,
  vertexShaderSource: `
in vec3 position3DHigh;
in vec3 position3DLow;
in vec3 previousPosition;
in vec3 nextPosition;
in float expandDirection;
in vec4 color;
in float batchId;

out vec4 v_color;

uniform float u_sceneGISGroundLineWidth;

void main()
{
    vec4 position = czm_computePosition();
    vec3 localPosition = position3DHigh + position3DLow;
    vec2 incoming = localPosition.xy - previousPosition.xy;
    vec2 outgoing = nextPosition.xy - localPosition.xy;
    float incomingLengthSquared = dot(incoming, incoming);
    float outgoingLengthSquared = dot(outgoing, outgoing);
    incoming = incomingLengthSquared > 0.0
        ? incoming * inversesqrt(incomingLengthSquared)
        : outgoing * inversesqrt(max(outgoingLengthSquared, 1.0e-20));
    outgoing = outgoingLengthSquared > 0.0
        ? outgoing * inversesqrt(outgoingLengthSquared)
        : incoming;
    vec2 incomingPerpendicular = vec2(-incoming.y, incoming.x);
    vec2 outgoingPerpendicular = vec2(-outgoing.y, outgoing.x);
    vec2 miter = incomingPerpendicular + outgoingPerpendicular;
    float miterLengthSquared = dot(miter, miter);
    miter = miterLengthSquared > 1.0e-10
        ? miter * inversesqrt(miterLengthSquared)
        : outgoingPerpendicular;
    vec3 miterEC = normalize(czm_normal * vec3(miter, 0.0));
    vec3 rightEC = normalize(
        czm_normal * vec3(outgoingPerpendicular, 0.0)
    );
    vec4 positionEC = czm_modelViewRelativeToEye * position;
    // RTE positioning keeps the EPSG:3857-scale origin out of the FLOAT route
    // attributes; meters-per-pixel then expands both height faces along the
    // same eye-space miter/start/end plane family.
    float halfWidthMeters = u_sceneGISGroundLineWidth * 0.5 *
        max(0.0, czm_metersPerPixel(positionEC));
    float miterProjection = max(abs(dot(miterEC, rightEC)), 0.25);
    positionEC.xyz +=
        miterEC * expandDirection * (halfWidthMeters / miterProjection);
    v_color = color;
    gl_Position = czm_depthClamp(czm_projection * positionEC);
}
`,
  fragmentShaderSource: `
in vec4 v_color;

void main()
{
    out_FragColor = czm_gammaCorrect(v_color);
    out_FragColor.rgb *= out_FragColor.a;
    czm_writeDepthClamp();
}
`,
};

export default SceneGISPlanarGroundLineShader;
