# 球面透明地表高度雾截断

- Type: standalone plan
- Status: implementation verified；负责人视觉验收待定
- Owner / review: 当前任务 execution / architecture self-review
- Created / Updated: 2026-10-23
- Parent: [扩展计划](2026-08-14-atmosphere-clouds-effects-extension.md)
- Baseline: `4f32a6e300`; branch: `codex/globe-translucent-fog`
- ADR: ADR-0045；恢复既有地面截断契约，无公共 API 或资源边界变化
- Review: [技术自审](../reviews/2026-10-23-globe-translucent-height-fog.md)
- Upstream-owned files / SGP: 无

## 已复现原因

SDK `underground-globe` 示例设置地表正反面 alpha=0.4，相机椭球高约 130.7 米，
默认 heightFogStartDistance=250 米。仅启用高度雾仍出现弧形亮带；关闭高度雾则消失，
不依赖相机进入地下或地下模式开关。示例使用 `b7ab45e` 引擎，当前源码保留相同条件。

`sceneGISHeightFogGlobeSegment` 仅在 bottomNear 大于 segmentStart 时截断到地面。
地面位于起雾距离之前时反而保留穿过地球内部的长积分段；透明地表后的 clear depth
将其暴露。不透明地表的近处接收深度通常掩盖此问题。

## 实现与验证

1. 所有向前的地面交点均裁剪 segmentEnd，最终以 end > start 判定有效雾段。
   保留球面几何、默认值、Planar、天空、空气透视、光照和透明度语义。
2. 实际 GPU 回归覆盖地面交点在起雾距离之前、等于和之后；近处接收者、远处或
   clear-depth 接收者、向天射线和既有高空长光程。先确认旧实现失败，再应用修复。
3. 在当前引擎的本地透明地表示例核对画面、开关恢复和资源复用；记录修复前后截图。
4. 开发构建与相关 GPU Specs、release shader 编译/运行、scoped lint/format 和
   AgentDocs 检查。无公共 API 变化，不重复类型生成及全包测试。

## 退出与保留事项

弧形亮带消失，地面之前的有效雾和真实天空保留；不靠关闭默认高度雾或更改透明度规避。
不增加 pass、纹理、FBO、采样或每帧分配，记录对应回归证据。项目负责人最终视觉判断
保持独立；此前环境质量、strict-WebGL fixture 和 bloom 失败不由本项关闭。

## 实施结果

- 产品只修改 `SceneGISExponentialHeightFog.glsl` 的地面截断条件，保留地面交点早于
  起雾距离时的无雾返回。没有增加渲染步骤或任何资源。
- `SceneGISEnvironmentEffectsSpec.js` 新增 7 条射线的实际 GPU 回归；旧实现 4 条失败，
  修复后开发 / release 均通过；既有 clear-depth 完整雾介质及 warm uniform 测试通过。
- 新增 `Test/透明地表大气.html` 并接入环境目录，复用 SDK 的相机、时间与管廊布局，
  用本地 GridImageryProvider 保证不依赖 SDK 资源。默认高度雾、天空、空气透视均开启时，
  已检查画面无异常弧形带。9 项 GPU 资源切换后复用，Viewer 销毁后全部释放。
- 开发构建、release 构建、scoped ESLint / Prettier、AgentDocs Markdownlint 和
  diff whitespace 检查通过。全 AgentDocs Prettier 仍报告 563 个历史文件告警，
  含扩展旧索引；新 plan / review 单独通过，未重排历史内容。
- 仅当前引擎验证页使用修复；SDK `5180` 的引擎版本锁定与分发文件保持原状态。
  SDK 页面临时诊断代码已恢复原例。后续由负责人判断视觉效果与引擎同步时机。
- 2026-10-23 负责人授权先形成本地提交；保留视觉验收待定状态。
  双世界均通过有效场景深度裁剪可见光程，雾介质下界分别为固定球面与 `z=0` 平面；
  本项没有增加沿真实地形起伏裁剪透明地表下雾介质的能力。
