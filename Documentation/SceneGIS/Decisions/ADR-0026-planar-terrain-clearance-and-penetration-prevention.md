# ADR-0026：平面地形净空与防穿透

## 状态

- Status：`approved`
- Date：`2026-08-11`
- Amendment：`2026-08-11` 项目负责人人工验收后，将 underground 双向中键 orbit 穿越纳入 A3
- Decision owner：Architecture Agent（依据项目负责人授予的后续阶段自主批准权限）
- Related plan：
  `AgentDocs/planar-terrain-advanced/plans/2026-08-11-phase-a3-terrain-clearance-and-penetration-prevention.md`
- Related patch：无；A3 只允许修改 SceneGIS-owned product files
- Supersedes：ADR-0025 中“surface 只在下一 gesture 校验、A2 不主动纠正 Camera”的阶段性边界
- Preserves：ADR-0024 的三手势锚点链、ADR-0025 的显式 mode owner、public Z=0 picking、
  normal-render-only terrain mutation 与 ControllerHost ownership

## 上下文与源码事实

`SceneGISPlanarCameraController` 目前只在 gesture start 或 wheel event 调用 `_syncRig`。Surface mode
遇到低于地表的 pose 会调用 `viewHome`；idle 或 programmatic Camera 不会被持续检查。因而应用把 Camera
放到 terrain 下方后，表现为下一次输入跳回 Home，而不是正常的碰撞纠正。

现有 `world.getTerrainHeight(position)` 从最深 resident `DIRECT`/`UPSAMPLED` Float32 mesh 查询指定 X/Y
的高度。它不发请求、不推进 LOD、不更新 LRU，也不分配 GPU 资源；无 provider、无 resident terrain、flat
fallback 或 extent 外返回 `undefined`。这是 Camera-local clearance 的低成本查询入口。

`world.pickTerrain(ray)` 面向最近 normal render actual cover，并遍历 cover 中的 terrain triangles。它适合
gesture-start pivot，不适合在每个相机更新中承担连续碰撞扫描。当前 terrain query 也没有 provider-independent
的 swept-volume 协议。A3 因此建立帧级 Camera clearance，而不是引入未经 profiling 的物理碰撞系统。

`ControllerHost` 在每次 Scene render 的 current normal pass 前调用 controller。A3 能看到最近已发布的
resident terrain；新 terrain revision 在 normal render 中发布后，会在下一次 controller update 被采用。

Cesium globe 的 `adjustHeightForTerrain` 同样把 Camera 沿地表法向推到 loaded height 之上，并把 policy 与
observed underground state分开。平面实现借鉴“向上纠正、绝不以 Home 代替碰撞”的思想，但使用固定 Z-up、
`Cartesian3` 米制高度和 SceneGIS resident query，不复用 Cartographic/Ellipsoid/Globe state。

A3 首轮实现与 Architecture review 后，项目负责人人工验收确认 clearance、surface/underground 两侧操作均
正常，但发现 underground 只能通过 programmatic pose 或 Sandcastle view 选择所在侧，用户无法通过既有 PC
手势从地上穿到地下或反向返回。源码复核表明这不是 clearance 拦截，而是 `_rotate` 的 side lock、分侧 pitch
clamp 与 `remainsOnPivotSide` 共同固定了 orbit 所在侧。该产品缺口在 A3 checkpoint 前修正。

## 决策

### Collision policy 继续由 `navigationMode` 表达

- `navigationMode === "surface"` 时启用 Camera-local terrain clearance。
- `navigationMode === "underground"` 时完全跳过 clearance correction，Camera 位于 terrain 上下两侧以及
  programmatic crossing 和本 ADR 定义的中键 orbit crossing 都是合法状态。
- 不新增 `enableCollisionDetection`。显式 underground mode 已是关闭 surface collision 的策略入口；再加
  一个布尔值会形成互相矛盾的组合。
- 不根据 Camera Z、terrain height 或一次 pick 自动切换 mode。

### Public `minimumTerrainClearance`

`SceneGISPlanarCameraController` 增加 constructor option 与 mutable property：

```js
new SceneGISPlanarCameraController({
  world,
  minimumTerrainClearance: 1.0,
});

controller.minimumTerrainClearance = 2.0;
```

- 默认值为 `1.0` 米；只接受 finite 且严格大于 `0.0` 的 number。
- Constructor 和 setter 在任何 controller/Camera/input mutation 前 fail-fast。
- Same-value assignment 是 no-op。
- Setter 本身不移动 Camera、不查询 terrain；新的 clearance 在下一次 registered/enabled controller update
  生效。
- 该 property 不增加新的 runtime export、Event、World/Scene/Viewer option。

### Surface clearance reference

每次需要纠正时，Controller 使用 Camera 的 finite world position：

1. 调用 `world.getTerrainHeight(position)`；
2. finite resident height 作为 `surfaceHeight`；
3. undefined 或 non-finite 结果回退 Z=0；
4. 计算 `minimumZ = surfaceHeight + minimumTerrainClearance`；
5. 若和、差值或 Camera pose 不可表示，在 Camera mutation 前抛出 `DeveloperError`。

该顺序延续 ADR-0025 的 Camera-local relationship。Collision 不使用 `scene.pickPosition`，避免 Entity、
Primitive 或 Ground classification 影响地形 policy；也不调用 terrain request/sampler。

### Correction 时序与响应

- `firstUpdate` 在 surface rig synchronization 前先执行一次 clearance correction，使合法 finite below-surface
  Camera 被沿 +Z 推到 `minimumZ`，随后再同步 center target；不得调用 Home。
- 普通 `update` 在输入前纠正 programmatic/terrain-revision pose；若本帧 pan、rotate 或 wheel 改变 Camera，
  输入结束后再对最终 pose 纠正一次。
- Collision correction 只修改 Camera world position.z，保持 X/Y、direction、up、right、frustum 和 mode；
  使用既有 world/local pose helper，支持 non-identity Camera transform。
- 只允许向 +Z 推开。Terrain 降低、provider detach 或 LOD 降级不得把 Camera 向下吸附；terrain 升高或
  clearance 增大则在下一次 update 立即推高。
- 纠正后的 internal relationship/rig state必须与新 Camera position一致；held gesture的A2 anchor/target
  snapshot继续稳定，release/new gesture再采用新的terrain target。
- Collision 是正常边界处理，任何 surface penetration correction 都不得调用 `viewHome`。Invalid axes、roll、
  pitch 或 frustum 的既有显式 recovery/fail-fast不属于collision，继续按 ADR-0025 处理。

### 防穿透保证与明确边界

A3 的保证是：当 controller 已注册、enabled 且执行一次 update 后，surface mode 的 accepted Camera position
不会低于当次 Camera-local resident terrain/Z=0 fallback 加 `minimumTerrainClearance`。这覆盖 PC input、
programmatic Camera、mode 切回 surface、provider/LOD height 上升和正负地形。

A3 不承诺连续物理 sweep：一次大跨度 programmatic teleport若起点和终点都在terrain上方，可以跨过中间山脊。
当前 triangle ray query 在热路径会线性扫描 actual cover，而固定步长采样又不能形成可靠保证；在没有真实 blocker
与 profiling 前，不把两者伪装成 continuous collision。A3 也不加入速度、惯性、法向滑移、角色体积或坡度限制。

### Underground 双向穿越

- 不新增输入类型：复用中键 drag 的纵向 orbit 作为明确的 crossing gesture。
- Pivot 仍是 press-time A1 rendered depth→terrain→Z=0 链得到的完整 `Cartesian3`，并在整个 held drag 中保持
  snapshot；window anchor 不能在穿越时切到 viewport center 或 Z=0。
- Underground 中纵向 orbit 可跨越相对 pivot 的 side：above/down 经近水平姿态进入 below/up，反向同理；
  crossing 不切换 `navigationMode`、不调用 Home，也不执行 A3 clearance。
- 穿越后 release/new gesture 必须能在新侧重新同步；左键 pan 与 wheel zoom 继续使用既有语义和新侧 target，
  不能因旧 side/pitch 状态失效。Surface mode 保留原 side restriction 与 frame-end +Z clearance。
- Exact/near-tangent pose 不能留下无法继续输入的 rig。实现可使用 controller-owned、无分配的过渡状态或
  representable epsilon，但不得产生可见的大角度跳变、隐式 Home 或 frame-to-frame side oscillation。
- Middle press保存finite orbit distance；underground held drag在Perspective与Orthographic中复用该snapshot，
  避免tangent处重新求交产生`0/0`。若在exact tangent释放，controller围绕同一pivot/window anchor/distance
  使用有符号窄pitch epsilon归一化到刚完成的穿越侧，再清除held状态；该过程不查询terrain或depth。
- 本 amendment 不加入任意朝向 free-look、第一人称飞行、wheel signed-dolly 穿越、touch crossing、惯性、重力
  或 continuous swept collision。若中键 orbit 无法在现有 helper 内保持 press anchor 和 release continuity，
  Execution 必须以可重复 fixture 停止并交回 Architecture，不能静默扩大为 free-flight controller。

### 所有权和实现边界

A3 product implementation 限于
`packages/engine/Source/SceneGIS/Scene/SceneGISPlanarCameraController.js`。优先增加 file-scope helper 和
controller-owned reusable scratch/state；不得为 collision 新建 World/Surface runtime、Shader、Worker 或
upstream seam。

预计 upstream-owned files=`0`、A3 SGP=`0`。若实现证明 point query 不能满足已批准语义，Execution 必须记录
可重复 blocker并交回Architecture，不能自行加入triangle sweep、Scene hook或扩大SGP。

## 不采用的方案

### Surface 与 Underground 再叠加 `enableCollisionDetection`

这会产生 surface+disabled、underground+enabled 等需要额外解释的状态。当前 mode 已准确表达应用 policy。

### 继续用 `viewHome` 恢复 below-surface Camera

Home 会丢失用户位置、heading、pitch 和上下文，正是项目负责人实际观察到的跳转问题。Collision 只做最小
Z-up correction；Home 只保留给无法形成稳定 rig 的非碰撞 invalid pose。

### 每帧调用 `world.pickTerrain` 做 swept collision

现有 ray query面向偶发 picking，会遍历actual-cover triangles。把它放入pan/rotate/wheel和idle热路径会扩大
CPU成本，且flat/no-cover/provider replacement边界仍需另一套协议。

### 沿三角形法线推开

平面terrain是Z-up单值height field，clearance定义为米制垂直距离。逐三角形法线会在triangle/LOD切换时改变
Camera XY并放大当前法线不连续问题；A6才处理视觉normal，不应倒灌到navigation collision。

### Terrain 变低时自动把 Camera 拉回地表

Collision 只防止穿透，不是terrain following。向下吸附会在LOD变化时制造不必要的Camera跳动，并破坏
programmatic高度。

### 把 underground 改成完整 free-flight controller

Cesium globe underground 会在部分路径使用 view-vector dolly、virtual tilt center 和 look fallback，但它依赖更大的
rotate/tilt/look 状态机。A3 只需要补齐现有 planar orbit 的双向穿越；复制或半复制该状态机会扩大输入语义和升级面。

## 测试与最小验证

- Public contract：默认值、constructor/property合法值、invalid atomic rejection、same-value no-op和exact types。
- Programmatic surface correction：positive/negative resident height、Z=0 fallback、non-identity transform、
  direction/up/frustum保持、零Home。
- Input：pan/rotate/wheel各经过一次below-clearance结果并在frame end被推回；held snapshot/release不退化。
- Mode：underground在同样pose下零correction；切回surface的下一update推开但setter本身零mutation。
- Revision：terrain升高只向上推，terrain降低/provider detach不向下吸附；World query/runtime counters不变。
- Real Context：一个non-flat Heightmap representative闭合rendered terrain、surface correction、underground bypass、
  command refs与terrain runtime zero-mutation。
- Crossing：真实 aggregator 中键 drag 从 above/down 穿到 below/up并反向返回；至少一个非中心press anchor、
  exact/near-tangent transition、release后pan/wheel继续工作，以及surface同输入不穿越。Real Context再闭合一个
  terrain上下侧像素/anchor representative，不扩大为全frustum矩阵。
- Public member触发`build`、`build-ts`、`build-docs`、`tsc`；其余只运行受影响focused suites和静态/audit。

## 升级检查点

升级 Cesium 时必须复核：

- ControllerHost update仍发生在normal terrain发布之前，且firstUpdate/update顺序没有改变；
- world/local Camera pose转换后，纯+Z correction保持axes与frustum；
- `world.getTerrainHeight`仍为zero-request/zero-LRU resident query；
- held input snapshot与post-input correction没有引入额外terrain扫描或逐帧分配；
- underground crossing仍复用press-time 3D pivot，tangent transition与release不会留下stale side/target；
- generated declarations/API保持finite positive `minimumTerrainClearance` number契约，public export inventory不变。
