# 综合环境同源影像对照

- Type: standalone plan
- Status: completed
- Owner / review: 当前任务 execution / architecture self-review
- Created / Updated: 2026-10-21
- Architecture review: confirmed；仅组装既有公开影像 API
- Parent: [扩展计划](2026-08-14-atmosphere-clouds-effects-extension.md)
- ADR / upstream / SGP: 无新增

## 范围与实现

负责人指定 ArcGIS World Imagery 的 `{z}/{y}/{x}` JPEG 瓦片，用于综合环境双世界
地表颜色对比。服务 metadata 确认为 EPSG:3857、256 像素、左上角起算的单根网格。
球面使用 UrlTemplateImageryProvider 和 WebMercatorTilingScheme，加入原生 picker 并默认选中；
平面使用 SceneGISPlanarUrlTemplateImageryProvider 和 World canonical tilingScheme。
两边共用 URL、level 0–18、版权与 opaque 配置，保留平面当前 maximumLevel=18；
不修改引擎、调色、环境、曝光、地形或矢量选级。球面仍可切换本地 Natural Earth，
平面可关闭影像回到底色；页面显示公网错误提示，清理 provider listener。

## 验证

扩展已有双世界综合 E2E，以本地 PNG 拦截指定服务请求，确认默认 provider、瓦片地址、
参数中性、平面 scheme identity、球面 picker、显隐和销毁；保留既有环境默认值验证。
另用独立页面检查真实网络影像加载及代表画面，不把外网成功作为自动测试前提。
只运行综合页两项 E2E、相关 lint/format；不重复构建引擎。历史环境质量和 fixture
未决事项继续保留，本项不宣称解决球面/平面颜色差异。

## 结果

已完成默认影像、球面 picker、平面显隐、错误提示及 listener 清理。综合环境球面/平面
两项与已有高空一项 E2E 均通过；独立浏览器同一中午时刻的真实网络检查中，Globe 210、
Planar 196 个影像响应均为 HTTP 200，场景 ready、tilesLoaded，页面无错误，代表画面已检查。
详见[技术自审](../reviews/2026-10-21-integrated-imagery.md)。
