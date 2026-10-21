# 综合环境同源影像技术自审

- Type: review
- Status: approved；示例组装与自动验证完成
- Owner / reviewer: 当前任务 execution / architecture self-review，非独立 Agent review
- Created / Updated: 2026-10-21
- Plan: [同源影像对照](../plans/2026-10-21-integrated-imagery.md)
- Upstream-owned files / SGP: 无

## 源码核对

两世界共用指定 URL、256 像素、opaque、level 0–18 配置；上限沿用现有平面 World，
不是服务最大层级。ArcGIS metadata 的 origin、EPSG:3857 和 XYZ Y 向下与标准网格一致。
平面绑定同一个 canonical scheme；球面使用原生 WebMercatorTilingScheme。
影像 alpha/brightness/contrast/saturation/gamma 为 1，hue 为 0；无额外调色或亮度补偿。
球面 picker 仍含所有原生图层和本地 Natural Earth；平面可关闭影像回到底色。
服务错误显式提示，页面销毁释放添加的 provider listener，图层随 World / Viewer 释放。

## 验证与结论

- `npx playwright test --config Test/playwright.examples.config.mjs scenegis-environment-examples.spec.js --grep 'Integrated environment'`：3/3，通过双世界 defaults/widgets/controls/lifecycle 和已有平面高空检查。
- 综合页测试用本地 256×256 PNG 拦截指定影像，检查真实 tile 路径请求、参数中性、provider identity、平面显隐及清理；其余外网请求仍禁止。
- 矢量验收测试也增加同一影像地址的本地响应，避免新增默认影像被误判为未知公网请求。
- 独立页面真实服务加载：同一南京初始视角、2026-10-21T04:00:00Z，双世界 effects.ready / tilesLoaded，无 pageError 或页面 alert；Globe 210 和 Planar 196 个瓦片响应均为 HTTP 200。
- 已检查 `Build/Specs/globe-world-imagery.png`、`Build/Specs/planar-world-imagery.png`；影像覆盖和地理位置正常，保留地表颜色差异供负责人比较。
- Scoped ESLint、变更代码 Prettier 通过；本项不修改产品、Shader、公共 API 或构建，因此不重复引擎构建。
- AgentDocs Markdownlint、`git diff --check` 通过；全目录 Prettier 仍有 522 个既有文件告警（含历史索引），本项新 plan/review 和变更代码单独检查通过，未重排历史文档。

未发现阻塞项；公网可用性仍是在线影像的依赖，离线替代明确保留。没有把同源影像等同于
两世界物理光照一致；此前环境观感与 legacy fixture 未决问题不由本项关闭。
2026-10-21 负责人授权本地提交；未推送。
