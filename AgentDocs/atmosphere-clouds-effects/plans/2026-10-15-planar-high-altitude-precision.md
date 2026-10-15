# Planar 超高空大气边界精度

- Type: standalone plan
- Status: completed
- Owner: 当前 Agent，Architecture / implementation；Architecture review: confirmed
- Created: 2026-10-15; Updated: 2026-10-16
- Parent: [环境扩展](2026-08-14-atmosphere-clouds-effects-extension.md)
- Related: ADR-0042；upstream-owned files / SGP 增量：无
- Review: [技术评审](../reviews/2026-10-15-planar-high-altitude-precision.md)

## 复现与范围

EPSG:3857 extent ±20037508.342789244、相机 `(0, 0, 250000000)` 俯视时，
默认环境的地表外背景出现蓝白噪点。无影像且只开启背景大气也复现；关闭环境后消失。
`effd811740` 未修改环境 Shader。FP32 模拟显示，地面交点高度由两个巨大值相消后
可能得到 -16、0、16 m，跨过 `includeGround` 的 1 m 判断。

仅修正 SceneGIS-owned `SceneGISBrunetonAtmosphere.glsl` 的 Planar slab 边界高度与
介质长度计算，并增加现有环境 Specs 中的真实 LUT GPU 回归。保持固定 Z、真实有限光程、
独立 LUT、光照及曝光；不扩大容差，不关闭效果，不更改 SDK 默认值或资源生命周期。
保留 Globe 与历史 strict background fixture 未解决项。

## 实现与验证

1. 先增加真实 GPU 回归：同一射线由 60 km 顶部或 250000 km 真空出发应获得相同
   radiance / transmittance；旧实现必须失败，实际光学贡献不能被零值替代。
2. 消费 slab 求交结果时保留被裁剪边界的准确高度；非水平完整介质长度由高度差与方向计算，
   不从两个巨大相机距离相减。有限接收点与不相交、向上、水平语义保持。
3. 运行新回归、既有 Planar 长光程 / horizon / depth variant 与资源相关最小检查。
   通过原有构建器生成 Shader 和 dev/release；生成产物不提交。
4. 相同超高空视角对比默认环境与背景大气隔离画面，补充近景检查和有边界的 GPU 耗时对比。
5. 写回技术评审与交接，交负责人视觉验收；通过后形成独立本地提交，不推送。

## 实现与验证结果

实现只修改 `sceneGISPlanarRadianceToPoint`，保留共享 slab helper 接口及 cloud shadow consumer。
真实 GPU 长真空光程回归旧实现失败、修正后通过；有限端点回归和既有 horizon / resource / variant
检查通过。两个既有 fixture 错误已用 HEAD 原 Shader 复现，详见 review。
完整 dev/release 构建和原复现、120 km、600 m 浏览器检查完成；噪点消失，环境仍开启。
背景 GPU median 相同、p90 增量约 0.001 ms，无新 pass、lookup、uniform 或资源。
技术自审通过；2026-10-16 负责人确认视觉验收通过，standalone 完成。
代码、Specs、ADR 与验收记录纳入 `scenegis/develop` 的同一独立本地提交，未推送。
