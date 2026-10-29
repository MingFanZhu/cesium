uniform sampler2D u_sgWindVelocity;
uniform sampler2D u_sgWindSolid;
uniform sampler2D u_sgWindTracer;
uniform vec3 u_sgWindDimensions;
uniform vec3 u_sgWindMinimum;
uniform float u_sgWindCellSize;
uniform float u_sgWindColumns;
ivec2 sceneGISWindPixel(ivec3 p) {
    return ivec2(p.x+(p.z%int(u_sgWindColumns))*int(u_sgWindDimensions.x),
                 p.y+(p.z/int(u_sgWindColumns))*int(u_sgWindDimensions.y));
}
bool sceneGISWindInside(vec3 p) {
    vec3 q=(p-u_sgWindMinimum)/u_sgWindCellSize;
    return all(greaterThanEqual(q,vec3(0.0)))&&all(lessThan(q,u_sgWindDimensions));
}
bool sceneGISWindSolid(vec3 p) {
    if(!sceneGISWindInside(p)) return true;
    return texelFetch(u_sgWindSolid,sceneGISWindPixel(ivec3(floor((p-u_sgWindMinimum)/u_sgWindCellSize))),0).r>0.5;
}
// Fluid-weighted trilinear velocity/concentration; zero inside solids or outside the box.
vec4 sceneGISWindSample(vec3 position) {
    if(sceneGISWindSolid(position)) return vec4(0.0);
    vec3 cell=clamp((position-u_sgWindMinimum)/u_sgWindCellSize-0.5,vec3(0.0),u_sgWindDimensions-1.0);
    ivec3 low=ivec3(floor(cell));
    vec3 f=fract(cell);
    vec4 value=vec4(0.0);float total=0.0;
    for(int z=0;z<2;++z) for(int y=0;y<2;++y) for(int x=0;x<2;++x) {
        ivec3 corner=ivec3(x,y,z);
        ivec2 pixel=sceneGISWindPixel(min(low+corner,ivec3(u_sgWindDimensions)-1));
        vec3 blend=mix(1.0-f,f,vec3(corner));
        float weight=blend.x*blend.y*blend.z*(1.0-step(0.5,texelFetch(u_sgWindSolid,pixel,0).r));
        value+=weight*vec4(texelFetch(u_sgWindVelocity,pixel,0).xyz,texelFetch(u_sgWindTracer,pixel,0).r);
        total+=weight;
    }
    return total>0.0?value/total:vec4(0.0);
}
