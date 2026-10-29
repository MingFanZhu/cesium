#ifdef SCENEGIS_PROFILE_WATER
uniform sampler2D u_waterProfile;
uniform int u_profileNodeCount;

float sceneGISProfileCross(vec2 a, vec2 b) { return a.x*b.y-a.y*b.x; }

bool sceneGISProfileTriangle(vec2 p, out vec3 result, out int triangle, out vec3 weights)
{
    int node=0;
    for(int visit=0;visit<2047;++visit) {
        if(node>=u_profileNodeCount) { break; }
        vec4 bounds=texelFetch(u_waterProfile,ivec2(0,node),0);
        vec4 data=texelFetch(u_waterProfile,ivec2(3,node),0);
        vec2 epsilon=(bounds.zw-bounds.xy)*1e-6;
        if(any(lessThan(p,bounds.xy-epsilon))||any(greaterThan(p,bounds.zw+epsilon))) {
            node=int(data.y); continue;
        }
        if(data.z>0.0) {
            vec4 ab=texelFetch(u_waterProfile,ivec2(1,node),0);
            vec4 cg=texelFetch(u_waterProfile,ivec2(2,node),0);
            float area=sceneGISProfileCross(ab.zw-ab.xy,cg.xy-ab.xy);
            float tolerance=area*1e-6;
            if(sceneGISProfileCross(ab.zw-ab.xy,p-ab.xy)>=-tolerance &&
                sceneGISProfileCross(cg.xy-ab.zw,p-ab.zw)>=-tolerance &&
                sceneGISProfileCross(ab.xy-cg.xy,p-cg.xy)>=-tolerance) {
                result=vec3(data.x+dot(cg.zw,p-ab.xy),cg.zw);
                triangle=node;
                #ifdef SCENEGIS_RIVER_WATER
                weights.y=sceneGISProfileCross(cg.xy-ab.xy,p-ab.xy)*(-1.0/area);
                weights.z=sceneGISProfileCross(ab.zw-ab.xy,p-ab.xy)/area;
                weights.x=1.0-weights.y-weights.z;
                #else
                weights=vec3(0.0);
                #endif
                return true;
            }
        }
        ++node;
    }
    result=vec3(0.0);
    triangle=0; weights=vec3(0.0);
    return false;
}

bool sceneGISProfileHeight(vec2 p, out vec3 result)
{
    int triangle; vec3 weights;
    return sceneGISProfileTriangle(p,result,triangle,weights);
}

#ifdef SCENEGIS_RIVER_WATER
bool sceneGISProfileFlow(vec2 p, out vec3 flow)
{
    vec3 profile, weights; int triangle;
    bool inside=sceneGISProfileTriangle(p,profile,triangle,weights);
    flow=inside ? texelFetch(u_waterProfile,ivec2(4,triangle),0).xyz*weights.x +
        texelFetch(u_waterProfile,ivec2(5,triangle),0).xyz*weights.y +
        texelFetch(u_waterProfile,ivec2(6,triangle),0).xyz*weights.z : vec3(1.0,0.0,0.0);
    return inside;
}
#endif
#endif
