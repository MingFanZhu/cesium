# 平面影像分屏

- Type: standalone plan
- Status: completed technically; owner visual acceptance pending
- Author roles: Architecture / Execution
- Date: 2026-10-22
- Architecture review: confirmed
- Parent: [Planar World](../README.md)（原 extension completed）
- ADR: [ADR-0005](../../../Documentation/SceneGIS/Decisions/ADR-0005-planar-imagery-runtime-and-composition.md)
- Review: [技术自审](../reviews/2026-10-22-imagery-split.md)；open discussion: None
- Upstream-owned files / SGP: None

## 源码事实与范围

当前 Globe 的 ImageryLayer.splitDirection 使用原生 SplitDirection，GlobeFS 根据
gl_FragCoord.x 与 czm_splitPosition 将被排除侧的 sample alpha 置零。UniformState
将 scene.splitPosition 转为 drawingBufferWidth 像素坐标，逻辑不依赖 Globe。
Planar layer 尚无该属性，Surface 在 normal render 发布持久 imagery slots；
SurfaceShader 动态展开每层的采样、滤镜与混合，最终进入同一个地表 command。

补齐可构造、可更新的 splitDirection，默认 NONE，仅接受 LEFT/NONE/RIGHT；
继续使用 scene.splitPosition。分屏只控制影像贡献，不裁掉地形、不影响矢量或其他对象。
不改变 SSE、请求、readiness、纹理预算、gamma 批次规则或 shader key。

## 实现步骤

1. 扩展 owned layer 参数及校验，复用 change notification。
2. 在已有 slots/uniform map 发布方向值，depth replay 保持上一 normal 快照。
3. 在影像合成中按 Globe 同样的严格比较屏蔽 sample alpha；不使用 discard。
4. 更新 ADR-0005 与使用指南，提供本地确定性示例、可拖动分屏线及图层控制。

## 验证与退出

- Layer Specs：默认、构造、setter/no-op、invalid atomicity。
- Surface Specs：真实像素 LEFT/RIGHT/NONE、0/1/中间位置、alpha/层序/coverage，
  地形深度和 normal/depth 发布；warm direction/position 更新无请求/纹理/command/shader 增量。
- 浏览器：真实拖动、resize 与非 1 resolution scale，截图检查；记录 warm 开销及资源收敛。
- 现有 build 和 release 两种产物、buildTs/tsc；只运行相关 Specs、静态检查与 ownership audit。
- 示例供负责人视觉验收；完成后记录 review 与剩余边界，不自动提交或推送。

## 风险

仅支持原生竖直分屏；scene.splitPosition 使用原生语义，requestRenderMode 下调用方
修改方向或位置后须 requestRender。Layer setter 复用现有 change notification；
该通知本身不请求绘制，与现有滤镜一致。
每层增加一个 float uniform 和简单比较，不增加纹理、离屏 pass 或 shader variants。

## 执行结果

已完成 layer、slot、shader 接入和本地示例。67 项相关 Specs、两项 dev/release
浏览器 E2E、build/release/types/tsc 通过。分屏连续修改无持久资源增量，保持
每瓦片一个地表 command；CPU timing 与截图检查见 review。没有修改上游或生成物。
2026-10-22 负责人要求形成本地提交检查点，未要求推送；视觉验收状态另记。
