# V4B 双世界高级环境接入自审

- Type: `review`
- Status: `technical review passed — owner visual gate confirmed`
- Author/Owner: 当前 Agent，architecture/execution 自审，非独立评审
- Updated: `2026-09-14`
- Target: [V4B](../plans/2026-09-14-v4b-environment.md)，基于 G1 checkpoint `a2f71e1120`
- Decision: [ADR-0071](../../../Documentation/SceneGIS/Decisions/ADR-0071-vector-environment-lighting.md)
- Upstream-owned changes: None；SGP: None

## Findings and disposition

| ID      | Severity | Finding / evidence                                                                                                                                                | Status / owner / follow-up                                                                                   |
| ------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| V4B-R01 | High     | 矢量覆盖原地表颜色，无法自动继承地表物理光照。复用现有 Sun/Moon source、sky irradiance 与 cloud transmittance，以真实位置/法线分别计算 direct/sky。               | fixed；当前 Agent；4 条路径真实 WebGL 像素测试                                                               |
| V4B-R02 | High     | Coverage 凸体不是真实 caster/receiver。Globe 原生定向阴影在实际地表位置采样；coverage command 不投影，sky 不随阴影压暗。                                          | fixed；当前 Agent；实际 3D Box caster、原生 ShadowMap/PCF、零 direct 像素对照                                |
| V4B-R03 | High     | Frame-local record 每帧替换，atlas/LUT 属于环境。Uniform 执行时借用当前值，关闭环境切回 base shader；只释放自有 program 引用。                                    | fixed；当前 Agent；记录替换、native pick、VA 保留、借用纹理与环境关闭释放 Specs/E2E                          |
| V4B-R04 | High     | 已复现 HDR→LDR 期间 shader 更换后，休眠 HDR 派生命令仍持有旧物理 shader；重新启用 HDR、资产尚在加载时，Planar surface 读取 undefined lighting record 并停止渲染。 | fixed；当前 Agent；Planar surface 与 vector 自有更换点撤销 derived records；真实页面往返切换及 Specs 回归    |
| V4B-R05 | High     | 页面地形开关覆盖高级 Globe 的光源/lighting 前提。真实 Globe 要禁用 native lighting，Moonlight 初始化要求 SunLight；基础 DirectionalLight 不能直接带入。           | fixed；当前 Agent；Test 保存/恢复 native 状态，active 期间接管基础光源设置；夜间、terrain 与环境重新启用 E2E |
| V4B-R06 | Medium   | 高级环境有独立成本；近地平线 1440 commands 的基础地图与高级环境均未达到实时交互目标，不能把 G1 常规倾斜视角性能扩大为全场景 60 FPS。                              | open；当前 Agent/后继 M1；本次有界对照见下表，需独立定位近地平线 GPU/driver/几何负载，不限制相机角度         |
| V4B-R07 | Boundary | Planar native geometry-shadow、透明 Globe、地下视角、完整曲面字形与超出当前 shaping profile 的公共字体仍未资格。                                                  | deferred；沿用 ADR-0055 / G1-R09/R10 与后继 V5C/M1，不静默降级                                               |
| V4B-R08 | Gate     | 负责人检查实际大气、云、昼夜、地图颜色、地形阴影与交互观感，并要求补充参数面板与原生时间控件。                                                                    | accepted；负责人于 2026-09-14 明确“我已手动检查通过”；完成本轮页面回归后建立独立 checkpoint，不激活下一阶段  |

## Verification

- 173 项 vector Specs 通过，包含新增 flat、Planar ground、Globe ellipsoid、Globe terrain 4 项环境 WebGL 验证。
  覆盖真实 source/sky/cloud 像素、真实几何阴影、alpha/pick、HDR 往返、record 替换、geometry 与 GPU 所有权。
- 2 项真实环境页面 E2E 分别通过：Planar 52.4 s、Globe 约 84 s。使用本地 MVT 与仓库实际环境资产，
  阻断外网；覆盖 native 状态、controller/Worker identity、夜间、开关与资源释放。初次失败按 R04/R05 修正，未增加重试。
- 2 项既有页面回归通过：Globe 地形/整球/清理 36.9 s，Planar terrain 往返 7.4 s。
- 参数与时间控件补充后的 2 项页面 E2E 通过：Globe 2.9 min、Planar 2.7 min。实际点击 native
  timeline/animation，验证天文光向与 cloud time、数值/单位转换、参数与时间保留、恢复默认与资源释放。
  增加交互后原 120 s 总时限不足，检查停在后半段操作且此前断言通过；总时限调整为 240 s，未增加重试。
  本轮仅 Test API 组装与页面 E2E/文档，不重复产品构建与发布包验证。
- Engine/root build、release build、buildTs、tsc 通过；既有 TSD-JSDoc warnings 保留。
- 实际 installed engine / release ESM / release IIFE 均通过独立运行时验证：Worker、glyph、Planar ground、
  Globe terrain、环境 shader、native pick、资源释放。环境蓝色 receiver 像素为 `[0, 0, 136, 255]`，无外部数据前提。
- 修改范围 ESLint/Prettier、全部 AgentDocs Markdownlint、diff whitespace 与 upstream-baseline 路径审计通过。
  全 AgentDocs Prettier 仍有 233 个既有文件告警；未扩展格式化范围。

## Bounded performance evidence

同机 in-app browser，1432×1150 drawing buffer、DPR 1，OpenFreeMap Bright / Alps，真实 Esri terrain，
pitch -45.14°、zoom 11.9505。每组静态就绪后记录 120 个正常帧，无 CPU profiler 或并行 GPU 测试。
20 visible / 24 resident tiles、469 vector commands、92 labels / 145 candidates、0 failed tiles / symbol failures。
环境组均启用 atmosphere、clouds、cloud shadows、fog/rays，原生几何阴影在该对照中关闭。

| Configuration   | CPU submission P50 / P95 | Frame interval P50 / P95 |
| --------------- | ------------------------ | ------------------------ |
| 基础地图        | 4.4 / 8.3 ms             | 17.4 / 18.6 ms           |
| 高级环境 medium | 5.3 / 9.7 ms             | 24.0 / 26.1 ms           |
| 高级环境 low    | 5.0 / 9.4 ms             | 23.1 / 26.6 ms           |

CPU 增量约 0.6–0.9 ms，命令数不变；帧间隔增量主要属于 GPU/合成路径的环境成本。
这是基于 CPU 与帧间隔差异的判断，不是 GPU timer 分项测量。低云品质在该视图提升有限，不能宣称
单调降低品质即可恢复 60 FPS。无自动画质降档、额外地图颜色纹理或第二套环境资源。

另补查 Alps 同定位的 -8.6°、16 km range 视角，63 visible / 76 resident、1440 commands，地形与地图
均已就绪；原生几何阴影关闭。每组 60 帧，advanced medium 的帧间隔 P50/P95 为 126.1/230.1 ms，
基础地图为 107.4/111.5 ms；对应 CPU 提交 118.1/139.6 与 16.2/29.5 ms。该视角已有明显基础负载
问题，高级环境进一步加重；CPU 提交包含潜在 driver 等待，尚未做 GPU timer/CPU profile 分项定位。
这不是达标证据，按 V4B-R06 保留 open。天空、地形与地图合成可见，验收页恢复常规 45° 视角。

## Handoff

实现、技术验证与负责人视觉验收通过；Test 两页新增高级环境开关、昼夜/品质/云雾选择及 Globe 原生阴影。
本轮没有 upstream-owned 修改，无 SGP。Planar surface 的变更是已复现共享命令切换问题的最小修正。
负责人随后要求补充参数与原生时间轴；两页新增亮度/空气散射/月光、云型/云量/高度/厚度/风、
雾/泛光控件，以及 native Timeline/Animation。数值使用既有属性单位与范围，输入合法时即时生效；
Planar 使用既有 astronomical mode，云时间与 Viewer clock 同步。设置恢复与时钟/地图生命周期分开，
不新增产品 API、Shader 或资源。负责人于 2026-09-14 明确手动检查通过，R08 关闭。
R06 性能工作仍由后继 M1 承接，R07 未资格范围不变；不把本次接受扩大为全场景 60 FPS。
V4B 形成独立本地 checkpoint，不激活下一阶段。

## 2026-09-17 收口处置

负责人验收当前大阶段后，V4B-R06 从 open 转为 deferred：近地平线高命令量与 GPU/driver 成本仍未消除，
当前交付不承诺全场景 60 FPS。V4B-R07 中当前可见地表透明已由 G2/G3 完成；
Planar native geometry-shadow、地下/背面、完整曲面文字和更广字体范围继续 deferred，不能整项标记 fixed。
负责人角色为 architecture，后续按需求重新激活资格阶段；统一跟踪见
[大阶段收口评审](2026-09-17-milestone-closeout-review.md)。
