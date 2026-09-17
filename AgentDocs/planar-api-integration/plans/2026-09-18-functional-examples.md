# 平面功能示例整理

- Type: standalone plan
- Status: completed（技术自审通过）
- Updated: 2026-09-18
- Owner / architecture review: 当前 Agent，architecture/execution 自审，approved
- Authorization: 负责人要求将前两个大阶段的综合示例按功能拆分，UI 统一使用 lil-gui
- Baseline: `feature/functional-examples@416fdb0aec`
- SGP / upstream-owned files: None

## 源码事实与范围

现有平面 Viewer、地表样式、环境、API 集成四页混合上手 API、公开数据接入、状态诊断和边界测试，
单页最多 710 行；示例内还覆盖 lil-gui 样式。高级环境另有约千行的综合脚本，由其已有扩展后继整理。
本次仅调整 Test 页面组装、入口说明与相应页面 E2E，不修改已验收的产品 runtime。

## 实现

1. 在 Test/Planar 按基础地图、影像地形、影像调色、地形材质、相机、实体定位、实体跟踪、日月天空拆分。
2. 每页使用独立中文 HTML/JS，直接展示 Viewer 和对应公共 API；只共用静态样式与少量测试数据/释放辅助。
3. 控件使用既有本地 lil-gui 的默认样式；说明独立成块。移除上手页中的断言、错误计数、销毁按钮及阶段术语。
4. 旧综合页归入明确的 tests 入口，原 URL 导向相应新示例/目录，保留需要的诊断材料而不作为上手入口。
5. 优先本地确定性背景/地形素材，单独展示公开服务接入及失败提示，不让网络阻塞基础功能。

## 验证与退出条件

页面 E2E 覆盖每个入口就绪、代表控件实际改变 API、导航与资源释放；自查代表页面。
复用根 8080 服务，不启动 Sandcastle；只运行相关页面验证和格式/静态检查。
记录 review、更新索引和入口后独立本地提交，再整理高级环境示例；不合并或推送。

## 结果

八页已实现，原四个综合页归入 Test/Planar/tests，旧 URL 保持兼容跳转。
8 项页面 E2E 通过；修正天空相机后单项再验证通过。PNG 高程实际采样超过 2500 米，
地形材质和天空画面已自查。共享代码仅负责页面释放，不隐藏 Viewer 或功能初始化。
未修改产品、构建或上游文件；完整证据见[review](../reviews/2026-09-18-functional-examples.md)。
