layout(location = SCENEGIS_AO_LOCATION) out vec4 sceneGISIndirectOutput;
vec3 sceneGISIndirect = vec3(0.0);

void sceneGISRecordIndirect(vec3 value)
{
    sceneGISIndirect += value;
}

void sceneGISScaleIndirect(vec3 value)
{
    sceneGISIndirect *= value;
}

void sceneGISWriteIndirect()
{
    sceneGISIndirectOutput = vec4(sceneGISIndirect, 1.0);
}
