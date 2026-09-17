# Review：V4A 平面真实贴地

## Metadata

- Status: `completed`，技术自审与负责人视觉 gate 通过
- Reviewer: 当前 Agent，architecture 自审，不是独立评审
- Created / Updated: `2026-09-14`
- Target: `feature/vector-tiles`，`1e9eb1f508` 之后的工作区
- Plan: [V4A](../plans/2026-09-13-v4a-planar-terrain.md)
- ADR: [ADR-0069](../../../Documentation/SceneGIS/Decisions/ADR-0069-planar-vector-ground-rendering.md)
- SGP: None

## Scope and findings

保留 flat；新增 ground 三角凸体、Worker 数值几何、逐要素 pick table、terrain anchor、
地表遮挡和公开 Esri LERC 开关。修改均为 SceneGIS-owned；upstream-owned files 为无，
无新 SGP、依赖、Worker entry 或 Scene pass。生成文件未手工编辑或提交。

| ID      | Severity    | Status   | Owner                  | Evidence / disposition                                                                                                                                                                                                                                               |
| ------- | ----------- | -------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V4A-R01 | correctness | fixed    | execution              | 共享 stencil 无法保留归属；使用每三角形凸体实例、barycentric coverage 与半开边。斜面 alpha、孔洞、stroke、普通/对数深度及多视锥 Spec 通过。                                                                                                                          |
| V4A-R02 | regression  | fixed    | execution              | Cesium builtin discovery 扫描预处理前源码；共享 FS 中 inactive depth-clamp 调用也会引入 varying，曾使 flat link 失败。调用移到仅 ground 编译的 GLSL，完整 vector 回归恢复。                                                                                          |
| V4A-R03 | performance | fixed    | execution              | 全局 -450～8700 米凸体产生大量无效片元。保守 command bounds 不变，uniform 从 World.render 当前 cover 收紧；同一 tile/frame 缓存一次。固定视图帧间隔 median 33.0→16.7 ms，见下表。                                                                                    |
| V4A-R04 | correctness | fixed    | execution              | 圆点/文字原 Z=0 anchor 会埋入或穿透地形。按发布 cover 采样，map 字形四角采样；GPU 地表遮挡同时用于 pick。山脊挡字、provider 更新、atlas/GPU 复用测试通过。                                                                                                           |
| V4A-R05 | lifecycle   | fixed    | execution              | 模式切换丢弃旧 preparation token、销毁旧 GPU/placement，保留 source payload 与 owned Workers。provider→provider 复用 ground 几何；返回 flat 后纹理/pick 释放；销毁清除 terrain snapshot、projection 和 anchor streams，避免保留 CPU 地形网格引用，生命周期断言通过。 |
| V4A-R06 | correctness | fixed    | execution              | 发布 cover 中 FLAT content 无 mesh；收紧包络明确把此内容视为零高程。provider 更换初期也可正常绘制，往返测试通过。                                                                                                                                                    |
| V4A-R07 | correctness | fixed    | execution              | Dash table 的 size uniform 曾覆盖 pick table 尺寸。按名称独立绑定，三个 dashed features 的实际拾取回归通过。                                                                                                                                                         |
| V4A-R08 | quality     | deferred | architecture/execution | 四角采样不能保证大字形跨陡坡/山脊的连续贴合，遮挡局部插值和地形 collision proxies 仍需 V5C 视觉资格；anchor 对 surface 发布可能有一帧差。详见 [标注文档](../../../Documentation/SceneGIS/VectorTileSymbols.md#地形标注)。                                            |
| V4A-R09 | scope       | deferred | architecture/execution | Style 比例仍依赖视轴前向 Z=0 交点，完全水平/仰视离开参考面时不显示地图；不限制 camera pitch，但尚未建立适用于此情形的三维比例契约。由剩余 V4 承接，不能当作 terrain/Globe 完整三维资格。                                                                             |
| V4A-R10 | gate        | fixed    | project owner          | 负责人于 2026-09-14 明确确认本轮画面验收通过并授权转向 Globe；V4A 形成独立 checkpoint，R08/R09 的未完成边界保留。                                                                                                                                                    |

## Validation

- 155 项完整 vector Specs 通过；随后新增高程包络剔除测试，并把普通深度 alpha 用例
  加强为多个 frustums，7 项 ground Specs 通过。释放 CPU 地形引用后，最终 33 项 ground/symbol Specs 回归通过。共 156 项相关 Specs 覆盖通过。
- 9 项相关 E2E 通过：公开页 6 项（新增 300 米确定性地形开关、地形深度、anchor、
  Worker 保留），点标注 2 项、沿线标注 1 项；无外网测试依赖。
- engine/root build、build-ts、tsc、build-release 通过。build-ts 有既有 upstream JSDoc warnings，
  类型检查退出码为 0。
- 实际 installed-engine、release ESM、release IIFE 均通过 Worker transfer、真实字形像素与 pick、
  static/dynamic buffers、蓝色 ground 像素/feature pick/纹理销毁。
- 在线 OpenFreeMap Liberty + Esri LERC：紫金山起伏画面、非零标注高度、无资源失败，
  22 个 MVT render tiles；真实 UI 和 CPU/frame 时间见下文。
- 修改范围格式、ESLint、AgentDocs Markdownlint 与 upstream/generated audit 通过。
  全仓 AgentDocs Prettier 的既有 233 份历史问题沿用前阶段记录，不扩大格式化范围。

## Performance evidence

同机 Windows 应用内浏览器、canvas 1432×1150 CSS、DPR=1、Liberty、Esri 紫金山、倾斜 45°，
zoom 13.8973，native FPS、持续渲染、MSAA=1、FXAA 关闭，没有 Profiler。
固定视图 838 commands / 22 MVT tiles；只在浏览器中临时替换高度 uniform 来比较全球包络，
采样后恢复，未改变源、样式、瓦片数量或相机，未向产品加入 benchmark 分支。

| Workload                                | CPU median / P95 | Frame interval median / P95 |
| --------------------------------------- | ---------------- | --------------------------- |
| 当前 cover 包络，固定 90 帧             | 7.0 / 8.2 ms     | 16.7 / 16.8 ms              |
| 全球高度包络，同一视图 90 帧            | 8.9 / 14.7 ms    | 33.0 / 36.3 ms              |
| 当前 cover 包络，90 帧 ±200 m pan       | 8.9 / 14.7 ms    | 16.7 / 18.6 ms              |
| 当前 cover 包络，90 帧 ±0.12 rad rotate | 10.5 / 17.1 ms   | 16.7 / 18.3 ms              |

运动时另有少量正常瓦片/字形完成，末端 836 commands、22 visible / 24 resident tiles，
无资源失败。Frame interval 包含浏览器/GPU 影响，但不是 GPU timer；仅此设备、视图和
数据的实测，不能推广为所有地形/高密度城市稳定 60 FPS。总内存硬上限和更多 GPU 命令优化
继续沿用 [V3C1C-R08](2026-09-13-v3c1c-symbol-motion-review.md) 的未完成边界。
