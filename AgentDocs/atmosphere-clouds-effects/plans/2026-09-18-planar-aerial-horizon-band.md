# 平面空气透视模型水平色带修复

- Type: standalone plan
- Status: completed; project-owner visual acceptance passed
- Created / Updated: 2026-09-18
- Owner / architecture review: 当前 Agent；confirmed for diagnosis and bounded owned-source repair
- Parent: [环境扩展](2026-08-14-atmosphere-clouds-effects-extension.md)
- Finding: [平面对照排查](2026-09-18-globe-aerial-receiver-distance.md#平面对照排查--2026-09-18)
- Decision: [ADR-0042](../../../Documentation/SceneGIS/Decisions/ADR-0042-planar-precomputed-atmosphere.md)
- Review: [技术自审](../reviews/2026-09-18-planar-aerial-horizon-band.md) — accepted; closed；负责人视觉验收通过
- Baseline: `scenegis/develop@69f76a94c6`，保留尚未提交的独立球面修复
- Upstream-owned files / SGP delta: None planned

## 已知事实与边界

负责人要求单独修复平面。在默认 `Test/AdvancedEnvironment/平面物理大气.html` 视角，三个方块在地平线附近出现水平色带；
关闭空气透视后消失。Planar 使用真实 resolved depth、fixed-Z slab 和首末端 boundary scattering LUT 差分，未调用球面 stabilizer。
既有 real opaque linear/log 和 P5 far transport GPU cases 通过，但没有覆盖该模型跨水平视线的连续性。

保留 fixed +Z、真实光程、物理参数、独立 Planar LUT 与现有资源所有权。不能通过改示例、关闭效果、模糊输出、经验颜色插值来隐藏缺陷。
本项不改 Globe 逻辑；未确认根因前不扩大 API、资源、LUT 或构建边界。

## 执行与验收

1. 用真实 opaque 模型和实际 GPU optical probe 建立失败回归，分别观察 transmittance 与 scattering 的跨水平变化。
2. 确认数值/采样根因后在本 plan 记录证据与最小修复；长期契约变更同步 ADR-0042。
3. 构建源 shader，运行新增用例及直接相关 Planar finite/far/high 路径、Globe 回归和资源检查。
4. 复测原平面画面与一个相关视角，记录渲染成本/资源影响、代码自审和剩余风险；不叠加无关全量矩阵。
5. 更新 review/索引；负责人视觉验收单独记录，独立于已有球面修复。

## 根因与实现决定

离线 generator 的 `integrateTransport` 将 camera 到真实 slab boundary 的距离均分为 12 段。
600 m 高度、`mu → 0+` 的第一采样点始终在约 3075 m，而 `mu → 0-` 在约 575 m；
光学很厚时第一段已经吸收绝大多数能量，向上的采样却漏掉近处高密度介质。
single-scattering red radiance 在 `mu=-1e-5/0/+1e-5` 分别为 0.0616008 / 0.0618990 / 0.0814644，
而同一 20.5 km segment 的 red transmittance 为 0.847420 / 0.847425 / 0.847430。

改为离线 per-channel absorbed-transmittance quadrature，利用
`L = integral((source / extinction) d(1 - T))`，在各颜色的 absorbed transmittance 上均匀采样。
通过解析 optical depth 的单调反解确定位置；每个颜色透射低于 binary16 最小正值 `2^-24` 后的 tail 忽略。
不改变 runtime 的真实 endpoint，也不恢复几何距离上限。使用每颜色 24 个 source samples，按 height/viewMu 预计算路径样本，
同一路径的 Sun/azimuth 与多次散射只复用几何权重。此修复作用于 single 和 orders 2–4，exact horizontal 解析极限保留。
独立 dense reference 表明共用颜色采样位置在 59 km 向下视角有明显偏差，因此采用逐颜色坐标；
近地向上/向下、长斜线和高空向下五个参考路径均达到 2% relative radiance 误差以内。

需要由 canonical generator 重新生成 Planar scattering / irradiance 和 provenance，更新固定 hash/version；
LUT 维度、格式、物理参数、runtime shader、API、pass、lookup 和资源字节数均不变。遵守 ADR-0042 的固定资产交付方式，
不手改 binary 或生成 JS。新增 CPU 极限回归及实际 GPU 水平连续性回归，增加独立数值积分参考以约束 quadrature 精度。

## 验证结果与当前交接

- 新 CPU 双侧水平极限回归在旧 generator 失败，修复后通过；独立 dense reference 对五个低空/高空路径的误差低于 2%。
  `node --test scripts/scenegis/generate-planar-earth-luts.test.mjs` 共 11/11 通过，包括完整重新生成后的 byte identity、
  orders 2–4 recurrence、irradiance reference、tamper rejection 和 atomic publication rollback。
- 新 actual-GPU optical case 在旧资产的相对偏差为 7%–13%，修复后低于 2%；真实 opaque box case
  旧资产相邻行 RGB 最大阶跃为 10，修复后小于 4。两个用例均验证非零空气透视，未通过关闭效果获得通过。
- 以下光学用例通过：上述两个新增用例、P5 far transport、horizontal/shallow/high-outside 双投影、Globe elevated opaque receiver。
  Planar lifecycle 用例首次在四个旧 CloudCore 字节数断言失败；现有 loader、renderer 和 reference provenance 明确已切为
  reference cloud assets。本次仅同步四个 stale assertions，不改云资产或 runtime；完整 lifecycle 复测结果见 review。
- 原 600 m 相机与升高到 1200 m 相机均保持空气透视开启，三个模型未见原横带；控制台无 warning/error。
  临时测试视角恢复为示例默认值。
- `npm run build`、`npm run build-release`、`npm run build-ts`、`npm run tsc` 通过。
  build-ts 保留既有其他模块 JSDoc 警告；本项无公共 API 或类型改动。
- `verify-planar-packages.mjs` 完成 engine/root tar 实际解包后的 PlanarEarth hash/version、Globe/其他资源校验；
  随后的通用 ESM consumer 因旧 public export 白名单遗漏五个既有 `SceneGISVectorTile*` 导出失败。
  不将整个 package smoke 记为通过，也不在本次大气修复中改 vector-tile API 清单。
- 固定 asset bytes 仍为 8,527,872，runtime shaders/passes/lookups/allocations 无本项变化；
  离线完整 candidate 生成约 39.7 s，独立 byte-identical regeneration 约 41.9 s。未声称实时 FPS 提升。
- 技术自审与最终静态结果见 [review](../reviews/2026-09-18-planar-aerial-horizon-band.md)。
  本项与已有球面修复均保留在工作区，尚未提交；2026-09-18 负责人确认本项最终视觉验收通过。

## 剩余边界

- 新积分仍为有限阶离线 quadrature 和 binary16 LUT；不承诺所有日照/高度/方向达到相同数值误差。
  本项覆盖已复现水平条带、近地与高空路径及资源交付，不扩大到云外观全面验收。
- 通用 package smoke 的 VectorTile export 白名单问题留待对应打包维护；已通过的大气资产复制校验不受影响。
