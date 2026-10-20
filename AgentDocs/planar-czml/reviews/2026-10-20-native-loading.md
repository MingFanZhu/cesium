# 原生 CZML 平面加载技术自审

- Type: implementation / architecture self-review
- Status: approved technically，负责人视觉验收待定
- Reviewer / owner: 当前任务，未启用独立评审 Agent
- Created / Updated: 2026-10-20
- Target: [standalone plan](../plans/2026-10-20-native-loading.md)
- Decisions: ADR-0173 / SGP-0063

## 实现审查

新增 options 只固定 native DataSource 的实例坐标域。加载完成时在 clear/parse 之前校验
实际空间字段；不遍历业务 metadata，不投影、预采样或重建 Property。
原生 insert/merge/delete、clock、availability、ReferenceProperty、插值、事件与 URI 流程保留。
原生 parser 其他错误仍为非事务行为，不承诺完整加载回滚。

显示层校验 placed source 的 World identity 与存活；在 child update 前拒绝 Globe/错 World。
使用原生 add/remove 的容器生命周期，未在 collectionAdded listener 中新增抛错造成半初始化。
既有 planar gate 接纳 CZML，children 顺序、Path 采样、camera tracking/framing 原样复用。
7 类 visualizer 的 collection listener 增加 Entity identity 检查，修复 native load 对同 ID
remove/add 合并为 changed 时仍保留旧 Entity 的问题；复用原 release 流程释放 owner / model generation。
Anchor 已有正确的 Entity / pick id 更新，无须修改。
没有新增 pass、GPU 对象、资源订阅、每帧投影或进程级 updater。

## Findings

| ID      | Severity / status                 | Evidence / disposition                                                                                                                                                                                                                                                                                                                                       |
| ------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CZ-R001 | P2 / accepted compatibility limit | 首轮 `cartesianVelocity + forwardExtrapolationType:HOLD` 期望末尾位置失败。`SampledProperty.js` forward HOLD 使用 `index * innerType.packedLength`，没有包含导数 stride；同包默认 Globe CZML 复现同结果。本项用户要求保留原生时序语义，因此不改上游 sampler；测试对照 native，另测无导数 HOLD 的正确位置与过期语义。后续若修复应作为独立原生采样器问题处理。 |
| CZ-R002 | P3 / fixed in validation fixture  | 类型 fixture 位于 engine workspace，不能解析根 self-reference `cesium`。使用真正安装的 `@cesium/engine` 与 `@cesium/widgets` 公共入口，严格类型消费通过。                                                                                                                                                                                                    |

### CZ-R003：同 ID reload 沿用旧渲染对象

P1 / fixed，负责人当前任务。最终示例中 process 把 Path 改为粉色，再 load 同 ID 后
source 为黄色而画面仍粉色；检查确认 item.entity 仍为旧对象。新增 E2E 在修复前失败。
7 类 visualizer 的 changed replacement 现在释放旧 owner 并创建新 tracking item，
普通 process 保持 item identity。11 项 CZML Specs 覆盖全部 8 类 children，
48 项相关 Visualizer Specs 和开发/发布 GPU reload 原实体 pick / 色彩检查通过。

## 验证

- `SceneGIS/DataSources/SceneGISPlanarCzml`：11/11，含米制大坐标、Hermite/外推、interval/reference、
  availability/clock、process 样本合并与删除、load 替换、元数据、事件、失效 World、绑定与 Globe 回归。
- Native `DataSources/CzmlDataSource`：151/151；`DataSources/DataSourceDisplay`：30/30。
- 7 类受影响 Visualizer Specs：48/48。合计 240 项通过。
- Local E2E 开发包与压缩发布包各 1/1：真实 GPU 动态点/Path 的 original Entity pick、
  availability、zoomTo/flyTo、trackedEntity 固定轴相机位移、process identity、同 ID reload 的
  Path 颜色及点/轨迹/面/体的新 Entity pick、show、remove/destroy。
  零外网请求，零页面/renderError。
- `npm run build`、完整 `npm run release`、根/engine `tsc --noEmit` 和严格类型 fixture 通过。
  Release 保留既有私有 doclet 类型生成告警，exit 0。
  最后的 owned Visualizer 修复后再次完成 `buildRelease`、engine 类型检查和压缩包 E2E。
- 本地中文示例已检查原生时钟、轨迹和设备画面；连续 120 帧遍历完整 120 s，
  资源容器数量固定 5，零 renderError。1000 量级 viewport 的本机浏览器帧提交
  median 2.1 ms / P95 4.9 ms，仅为 CPU/驱动提交证据，不冒充 GPU 时间或跨机性能保证。
- Scoped ESLint、补丁审计、类型检查、修改源码/新文档 Prettier、全量 AgentDocs Markdownlint
  及 `git diff --check` 通过。全量 AgentDocs Prettier 报 501 份既有未修改文件的格式告警；
  本扩展单独检查通过，未扩大为历史文档重排。
- E2E 使用本机 Chromium 默认 ANGLE 后端和已有开发服务器，测试数据全部在本地；
  用临时配置省略仓库通用配置的 `--use-angle=gl`，未修改全库浏览器配置。

## 上游与交付边界

仅 `packages/engine/Source/DataSources/CzmlDataSource.js` 与
`packages/engine/Source/DataSources/DataSourceDisplay.js` 为本项修改的 upstream-owned files，
均使用 SGP-0063 paired markers。生成的 barrel、types、Build、SpecList 不进入提交。
前一项雾修复已提交 `9ed58fbccb`；负责人已授权本项形成本地提交并合并至 `scenegis/develop`，未 push。

平面支持范围仍受既有 Graphics/material profile 约束；不支持 INERTIAL、VVLH 或椭球速度朝向，
也不声称能自动转换任意现有地理 CZML。参考属性需要返回当前 World 的固定坐标。
`load` 创建新 Entity 后，调用方持有的旧引用不自动重定向；跟随新对象应重新取得 Entity 并设置
`trackedEntity`，与原生对象引用语义一致，示例在 reload 前先停止跟随。
