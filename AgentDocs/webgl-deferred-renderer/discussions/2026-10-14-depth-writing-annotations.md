# Discussion: Depth-writing native annotations

## Metadata

- Type: discussion
- Status: resolved / owner budget accepted
- Author role: architecture
- Created / Updated: 2026-10-14
- Parent: [P4d](../plans/2026-10-14-p4d-opaque-pipeline-consolidation.md)
- Review: [WDR-P4D-07](../reviews/2026-10-14-p4d-entry-audit.md)
- ADR / SGP: ADR-0161 / SGP-0046; further seams follow implementation

## Reproduction and native contract

在扩展材质页为 Entity label 设置 showBackground=true，会触发当前 DeferredLayout
对 blending opaque command 的显式拒绝。LabelCollection.update 在存在背景时把
glyph/background BillboardCollection 设为 BlendOption.TRANSLUCENT。该 native 分支
仍使用 Pass.OPAQUE，开启 ALPHA_BLEND 和 depthMask，以避免其 opaque-ish fragment
在 OIT 中的不良表现。这是原生混色写深度的标注专用语义，不是普通不透明受光表面。

不能直接将 alpha 混入材质附件；它会混合 normal/group 与未受光 albedo。也不能
直接关闭深度写入并改成 OIT，否则改变其对后方透明物的遮挡。保留原生颜色 Shader、
覆盖率、深度测试/写入、命令顺序和拾取；不增加标注 BRDF 或恢复完整前向主通道。

## Original schedule (superseded by alpha separation)

将该已确认家族从主材质采集排除，在专用 per-frustum 颜色尾部按原生命令顺序绘制，
位于水面/透明阶段前，保留远到近的 frustum 合成顺序。同步输出标注深度，场景
恢复、TAA、深度效果与水面使用明确的已合成深度。普通 opaque/MASK 标签仍可走
既有 unlit 材质路径；同步 pick 保留原生执行。不得对所有未知 blending command
做通用 fallback。

原 material depth 必须保留：共享效果已把它作为物理表面，Globe 清深度与分段
标签依赖该身份，水面还需要独立于水后最终深度的折射输入。建议按需增加一张
标注后的 opaque depth：单视锥 R32F，多视锥 RG32F（depth + frustum tag），
标注识别采用明确内部编码。原物理材质数据和水后 final-depth 所有权不变。
标注绘制复用原生硬件 depth-stencil，不新增深度模板附件；每帧复制原 surface depth
一次，标注原提交同时写入新深度，无新增几何重放。水面颜色复用已有颜色目标并在
必要时刷新，不增加颜色纹理。

| Active annotation profile | Additional depth | Bytes/pixel | 1280×800 MiB |
| ------------------------- | ---------------- | ----------: | -----------: |
| single frustum            | R32F             |           4 |      3.90625 |
| multiple frusta           | RG32F            |           8 |       7.8125 |

没有此类标注时释放该纹理；它只分配一份，不按标注数或 frustum 数重复。TAA 和
已有 water final-depth 可以继续复用各自目标，但不能与水面同时采样的折射深度
合并为同一读写纹理。该申请补充此前仅针对材质扩展和水面的批准，不假设其已覆盖
这一新条件。技术 gate 包含背景 alpha、前后遮挡、拾取、单/多视锥、Globe clear、
TAA/water 与 resize/release；最后仍需负责人画面判断。

## Alternatives

重新把此类标注拆成 opaque/MASK 与 OIT 会改变既有深度/混合语义；用户并未授权。
就地覆写原 surface depth 会使剩余消费者的材料身份、Globe skip 和折射输入不一致。
建议保留原生语义并接受上述按需深度目标；预算确认前不加入产品分配或关闭 finding。

## Decision

2026-10-14 负责人接受按需深度纹理，保留原生标注行为。按上述单/多视锥预算实施；
原物理材质深度不覆写。多段纹理的负 frustum tag 标识标注，深度本身保持正数供
既有深度消费者使用；TAA / water final-depth 在标注原提交中同步更新。

实现偏差：R32F / RG32F 与 alpha blend 同次 MRT 写入依赖 EXT_float_blend，原生
标注并无该设备要求。改为每个实际提交标注的视锥段在颜色后执行一次无混色的全屏
硬件深度复制，同时更新已有 TAA / water final-depth；不新增几何提交或纹理，
不扩大设备门槛。物理深度保持独立。费用记录同时列 annotation 与 depth-copy 次数。

## Visual feedback supersedes the depth-writing contract

2026-10-14 负责人拒绝标注验收画面：背景矩形把后绘制的透明蓝板和水面挡掉。
上述资源预算批准继续有效，但保留原生半透明背景 depthMask 的设计被此视觉反馈
取代；实现尚未修正。应将世界空间标注作为独立无光照通道，半透明部分协调透明
合成并测试场景遮挡，不写成完整不透明遮挡面。屏幕 HUD 的最后覆盖是不同语义，
不能借修复默认切换；单独 pass 也不等于必须新增全屏纹理。

当前额外深度 / 全屏复制是否仍需要，须根据修正后的深度消费者重新决定。
相关技术用例与浏览器像素断言需更新，WDR-P4D-07 保持 open，等待重新视觉验收。

## Revised concrete schedule and submission cost

源码确认 BillboardCollection 默认 OPAQUE_AND_TRANSLUCENT 已按 alpha 0.995 将实心与
透明片段分两次提交；带背景 Label 则强制 TRANSLUCENT，实际输出单次混色写深度的
Pass.OPAQUE。原生注释明确说明实心文字直接进入 weighted OIT 会产生不良混色。
因此不建议将完整 glyph/background 单次塞入 OIT，也不建议把它们最后无条件覆盖。

建议在 Scene 创建可见队列和 native derived commands 之前，通过已有 deferred owner
调用窄小的命令准备接缝。仅对该 BillboardCollection 家族派生两个互斥 alpha 命令：
实心片段在独立无光照标注尾部写颜色与深度；透明片段不写深度，加入现有透明队列，
共用 OIT 或调用方已选择的排序透明。既有 OPAQUE_AND_TRANSLUCENT 命令直接复用，
不再重复拆分。pick / depth picking 保留原生命令。SceneGIS-owned helper 管理派生缓存；
上游接缝复用 Scene.js / SGP-0046，不复制原生 Billboard / Label 实现。

每个旧单次混色批次由 1 次变为 2 次 alpha 互斥提交；当前验收页的 glyph/background
两批由 2 次变 4 次。普通物理几何不增加提交；这不是材质采集或 BRDF 重放。
既有拆分标注不增加次数。新增纹理为 0；已批准的条件标注深度预算仍作为上限，
只服务真正实心覆盖的跨视锥恢复 / TAA / water 消费，半透明背景不得污染该深度。

状态：待负责人确认提交成本变化。理由是此前获批方案承诺不增加标注几何提交；
此次正确的 alpha 分离改变该成本，不能仅以原生默认做法为由视为已批准。
确认前可补充失败像素回归，不启用新的产品命令拆分。

2026-10-14 负责人确认接受上述实心 / 透明拆分及最多两次提交。实现与回归继续，
不重复申请该提交成本；P4d 与本增量视觉 gate 仍未关闭。

## Water refraction boundary after alpha separation

拆分后，两个新增像素回归已通过，原矩形缺口消失。浏览器将水面移到标注前方，
发现只剩零散文字实心像素；显式 TAA.reset 后仍可复现。原因是现有 water 仅保存
不透明折射输入，专用标注实心颜色刷新进入该输入，半透明边缘则在水后 OIT 中
被水面深度拒绝。不能把字体部分消失称为完整水下标注支持。

建议语义：Label / Billboard 是独立标注层，不进入物理水面折射输入。保留场景深度
测试，前方水面完整遮挡标注；水面在后方时，半透明背景仍可透出完整水面。
对应实现是移除 refreshWater 及其借用 framebuffer / fullscreen color copy / mipmap
刷新；water 继续采样原物理表面 color/depth。标注实心深度仍服务遮挡恢复与 TAA。
不新增设备或纹理预算，也不更改物理物体的水面折射。

另一语义是保留完整水下标注折射。此时必须让标注透明层参与水前折射合成并区分
水前 / 水后覆盖，不能单靠已有实心深度和一次尾部 OIT；需要进一步设计与预算核对。
2026-10-14 负责人选择标注层不参与水面折射。已移除标注输入刷新，物理几何折射保持不变；12 项定向 GPU 用例与独立 E2E 通过，负责人随后在页面确认画面符合预期。此增量视觉 gate 通过，P4d 仍 active / 未提交。
