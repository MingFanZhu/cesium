const features = [
  ["PRIMITIVE_TYPE_POINTS", ["pointOffset.x", "pointOffset.y"]],
  ["USE_SPECULAR", ["specularWeight"]],
  [
    "USE_CLEARCOAT",
    [
      "clearcoatFactor",
      "clearcoatRoughness",
      "clearcoatNormal.x",
      "clearcoatNormal.y",
      "clearcoatNormal.z",
    ],
  ],
  [
    "USE_ANISOTROPY",
    [
      "anisotropicT.x",
      "anisotropicT.y",
      "anisotropicT.z",
      "anisotropicB.x",
      "anisotropicB.y",
      "anisotropicB.z",
      "anisotropyStrength",
    ],
  ],
];

function layout(defines, hasStyleTarget = false) {
  const selected = features.filter(([name]) => defines.has(name));
  const fields = selected.flatMap(([name, fields]) =>
    fields.map((field) => ({ name, field })),
  );
  const outline = defines.has("HAS_PRIMITIVE_OUTLINE");
  const outlineInStyle = outline && hasStyleTarget;
  if (outline && !outlineInStyle) {
    fields.push({ name: "HAS_PRIMITIVE_OUTLINE", field: "outline" });
  }
  return {
    key: `${selected.map(([name]) => name).join("_")}_${outline}_${outlineInStyle}`,
    outlineInStyle,
    fields,
    count: Math.ceil(fields.length / 4),
  };
}

function component(index) {
  return `sceneGISExtension${Math.floor(index / 4)}.${"xyzw"[index % 4]}`;
}

function captureSource(layout, location) {
  const lines = [];
  for (let i = 0; i < layout.count; ++i) {
    lines.push(`vec4 sceneGISExtension${i} = vec4(0.0);`);
    if (location !== undefined && location + i !== 0) {
      lines.push(
        `layout(location = ${location + i}) out vec4 sceneGISExtensionOutput${i};`,
      );
    }
  }
  lines.push(
    "void sceneGISRecordExtensions(czm_modelMaterial material, vec3 positionEC) {",
  );
  if (layout.fields.some(({ field }) => field.startsWith("pointOffset."))) {
    lines.push(
      "#ifdef PRIMITIVE_TYPE_POINTS",
      "vec4 pointClip = czm_projection * vec4(positionEC, 1.0);",
      "vec2 pointOffset = gl_FragCoord.xy - (pointClip.xy / pointClip.w * 0.5 + 0.5) * czm_viewport.zw - czm_viewport.xy;",
      "#endif",
    );
  }
  layout.fields.forEach(({ name, field }, i) => {
    if (field !== "outline") {
      lines.push(
        `#ifdef ${name}`,
        `${component(i)} = ${field.startsWith("pointOffset.") ? `pointOffset.${field.slice(-1)}` : `material.${field}`};`,
        "#endif",
      );
    }
  });
  lines.push("}");
  if (location !== undefined) {
    lines.push("void sceneGISWriteExtensions() {");
    const outlineIndex = layout.fields.findIndex(
      ({ field }) => field === "outline",
    );
    if (outlineIndex >= 0) {
      lines.push(
        "#ifdef HAS_PRIMITIVE_OUTLINE",
        `${component(outlineIndex)} = sceneGISDeferredOutlineValue;`,
        "#endif",
      );
    }
    for (let i = 0; i < layout.count; ++i) {
      const output =
        location + i === 0 ? "out_FragColor" : `sceneGISExtensionOutput${i}`;
      lines.push(`${output} = sceneGISExtension${i};`);
    }
    lines.push("}");
  }
  return lines.join("\n");
}

function lightingSource(layout) {
  const lines = [];
  if (layout.count) {
    lines.push("uniform highp sampler2DArray u_sceneGISExtensions;");
  }
  lines.push("float sceneGISDeferredOutline = 0.0; vec2 sceneGISPointOffset;");
  lines.push(
    "void sceneGISRestoreExtensions(inout czm_modelMaterial material, ivec2 pixel) {",
  );
  for (let i = 0; i < layout.count; ++i) {
    lines.push(
      `vec4 sceneGISExtension${i} = texelFetch(u_sceneGISExtensions, ivec3(pixel, ${i}), 0);`,
    );
  }
  layout.fields.forEach(({ name, field }, i) => {
    const target =
      field === "outline"
        ? "sceneGISDeferredOutline"
        : field.startsWith("pointOffset.")
          ? `sceneGISPointOffset.${field.slice(-1)}`
          : `material.${field}`;
    lines.push(`#ifdef ${name}`, `${target} = ${component(i)};`, "#endif");
  });
  lines.push("}");
  return lines.join("\n");
}

function copySource(layout, location) {
  const lines = ["uniform highp sampler2DArray u_sceneGISExtensions;"];
  for (let i = 0; i < layout.count; ++i) {
    if (location + i !== 0) {
      lines.push(
        `layout(location = ${location + i}) out vec4 sceneGISExtensionOutput${i};`,
      );
    }
  }
  lines.push("void sceneGISCopyExtensions(ivec2 pixel) {");
  for (let i = 0; i < layout.count; ++i) {
    const output =
      location + i === 0 ? "out_FragColor" : `sceneGISExtensionOutput${i}`;
    lines.push(
      `${output} = texelFetch(u_sceneGISExtensions, ivec3(pixel, ${i}), 0);`,
    );
  }
  lines.push("}");
  return lines.join("\n");
}

/** Native extension fields retain the material buffer's half-float precision. @private */
const _SceneGISDeferredMaterialExtensions = {
  layout,
  captureSource,
  lightingSource,
  copySource,
};
export default _SceneGISDeferredMaterialExtensions;
