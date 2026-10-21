# 平面材质扩展

- Plan type: `extension`
- Status: `active`
- Owner role: architecture
- Architecture review: `confirmed`（当前任务源码核对）
- Created / Updated: `2026-10-21`
- ADR: [ADR-0178](../../../Documentation/SceneGIS/Decisions/ADR-0178-planar-materials.md)
- SGP: None。

## Objective and boundaries

普通面、贴地面及其 Entity 入口支持 Cesium Material / Fabric：图片、程序纹理与动态 uniform。
继续使用当前世界米制 XYZ；原生 Primitive、Material 和 BatchTable 承担已有职责。
保留既有逐实例颜色 API、合批、独立显隐与拾取、透明覆盖顺序。
不复制原生渲染器，不修改默认球面材质，不新增 MVT 或 Model CustomShader 支持。
M1–M3 聚焦面材质。项目负责人在 M4 明确扩大范围至普通和贴地折线 Fabric。

## Phase roadmap

| Phase                                       | Objective                            | Dependencies            | Exit gate                                          | Status              |
| ------------------------------------------- | ------------------------------------ | ----------------------- | -------------------------------------------------- | ------------------- |
| [M1](2026-10-21-m1-ordinary-materials.md)   | 普通面 MaterialAppearance 与几何属性 | 既有 Primitive/deferred | GPU、几何、生命周期、build/types、review、独立提交 | completed           |
| [M2](2026-10-21-m2-ground-materials.md)     | 贴地面 Fabric、深度坐标与有序合批    | M1 checkpoint           | 重叠/孔洞/透明/pick/低视角、预算与独立提交         | completed           |
| [M3](2026-10-21-m3-entity-qualification.md) | Entity MaterialProperty、示例与交付  | M2 checkpoint           | 动态更新/销毁、综合画面、完整构建类型、review      | completed           |
| [M4](2026-10-21-m4-polyline-materials.md)   | 普通/贴地折线 Fabric 与 Entity 属性  | M1–M3 checkpoint        | dev/release、UV/透明/pick、生命周期、review        | technical completed |

## Acceptance and risks

M4 [平面折线材质](2026-10-21-m4-polyline-materials.md) 为当前技术完成、待视觉验收阶段，依赖
已合并的 M1–M3。补齐连续 UV、原生 Arrow/Dash、动态 MaterialProperty 与所有权，
完成 dev/release Shader、GPU/Viewer 验证和独立提交后退出。

每阶段只细化当前源码事实，完成后先提交再进入下一阶段。
颜色快路径保持原几何/资源成本；材质按兼容 Appearance 分批，不承诺不同材质共用 draw。
验证真实像素、属性更新、pick、销毁及 warm VA/program identity，记录构建和命令成本。
自动化技术证据与最终负责人视觉验收分别记录；任意外层 shader 不扩大为支持承诺。

技术阶段 M1–M4 均完成并建立独立检查点；整体视觉验收由项目负责人在综合示例确认。
