# 综合环境矢量验收图层

- Type: standalone plan
- Status: completed
- Owner / review: 当前任务，Architecture / execution self-review
- Created / Updated: 2026-10-19
- Architecture review: confirmed；只组装既有公开 API
- Parent: [综合环境示例](2026-10-19-integrated-environment-example.md)
- Related: [VectorTiles](../../../Documentation/SceneGIS/VectorTiles.md)
- Review: [技术与验收记录](../reviews/2026-10-19-integrated-vector-layer.md)
- ADR / SGP: 无新增；不修改产品、上游文件或生成物

## 范围与事实

在综合环境页面按需加载 `SceneGISVectorTileLayer`。复用已有 OpenFreeMap Bright
样式快照及示例的 building extrusion 配置，仅排除既有 profile 不支持的 building-top。
保留数据 attribution，并明确在线数据依赖。加入显隐、不透明度、地图底色开关，
底色默认隐藏以便对照原影像；道路、水域、注记与建筑走现有真实矢量绘制路径。

Layer 自动使用 Globe 真实地表，Planar 复用 canonical tilingScheme；因此平面例子的
局部 400 km / level 0 改为标准全球 Web Mercator 单根矩阵，保留南京视角及天文参考。
不改环境默认、时钟、曝光或用户选择的地形。默认不请求在线数据，由用户开启图层；
首次加载中关闭开关不能迟到显示，页面销毁须取消元数据请求并由 Scene 释放 Layer。

只在 Test 下增加页面组装 helper，复用既有 shared example lifecycle；错误单独展示，
不覆盖环境错误，不自动降级数据源。负责人明确允许示例保留现有 ion token，不复制到文档或测试。

验收截图另复现原生 BaseLayerPicker 切回 Ellipsoid 时将 `depthTestAgainstTerrain`
改为 false，触发高级环境契约错误。追加最小示例衔接：监听公开 `terrainProviderChanged`，
仅环境 enabled 时恢复所需的 true，随页面销毁解除；不改变原生 provider 或引擎默认值。
用原生选择器重新选择离线 Ellipsoid 的自动化回归覆盖，不刷新已验收的负责人页面。

## 验证

- 两世界 E2E 以既有本地 MVT / glyph / sprite 拦截在线请求，验证默认无外网请求、
  加载和实际绘制、控件与原图层实例复用、BFCache / destroy，以及加载中关闭 / 销毁。
- 当前页面保留相机、时间、影像和 Cesium 地形，开启真实在线矢量并留图。
- scoped ESLint / Prettier、AgentDocs 检查与 diff check；本项不改引擎，无需重新构建类型。
- 更新评审与索引，保留既有渲染限制和负责人视觉验收状态；按负责人要求形成独立本地提交，不推送。

## 完成结果

双世界示例已接入在线 Bright 矢量验收层，显隐、不透明度、地图底色及独立错误提示齐全。
真实在线南京道路、水域、建筑、中文注记可见，2026-10-19 负责人明确确认视觉验收通过。
当前页保留负责人的视角与设置；追加地形选择器衔接仅写入源码，下次刷新生效。

五项相关 E2E 通过：原环境默认值 / 原生控件 / Clock / 生命周期两项，以及新增双世界矢量绘制与控件两项、
加载中销毁一项。原生切回 Ellipsoid 的深度契约补入 Globe 用例后再次通过。
注记测试将既有确定性 POI 放入视野并使用街区尺度，避免把图外候选当作绘制证据。
ESLint、修改文件 Prettier、Markdownlint 和 diff 检查通过；全量 AgentDocs Prettier 的既有警告见评审。
仅改 Test、SceneGIS E2E 与 AgentDocs，无 upstream-owned 文件或 SGP 增量；2026-10-19 负责人要求形成独立本地提交，不推送。
