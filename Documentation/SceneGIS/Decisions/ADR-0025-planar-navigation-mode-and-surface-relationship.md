# ADR-0025：平面导航模式与相机—地表关系

## 状态

- Status：`approved`
- Date：`2026-08-10`
- Decision owner：Architecture Agent（依据项目负责人授予的后续阶段自主批准权限）
- Related plan：
  `AgentDocs/planar-terrain-advanced/plans/2026-08-10-phase-a2-navigation-mode-and-surface-relationship.md`
- Related patch：无；A2 只允许修改 SceneGIS-owned product files
- Supersedes：ADR-0004 中“Camera 永远位于 Z=0 上方”的阶段性 profile，以及 ADR-0024 中
  `_syncRig`、center target 与 clamp 永远使用 Z=0 的 A1 保留边界
- Preserves：public `world.pick`/`pickFromWindowPosition` 的有界 Z=0 语义、A1 gesture anchor
  fallback chain、ControllerHost/Viewer ownership、Home 的 north-up/nadir 语义

## 上下文与源码事实

当前 `SceneGISPlanarCameraController` 只有一套 surface-side orbit profile：

- `_syncRig` 以 viewport center ray 与无限 Z=0 平面求交，并要求 Camera world Z 大于 0；
- pitch 固定在 `[-90°, -5°]`，roll 必须为 0；不满足时，下一次 gesture 会调用 `viewHome`；
- `_target` 与 `_applyTargetClamp` 把 Z 固定为 0；
- `_rotate` 还拒绝新的 Camera Z 小于等于 0；
- `viewHome` 始终建立 world extent center 上方的 north-up/nadir 视图。

A1 已把 pan、rotate 与 wheel 的鼠标锚点改为 rendered depth → actual-cover terrain → bounded Z=0，
并允许正、负 anchor Z；但它刻意没有改变上述全局 rig。因而应用即使通过 programmatic Camera 把视点放到
terrain 下方，下一次输入仍会被当作非法 pose 并恢复到 Home。

现有 terrain 是双面 2.5D height field，`world.getTerrainHeight(position)` 能只读查询 Camera X/Y 下最深的
resident `DIRECT`/`UPSAMPLED` Float32 surface；没有 resident terrain 时返回 `undefined`，且不发请求、不更新
LRU。`world.pickTerrain(ray)` 能从地表上下两侧拾取最近 normal render 的 actual cover。两者足以建立平面
camera-surface relationship，但都不能单独表达应用是否允许地下浏览。

Cesium globe 把 policy 与 observed state 分开：`enableCollisionDetection` 控制行为，私有/Scene
`cameraUnderground` 根据 Camera 与 loaded globe height 判断当前关系。SceneGIS 采用相同思想，但不能复用
Cartographic、Ellipsoid、Globe height callback 或 upstream `Scene.cameraUnderground`。

`ControllerHost` 在 current normal render 前更新 controller；因此 A2 查询的是最近已发布的 resident/query
状态。Viewer 已通过 readonly `viewer.planarCameraController` 暴露其拥有的 controller，不需要再增加
Viewer option 或新的 upstream seam。

## 决策

### 模式由 Controller 拥有

`SceneGISPlanarCameraController` 增加公共构造选项和 mutable property：

```js
new SceneGISPlanarCameraController({
  world,
  navigationMode: "surface", // "surface" | "underground"
});

controller.navigationMode = "underground";
```

- 精确合法值为 lowercase string literals `"surface"` 与 `"underground"`；默认值为 `"surface"`。
- 使用 string union 而不是新增 runtime enum export，避免为两个稳定值扩大公共 export inventory。
- 模式属于 input/camera policy，不属于 `SceneGISPlanarWorld`、terrain provider、Scene 或 Viewer。
- `Viewer({ world })` 继续创建默认 surface controller。应用通过
  `viewer.planarCameraController.navigationMode` 切换；A2 不增加 Viewer constructor option。
- A2 不增加 `navigationModeChanged` Event。Setter 是同步、可读状态；当前 controller settings 也不提供
  change events。若未来出现独立 UI observer 需求，再单独评审事件契约。

Setter 必须在任何状态修改前验证值。相同值是 no-op；不同值会取消并隔离当前 held pan/rotate/wheel input，
避免一个 gesture 跨越两种模式，但不得移动 Camera、修改 frustum、调用 Home、查询 terrain 或改变 World。

### 模式与 observed relationship 独立

Controller 使用 file-scope private helper 按需计算 Camera 与逻辑平面地表的关系：

1. 以 finite world Camera position 调用 `world.getTerrainHeight(position)`；
2. 得到 finite resident height 时以它作为 `surfaceHeight`；
3. 无 provider、无 resident content、flat fallback 或 extent 外时，明确以 Z=0 作为关系参考；
4. `signedDistance = camera.position.z - surfaceHeight`，内部分类为 above、below 或 on-surface。

该 relationship 是 A2/A3 的 private seam，不是新的 public API，不触发事件，也不得反向推断或改写
`navigationMode`。Terrain LOD/provider 变化可以让下次同步得到不同关系；A2 只更新输入所需的 private state，
不据此推开、吸附或恢复 Camera。关系查询不得创建 tile/request/mesh/GPU resource，不改变 selection、LRU、
readiness 或 command references。

### Mode-aware center rig

A2 把 `_syncRig` 的固定 Z=0 center target 提升为私有 mode-aware surface target：

1. 使用既有 four-frustum helper 计算 viewport-center world ray；
2. 优先调用 `world.pickTerrain(ray)` 获得当前 actual-cover terrain target；
3. terrain miss 时，与上述 `surfaceHeight` 的无限水平面做 forward intersection；无 resident terrain时该平面
   即 Z=0；
4. target X/Y 继续按 inclusive world extent clamp，但保留 target Z，不修改 public bounded pick；
5. 一次 gesture 内仍使用同步得到的稳定 target/anchor，不因 LOD replacement 中途跳变。

Center rig 不使用 `scene.pickPosition`，避免前景 Entity/Primitive 临时改变全局 orbit/range target。A1 的
pointer gesture anchor 仍保留 rendered depth priority，因此对象上的 pan/rotate/wheel 视觉锚点不退化。

### Surface 与 Underground profile

`"surface"` 保持默认、兼容 profile：

- Camera 必须位于当前 center surface target 的上方并朝下观察；pitch 仍限制为 `[-90°, -5°]`，roll 为 0；
- 已有 invalid external pose 在下一 gesture 的 Home recovery 保留；
- A2 不加入 clearance、swept collision、terrain-normal correction 或防穿透，因此“位于上方”是同步/输入
  profile，不是永久 world invariant。

`"underground"` 是允许地表两侧浏览的显式 profile：

- target 在 Camera 下方时沿用 surface 的负 pitch range；target 在 Camera 上方时使用镜像
  `[+5°, +90°]` pitch range；两侧均保持 roll 为 0；
- 合法 below-side programmatic pose 在下一 pan/rotate/wheel 不调用 Home；三种 A1 anchor 继续工作；
- rotate 保持当前 orbit side，不以一次旋转跨过 pivot；zoom 的 minimum range 仍避免穿过当前 target；
- 切换到 underground 本身不移动 Camera。`viewHome(scene)` 仍建立 surface-side home，但不改回
  `navigationMode`，因为 underground 表示“允许两侧”，不是“Camera 必须位于下侧”。

如果 underground pose 没有 forward surface target、位于 target 上、近水平或 axes/roll 不可用于稳定 orbit，
普通输入不得把它当作边界碰撞并自动 Home；合法 miss 只忽略该帧 gesture。非 finite/degenerate Camera 或
frustum 仍按既有规则 fail-fast。A3 才定义 free-look、crossing、clearance 与 recovery 的完整策略。

### A3 保留边界

A2 不实现：

- terrain clearance、连续/swept collision、速度相关安全距离、法向位移或防穿透；
- programmatic Camera 每帧强制纠正、terrain LOD replacement push-out 或 provider replacement recovery；
- surface ↔ underground 自动切换、穿越手势、free-look、flight/tracking、touch 或 inertia；
- underground material、terrain transparency、cutaway、洞穴或多值 Z surface。

A3 必须复用 A2 的 public mode 与 private relationship 语义，并以实际交互证据决定 collision profile；不得
再用 Camera Z 或一次 pick 隐式切换模式，也不得把 `viewHome` 当作正常碰撞处理。

### 实现、所有权与发布边界

A2 的 product implementation 限于
`packages/engine/Source/SceneGIS/Scene/SceneGISPlanarCameraController.js` 与必要的既有 private four-frustum
camera helper；优先使用 file-scope helper，不为 relationship 创建公共类型。

不修改 World/Surface/Terrain runtime、Scene、CesiumWidget、Viewer、Shader、Worker 或 build generator；预计
upstream-owned files=`0`、A2 SGP=`0`。`navigationMode` 是既有 public controller 的新 member，不增加
non-underscore SceneGIS runtime export，现有 engine/widgets/root exact export inventory保持不变。

## 不采用的方案

### 把模式放到 `SceneGISPlanarWorld`

World 负责 surface/data/resource ownership，不拥有 input controller。一个低层应用可以暂时没有 controller，
也可以自行实现其他 navigation policy；把模式放到 World 会混淆职责并引入状态同步。

### 复用 `Scene.cameraUnderground` 或修改 `Scene`

该状态由 Globe/Cartographic height 驱动，平面 world 中没有对应语义。修改 upstream Scene 还会扩大 SGP-0001，
但 Viewer 已暴露 controller，不存在必要 seam。

### 根据 Camera Z 自动切换模式

正、负 terrain 与非零 height 使 Camera Z 不能代表地表关系；即使知道 above/below，也不能推断应用是否允许
穿越。Observed relationship 只能服务当前显式 mode。

### 新增 `SceneGISPlanarNavigationMode` runtime enum

两个 lowercase string literal 已能形成严格 types/runtime validation。新增 enum 会扩大 package public inventory、
兼容矩阵与长期入口维护，却不增加行为表达力。

### 在 A2 同时实现 collision

Collision 需要 clearance、连续路径、terrain revision、边界与 programmatic Camera 的独立证据。把它混入 A2
会让模式契约无法先稳定，也会把正常 invalid-pose recovery 与防穿透混为一谈。

## 测试与最小验证

- Public contract：constructor/property 的默认值、两个合法值、invalid atomic rejection、same-value no-op、
  held-input isolation，以及 exact generated string union。
- Mode adoption：surface above/down 兼容；underground above/down 与 below/up 均可同步；切换本身保持 Camera、
  frustum、World 和 terrain query不变。
- Relationship：positive/negative resident height 与 no-provider/no-resident Z=0 fallback；mode 不被 observed side
  反向修改。
- Gesture：一个 perspective 与一个 orthographic representative 证明 below-side pan/rotate/wheel 不 Home、
  mirrored pitch clamp、target Z 保留、A1 pointer anchor与 release/cancel不退化。
- Real Context：本地 non-flat Heightmap 上方/下方各一个 pose，terrain target、public Z=0 pick、command refs 与
  terrain runtime zero-mutation闭环；不扩大为四 frustum/GPU 矩阵。
- Public API 运行 `build`、`build-ts`、`build-docs`、`tsc` 并检查 runtime/types/API member；不运行无关全库
  regression、Sandcastle build 或 release package smoke。

## 升级检查点

升级 Cesium 时必须复核：

- ControllerHost update 与 normal render 的顺序，以及 programmatic Camera 在下一 input frame 的同步时机；
- four-frustum ray、world/local Camera pose、positive pitch 与 nadir heading round-trip；
- `world.getTerrainHeight`/`pickTerrain` 的 zero-mutation、双面与 revision invalidation；
- CameraEventAggregator cancel/quarantine，不让 held input 跨 mode；
- Viewer readonly controller getter仍足以配置 mode，无需新增 upstream option；
- generated declarations 保持 `"surface" | "underground"`，公共 export inventory没有意外变化。
