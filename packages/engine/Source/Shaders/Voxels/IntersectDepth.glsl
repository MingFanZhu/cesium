// See IntersectionUtils.glsl for the definitions of Ray, Intersections,
// setIntersectionPair, INF_HIT, NO_HIT

/* intersectDepth defines (set in Scene/VoxelRenderResources.js)
#define DEPTH_INTERSECTION_INDEX ###
*/

// SCENEGIS_PATCH_BEGIN SGP-0046: Borrow final opaque and water surface depth for dedicated volume composition.
#ifdef SCENEGIS_DEFERRED_VOXEL_DEPTH
uniform sampler2D u_sceneGISVoxelDepth;
#endif
// SCENEGIS_PATCH_END SGP-0046
void intersectDepth(in vec2 screenCoord, in Ray ray, inout Intersections ix) {
    // SCENEGIS_PATCH_BEGIN SGP-0046: Keep native packed depth for dedicated picking and linear depth for color.
    #ifdef SCENEGIS_DEFERRED_VOXEL_DEPTH
    float logDepthOrDepth = texture(u_sceneGISVoxelDepth, screenCoord).r;
    #else
    float logDepthOrDepth = czm_unpackDepth(texture(czm_globeDepthTexture, screenCoord));
    #endif
    // SCENEGIS_PATCH_END SGP-0046
    float entry;
    float exit;
    if (logDepthOrDepth != 0.0) {
        // Calculate how far the ray must travel before it hits the depth buffer.
        // SCENEGIS_PATCH_BEGIN SGP-0046: Intersect the native view ray with the complete linear eye-depth plane.
        #ifdef SCENEGIS_DEFERRED_VOXEL_DEPTH
        entry = (-logDepthOrDepth - ray.pos.z) / ray.dir.z;
        #else
        vec4 eyeCoordinateDepth = czm_screenToEyeCoordinates(screenCoord, logDepthOrDepth);
        eyeCoordinateDepth /= eyeCoordinateDepth.w;
        entry = dot(eyeCoordinateDepth.xyz - ray.pos, ray.dir);
        #endif
        // SCENEGIS_PATCH_END SGP-0046
        exit = +INF_HIT;
    } else {
        // There's no depth at this location.
        entry = NO_HIT;
        exit = NO_HIT;
    }
    ix.distanceToDepthBuffer = entry;
#if defined(DEPTH_TEST)
    setIntersectionPair(ix, DEPTH_INTERSECTION_INDEX, vec2(entry, exit));
#endif
}
