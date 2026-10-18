# 平面 tileset 取景技术评审

- Type: implementation / architecture self-review
- Status: approved technically
- Created / Updated: 2026-10-18
- Owner: current architecture / execution role; no independent review agent
- Target: [Standalone plan](../plans/2026-10-18-tileset-framing.md)
- Decision / patch: ADR-0006 / SGP-0005

## Findings

- TF-01（medium / fixed）：已复现原生 tileset 被平面 target profile 拒绝。真实 Widget + native fromUrl
  回归在修复前抛出 DeveloperError；同一 helper 同时控制 zoomTo/flyTo。实现接纳 native
  tileset，执行时读取公开 boundingSphere，保留 Entity/DataSource 原有聚合和事务。
- TF-02（medium / fixed）：新目标需要 operation 生命周期内的成员移除/销毁监听。只对所在 collection 路径
  注册 primitiveRemoved，另一条有效归属存在时重新绑定；preUpdate 检查直接销毁。
  结束、取消、替换和错误统一移除监听；不创建永久 controller、计时器或全局注册。
- TF-03（scope / deferred）：坐标转换不是取景能力。审计与待选方案见
  [地理 tileset 边界](../discussions/2026-10-18-geographic-tileset-scope.md)。

## 验证

修复前 1 项真实 Widget/native tileset 回归抛出目标类型 DeveloperError，符合预期。
修复后 Chrome Headless 155 / Windows 的相关 50 项 Specs 通过：

- 13 项新 tileset 用例：sphere/box 初始定位、root/model 矩阵更新、真实 tween 航程完成、
  explicit complete/cancel、Promise readiness 与 stale replacement、Promise resolve 后加入
  Scene、无效 bounds 拒绝、移除与多重/嵌套集合、直接销毁、Widget pending/flight teardown、
  standalone Scene flight teardown。验证实际 Camera pose、包围球、结算次数、监听与 token 释放。
- 12 项原 Entity/DataSource framing 回归通过；只更新扩大目标 profile 后的错误消息断言，
  其余 bounds PENDING、空目标、替换、异常、trackedEntity 互斥和实际渲染断言保留。
- 25 项 Viewer 集成通过，新增 live/declarative Viewer 的真实 tileset zoom/fly，保留
  Globe/globe:false、selection、controller ownership、terrain/imagery warm 渲染测试。

首轮 Scene teardown 用例混用了源码 helper 与 root barrel 的类实例，导致独立打包的
instanceof 不一致；统一从既有 engine barrel 导入 soft-private helper 后通过。未为此增加
产品类型绕过。测试筛选器使用子串，不接受正则 alternation；首次零用例运行不算验证证据。

完整 dev/release build、build-ts、tsc 通过；build-ts 输出原有 TSD-JSDoc 警告。定向 ESLint、
Prettier、全 AgentDocs Markdownlint 和 diff check 通过。全量 AgentDocs Prettier 报告
452 个无关文件格式问题，本轮四份协作文档定向检查通过，不扩散格式修改。
上游补丁审计通过，current delivery upstream-owned entries=2，generated status=0。

运行时仅在取景期间添加 collection 路径监听与一个 preUpdate 存活检查；正常帧不遍历
primitive tree，不创建逐帧对象或新的渲染资源。树查找仅在发布/执行及相关移除事件中进行。
本轮未改变渲染热路径，不以相机 Specs 代替实际地理 tileset 全链路渲染资格。

## 上游边界和剩余风险

仅 `packages/engine/Source/Widget/CesiumWidget.js` 与
`packages/widgets/Source/Viewer/Viewer.js` 的已有 SGP-0005 JSDoc 修改；运行时实现在自有
private helper，无新增 Camera/Scene/Tileset seam。公共签名不变，扩展 planar target profile。
场景环境默认值保持不变。飞行目标在开始时固定，不是移动对象 tracking。
调用方应从 owning collection 移除对象；销毁对象后仍把它保留在原生 collection 中不合法，
本修复取消取景但不会替调用方修复该 collection。

原 EA-R002 / EA-R004、Entity fixture 既有失败仍由原 review 跟踪，不在本轮关闭。
