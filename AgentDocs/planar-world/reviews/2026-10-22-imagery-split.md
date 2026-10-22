# 平面影像分屏技术自审

- Type: review
- Status: approved technically; owner visual acceptance pending
- Author role: Architecture / implementation self-review
- Date: 2026-10-22
- Target: [standalone plan](../plans/2026-10-22-imagery-split.md)
- ADR: [ADR-0005](../../../Documentation/SceneGIS/Decisions/ADR-0005-planar-imagery-runtime-and-composition.md)
- Upstream-owned files: None; SGP: None

## Findings 与处置

| ID    | Severity | Finding                                                           | Owner        | Status / evidence                                                                     |
| ----- | -------- | ----------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------- |
| IS-01 | P2       | 分屏不能 discard 地表片元，否则底色/深度与其他地表贡献出现空洞    | Execution    | fixed：只屏蔽 sample alpha；真实像素与两侧 pickPosition Specs 通过                    |
| IS-02 | P2       | CSS 像素与 drawing-buffer 像素混用会使分屏线错位                  | Execution    | fixed：直接使用原生 czm_splitPosition；DPR=2、resize 与 resolutionScale=0.75 E2E 通过 |
| IS-03 | P2       | 方向变化不得越过 normal-render 发布边界或重建资源                 | Execution    | fixed：现有 persistent slot/uniform 路径，depth replay 与 warm counter Specs/E2E 通过 |
| IS-04 | P3       | requestRenderMode 不会因原生 splitPosition 或已有滤镜通知自动绘制 | Architecture | accepted：沿用既有契约，API/指南要求显式 requestRender；示例拖动与全部控件请求绘制    |

没有未解决的产品正确性 finding；负责人仍可在示例确认交互。没有修改球面实现。
只迁移官方 GlobeFS 的必要比较数学，基线与升级同步条件已记录于 ADR。

## 验证证据

- `gulp build` 成功；`gulp release`（包括两种 Cesium bundle、types 与 docs）成功；
  `npm run tsc` 成功。新 options/property 出现在生成的 engine declarations。
  Release 有既有 TSD-JSDoc warning，命令成功；不编辑或提交生成物。
- Layer / Collection Specs：13/13；Surface / Shader Specs：54/54。
  覆盖三种方向、0/1/非中心位置、透明叠加、调序、partial coverage、depth、快照、
  请求/纹理/程序/命令复用及 remove/destroy。原默认画面与现有 Surface 分支也通过。
- `scenegis-planar-imagery-split.spec.js` dev/release 2/2：真实鼠标拖动、
  request-render、resize、DPR、resolutionScale、倾斜地形、像素与销毁平衡。
  两种构建的截图均生成，已检查 dev 俯视及 release 倾斜图。
- 第一轮新增像素测试误认为原生 splitPosition 默认为 0.5；源码默认实际为 0。
  测试显式设置 0.5 后通过，未更改原生默认值或增加产品补偿。
- 本次文件 ESLint / Prettier、全量 AgentDocs Markdownlint、diff check 与 upstream audit
  通过（current upstream-owned 0，generated status 0）。全量 AgentDocs Prettier
  报告 567 个本次范围外的既有格式问题，未扩散格式化。

## 性能与生命周期

同机 Windows / Chromium 155，CSS 1100×700、DPR=2、resolutionScale=0.75，
56 个可见地表瓦片、两个共享祖先影像。NONE 与启用 split 各连续绘制 30 帧：

| 构建    | NONE CPU median / P95 | split CPU median / P95 |
| ------- | --------------------- | ---------------------- |
| dev     | 1.0 / 2.3 ms          | 0.9 / 1.1 ms           |
| release | 0.8 / 1.6 ms          | 0.8 / 1.2 ms           |

这是同一新实现内开关对照的 CPU 提交时间，非 GPU 完成时间；不据此宣称提速。
确定性证据：始终 56 个地表 command；stable command/program identity；
createdRequests=2、createdTextures=2、createdShaders=1 在整个 sweep 保持，
destroy 后两张 imagery texture 全部释放。每层仅增加一个 float uniform 和比较，
没有新增 pass、sampler、framebuffer 或 shader variants。

原始截图、measurements 与日志保存在忽略的 `Build/Specs/`，不进入版本库。

## 边界与交接

仅为原生语义的竖直影像分屏，不是多相机 viewport。被屏蔽的图层仍参与既有
加载/readiness/texture-unit 预算；Material、矢量和模型不随影像分屏。左右交界采用
Globe 的严格比较，精确等于 split 像素时两层按顺序混合。

2026-10-22 负责人要求在 `scenegis/develop` 形成本地提交检查点；未要求推送。示例入口：
[影像分屏](../../../Test/Planar/影像分屏.html)。负责人视觉验收待定。
