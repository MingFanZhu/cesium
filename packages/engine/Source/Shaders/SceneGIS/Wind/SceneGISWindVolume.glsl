uniform sampler2D colorTexture;
uniform sampler2D depthTexture;
uniform mat4 u_eyeToLocal;
uniform float u_extinction;
uniform bool u_slice;
uniform float u_sliceHeight;
in vec2 v_textureCoordinates;
void main() {
    vec4 background=texture(colorTexture,v_textureCoordinates);
    vec4 nearEye=czm_windowToEyeCoordinates(vec4(gl_FragCoord.xy,0.0,1.0));
    vec4 farEye=czm_windowToEyeCoordinates(vec4(gl_FragCoord.xy,0.999,1.0));
    vec3 origin=(u_eyeToLocal*vec4(nearEye.xyz/nearEye.w,1.0)).xyz;
    vec3 farPoint=(u_eyeToLocal*vec4(farEye.xyz/farEye.w,1.0)).xyz;
    vec3 direction=normalize(farPoint-origin);
    vec3 safeDirection=mix(vec3(1e-9),direction,greaterThan(abs(direction),vec3(1e-9)));
    vec3 slab0=(u_sgWindMinimum-origin)/safeDirection;
    vec3 slab1=(u_sgWindMinimum+u_sgWindDimensions*u_sgWindCellSize-origin)/safeDirection;
    vec3 low=min(slab0,slab1), high=max(slab0,slab1);
    float entry=max(0.0,max(low.x,max(low.y,low.z)));
    float exitDistance=min(high.x,min(high.y,high.z));
    float depth=texture(depthTexture,v_textureCoordinates).r;
    if(depth<1.0) {
        vec4 eye=czm_windowToEyeCoordinates(gl_FragCoord.xy,depth);
        vec3 position=(u_eyeToLocal*vec4(eye.xyz/eye.w,1.0)).xyz;
        exitDistance=min(exitDistance,dot(position-origin,direction));
    }
    vec4 accumulated=vec4(0.0);
    if(exitDistance>entry) {
        if(u_slice) {
            float distanceToSlice=(u_sliceHeight-origin.z)/safeDirection.z;
            if(distanceToSlice>=entry && distanceToSlice<=exitDistance) {
                vec4 field=sceneGISWindSample(origin+direction*distanceToSlice);
                float alpha=1.0-exp(-u_extinction*max(field.w,0.0)*u_sgWindCellSize);
                accumulated=vec4(windDisplayColor(field)*alpha,alpha);
            }
        } else {
            float ds=max(u_sgWindCellSize*0.75,(exitDistance-entry)/256.0);
            for(int i=0;i<256;++i) {
                float distanceToSample=entry+(float(i)+0.5)*ds;
                if(distanceToSample>=exitDistance || accumulated.a>0.995) break;
                vec4 field=sceneGISWindSample(origin+direction*distanceToSample);
                float alpha=1.0-exp(-u_extinction*max(field.w,0.0)*ds);
                accumulated.rgb+=(1.0-accumulated.a)*alpha*windDisplayColor(field);
                accumulated.a+=(1.0-accumulated.a)*alpha;
            }
        }
    }
    out_FragColor=vec4(accumulated.rgb+(1.0-accumulated.a)*background.rgb,background.a);
}
