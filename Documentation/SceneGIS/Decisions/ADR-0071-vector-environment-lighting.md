# ADR-0071：矢量地表消费既有高级环境

- Status: `accepted`
- Date: `2026-09-14`
- Plan: [V4B](../../../AgentDocs/vector-tiles/plans/2026-09-14-v4b-environment.md)
- Related: ADR-0054、ADR-0055、ADR-0069、ADR-0070
- SGP: None planned

## Decision

矢量地图是地表的直接绘制内容，background/fill/line 的颜色作为 albedo 消费现有环境的 physical
primary beam、diffuse sky 和 Beer cloud transmittance。高级环境 active/ready 时替换基础 Lambert，
inactive/loading 时保留原路径；不得同时应用两次照明。MapLibre hillshade 不再是当前交付目标。

Globe 与 Planar 只消费各自 World 的 frame-local record。Uniform 使用执行时当前值，不缓存过时
record/atlas；环境仍独占资源创建、history、光源发布和释放。矢量惰性缓存 Shader variants，保留
既有 geometry、命令、特征 identity 与 pick。Circle/symbol 维持制图颜色，不伪造 PBR 法线。

借用现有 `SceneGISModelEnvironmentLighting` / `SceneGISPlanarEnvironmentLighting` GLSL 的源光照
函数，地表片元供应自己的实际位置和法线；不得把 planar tile model transform 重复作用于世界坐标。
几何阴影可见度只作用于 direct 项，sky 不重复压暗。颜色继续遵循 Cesium gamma/HDR 域与预乘 alpha。

Globe 只为 Scene 所属定向 ShadowMap 的真实 surface receiver 采样，使用原生 cascade/visibility
builtins 与 terrain bias，遵循 Scene enable/Globe ShadowMode；coverage volume 永远不投影。
私有桥接所参考的 upstream 来源为 `Scene/ShadowMap.js` 的 `combineUniforms`、
`Scene/ShadowMapShader.js` 的定向 receiver，基线 `6d5d8b1f0725b6f831b336463f4b11c98023427b`。
升级时核对 bias、cascade、texture 与深度域；不复制原生命令派生管线。Planar 保持既有几何阴影资格限制。

天空、aerial、fog、cloud、rays 与 bloom 继续由原有 advanced background/pre-tonemap HDR slots 合成。
不增加 final-color relight、地图 RTT 或第二份环境资源。测试页面通过原 Controller API 组装，产品层
不自动创建环境，不为示例增加全局状态、隐式 fallback 或原型补丁。

自有 DrawCommand 更换 base Shader 时撤销旧 derived-command 记录。Cesium 在 LDR 下不会刷新
休眠的 HDR 分支；若随后重新启用 HDR，而环境资产还未 ready，旧分支可能访问已撤销的 lighting
record。该已复现问题在 Planar surface 与矢量自有 command 的更换点修正，不修改上游 Scene，
仍复用 Renderer ShaderCache。正常光照 uniform 变化不失效 Shader 或 command。

## Verification

Flat/ground/Globe、actual depth receiver、direct/sky、云影和定向几何阴影、alpha/native pick、环境与
provider 切换、当前帧资源、共享 GPU 生命周期与 bounded performance 单独验证。修改 public 既有
配置的有效组合，须完成 build/types/release/installed-package 资格与负责人视觉 gate。
