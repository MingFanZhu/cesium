void sceneGISWeatherPhong(inout czm_material material, vec3 positionEC)
{
    vec2 cover = sceneGISWeatherCoverage(positionEC, material.normal);
    material.diffuse = sceneGISWeatherAlbedo(material.diffuse, cover);
    material.specular = mix(max(material.specular, 0.12 * cover.x), 0.02, cover.y);
    material.shininess = mix(material.shininess, max(material.shininess, 64.0), cover.x);
    material.shininess = mix(material.shininess, 4.0, cover.y);
    material.normal = sceneGISWeatherRippleNormal(positionEC, material.normal, material.normal, cover.x);
}
