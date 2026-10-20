# 原生 CZML 平面加载

- Plan type: standalone
- Status: completed
- Parent plan / Phase: None
- Owner role: 当前任务，架构与执行
- Architecture review: confirmed，当前任务源码审查
- Created / Updated: 2026-10-20
- Related discussions: None
- Related review: [Native loading](../reviews/2026-10-20-native-loading.md)
- ADR: ADR-0173
- SGP: SGP-0063

## 目标与边界

原生 `CzmlDataSource.load/process` 增加 `planar: { world }`，绑定实例且不投影。
复用原生 Entity、Property、插值、availability、clock、URL、error/loading 与删除语义。
默认球面解析不变；使用既有平面 Visualizer、Path sampler 与 Viewer framing/tracking。

## 源码事实

`load` 负责 Resource 与 promise；`loadCzml` 清空/追加后调用 `_processCzml`。
`processPositionProperty` 已原生支持 FIXED Cartesian、cartesianVelocity、采样、插值和 intervals。
几何数组原生支持 Cartesian 和 references；平面 Visualizer 缺省 arc 已是直线，无须改写包。
`VelocityOrientationProperty` 使用椭球法线，平面不能原样接受 `orientation.velocityReference`。
原 gate 只接受 CustomDataSource 与显式 GeoJSON；Path 已复用 FIXED `_subSample`。
DataSourceDisplay 默认球面 callback 不校验 World，需在 update 前增加窄校验缝隙。

## 设计与影响路径

- SceneGIS-owned helper 保存不可变实例 context，首次 load/process 固定坐标模式；后续省略复用，
  不允许重绑定，URL 完成时再次验证 World 存活。
- 在 native 清空和解析之前只检查实际空间字段，不遍历业务 metadata，不转换、重写或复制解析器。
  拒绝经纬度/球坐标位置、非 FIXED、非有限坐标和椭球速度朝向。
- 原生 `CzmlDataSource.js` 只增加 options 文档、prepare 与 load-completion validate。
- `DataSourceDisplay.js` 在正常 update、所有 visualizer 更新前校验显式 CZML 绑定。
  保留 add/remove 容器流程，避免在原生非事务 collectionAdded listener 中抛错造成半初始化。
- 扩宽已有 planar gate 的数据源 allowlist，不增加 pass、GPU 资源或逐帧坐标转换。
- 新增 SceneGIS Specs、类型 fixture、本地 E2E 与中文人工示例。

## 验证与完成条件

1. XYZ / velocity 插值、interval/reference、availability/clock、process 合并/删除、load 替换、
   load 错误事件、异步 World 销毁、复用/重绑定及默认球面行为。
2. 当前 World 的 gate 激活；错 World、未绑定 CZML 与 Globe 错用在 child update 前拒绝。
3. 真实 Viewer 动态位置/Path、拾取、zoomTo/flyTo、trackedEntity、显示/移除和销毁，
   本地数据不依赖外网；保持既有有限平面几何 profile。
4. Native CZML / DataSourceDisplay 回归、完整 release 和类型、补丁审计与范围内格式检查。
5. 回写结果和自审，不以历史无关失败要求扩大产品修改。

## 已知事项

旧 Entity API review 的 EA-R004 椭球 velocity orientation 保持限制；此次明确拒绝相应 CZML 输入。
EF-R001/EF-R002 是旧 ground qualification fixture 事项，此次不宣称已解决。

## 结果

最终人工检查复现同 ID reload 后 Path 沿用旧 Entity / 颜色。
Native suspendEvents 将 remove+add 同 ID 合并为 changed；既有 Anchor 正确刷新引用，
其余 7 类 visualizer 的同 ID 对象替换需分别释放旧 owner / async generation，再跟踪新 Entity。
保持同一 Entity 的普通属性变化复用原资源。此项是保留 native load 语义所必需的修复，
增加跨 Visualizer 的 native reload 回归及 GPU 原 Entity pick / 颜色验证，修复后均通过，重审完成。

实现仅增加原生 loader / display 的窄缝隙，坐标预检一次执行，无投影或 Shader 改动；
visualizer 只修正上述同 ID 替换通知；Path 和 Viewer tracking/framing 不复制。
240 项 Specs、开发/压缩发布包 E2E、完整 release、类型消费和补丁审计通过。
人工示例检查及连续 120 帧播放无 renderError，资源容器固定为 5；
帧提交中位数 2.1 ms / P95 4.9 ms，含 CPU/驱动提交，不声称为纯 GPU 时间。
完整边界、格式检查与原生 HOLD 限制见 review。用户本轮要求的前一项雾修复已经独立提交；
负责人已授权将 CZML 改动在 `feature/planar-czml` 形成本地提交并合并至 `scenegis/develop`，未 push。
