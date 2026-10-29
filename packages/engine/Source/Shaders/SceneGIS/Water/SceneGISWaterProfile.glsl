#ifdef SCENEGIS_PROFILE_WATER
uniform sampler2D u_waterProfile;
uniform int u_profileNodeCount;

float sceneGISProfileCross(vec2 a, vec2 b) { return a.x*b.y-a.y*b.x; }

bool sceneGISProfileHeight(vec2 p, out vec3 result)
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
                return true;
            }
        }
        ++node;
    }
    result=vec3(0.0);
    return false;
}
#endif
