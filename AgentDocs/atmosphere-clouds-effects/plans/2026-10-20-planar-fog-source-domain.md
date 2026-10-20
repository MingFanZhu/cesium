# 平面中午高度雾亮度域一致性

- Type: standalone plan
- Status: implementation verified；负责人视觉判断保留
- Owner: 当前任务，Architecture / execution
- Created / Updated: 2026-10-20
- Architecture review: confirmed；先复现同视角雾开关差异，修正遗留 source-domain 差异
- Parent: [extension](2026-08-14-atmosphere-clouds-effects-extension.md)
- Related: ADR-0042 / ADR-0044 / ADR-0045 / ADR-0052
- Upstream-owned files / SGP delta: none；仅消费既有 SGP-0008

## 事实与边界

南京相同经纬度、高度、ENU 观察方向、2026-10-20 北京时间 12:00、HDR/PBR Neutral/exposure 1，
暂关自动曝光和云/泛光，统一空气透视距离倍率为 1。平面打开高度雾后出现明显暗蓝地平线带。
源码确认 Globe 高度雾已使用 backgroundRadianceScale，Planar Background、Aerial、cloud 与 shadow delta
仍传 1；Planar directional source 还除以旧 spectral solar max，而 Globe 保留 scene RGB 光照。
这两项是历史分阶段保留，不属于 flat-slab 与球壳的几何差异。

## 修复与验证

1. 为 Planar 实际 Background / Aerial / cloud fog 添加 GPU 线性源倍率回归，先记录旧路径失败。
2. 对齐 source-domain 系数及 directional source 单位，所有 consumer 一致，保留 Planar 独立 LUT、固定 Z、
   解析消光积分、密度、最大不透明度、白平衡、曝光和所有默认参数；不借用球面光程或曲率。
3. 更新 ADR-0044/0045 的历史边界说明，保留未提交的自动曝光示例工作，不混入新产品功能。
4. 对照中午同视角雾开关、连续倾角与高度，运行新 GPU 回归、原 Planar 合成与相关 fog / rays 回归。
   核对资源恒等与固定 pass/采样预算，提供实际 Aerial 成本证据。

## 结果

产品修复已完成：统一五处 fog consumer 的 `backgroundRadianceScale`，移除 Planar directional
source 的旧 spectral solar max 除法。没有修改积分、参数默认值、LUT、曝光或资源预算。
新 GPU 回归先在旧代码失败，修复后通过；相关云影、Globe、Moon 和 warm-uniform 回归共 5 项通过。
同一中午视角雾开关与 120 帧连续高度 / 倾角检查通过；固定输入 Aerial GPU median 前后均为 0.08192 ms。
完整结果、构建与范围审计见[技术评审](../reviews/2026-10-20-planar-fog-source-domain.md)。
最终画面由负责人判断；2026-10-20 按负责人后续要求独立提交，未推送。此前自动曝光示例另行提交。
