# ADR-0188：分段 Gaussian 泼溅迁移

## 状态与依据

- Status: accepted
- Date: 2026-10-23
- Owner: Architecture / execution（本任务）
- Plan: [extension plan](../../../AgentDocs/gaussian-splats/plans/2026-10-23-migration.md)
- SGP: P1 无；P2 为 SGP-0067。

来源为旧 Cesium 1.141 工作树，提交基线
`9f90975b4f478b4795df96a1112bd6518f9d22a7`。迁移时包含分段 runtime 的远距离排序
范围修正、对应测试及 CPU 工具已有的 authored LOD 导入；不修改来源仓库。
项目负责人明确排除 fixed10 加载和切片，训练蒸馏不迁移。

## 源码事实

旧分段路线由 `GaussianSegmentedPrimitive`、Active Cut、page ownership、global atlas、
mapping/sort Workers 组成。它复用 MCI manifest、Core/SH page 和 GSP pack 格式，
但不依赖固定网格 primitive、TilePlan 或 tile sorter。CPU builder 中的文件 hash helper
误与固定网格 builder 共置，迁移时提取，不能为了这个 helper 搬入固定网格构建入口。

目标 Cesium 1.144 已有 `Pass.GAUSSIAN_SPLATS` 和 SceneGIS deferred 混合场景调度。
普通 JS 依 basename 生成 default exports；Shader 与 Worker 分别由既有 glob 构建。
`createUniform` 已支持浮点 sampler2DArray，尚未支持整数 sampler2DArray。

## 决定与替代方案

仅移植 segmented-active-cut-v3；公共入口使用 `SceneGISGaussianSegmentedPrimitive`。
保留二进制格式、producer policy 和显式分段路由，不把 fixed10 产品自动转换或降级加载。
shared manifest/刚体校验从旧 mixed runtimeIndex 中提取，删除固定网格 reader/writer 依赖。

平台无关协议、编码数学与选择逻辑放入 SceneGIS Core private；Renderer 只放 GPU 资源，
Scene 持有请求、帧状态和呈现生命周期。私有文件使用唯一 `_SceneGISGaussian*` basename、
default export 与 `@private`。不改变公开 Cesium 模块身份，不复制整个 Scene 或原生 Gaussian renderer。

`Tools/GaussianSplatTiler` 仅包含 Node.js I/O、CPU reducer、worker_threads 调度和 CLI。
工具直接引用仓库内 Core 的纯模块，以单一源码维护 reader/writer 协议；不复制一份 browser
协议到 Tools，也不让 engine 依赖 Tools。它从完整仓库运行，不是独立 npm 发布物。
工具无需安装训练框架，不增加根 workspace 或运行时依赖。维护独立说明与 Node tests。

## 构建、发布与升级

P1 不修改 upstream-owned files。Engine 使用既有 Source 发布范围；Tools 不进入 Cesium 包。
只提交迁移后的源文件，不提交旧 Build、生成 shader JS、barrel 或大体积数据。
Worker 与整数 sampler 的准确接入、生命周期、Shader 颜色/遮挡见下述 P2 决定。

升级检查：Core 无 Node 依赖、唯一 basename/default export、MCI/GSP round trip、
TaskProcessor 生命周期、integer array sampler、Gaussian pass 与 deferred 混合场景。

## 验证

### P2 接入细化

新增两个 owned Worker entries：`SceneGISGaussianSortWorker.js`、`SceneGISGaussianMappingWorker.js`。
算法在 Core private，入口只调用 createTaskProcessorWorker；图元拥有 Worker、atlas 和 presentation。
保持原代际/ack 协议及移除后异步清理，不增加全局 Worker pool。只对当前 Context 建立资源。
明确的迁移修正：`requestDestroy` 同步释放 VAO/shader，因为 Scene 随后立即销毁 Context；
Worker/page cleanup 继续异步完成，atlas 释放后实际分配字节归零。Strict WebGL 的 Scene
in-flight teardown 用例覆盖该失败模式，不能要求用户先等待 Worker 才能销毁 Viewer。
GPU atlas 使用窄小 RGBA32UI array owner，避免迁入旧通用 Texture2DArray 的大量 Cesium 派生实现。
SGP-0067 对 `Renderer/createUniform.js` 添加 integer array sampler 分派，沿用 native UniformSampler。
其余调用 native `Pass.GAUSSIAN_SPLATS`，不搬入旧 RAD_SPLATS pass 或修改 Scene。
升级复核 GL texture state、TaskProcessor 错误/ack、log depth、颜色空间与混合场景排序。

P1：分段协议/Active Cut/page ownership 和 CPU producer 测试，CLI 构建/inspect/validate，
损坏数据拒绝与旧产物兼容；确认不存在 fixed10 加载或切片入口。
P2：严格 WebGL Specs、真实 Worker、资源释放、球面/平面示例、构建/声明/类型检查、
可复现性能与视觉证据。数值测试不替代负责人视觉验收。

用法与预算边界见 [GaussianSplats](../GaussianSplats.md)。
