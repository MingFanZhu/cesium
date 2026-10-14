# Custom primary light under the default advanced environment

## Metadata

- Type: discussion
- Status: resolved, recommended policy implemented; technical verification and owner visual passed
- Author role: architecture / execution
- Created / Updated: 2026-10-14
- Parent: [P4d](../plans/2026-10-14-p4d-opaque-pipeline-consolidation.md)
- Review: [WDR-P4D-08](../reviews/2026-10-14-p4d-entry-audit.md)
- ADR: ADR-0161 / ADR-0053

## Current evidence

修复前，SceneGISEnvironmentEffects.validateGlobeConflict 拒绝初始自定义 DirectionalLight；激活后也拒绝 scene.light 被替换。acquireGlobeCelestialLifecycle 将旧 SunLight 保存并安装控制器自有 DirectionalLight；renderer 的 primary light direction / scale 来自太阳、月亮、夜间权重和月相。native Model / 阴影借同一个 scene.light，而物理地表、云与云影借 renderer 的主光记录。

这是高级环境已有的显式控制器契约。Scene 自动启用环境后，旧应用直接设置 scene.light 会更普遍地触发环境失败。只删除冲突检查会造成调用方光源被覆盖，或模型 / 地表 / 云 / 阴影使用不同方向，不能视为保留 API。关闭原生雾 / 天空 / 旧 Globe daylight 并未自动授权废弃主方向光的公共配置入口。

## Accepted decision

2026-10-14 负责人接受推荐方案，并确认开云修正画面通过。保留 scene.light 作为显式自定义主方向光入口，通过高级延迟渲染实现其效果：

1. 无显式自定义光时仍由高级环境自动计算太阳 / 月亮主光。
2. 调用方安装自有 DirectionalLight 时，自动主光让位；保留该对象的方向、颜色、强度和所有权，不覆盖或销毁它。
3. 统一将该主光映射到地表、模型、云体、云阴影与已有几何阴影；避免两套方向或额外 ShadowMap。天空大气、天体位置和月相仍按 Clock 星历。
4. 调用方显式恢复 SunLight 时重新使用自动天体主光。环境开关 / 显式控制器接管不恢复已被调用方替换的旧对象。
5. 不新增公开开关、纹理、几何提交或第二套不透明前向路径。实际辐射量映射与颜色 / 强度一致性在实施前依据既有 Shader 单位核对，以像素和 shadow direction 验证。

替代方案：明确放弃高级环境活跃时的自定义 scene.light 兼容，只允许高级环境管理太阳 / 月亮主光，继续用明确错误拒绝外部替换。此方案实现较小，但缩减旧公共 API 的可用范围，必须由负责人接受，不能因默认自动创建而悄然改变。

## Verification and gate

覆盖初始自定义、激活后替换、方向 / 颜色 / 强度变更、恢复 SunLight、环境禁用 / 重启与显式实例接管；检查地表、模型、云及几何 / 云阴影一致性。资源预算不变；定向 GPU、必要浏览器和负责人画面确认后关闭 WDR-P4D-08。

源码细化：PlanarEnvironment 每帧重写 scene.light，同样须让位；Globe / Planar 两种世界统一处理。高级 Shader 的 direct source 为 solarIrradiance × primaryLightScale × atmospheric transmittance。自定义光将 linear RGB × intensity 按分量除以既有 solarIrradiance 写入 scale，从而直接入射能量与调用方颜色 / 强度一致；现有大气透射和 BRDF 保留。无需新纹理、Shader 分支或光照提交。自定义光不受自动夜间 / 月相权重衰减，天空仍使用实际 Sun。

实施结果：两世界新增四项真实 GPU Specs 通过，覆盖主光替换 / 变更、SunLight 恢复、禁用 / 重启、显式控制器接管、地表与真实 glTF 的红 / 蓝 / 零强度 / 反向受光。既有 Planar authority 和 Globe lifecycle / conflict 回归按新契约迁移后通过。两项 E2E 验证真实云辐射颜色、原生 shadow camera 与主光同向、云影级联、自动主光恢复、无 GL / page error；固定场景材质提交和附件字节数不变。自审未发现新增所有权或资源问题，详情见 review 最新节；本增量负责人视觉待完成。

2026-10-14 负责人确认新增主光画面通过，批准提交 P4d 后继续矢量切片适配。本讨论的实施、技术与视觉 gate 全部完成，WDR-P4D-08 关闭。
