# 物理大气夜晚星空

- Type: standalone plan; status: image approach superseded by [程序星空](2026-09-30-procedural-stars.md); original implementation and verification retained below
- Owner: 当前 Agent（实现与架构自审）；date: 2026-09-30
- Parent: [extension](2026-08-14-atmosphere-clouds-effects-extension.md)
- ADR: [ADR-0107](../../../Documentation/SceneGIS/Decisions/ADR-0107-atmosphere-stars.md)
- Upstream-owned files / SGP delta: none; consume existing SGP-0008 only

## 源码事实与设计

高级环境禁止原生 SkyBox 与其同时启用，现有 background shader 只有散射和太阳。
复用 Cesium 自带六面 Tycho 星图，在已有背景命令中线性合成，进入高度雾和后续云合成之前。
新增 showStars / starIntensity；Globe 使用 Clock 的 TEME 旋转，Planar 天文模式使用显式
originLongitude / originLatitude，手动模式采用固定世界方向。不得从 CRS 推断位置。

星图进入既有 generation 的 CPU 异步加载和原子 GPU 发布，随 pipeline 销毁；禁用控制器不请求。
启用后保持星图常驻，使昼夜与星空开关不触发 LUT 重建。新增一个 cubemap，无额外 pass。
以天文暮光淡出和已有视线透射处理昼夜/地平线；Planar 必须显式遮掉朝向地面的无限背景。

## 实施与验收

1. 添加公共属性、资源加载、方向变换、背景 shader 合成和英文 JSDoc。
2. 添加双世界独立夜空示例，保留时间、亮度、云和雾控制。
3. 聚焦 GPU 测试昼夜、遮挡、方向、开关和地平线，验证失败/过期加载及销毁。
4. 浏览器检查两种世界画面；记录资源/渲染开销；构建与类型检查、scoped lint、ownership audit。
5. 技术自审记录结果和边界，形成独立本地提交，视觉效果交负责人验收。

历史 Globe aerial review 的 owner gate 保留，不以此次星空工作关闭。

## 实现与验证结果

- 已接入同一个物理背景 pass，默认 showStars=true / starIntensity=1；支持球面和平面。
- Globe 散射内部会 clamp below-horizon rays，因此星空单独使用真实 RayIntersectsGround；
  不改变既有散射连续性。Planar no-hit 向上射线现在可以显示太空星图。
- WebGL validation 复现既有 Planar 云 mip 的 2³ RED 字节上传行对齐错误。
  本项在同一自有 renderer 中按 base unpack alignment 分配小 mip 的零初始化存储；
  后续 generateMipmap 和云密度计算不变，无 upstream 修改。
- 新增 7 项 GPU/API/lifecycle Specs 全部通过；5 项既有加载/失败/释放回归通过。
  Release 合并执行上述 12 项，全部通过。双世界示例 E2E 各 1 项通过。
  Globe 示例首轮因初次 shader 编译超过默认 30 s 超时；使用该文件其他环境案例相同的
  120 s 测试预算后通过（33.8 s），没有产品 retry 或等待帧。
- buildRelease、buildTs、tsc、scoped ESLint 通过；生成文件未手工编辑或提交。
- 实际浏览器验证白昼无星、夜间有星、Planar 地面无星、两种云层遮挡和暖开关。
- RTX 3060 Ti / ANGLE D3D11，1185×667，固定球面夜空：背景 GPU timer 各 32 个样本，
  关闭 median 0.090112 ms，开启 0.165888 ms；增加约 0.076 ms。星图实测 25,165,824 bytes。
  此为该设备背景通道对照，不外推整帧或移动端性能。
- 技术自审：[review](../reviews/2026-09-30-night-stars.md)。最终星图观感交负责人判断。
