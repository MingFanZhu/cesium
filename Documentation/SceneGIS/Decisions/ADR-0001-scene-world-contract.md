# ADR-0001：Scene primary world 契约

## 状态

- Status：`approved`
- Date：`2026-08-05`
- Decision owners：Architecture Agent、项目负责人
- Related plan：
  `AgentDocs/planar-world/plans/2026-08-05-phase-1-world-contract.md`
- Related patch：`SGP-0001`

## 上下文与源码事实

当前基线是 Cesium `1.144`（`6d5d8b1f0725b6f831b336463f4b11c98023427b`）。
`Scene` 只保存 `_globe`，并通过它调用 `update`、`beginFrame`、`render`、
`endFrame`、读取 `tilesLoaded` 和执行销毁。`scene.globe` setter 同时承担旧
`Globe` 销毁以及 imagery/terrain listener 的迁移。

`CesiumWidget` 先构造一个没有 `Globe` 的 `Scene`，随后创建或接收 `Globe`
并赋给 `scene.globe`。Earth skybox、Sun、Moon、sky atmosphere、默认 imagery
和 terrain 也在这一阶段按 `Globe` 语义创建。这个构造顺序允许增加一个窄小的
内部 world 初始化入口，而不需要先创建再销毁默认 `Globe`。

`Globe` 已结构化提供 P1 所需成员，但其 imagery、terrain、`_surface`、
ellipsoid、underground、occlusion 与 shadow 行为不是通用 world 能力。

## 决策

1. 一个 `Scene` 最多拥有一个 primary world；`Globe` 与非 `Globe` world
   互斥。
2. primary world 在构造期选择。不增加受支持的运行时 `scene.world` setter。
3. `scene.world` 是公共只读访问器。默认 `Globe` 场景满足
   `scene.world === scene.globe`；非 `Globe` 场景满足
   `scene.globe === undefined`。
4. `SceneGISWorld` 使用 structural contract。P1 required contract 仅包含
   `show`、`tilesLoaded`、四个 frame lifecycle 方法以及 `isDestroyed`、
   `destroy`。不修改 `Globe` 来声明 conformance。
5. `maximumScreenSpaceError` 延后到 P3 surface/LOD capability；
   `pickWorldCoordinates` 延后到 P4 picking capability。
6. 没有 custom world 时，保留既有运行时 `scene.globe` 替换和移除行为。
   custom world active 时，给 `scene.globe` 赋已定义值抛出 `DeveloperError`；
   赋 `undefined` 不影响 custom world。
7. `Scene` 拥有 primary world，并且只销毁一次。只有 `Globe` 安装和移除
   Globe-specific listener。
8. `CesiumWidget` 提供显式 non-Globe construction path。custom world 和
   `world: false` 都不创建默认 `Globe`。
9. non-Globe world 不自动创建 Earth skybox、Sun、Moon、sky atmosphere、默认
   imagery 或 terrain。显式通用 Scene environment option 仍可使用；显式
   `skyBox` 继续沿用既有的关联 `Sun` 安装路径；
   Globe-only option 与 custom world 同时出现时抛出 `DeveloperError`。

## 备选方案与取舍

### 让 custom world 继承或模拟 `Globe`

拒绝。这样会把 ellipsoid、imagery、terrain 和私有 surface 假能力带入平面世界，
并扩大长期升级面。

### 增加公开可写 `scene.world`

拒绝。运行时切换会引入相机、拾取、环境和 provider 的跨世界状态迁移，本扩展
明确不支持。只读访问器加构造期选择可以保持单一所有权。

### 在 `Scene` 公共 constructor options 中增加 world

本阶段不采用。`CesiumWidget` 构造时的 `Scene` 尚无 `Globe`，使用窄小的
`@private` 初始化入口即可避免默认 `Globe` 的临时创建，同时不增加第二套公开
构造 API。

### 保持全部调用都走 `_globe`

拒绝。非 `Globe` world 无法参与 frame lifecycle 和 request-render，也无法建立
明确销毁所有权。

## 兼容性与所有权

现有 `globe` option、`globe: false`、默认 Earth environment、imagery 和 terrain
行为保持不变。默认 `Globe` 同时占用 `_globe` 和 `_world`，但所有权只在
`_world` 中结算一次。替换或移除默认 `Globe` 时，先移除 listener，再销毁旧
primary world，并同步两个 alias。custom world 永远不进入 `Globe` 专用路径。

## 构建与发布影响

新增 `SceneGISWorld` 是 engine 公共 API，由现有 basename-based generator 自动
进入根 export 和声明。不得手工编辑生成 barrel。没有 Shader、Worker、静态资源或
发布协议变化。

## 测试

- `SceneGISWorld` 接口实例化与 required method 错误路径 Specs。
- `CesiumWidget` 默认、no-world、custom world、冲突和 Earth environment Specs。
- frame lifecycle 顺序、`tilesLoaded` request-render、listener 与销毁一次性 Specs。
- 现有 `CesiumWidget`、`Globe` 回归以及 build、声明和 type-check。

## 升级检查点

每次 Cesium 升级检查 `Scene.js` 中 `_globe`/`scene.globe` 的 frame lifecycle、
request-render、destroy 和 listener 使用，以及 `CesiumWidget.js` 的默认 `Globe`、
Earth environment、imagery、terrain 构造顺序。若 upstream 提供等价的互斥
primary-world contract，评估退役 `SGP-0001`。
