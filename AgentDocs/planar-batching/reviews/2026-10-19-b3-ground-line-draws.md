# B3 贴地线 draw call 合批 review

- Type: architecture / code review
- Status: approved
- Owner role: architecture（当前任务自审，未启用独立 Agent）
- Created / Updated: 2026-10-19
- Target: [B3 plan](../plans/2026-10-19-b3-ground-line-draws.md)
- ADR: [ADR-0168](../../../Documentation/SceneGIS/Decisions/ADR-0168-planar-static-batching.md)
- SGP: None

## 源码结论与修正

原生 `GroundPolylinePrimitive.createCommands` 以 `primitive._va.length` 确定 command 数。
Terrain pass 的 `getRenderState(false)` 不启用 stencil；反向绕序的 segment volume 剔除一侧面，避免重复着色。
`PolylineShadowVolumeFS` 从 `czm_globeDepthTexture` 重建地表位置，按侧面距离、width、起止面裁剪；
per-instance color 和 pick ID 不要求逐对象命令。额外的 3D Tiles、frustum、2D/morph 分支不能理解为每条线各两次 draw。

B2 对 line 保留逐对象 stencil/color 是平面既有实现的限制，未达到原生 line 合批目标。
B3 替换唯一 line specialization；area 保留原分类路径。公开实例数组无需变动，不提供新开关或 fallback。

## Findings

| ID    | Severity | Status | Evidence / disposition                                                                                                                                                                         |
| ----- | -------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B3-R1 | high     | fixed  | 原生 ground line 使用 per-fragment footprint，B2 错用逐实例 classification 组织。现在 line 每 VA 一条命令；1024 对象 render/pick 各一条，独立 ID/color/show 通过。                             |
| B3-R2 | high     | fixed  | 只合并命令无法保留不同色、width 和透明交叉。新增稳定起止切面、相对端点属性，VS 保守扩张，FS 按真实地表位置求宽度和裁剪。4/12 px 线宽与透明交叉对照通过。                                       |
| B3-R3 | high     | fixed  | 新算法必须消费当前 surface depth，不能使用 stale/fallback depth。Scene 已在 GLOBE 后复制深度；真实坡面、normal/pick、linear/log、85°/45°/10° 视角、端点/天空 discard 通过，无新 depth target。 |
| B3-R4 | medium   | fixed  | 新路径依赖 depth texture。isSupported 明示全能力条件，line mutation 前拒绝缺少该能力的 Context；不再生成 line pickOffsets 或受 polygon 的 uint guard 限制。                                    |

## 验证

- Ground 开发/release 各 23/23，DataSources 102/102。
- 1024 条线保持一个 native Primitive/VA，color command=1、stencil=0、pick=1；改色/隐藏后 warm 资源 identity 保持。
- 不同 origin、独立颜色/width/ID、透明交叉、折点、端点、天空及 log depth 通过。
- 实际 heightmap 坡面加载后 line VA 保持，按真实地表位置拾取正确；已有 provider attach/replace/detach 测试继续通过。
- Browser Chrome Headless 155 / Windows 10，1280×900、DPR 1，本地 1024-line 示例截图已检查。
  业务对象 532 点击改白、隐藏后不可拾取，页面错误为 0。
- 新算法下同一数据、同一浏览器，逐对象与合批：Primitive/VA 1024 → 1，color command 1024 → 1，stencil 均 0。
  20 warm frames CPU 提交 median/P95 从 7.0/14.6 ms 降到 0.4/0.7 ms；首次构建与提交 173.7 → 18.9 ms。
  B2 同一示例的旧合批为 2048 commands、6.7/9.2 ms；此值是上一阶段记录，不伪称同一次运行 A/B。
- dev/release build、build-ts、tsc、ESLint 通过；实际 engine tarball 的 VS/FS generated module、GLSL source、
  public batch 构造/声明及销毁检查通过。
- AgentDocs 全量 markdownlint 通过；全量 Prettier 仍报 452 个既有文件，本扩展 scoped 格式通过。

## 升级与风险

- 依赖已有 globe-depth copy 和当前 frustum 的 linear/log reconstruction；已补充升级检查与源算法出处。
- Pixel width 与重叠遵循按 segment/instance 的原生绘制方式；没有新增 CPU terrain 查询、request 或 renderer。
- 每 VA/terrain pass 一条业务命令，不包含场景共用 depth copy/resolve；VA 拆分、多 frustum 仍可能增加实际 draw 数。
- 普通合批与 polygon stencil 规则保持；原生 Entity 仍逐对象，但单条贴地线也使用新 Shader。
- upstream-owned files=0，SGP=None；不提交任何生成物。
