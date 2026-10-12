# Extension Plan: WebGL 延迟管线探索

## Metadata

- Plan type: `extension`
- Status: `active`
- Owner role: `architecture`
- Architecture review: `confirmed`，仅探索范围与阶段边界
- Architecture reviewer: Current task
- Created / Updated: `2026-10-13`
- Related discussion: [接入审计](../discussions/2026-10-13-command-integration-and-reuse.md)
- Related review: [P0](../reviews/2026-10-13-p0-isolation-and-audit.md)
- ADR / SGP: 尚无新增

## Objective

在当前 WebGL 街道画质成果之上，验证统一 G-buffer 与延迟光照能否改善多光源和
屏幕空间效果的复用、画质及成本，并依据证据决定是否替换现有不透明前向主通道。
“用了延迟”不是验收标准；必须有材质正确性、兼容性和同条件成本证据。

## Non-goals

- 不移植整个 WebGPU 后端或重新设计模型加载、相机和同步拾取 API。
- 不同时推进世界空间 GI、Lumen 对等或路径追踪。
- 不承诺第一阶段覆盖所有 Cesium DrawCommand、任意 CustomShader 和全部 GIS 组合。
- 不要求维护完整的旧前向运行模式，也不提前删除已有透明、阴影、拾取等通道。

## Stable exploration boundaries

1. 使用独立分支和工作目录；原已验收 WebGL 分支作为稳定对照。
2. 默认复用现有 API、资源、几何准备、LOD、材质解析和 GPU 资源所有权；先按材质家族
   适配，再决定统一调度缝隙，禁止在底层 draw 入口猜测任意 Shader 的材质语义。
3. 可以采用不透明/MASK 延迟、透明和特殊内容配套前向的单一混合管线。
   探索中的调试选择不自动形成永久公开选项。
4. 新实现进入 SceneGIS-owned 区域。长期管线决定形成 ADR；上游最小接点逐项登记 SGP。
5. 任何旧能力删除、设备门槛提高、AA 语义改变或 API 改变均属重大选择；获得证据后确认。
   已有 ADR 中要求前向材质求值的范围，在具体替换前正式修订，不能只靠本计划覆盖。

## Source and baseline facts

- 基线 `5688deaeeb` 已含街道曝光、白平衡预设与夜间泛光验收成果。
- 现有共享 MRT 记录的是已求值的光照响应，不是通用材质 G-buffer；具备资源和合成经验，
  但受单视锥、分类、后光照 Shader 分支及附件数量限制。
- SSR 已有分层深度、半分辨率和历史重建；SSIL 已有一跳屏幕估计。
  后继优化必须对照现有实现，不能把已有能力重新计为新增收益。
- WebGPU 已有独立延迟主通道，但内容覆盖受限且完整街区 GI 视觉 gate 未通过。
  它提供参考，不构成本分支兼容性或性能依据。

## Phase roadmap

| Phase | Objective                   | Dependencies / entry gate                      | Exit gate                                                      | Status    | Phase plan                                 |
| ----- | --------------------------- | ---------------------------------------------- | -------------------------------------------------------------- | --------- | ------------------------------------------ |
| P0    | 隔离与接入范围审计          | 已提交 WebGL 基线                              | 分支、源码事实、复用/风险清单、文档检查与独立提交              | completed | [P0](2026-10-13-p0-isolation-and-audit.md) |
| P1    | 统一表面数据的有限 GPU 原型 | P0 checkpoint；依据源码细化材质/深度与附件预算 | 已限定材质正确性、覆盖率、精度、资源生命周期和 MSAA 取舍证据   | planned   | 未创建                                     |
| P2    | 不透明延迟光照与混合合成    | P1 契约通过；必要重大选择已确认                | 同条件直接光/环境光/阴影/透明/曝光正确性和街道对照             | planned   | 未创建                                     |
| P3    | 多光源与共享屏幕空间效果    | P2 已验收                                      | 分项验证光源剔除、AO/SSR/SSIL 数据复用收益及稳定性             | planned   | 未创建                                     |
| P4    | GIS 内容覆盖与替换决策      | P3 有明确收益；按缺口安排子阶段                | 兼容矩阵、回归、实际设备成本、视觉验收，明确迁入主线或保留实验 | planned   | 未创建                                     |

后继阶段仅记录目标，不提前冻结 G-buffer 编码、灯光分块方式、Shader 文件或接口。
默认顺序推进，每阶段独立提交后才能激活下一阶段。

## Cross-phase validation

- 正确性：材质响应、MASK 孔洞、光照分量、几何阴影只衰减直接光；曝光独立对照。
- 合成与 GIS：前后遮挡、同步拾取、日志深度、多视锥、Globe/Planar、分类、裁剪和透明，
  按阶段明确已支持/待验证/不支持，不能把小场景通过报告成全面替换。
- 生命周期：创建、resize、场景销毁、模型卸载与 Shader 变体失效；借用资源不得销毁。
- 成本：固定资产、相机、Clock、分辨率、采样数和效果质量，报告 GPU 分项、帧耗时、
  几何提交数及可核算附件显存；光源数量和覆盖面积分别变化，包含少光源场景。
- 画质：街道日/夜、金属/粗糙表面、树叶、轮廓和移动；数值不能替代负责人视觉判断。
- 仅运行与风险有关的 Specs/E2E；管线和交付变化时补完整 build/release/types 与补丁审计。

## Global risks and acceptance

主要风险是材质信息不足、clearcoat/自定义材质、MSAA 材质边缘混合、附件带宽、
多视锥合成以及现有派生阴影/拾取命令的组合。延迟本身不解决屏幕外缺失、运动历史、
多光源剔除或多灯阴影开销。达到兼容矩阵和同质量收益证据后，才能提出主线替换；
无收益的候选优化不因已实现就强行保留。

## Progress and handoff

P0 完成；P1 尚未激活。当前交付为隔离分支与探索记录，没有运行时代码变化。
