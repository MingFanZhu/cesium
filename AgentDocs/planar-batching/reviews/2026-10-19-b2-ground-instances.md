# B2 贴地线面合批 review

- Type: architecture / code review
- Status: approved
- Owner role: architecture（当前任务自审，未启用独立 Agent）
- Created / Updated: 2026-10-19
- Target: [B2 plan](../plans/2026-10-19-b2-ground-instances.md)
- ADR: [ADR-0168](../../../Documentation/SceneGIS/Decisions/ADR-0168-planar-static-batching.md)
- SGP: None

## Findings

后续 [B4 review](2026-10-19-b4-ground-area-draws.md) 已补齐 area extent 片元归属与空间分组，
解除 B2-R6 对不相交异色/透明面与拾取的逐对象命令限制；本表保留 B2 当时的结论。

| ID    | Severity | Status   | Evidence / disposition                                                                                                                                                                   |
| ----- | -------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B2-R1 | high     | fixed    | 不同色或透明 footprint 共写 stencil 会污染着色；复用原生 `_pickOffsets` 隔离范围。真实像素与旧单对象对照、孔洞和重叠透明度测试通过。                                                     |
| B2-R2 | high     | fixed    | 4-bit classification mask 在 16 个同色重叠体时回绕；每组最多 15 个。32 个完全重叠面的颜色、末项 pick 和改色重分组均通过。                                                                |
| B2-R3 | medium   | fixed    | 单 Primitive uniform width 和 FLOAT previous/next 点不能正确表示跨 origin、不同宽度的线。改为 DOUBLE 点差生成方向与逐顶点 width；交叉线像素、拾取及大坐标浏览器图像通过。                |
| B2-R4 | medium   | fixed    | 原生 16-bit geometry split 后的 pick offset 无法完整表达跨 VA 实例；大于 65535 顶点且无 uint 支持时在 GPU 创建前拒绝。8192 个面验证失败分支及成功共享一个 VA。                           |
| B2-R5 | medium   | fixed    | 候选初始化可能向 frameState 发布部分命令；改为隔离 commandList，失败销毁候选、保留 current。失败恢复后实例颜色保留且旧 GPU 资源释放。                                                    |
| B2-R6 | low      | accepted | 贴地线、透明与不同色面仍保留逐对象 stencil/color 命令；共享 Primitive/VA 减少 CPU/GPU 资源，不能宣称完全消除 draw call。扩大 fragment footprint backend 超出本次静态入口与最小改动范围。 |

## 验证

- Ground 开发与 release Specs 各 18/18；DataSources 回归 102/102。
- 基于真实 WebGL 验证 overlap、holes、alpha、独立 ID/show/color、width、候选失败、释放和 provider 生命周期。
- 8192 个面、65536 顶点：一个 Primitive/VA，547 对 stencil/color 命令，8192 个 pick ranges。
- 静态 warm 帧不再读取全部实例颜色，命令 identity 保持；颜色改变通过 native BatchTable dirty 触发范围规划。
- dev/release build、build-ts、tsc 与严格 SDK root/engine 类型用例通过。
- 非 pedantic API HTML 生成通过，仅有 B1 记录的两处既有 Scene.js 警告。
- 实际 engine tarball 的公开普通/贴地 batch 构造、Ground 实例声明、生成的 line Shader 和销毁通过；
  smoke 首次因小 extent 使用默认 maximumLevel 失败，显式 maximumLevel=0 后复用同一 tarball 验证成功。
- ESLint 通过。颜色比较按固定 RGBA 四分量执行，避免循环内回调捕获可变 previousColor。
  最后这一等价改写后重新构建 release，GroundBatch 8/8 通过。
- AgentDocs 全量 markdownlint 通过；全量 Prettier 仍报 452 个既有文件，本扩展及修改代码/示例 scoped check 通过。

## 浏览器证据

同一 Chrome Headless 155 / Windows 10、1280×900、DPR 1，本地确定性数据，无公网数据。
使用 [平面图形合批](../../../Test/平面图形合批.html) 的 1024 对象，先 warm 各类型，再逐对象/合批对照；
每组统计 20 个 warm frames，计时为 CPU 提交，不包含 GPU fence 等待。

| 数据                 | Primitive / VA（逐对象 → 合批） | stencil + color 命令（逐对象 → 合批） | CPU median / P95 ms（逐对象 → 合批） |
| -------------------- | ------------------------------- | ------------------------------------- | ------------------------------------ |
| 同色不透明贴地面     | 1024 / 1024 → 1 / 1             | 2048 → 138                            | 7.0 / 9.9 → 0.9 / 1.5                |
| 独立颜色与宽度贴地线 | 1024 / 1024 → 1 / 1             | 2048 → 2048                           | 9.3 / 12.3 → 6.7 / 9.2               |

首建与提交（同一 warm renderer）area 133.2 → 15.9 ms，line 125.7 → 24.3 ms。
不作跨设备容量或 FPS 承诺。两类型截图已目视检查，业务对象 532 均可点击改白，隐藏后无法拾取，浏览器错误为 0。
普通面 B1 的资源与 timing 证据见 [B1 review](2026-10-19-b1-native-instances.md)。

## 边界与剩余风险

B3 后继已按用户要求处理 line draw call，见 [B3 review](2026-10-19-b3-ground-line-draws.md)；
以下 B2 性能与边界保留为当时的 checkpoint 事实，其中 line 逐实例命令限制由 B3 替代。

- 修改均位于 SceneGIS-owned 路径；upstream-owned files=0，新增/变更 SGP=0；生成 shader JS、barrel、声明与 Build 不提交。
- 同步首次构建、拓扑更改整批重建，SDK 仍应按空间/样式/更新频率分批；不自动合并 Entity。
- Ground 采用原生 offsets 与 BatchTable dirty 私有语义，已写入升级检查；非 uint Context 需要调用方较小批次。
- 标准 docs 的两处既有上游 pedantic 告警、AgentDocs 全量既有格式问题沿用 B1 记录，不扩大修复范围。
- 本阶段无延期产品修复；进一步降低贴地线/透明异色面 draw call 需要独立的 footprint Shader 设计与资格。
