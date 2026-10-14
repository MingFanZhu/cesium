# WebGL 延迟管线中的 CustomShader

本说明适用于 WebGL2 / SCENE3D、单采样的 SceneGIS 延迟入口。
使用原生 `Model.customShader` 或 `Cesium3DTileset.customShader`，无需 SceneGIS
专用开关。接口、输入属性及所有权仍遵循
[Cesium CustomShader](https://cesium.com/learn/cesiumjs/ref-doc/CustomShader.html)
和仓库的 [原生指南](../CustomShaderGuide/README.md)。

## 材质与顶点

- `MODIFY_MATERIAL` 在原材质求值后修改 `czm_modelMaterial`；
  `REPLACE_MATERIAL` 由回调提供材质，两者都在延迟材质捕获之前执行。
  REPLACE 替换的是材质求值，并不绕过后续光照或透明调度。
- 不透明 / MASK 内容保留一次几何材质提交，再在屏幕阶段计算光照。
  `LightingModel.PBR` 接收光照；`UNLIT` 保留不受光材质语义。
- `vertexMain`、varyings、`fragmentMain`、uniforms 和
  `TextureUniform` 沿用原生管线。已验证顶点位移与 discard 对颜色、对象拾取
  和位置拾取一致，以及 Model / Tileset 动态替换和要素 ID 输入。
- 材质字段、属性可用性及与其他原生功能组合的约束仍以原生接口为准。
  这不构成任意外层 `main`、直接 MRT 输出或自定义 framebuffer 的接入协议。

## 透明模式

普通透明内容继续前向计算光照，再进入现有 OIT 或原生排序透明调度。
它不会写入不透明 G-buffer，也不会重新运行一套完整不透明前向管线。

`translucencyMode` 决定通道，`material.alpha` 决定片元覆盖：

| 模式          | 路由                                   |
| ------------- | -------------------------------------- |
| `INHERIT`     | 保留原模型材质的 OPAQUE / MASK / BLEND |
| `OPAQUE`      | 强制不透明；仍执行回调中的 discard     |
| `TRANSLUCENT` | 强制透明前向；使用回调输出的 alpha     |

仅对 OPAQUE 模型写 `material.alpha = 0.5` 不会自动切换通道。需显式选择
`TRANSLUCENT`，或者继承原有 BLEND 材质。例如：

```js
const customShader = new Cesium.CustomShader({
  lightingModel: Cesium.LightingModel.PBR,
  translucencyMode: Cesium.CustomShaderTranslucencyMode.TRANSLUCENT,
  uniforms: {
    u_opacity: { type: Cesium.UniformType.FLOAT, value: 0.5 },
  },
  fragmentShaderText: `
    void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
      material.diffuse = vec3(0.2, 0.6, 0.9);
      material.roughness = 0.5;
      material.alpha = u_opacity;
    }
  `,
});
model.customShader = customShader;
customShader.setUniform("u_opacity", 0.3);
```

Cesium 的 OIT 使用 [Weighted Blended OIT](https://www.jcgt.org/published/0002/02/09/)：
在完成前向受光之后，以近似的加权合成避免依赖逐对象绘制顺序。
它不是精确的逐层深度排序，也不自动解决多层折射。
本阶段 GPU 资格直接验证 OIT；未新增或改写原生排序透明算法。

矢量地图的“地下 / 背面跨透明排序”限制是另一项内容语义：地图当前贴附最近地表，
没有为每个地下或背面地表生成独立覆盖。切换 OIT 无法凭空补出这些表面。
这不限制普通透明 Model 的前向绘制和混合。

## 所有权与验证

更换或移除 Model / Tileset 上的 CustomShader 不转移其所有权。调用者应在所有使用者
解除引用后调用 `customShader.destroy()`；Shader 内部管理其 TextureUniform 纹理，
动态替换纹理时释放旧资源。

本轮无需修改运行时、公共 API 或资源预算；新增资格证据见
[P4f review](../../AgentDocs/webgl-deferred-renderer/reviews/2026-10-15-p4f-custom-shader.md)。
[验收页](../../Test/Rendering/延迟CustomShader验收.html) 提供材质模式、受光、纹理、
顶点位移、孔洞、透明度、遮挡和要素拾取控件。
