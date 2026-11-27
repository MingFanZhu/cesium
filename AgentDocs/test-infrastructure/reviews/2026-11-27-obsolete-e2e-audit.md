# SceneGIS 浏览器用例复查评审

- 类型 `review`
- 状态 `completed`
- 日期 `2026-11-27`
- 负责人角色 `架构 / 执行`
- 评审对象 [浏览器用例复查](../plans/2026-11-27-obsolete-e2e-audit.md)

## 已处理

- `fixed`，低，执行负责。六个浏览器 spec 各自跟随 `release` 选择产物，开发和发行入口均发现 183 项用例。
- `fixed`，低，执行负责。删除重复的浏览器平面地形计时用例。Jasmine 的 `SceneGISPlanarReleaseQualification` 继续覆盖裸地形、影像和运动下的固定采样协议与资源稳定性。
- `fixed`，中，执行负责。分屏用例显式启用高 DPI。示例识别 lil-gui 根控件，关闭远程地形后验证默认零高程。岸线显存预算计入 BVH，大气显存按 Globe 和 Planar 的 LUT 尺寸分别验证，自定义光源等待阴影级联就绪。

定向复测累计通过 23 项开发包用例和 7 项发行包用例。`npm run build-release`、改动范围的 ESLint、Prettier 和 AgentDocs Markdown lint 通过。

## 待定位

- `deferred`，中，执行负责。自动曝光场景的目标曝光值与预期的固定档位偏移不符，延迟要素样式场景未到达就绪条件。保留用例，下一次排查要分别核对曝光 HDR 输入和要素样式附件的注册条件。
- `deferred`，中，执行负责。平面 TMS 像素断言在开发和发行包均失败。后续排查同一影像经过两种提供者进入着色器时的采样与颜色处理。
- `deferred`，中，执行负责。平面集成交付的两个用例分别遇到缺失绘制命令与资源身份断言失败。保留侧重 Viewer 和融合 API 的行为覆盖，后续核对当前渲染路径和资源生命周期。

本次复查修改 `Specs/e2e/SceneGIS/` 和 AgentDocs，无新增上游补丁。测试目录迁移已有 `SGP-0076`。
