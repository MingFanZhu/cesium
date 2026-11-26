# 模型延迟光照组复用

- Plan type `standalone`
- Status `completed`
- Date `2026-11-26`
- Architecture review `confirmed`
- ADR [0161](../../../Documentation/SceneGIS/Decisions/ADR-0161-unified-opaque-deferred-direction.md#model-lighting-group-reuse)
- [Review](../reviews/2026-11-26-model-lighting-groups.md)

Viewer 在虚拟城市试验区准备第 2049 个 `Model` 光照组时停止渲染。几何 pass 已按像素写入材质值，
同一光照程序和实际光照绑定可用于多个 `Model`。

在 SceneGIS-owned 延迟光照调度中共享普通模型的默认光照组。共享原生 IBL、环境管理器和参考帧的瓦片
可复用所在 tileset 的光照组。模型级非默认绑定与 EDL 保留独立组。预检和材质提交使用同一组查找，
覆盖分类等派生命令。保留代表命令变动时的 Shader 和 uniformMap 配对，并在组不再可见时释放 Shader。

验证超过 2048 个可见模型的实际 GPU 材质提交与光照提交数、像素和资源清理，以及原生瓦片 LOD、
显式模型光照和材质样式回归。保留现有 G-buffer 编码和独立光照组容量。

压力用例验证 2049 个默认物理光照模型、2049 次材质提交和 1 次屏幕光照提交。原生 LOD 测试
验证同一 tileset 中多个瓦片共享 IBL 组，并在瓦片卸载和重载后绑定当前代表模型。
