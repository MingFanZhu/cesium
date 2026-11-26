# 按实际光照绑定合并延迟组

- Plan type `standalone`
- Status `completed`
- Date `2026-11-26`
- Architecture review `confirmed`
- [前一增量](2026-11-26-model-lighting-groups.md)
- [ADR-0161](../../../Documentation/SceneGIS/Decisions/ADR-0161-unified-opaque-deferred-direction.md#model-lighting-group-reuse)
- SGP `SGP-0015`
- [Review](../reviews/2026-11-26-lighting-binding-equivalence.md)

以延迟光照 Shader 变体和本帧实际使用的模型级绑定分组。比较光色、色彩混合、轮廓、IBL 参数和
参考帧的值，反射纹理和 EDL 深度按资源身份区分。同一 tileset 内外使用同一规则。保留场景级物理
天空与原生 IBL 的优先级和有效坐标系。Model pipeline 与组选择共用 IBL 来源解析。

逐帧查找支持同一个 Model 的多个变体，以及几何命令的分类和对数深度派生。缓存 Shader 时避免把
相机变换和连续 uniform 值用作缓存生命周期键。异步 IBL 改变静态绑定时更新代表 Shader 和 uniformMap。

验证跨 tileset 画面和光照提交数，区分数值不同的光照绑定，覆盖源替换、相机移动、瓦片卸载和
已通过的 2049 模型压力用例。G-buffer 编码保持现有协议，逐像素绑定索引在独立增量处理。

同一份原生 3D Tiles 内容拆为五个 tileset 后保持一次屏幕光照，HDR 像素在 0.002 误差内一致。
独立 IBL 强度、参考帧和反射纹理均有 GPU 验证。
