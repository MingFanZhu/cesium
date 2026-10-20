# 综合环境自动曝光对照

- Type: standalone plan
- Status: completed；页面已可用于负责人对比
- Owner: 当前任务，Architecture / execution
- Created / Updated: 2026-10-20
- Architecture review: confirmed；仅组装既有 SceneGISAutoExposure
- Parent: [extension](2026-08-14-atmosphere-clouds-effects-extension.md)
- Related: [综合环境示例](2026-10-19-integrated-environment-example.md)
- ADR: [ADR-0100](../../../Documentation/SceneGIS/Decisions/ADR-0100-global-auto-exposure.md)，既有 SGP-0027 仅消费
- Upstream-owned files / SGP delta: none

## 设计与范围

综合环境两世界直接使用 Scene 拥有的 SceneGISAutoExposure，保持引擎默认关闭；
开启时同时开启 HDR，关闭 HDR 时先退出自动曝光的有效渲染状态，避免违反产品契约。
开放锁定、曝光补偿、亮暗适应速度、测光分位、中央权重和倍率范围，手动曝光仍为额外乘数。
恢复默认值同时重置自动曝光设置与历史，但保留视角、时刻、图层。

仅示例的可选诊断以不超过 4 Hz 读取已有 1×1 GPU 结果，显示自动倍率、合成倍率、目标倍率与测光亮度；
默认关闭读回，不添加引擎 API、资源或测光算法。说明相对倍率不是 EV100，适应使用墙钟时间。
Scene 负责销毁控制器，页面释放诊断监听，沿用 BFCache-aware cleanup。

## 验证

扩展两项综合 E2E：默认零自动曝光资源、开启/HDR联动、锁定与补偿、诊断数据、关闭释放、恢复默认和销毁。
固定当前视角与时刻检查自动/手动画面，保留原图层与环境设置供负责人继续比较。
只改示例、E2E 与协作文档，运行 scoped lint/format 和 AgentDocs 检查，不重复完整引擎构建。

## 结果

两世界综合页已开放自动曝光、锁定、补偿、亮暗适应速度、范围、测光分位、中央权重和立即重新测光。
参数直接读取控制器默认值，首次加载关闭；当前用户页为对比已开启自动曝光与诊断，保留原相机、时刻和图层。
可选诊断显示 GPU 真实结果，默认不读回，启用时上限 4 Hz；页面文字区分未补偿自动倍率与合成倍率。
两项离线综合 E2E 通过：默认零资源、HDR 联动、锁定/补偿两倍关系、读数、关闭释放、默认恢复、BFCache 和销毁。
当前 Globe 固定视角手动倍率 1，对应自动倍率约 0.665；渲染错误为空。
没有修改引擎、Shader、API、upstream-owned 文件或生成物；边界及技术评审见
[review](../reviews/2026-10-20-integrated-auto-exposure.md)。2026-10-20 按负责人后续要求独立提交，未推送。
