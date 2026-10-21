in vec3 position3DHigh;
in vec3 position3DLow;
in vec2 incomingDirection;
in vec2 outgoingDirection;
in float lineWidth;
in float expandDirection;
in vec4 segmentNormals;
in vec4 segmentOffsets;
#ifndef SCENEGIS_GROUND_MATERIAL
in vec4 color;
#else
in vec2 segmentTexture;
#endif
in float batchId;

#ifndef SCENEGIS_GROUND_MATERIAL
out vec4 v_color;
#else
out vec4 v_lineTexture;
out float v_polylineAngle;
#endif
out vec4 v_startPlane;
out vec4 v_endPlane;
out vec4 v_rightPlane;
out float v_halfWidth;

void main()
{
    vec4 position = czm_computePosition();
    vec2 incoming = incomingDirection;
    vec2 outgoing = outgoingDirection;
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
    vec3 startEC = positionEC.xyz +
        (czm_modelViewRelativeToEye * vec4(segmentOffsets.xy, 0.0, 0.0)).xyz;
    vec3 endEC = positionEC.xyz +
        (czm_modelViewRelativeToEye * vec4(segmentOffsets.zw, 0.0, 0.0)).xyz;
    vec3 startNormalEC = normalize(czm_normal * vec3(segmentNormals.xy, 0.0));
    vec3 endNormalEC = normalize(czm_normal * vec3(segmentNormals.zw, 0.0));
    vec2 forward = segmentOffsets.zw - segmentOffsets.xy;
    vec3 rightNormalEC = normalize(czm_normal * vec3(-forward.y, forward.x, 0.0));
    v_startPlane = vec4(startNormalEC, -dot(startNormalEC, startEC));
    v_endPlane = vec4(endNormalEC, -dot(endNormalEC, endEC));
    v_rightPlane = vec4(rightNormalEC, -dot(rightNormalEC, startEC));
    v_halfWidth = lineWidth * 0.5;
#ifdef SCENEGIS_GROUND_MATERIAL
    vec3 forwardEC = normalize(czm_normal * vec3(forward, 0.0));
    // Normalize miter-plane distances so centerline progress is metric, while joins share s.
    v_lineTexture = vec4(segmentTexture,
        max(dot(startNormalEC, forwardEC), 1.0e-7),
        max(dot(endNormalEC, -forwardEC), 1.0e-7));
    vec2 screenDirection = forwardEC.xy;
    float angle = dot(screenDirection, screenDirection) > 0.0
        ? atan(-screenDirection.y, screenDirection.x) : 0.0;
    v_polylineAngle = floor(angle / czm_piOverFour + 0.5) * czm_piOverFour;
#endif
    // RTE positioning keeps the EPSG:3857-scale origin out of the FLOAT route
    // attributes; meters-per-pixel then expands both height faces along the
    // same eye-space miter/start/end plane family.
    // Rasterize a conservative volume; the fragment shader decides the actual width.
    float halfWidthMeters = lineWidth *
        max(0.0, czm_metersPerPixel(positionEC));
    float miterProjection = max(abs(dot(miterEC, rightEC)), 0.25);
    positionEC.xyz +=
        miterEC * expandDirection * (halfWidthMeters / miterProjection);
#ifndef SCENEGIS_GROUND_MATERIAL
    v_color = color;
#endif
    gl_Position = czm_depthClamp(czm_projection * positionEC);
}
