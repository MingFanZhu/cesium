# 平面 Entity 通用属性修复技术自审

- Type: implementation / architecture self-review
- Status: approved technically；待负责人验收
- Created / Updated: 2026-09-18
- Author / owner: 当前 Agent；未启用独立评审 Agent
- Target: [standalone plan](../plans/2026-09-18-entity-api-fixes.md)
- Findings source: [Entity API audit](2026-09-18-entity-api-compatibility.md)
- Decisions: ADR-0015 / ADR-0016 amendment；保留 ADR-0019 的 Rectangle 米制解释
- Upstream-owned files / SGP: None / None

## 实现与处置

- EA-R001 fixed：gate 通过 Entity.prototype 区分内建 Property 和 addProperty 业务字段；保留标准 Graphics allowlist。
  使用原 addProperty/removeProperty、实例字段和 PropertyBag，无平行 API、无 Entity 源码或 prototype mutation。
- EA-R003 partially fixed：Polyline/Polygon 的 distanceDisplayCondition 已支持 ordinary/ground、fill 与全部 outline；
  材质仍保持原 ColorMaterialProperty profile，本轮不宣称已补齐所有 Graphics 字段。
- EA-R005 accepted：负责人接受为复用 Cesium 类型而保留平面字段解释；RectangleGraphics 的四个范围字段继续是米，
  不改 Cesium Rectangle 原方法。指南明确不得用 fromDegrees 或球面 Rectangle 运算来构造平面范围。
- EA-R002、EA-R004 remain open：DataSource class 限制和 Entity.computeModelMatrix / VelocityOrientationProperty 的球面假设未修改。

距离条件未定义时保持原属性布局；定义/清除时替换 owner。已有 ready 的条件只更新 GeometryInstance attributes，
不修改 geometry、VA、commands 或 Shader；pending CPU owner 条件变化时替换 candidate。
原生 far=Number.MAX_VALUE 在 GPU 中采用 Float32 有限上限，应用 Property 不变。距离判断继续是原生包围体近似，
不是逐像素到地形的精确距离。私有 helper 没有新 public API 或独立 GPU resource。

## 验证

- 首轮 metadata 回归复现 businessCode 被拒绝；修复后初始添加、动态赋值、增加另一业务对象、移除属性与原 tileset 拒绝均通过。
- 新增 6 项真实 WebGL Specs：ordinary/ground 的 line 与 polygon fill/outline 的颜色和 original Entity pick，
  far 隐藏、near 隐藏、恢复、清除、非法 near 原子性、pending 更新、原生默认 far、remove/destroy。
- 同一用例断言 near/far 动态变化保持 owner、internal Primitive、VA 与实际 color command identity。
  不设置条件时无新增 attribute；本轮没有新 texture、buffer 或 command 类别。测试环境为 Windows / ChromeHeadless 153。
- 首轮定向 30 Specs 全部通过。相关内容扩展回归 120 项中 118 passed、2 failed；失败项见下方，不计为本轮通过。
- 完整 build、buildRelease、buildTs、buildDocs 与 root/engine TypeScript 通过；buildTs 保留既有 TSD-JSDoc warnings。
- 源码 ESLint、修改文件格式、全 AgentDocs Markdownlint 与 git diff --check 通过；全 AgentDocs Prettier 仍有
  285 份既有无关文件未通过。生成文件无 tracked 改动。

## 既有失败与剩余风险

| ID      | 状态 / 负责人         | 证据与下一步                                                                                                                                                                                 |
| ------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EF-R001 | P2 / open，当前 Agent | `SceneGISPlanarContentVisualizer` 的 volume/area/route/path 旧用例没有绑定 World，却渲染要求 World frameState 的 ground primitive；需单独修正 fixture 生命周期                               |
| EF-R002 | P2 / open，当前 Agent | `SceneGISPlanarContentQualification` 固定次数 Promise/frame 循环后 terrain 未 ready，height 未定义，后续坐标转换报错；需单独按当前异步地形就绪契约修正资格用例，不能增加盲目 settling frames |

为隔离回归，将本轮修改的三个既有 runtime 源文件临时换回 HEAD 内容，仅运行上述两项，得到相同两项失败与堆栈，
随后恢复全部三个文件并重新构建。这证明它们在本轮修改前已存在；没有修改这些旧 Specs，也没有改地形 runtime。
后续修复需建立独立有界 plan；本次距离显隐有独立 actual-GPU 证据，不依赖这两项旧 fixture。

本轮未进行负责人页面视觉验收，未提交或 push 混合工作区；没有修改 upstream-owned 或手工编辑生成文件。
