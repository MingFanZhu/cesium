void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material)
{
    // Derivatives use the deformed positions and include boundary slope triangles.
    vec3 p = fsInput.attributes.positionEC;
    vec3 n = cross(dFdx(p), dFdy(p));
    float lengthSquared = dot(n, n);
    if (v_sgFlattened > 0.0 && lengthSquared > 0.0) {
        n *= inversesqrt(lengthSquared);
        material.normalEC = dot(n, material.normalEC) < 0.0 ? -n : n;
    }
}
