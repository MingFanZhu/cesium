// Gaussian Stream ext-quality vertex shader for GSP v0 GPU-ready pages.
#define MAX_STD_DEV u_renderTuning0.x
#define MIN_PIXEL_RADIUS u_renderTuning0.y
#define MAX_PIXEL_RADIUS u_renderTuning0.z
#define MIN_ALPHA u_renderTuning0.w
#define PRE_BLUR_AMOUNT u_renderTuning1.x
#define BLUR_AMOUNT u_renderTuning1.y
#define CLIP_XY u_renderTuning1.z
#define FOCAL_ADJUSTMENT u_renderTuning1.w

const float PI = 3.14159265358979323846;

ivec2 packedIndexCoord(int index) {
    return ivec2((index >> 2) & 4095, index >> 14);
}

uint packedIndex(highp usampler2D textureValue, int index) {
    return texelFetch(textureValue, packedIndexCoord(index), 0)[index & 3];
}



vec4 quatMultiply(vec4 left, vec4 right) {
    return vec4(
        left.w * right.xyz + right.w * left.xyz + cross(left.xyz, right.xyz),
        left.w * right.w - dot(left.xyz, right.xyz)
    );
}

vec3 quatRotate(vec4 quaternion, vec3 value) {
    return value + 2.0 * cross(quaternion.xyz, cross(quaternion.xyz, value) + quaternion.w * value);
}

vec4 decodeQuatOctXy1010R12(uint encoded) {
    uint quantU = encoded & 0x3ffu;
    uint quantV = (encoded >> 10u) & 0x3ffu;
    uint angleInt = encoded >> 20u;
    vec2 folded = vec2(float(quantU), float(quantV)) / 1023.0 * 2.0 - 1.0;
    vec3 axis = vec3(folded, 1.0 - abs(folded.x) - abs(folded.y));
    float correction = max(-axis.z, 0.0);
    axis.x += axis.x >= 0.0 ? -correction : correction;
    axis.y += axis.y >= 0.0 ? -correction : correction;
    axis = normalize(axis);
    float halfTheta = (float(angleInt) / 4095.0) * PI * 0.5;
    return vec4(axis * sin(halfTheta), cos(halfTheta));
}

vec3 decodeExtRgb(uint encoded) {
    float divisor = exp2(float(int((encoded >> 27u) & 0x1fu) - 15)) / 255.0;
    vec3 value = vec3(
        float(encoded & 0xffu),
        float((encoded >> 8u) & 0xffu),
        float((encoded >> 16u) & 0xffu)
    ) * divisor;
    return vec3(
        (encoded & 0x1000000u) != 0u ? -value.x : value.x,
        (encoded & 0x2000000u) != 0u ? -value.y : value.y,
        (encoded & 0x4000000u) != 0u ? -value.z : value.z
    );
}

vec3 evaluateSh(uvec4 sh0, uvec4 sh1, uvec4 sh2, uvec4 sh3, int degree, vec3 direction) {
    vec3 result = decodeExtRgb(sh0.x) * (-0.4886025 * direction.y)
        + decodeExtRgb(sh0.y) * (0.4886025 * direction.z)
        + decodeExtRgb(sh0.z) * (-0.4886025 * direction.x);
    if (degree >= 2) {
        result += decodeExtRgb(sh0.w) * (1.0925484 * direction.x * direction.y)
            + decodeExtRgb(sh1.x) * (-1.0925484 * direction.y * direction.z)
            + decodeExtRgb(sh1.y) * (0.3153915 * (2.0 * direction.z * direction.z - direction.x * direction.x - direction.y * direction.y))
            + decodeExtRgb(sh1.z) * (-1.0925484 * direction.x * direction.z)
            + decodeExtRgb(sh1.w) * (0.5462742 * (direction.x * direction.x - direction.y * direction.y));
    }
    if (degree >= 3) {
        float xx = direction.x * direction.x;
        float yy = direction.y * direction.y;
        float zz = direction.z * direction.z;
        float xy = direction.x * direction.y;
        result += decodeExtRgb(sh2.x) * (-0.5900436 * direction.y * (3.0 * xx - yy))
            + decodeExtRgb(sh2.y) * (2.8906114 * xy * direction.z)
            + decodeExtRgb(sh2.z) * (-0.4570458 * direction.y * (4.0 * zz - xx - yy))
            + decodeExtRgb(sh2.w) * (0.3731763 * direction.z * (2.0 * zz - 3.0 * xx - 3.0 * yy))
            + decodeExtRgb(sh3.x) * (-0.4570458 * direction.x * (4.0 * zz - xx - yy))
            + decodeExtRgb(sh3.y) * (1.4453057 * direction.z * (xx - yy))
            + decodeExtRgb(sh3.z) * (-0.5900436 * direction.x * (xx - 3.0 * yy));
    }
    return result;
}

mat3 scaleQuaternionToMatrix(vec3 scale, vec4 quaternion) {
    float x = quaternion.x;
    float y = quaternion.y;
    float z = quaternion.z;
    float w = quaternion.w;
    mat3 rotation = mat3(
        1.0 - 2.0 * (y * y + z * z), 2.0 * (x * y + z * w), 2.0 * (x * z - y * w),
        2.0 * (x * y - z * w), 1.0 - 2.0 * (x * x + z * z), 2.0 * (y * z + x * w),
        2.0 * (x * z + y * w), 2.0 * (y * z - x * w), 1.0 - 2.0 * (x * x + y * y)
    );
    return rotation * mat3(scale.x, 0.0, 0.0, 0.0, scale.y, 0.0, 0.0, 0.0, scale.z);
}

void main() {
    uint ordered = packedIndex(u_ordering, gl_InstanceID);
    if (ordered == 0xffffffffu) {
        gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
        return;
    }
    int selectionIndex = int(ordered);
    int mappingIndex = selectionIndex;

    ivec2 globalMappingCoord = ivec2(mappingIndex & 4095, mappingIndex >> 12);
    uvec4 globalMapping = texelFetch(u_renderIndices, globalMappingCoord, 0);
    uint mapped = globalMapping.r;

    if (mapped == 0xffffffffu) {
        gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
        return;
    }
    uint localIndex = mapped & 0xffffu;
    int layer = int((mapped >> 16u) & 0x3fffu);
    uint shDegree = globalMapping.g == 0xffffffffu
        ? 0u
        : uint(u_globalShDegree);

    int x = int(localIndex & 255u);
    int y = int(localIndex >> 8u);
    ivec3 coreCoord = ivec3(x * 2, y, layer);
    uvec4 ext0 = texelFetch(u_coreTexture, coreCoord, 0);
    uvec4 ext1 = texelFetch(u_coreTexture, coreCoord + ivec3(1, 0, 0), 0);

    vec3 center = vec3(uintBitsToFloat(ext0.x), uintBitsToFloat(ext0.y), uintBitsToFloat(ext0.z));
    float opacity = unpackHalf2x16(ext0.w).x;
    vec2 rg = unpackHalf2x16(ext1.x);
    vec2 blueScale = unpackHalf2x16(ext1.y);
    vec3 color = vec3(rg, blueScale.x);
    vec2 scaleYz = unpackHalf2x16(ext1.z);
    vec3 scales = exp(vec3(blueScale.y, scaleYz));
    vec4 quaternion = decodeQuatOctXy1010R12(ext1.w);

    if (shDegree > 0u) {
        int texelsPerSplat = shDegree == 1u ? 1 : (shDegree == 2u ? 2 : 4);
        uint shLocalIndex = globalMapping.g & 0xffffu;
        int shLayer = int((globalMapping.g >> 16u) & 0x3fffu);
        int shX = int(shLocalIndex & 255u);
        int shY = int(shLocalIndex >> 8u);
        ivec3 shCoord = ivec3(shX * texelsPerSplat, shY, shLayer);

        uvec4 sh0 = texelFetch(u_shTexture, shCoord, 0);
        uvec4 sh1 = shDegree >= 2u ? texelFetch(u_shTexture, shCoord + ivec3(1, 0, 0), 0) : uvec4(0u);
        uvec4 sh2 = shDegree >= 3u ? texelFetch(u_shTexture, shCoord + ivec3(2, 0, 0), 0) : uvec4(0u);
        uvec4 sh3 = shDegree >= 3u ? texelFetch(u_shTexture, shCoord + ivec3(3, 0, 0), 0) : uvec4(0u);
        color += evaluateSh(sh0, sh1, sh2, sh3, int(shDegree), normalize(center - u_viewOriginLocal));
    }
    color *= u_color.rgb;

    opacity *= u_color.a;
    if (opacity <= 0.0) {
        gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
        return;
    }

    vec3 centerRelative = center - u_viewOriginLocal;
    quaternion = quatMultiply(u_sourceRenderToViewQuaternion, quaternion);
    vec3 viewCenter = quatRotate(u_sourceRenderToViewQuaternion, centerRelative) + u_sourceRenderToViewPosition;
    vec4 clipCenter = czm_projection * vec4(viewCenter, 1.0);
    if (viewCenter.z >= 0.0 || abs(clipCenter.z) >= clipCenter.w) {
        gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
        return;
    }
    float clip = CLIP_XY * clipCenter.w;
    if (abs(clipCenter.x) > clip || abs(clipCenter.y) > clip) {
        gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
        return;
    }

    mat3 rs = scaleQuaternionToMatrix(scales, quaternion);
    vec2 renderSize = czm_viewport.zw * FOCAL_ADJUSTMENT;
    vec2 focal = 0.5 * renderSize * vec2(czm_projection[0][0], czm_projection[1][1]);
    float invZ = 1.0 / viewCenter.z;
    vec2 j1 = focal * invZ;
    vec2 j2 = -focal * viewCenter.xy * invZ * invZ;
    mat3 jacobian = mat3(j1.x, 0.0, j2.x, 0.0, j1.y, j2.y, 0.0, 0.0, 0.0);
    mat3 covariance = transpose(jacobian) * (rs * transpose(rs)) * jacobian;
    float a = covariance[0][0] + PRE_BLUR_AMOUNT;
    float b = covariance[0][1];
    float d = covariance[1][1] + PRE_BLUR_AMOUNT;
    float originalDeterminant = a * d - b * b;
    a += BLUR_AMOUNT;
    d += BLUR_AMOUNT;
    float determinant = a * d - b * b;
    opacity *= sqrt(max(0.0, originalDeterminant / max(determinant, 1.0e-6)));
    if (opacity < MIN_ALPHA) {
        gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
        return;
    }

    float average = 0.5 * (a + d);
    float delta = sqrt(max(0.0, average * average - determinant));
    float eigen1 = average + delta;
    float eigen2 = average - delta;
    vec2 axis1 = abs(b) > 0.001
        ? normalize(vec2(b, eigen1 - a))
        : (a >= d ? vec2(1.0, 0.0) : vec2(0.0, 1.0));
    vec2 axis2 = vec2(axis1.y, -axis1.x);
    float radius1 = min(MAX_PIXEL_RADIUS, MAX_STD_DEV * sqrt(eigen1));
    float radius2 = min(MAX_PIXEL_RADIUS, MAX_STD_DEV * sqrt(max(eigen2, 0.0)));
    if (radius1 < MIN_PIXEL_RADIUS && radius2 < MIN_PIXEL_RADIUS) {
        gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
        return;
    }
    vec2 corner = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2) - 1.0;
    vec2 pixelOffset = corner.x * axis1 * radius1 + corner.y * axis2 * radius2;
    vec2 ndc = clipCenter.xy / clipCenter.w + (2.0 / renderSize) * pixelOffset;
#ifdef SCENEGIS_GAUSSIAN_VIDEO
    // Normalize covariance before inversion; a relative variance floor bounds
    // the receiver proxy's condition number without changing rendered alpha.
    mat3 covariance3D = rs * transpose(rs);
    float varianceScale = max(covariance3D[0][0], max(covariance3D[1][1], covariance3D[2][2]));
    v_gvPrecision = inverse(covariance3D / varianceScale + mat3(1.0e-6));
    v_gvCenter = viewCenter;
    vec4 planePosition = czm_inverseProjection * vec4(ndc, clipCenter.z / clipCenter.w, 1.0);
    v_gvRay = planePosition.xyz / planePosition.w;
#endif
    gl_Position = vec4(ndc * clipCenter.w, clipCenter.zw);
    gl_Position.z = clamp(gl_Position.z, -abs(gl_Position.w), abs(gl_Position.w));
    v_tileCropPosition = center.xy;
    int cropWidth = textureSize(u_globalCropTexture, 0).x;
    int cropSlot = int(globalMapping.b);
    v_globalCropBounds = texelFetch(
        u_globalCropTexture,
        ivec2(cropSlot % cropWidth, cropSlot / cropWidth),
        0
    );

    v_vertPos = corner * MAX_STD_DEV;
    v_adjustedStdDev = MAX_STD_DEV;
    v_splatColor = vec4(color, opacity);
}
