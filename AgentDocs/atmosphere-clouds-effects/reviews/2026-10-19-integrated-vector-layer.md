# 综合环境矢量验收图层评审

- Type: architecture / code review
- Status: approved；2026-10-19 负责人视觉验收通过
- Owner role: 当前任务，Architecture / execution self-review；未启用独立 Agent
- Created / Updated: 2026-10-19
- Target: [standalone plan](../plans/2026-10-19-integrated-vector-layer.md)
- ADR / SGP: 无新增；upstream-owned files=0

## 结论与范围

`Test/AdvancedEnvironment/综合环境矢量.js` 只组合公开 `SceneGISVectorTileLayer`、
`show`、`opacity`、`setLayoutProperty` 和状态 / 错误接口，未增加矢量实现或改变渲染管线。
使用已有 Bright 快照、在线 TileJSON 与 building extrusion 示例配置；保留 attribution。
默认关闭且地图底色隐藏，在线服务失败只报告矢量错误，原环境和本地地表仍可使用。
恢复环境默认值保留矢量配置；反复开关复用同一个 Layer，Scene 持有并销毁其资源。

## Findings

- **P1 / fixed：Planar 矩阵必须与在线源一致。** 既有示例的局部根范围 / level 0
  不能解释 OpenFreeMap 全球 z/x/y；改用全球单根 Web Mercator / maximumLevel 18，
  保留南京视角与天文参考。双世界实际 MVT 绘制及原环境默认值回归通过。
- **P2 / fixed：异步初始化生命周期。** 元数据完成时读取当前显隐 / 不透明度 / 底色设置，
  页面销毁取消元数据请求，解除页面注册的 listener。E2E 覆盖加载中隐藏、重新开启、
  BFCache、重复销毁、加载中销毁，未发生迟到的可见层或孤立 Layer。
- **P2 / fixed：原生地形选择器与环境深度契约。** 负责人验收截图复现切回 Ellipsoid 后的环境错误；
  `BaseLayerPickerViewModel` 会同步关闭地形深度测试，而已启用的环境要求保持 true。
  仅在示例中监听 `terrainProviderChanged`，环境 enabled 时恢复 true，并随页面清理解除。
  Globe E2E 经原生 picker 重新选择 Ellipsoid 后 depth 为 true，环境错误为空且绘制、销毁正常。
  无需修改 upstream 或放宽产品契约；已验收页面未刷新，源码修复下次加载生效。

## 验证证据

- `Specs/e2e/scenegis-environment-examples.spec.js` 两项 Integrated 环境回归通过：
  默认值、原生控件、时钟与生命周期保持。
- `Specs/e2e/scenegis-environment-vector.spec.js` 三项通过：Globe / Planar 真实绘制、
  显隐与属性修改、实例复用、恢复环境默认保留矢量设置、页面和请求生命周期。
  采用既有本地 MVT / glyph / sprite 拦截在线请求；默认无公网请求，实际瓦片、drawCommands、
  视内 placedSymbols 均非零，tile / 页面错误为空。追加 picker 修复后的 Globe 用例通过。
- Windows Chromium / D3D11，复用当前开发服务器；仅测试配置使用本机 Chrome 和 D3D11，
  避开既有 Windows `--use-angle=gl` 的初始化问题，不增加产品重试或测试分支。
- 真实在线当前页道路、水域、建筑和中文注记可见；2026-10-19 负责人确认视觉验收通过。
  验收时截图显示 9 个瓦片、90 个标注、0 个瓦片失败；截图保存在忽略的 Build 调试目录。
- Scoped ESLint / Prettier、全量 AgentDocs Markdownlint、`git diff --check` 通过。
  全量 AgentDocs Prettier 保留 452 个既有文件的格式警告；本项修改文件通过。

## 剩余边界与交接

在线瓦片、glyph 与 sprite 依赖网络，首次中文注记需要下载多个字形段；页面有加载状态与错误提示。
默认本地场景启动不依赖该网络。既有矢量能力和环境历史限制仍按各自文档维护，本项不宣称扩展其支持范围。
没有新的未处理 finding。2026-10-19 负责人要求提交有效改动，并明确允许 ion token 保留在示例中；
本项形成独立本地提交，不推送。评审和测试不复制凭据。MVT 专用水面已按要求撤销，水域继续使用普通 fill。

## 撤销 MVT 水面后的提交复核

负责人要求一并删除未提交的专用类、geometry helper、专属示例、Specs / E2E、
ADR-0170 / ADR-0171 草案与四份过程计划 / 评审；只保留矢量扩展索引中的撤销结论。
原 WaterSurface 及其两个 Shader 恢复既有提交版本，原水面 17 项 strict-WebGL 回归通过。
综合环境不提供水位控制或独有 water 样式，普通 fill 与既有 SSE / 调度保持原状。
相关无用的忽略目录调试产物已清理，未删除有效环境修复的验证证据。

本次三项矢量 E2E 全部通过，验证双世界绘制、普通水域填充、属性控制和异步资源释放。
两项综合环境用例完成验证；平面用例先因旧时钟精确相等断言失败，按
[白平衡收口记录](2026-10-19-solar-white-balance.md#本地提交复核)修复浮点容差后单独重跑通过。
开发 / 发布构建、build-ts / tsc 通过；自动生成的 JS / 类型只保留原 WaterSurface，
没有已撤销的 MVT 水面导出。新增矢量 E2E 已登记到 Test 的通用 examples 配置。
