# B3 纽约建筑材质示例自审

- Type: review
- Status: technical review completed；architecture technical gate passed；owner visual gate pending
- Date: 2026-10-27
- Author / owner: 当前 Agent，architecture / implementation / self-review
- Target: [B3](../plans/2026-10-27-b3-nyc-material-example.md)
- Related: [ADR-0192](../../../Documentation/SceneGIS/Decisions/ADR-0192-vector-building-materials.md)
- Upstream-owned files / SGP: 无；B1–B3 变更路径与官方基线逐项核对，无上游路径

## 发现与处置

| Severity | Finding                                                              | Status / evidence                                                                                            |
| -------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| P1       | 纽约 MVT ID 为字符串，直接取模使低楼选择器返回默认空字符串，出现白墙 | fixed；显式 to-number，Core 新回归通过；真实拾取 ID `3745289562`；公共文档同步说明 safe integer 边界         |
| P2       | 高楼全部同一蓝灰窗格，初始材质库单调                                 | fixed implementation；新增原创石材、砖窗、平屋顶，三色玻璃和源 colour 优先选择；负责人确认视觉效果仍 pending |
| P2       | PlanarEnvironment 必需方向缺失且清理误用不存在的 destroy             | fixed；提供初始方向，removeController 断开所有权；双世界各两次图层重建及重复最终 destroy 无错误              |
| P2       | 初始 TileJSON 网络失败时 reload 没有 style 而直接返回                | fixed；显式用户重试重新 load，错误保持可见，不增加自动 retry 或离线 fallback                                 |
| Info     | 初次使用 floor 表达式超出现有支持子集                                | fixed；改为已支持的 to-number / prime modulo；不扩展表达式产品范围                                           |
| Info     | 原素材为坡屋顶与夜景窗图，不适合白天纽约街区                         | replaced；原创平屋顶/墙体、技术通道推导、来源和完整生成提示词随示例保存                                      |

## 实际验证

引擎实现保持 B2 checkpoint `d7319e1f05`；B3 新增示例/素材/文档及字符串 ID 回归。
development build、完整 buildRelease、buildTs 后 tsc 通过；独立消费端从 `@cesium/engine`
导入 BuildingMaterial typedef、Style、Layer 和材质预算/统计字段，tsc 通过。
Core/Worker 材质专项 10/10、release GPU 材质专项 18/18 通过。
scoped eslint、修改文件格式及 Markdown 检查通过。全 AgentDocs Prettier 已有 598 个历史格式问题，
未批量改写；全 AgentDocs Markdown 检查通过。B2 广域回归的 10 项基线失败仍按原 review 保留。

人工诊断脚本和画面位于忽略的 `Build/material-evidence/`，不提交原始日志、街区瓦片或截图。
`globe/planar-day.png`、`globe/planar-evening.png` 是同一地理位置和时刻的双世界截图；
墙面窗列按米重复，近景可辨玻璃、石材、砖墙及屋顶纹理，日落时明暗/暖色方向改变。
`reflections-on/off.png` 与 `shadows-off.png` 对照确认现有开关影响实际建筑画面；
图集与光照均由引擎实现。玻璃表现以天空为主，屏幕内反射受可见范围约束。

`globe-far.png`、8 张小幅转动的 `globe-motion-*.png`、z14 边界叠加及 z13.18 远景已采集。
小幅移动中材质风格不随机重选，远处窗格通过 mip 逐渐收敛；未宣称完全无摩尔纹或闪烁。
源在远景改变建筑轮廓/高度，且 style minzoom=13；z12.98 的建筑隐藏不是材质失效。
相同直线墙分段/瓦片/LOD 的纹理相位已有 Core 数值测试，真实数据拓扑变化不由材质修补。

## 性能与销毁

Chrome 156，Windows / NVIDIA RTX 3060 Ti，1440 × 1000、DPR=1，HDR+AO+SSR+阴影+FXAA。
同一场景各 90 warm frame，GPU disjoint timer 取得 89 个完成结果；计时为整帧，未包含首次编译/加载。
下列结果采于最终 ferry/tunnel 道路过滤前，无材质/渲染源代码随后变化。

| 场景                 | CPU median / p95 ms | GPU median / p95 ms | 矢量命令 | 材质纹理            |
| -------------------- | ------------------- | ------------------- | -------- | ------------------- |
| Globe PBR            | 3.8 / 5.1           | 14.78 / 16.64       | 116      | 16.66 MiB           |
| Globe 关闭材质选择器 | 3.6 / 5.0           | 13.47 / 14.76       | 116      | 16.66 MiB（库保留） |
| Planar PBR           | 2.8 / 4.0           | 9.18 / 10.42        | 115      | 16.66 MiB           |

Globe 32 visible / resident tiles，Planar 31；无失败瓦片或挂起材质请求。
两世界各两次移除 Layer 后五张材质纹理全销毁；重建内存不增长，最终 viewer/Layer
销毁以及重复 destroy 正常。迟到图片/Worker 与分配预算失败继续由 GPU Specs 覆盖。
性能数据只说明当前设备/画面中约 1.31 ms GPU 增量，不作为跨设备帧率承诺。

## 交付与未决项

- [示例/来源/操作说明](../../../Test/vector-tiles/building-materials/README.md)；
  [公共 API](../../../Documentation/SceneGIS/VectorBuildingMaterials.md)。
- 原创素材使用内置 imagegen，原始输出与提示词保存于 Test；ambientCG Facade006 为 CC0。
  通道推导是风格化近似，屋顶设备是纹理，不含新增几何、玻璃透射或内部空间。
- owner visual gate pending：负责人检查新的配色/窗列、反射观感及连续运动中的远景质量，
  当前 Agent 继续负责收到反馈后的收敛。此前“单调”的反馈不等于新画面已获确认。
- 独立 building part 的 ID/colour、高度与轮廓仍可能不同；公网更新和服务失败仍可影响页面。
  不承诺任意源数据的跨瓦片/LOD 完全连续。
- 原 D2 人工 gate 保持 pending，不通过本阶段替代。
