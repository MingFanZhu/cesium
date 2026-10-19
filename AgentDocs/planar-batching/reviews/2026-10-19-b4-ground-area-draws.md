# B4 贴地面 draw call 合批 review

- Type: architecture / code review
- Status: approved
- Owner role: architecture（当前任务自审，未启用独立 Agent）
- Created / Updated: 2026-10-19
- Target: [B4 plan](../plans/2026-10-19-b4-ground-area-draws.md)
- ADR: [ADR-0168](../../../Documentation/SceneGIS/Decisions/ADR-0168-planar-static-batching.md)
- SGP: None

## 源码对照与实现

GroundPrimitive 在支持 depth texture 时构造实例 extents，ClassificationPrimitive.createColorCommands
及 extent picking 每 VA 使用两条命令。ShadowVolumeAppearanceFS 根据地表位置裁剪实例范围；
不带 extent 的兼容 picking 才使用逐对象 offset。原有 planar area 缺少这一片元归属判定。

新增 XY extent 属性、eye-space plane 与 color/pick FS 裁剪，stencil 保持完整闭体轮廓。
沿用原生 Primitive/BatchTable/offsets 与已有 globe-depth copy，无新 Renderer、texture、pass 或上游修改。
连续范围按 VA 与空间相交关系组织，保持原始覆盖/透明顺序；保守 bbox 分组并不承诺任意重叠面只需两条 draw。

## Findings

| ID    | Severity | Status | Evidence / disposition                                                                                                                                   |
| ----- | -------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B4-R1 | high     | fixed  | 直接合并 stencil/color 会在斜视角发生实例归属错误。color/pick 使用 depth-reconstructed extent；真实坡面、宽 envelope、85°/45°/10° 和 linear/log 均正确。 |
| B4-R2 | high     | fixed  | 无条件 union 破坏透明叠加与覆盖顺序。rbush 按输入顺序检测 extent 内部相交；透明重叠对照独立 Primitive 相同，32 层同色合并仍受计数容量限制。              |
| B4-R3 | high     | fixed  | 既有 hole wall 绕序与 outer wall 同向；四种输入绕序在单对象斜视角全部复现误填/误拾取。按 ring role 翻转内壁后，单对象及合批孔洞均通过。                  |
| B4-R4 | medium   | fixed  | 新 area FS 同样依赖 depth texture。缺失能力时两种 geometry 均在 candidate/GPU mutation 前拒绝；provider 变化保持共享资源 identity。                      |

## 验证

- Ground 开发 / release 各 27/27；DataSources 102/102。
- 1024 个独立异色透明面：一个 Primitive/VA，render 与 pick 各一条 stencil 和一条 fill。
  改色、显隐、业务 ID、warm command/VA 与销毁通过。
- 既有 overlap、同色 32 层计数、8192 实例 uint-index、provider attach/replace/detach、candidate failure 与 ground line 回归通过。
- Browser Chrome Headless 155 / Windows 10，1280×900、DPR 1，1024 个异色面截图已检查；
  点击业务对象 532 改白、隔列隐藏后不可拾取，页面错误为 0。
- 同一次浏览器运行、相同数据，逐对象到合批：Primitive/VA 1024 → 1，stencil/fill 2048 → 2。
  20 warm frames CPU 提交 median/P95 9.2/13.0 → 0.5/1.4 ms，首次构建与提交 135.3 → 17.7 ms。
  这是本机 CPU 提交数据，不是 GPU 完成时间或跨设备 FPS 承诺。
- Dev/release build、build-ts/tsc、ESLint 通过；真实 engine tarball 的构造/声明、area/line 生成 Shader、GLSL source 和销毁通过。
- AgentDocs 全量 markdownlint 通过；全量 Prettier 仍有 452 个既有文件，本扩展 scoped 格式检查通过。

## 剩余边界

- 完全重叠的异色/透明面仍按顺序逐对象绘制；包围范围相交但实际凹轮廓不交也可能额外分组。
- 每空间范围、VA、terrain pass 一对命令；多 frustum 与场景共用 depth copy/resolve 会增加实际 draw。
- 同步构建、整批剔除/拓扑替换及不自动合批 Entity 的既有边界不变。
- 源算法及 depth-copy/pick/stencil 升级检查已记录；无尚未处置的正确性 finding。
- upstream-owned files=0，SGP=None；生成物不提交。
