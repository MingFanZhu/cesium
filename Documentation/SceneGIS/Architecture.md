# SceneGIS 架构

本文档记录 SceneGIS 长期维护所依赖的系统边界、分层原则和架构决策入口。它面向架构 Agent、维护者，以及执行公共 API、渲染管线、Shader、Worker、构建发布和官方版本升级等非局部任务的 Agent。

具体编码、分支、测试和补丁操作见 [DevelopmentGuide.md](DevelopmentGuide.md)。强制执行规则见仓库根目录和相关包中的 `AGENTS.md`。

## 当前基线

官方基线的机器可读来源是 [upstream-base.json](../../.scenegis/upstream-base.json)：

- 上游仓库：`CesiumGS/cesium`
- 上游版本：`1.144`
- 上游提交：`6d5d8b1f0725b6f831b336463f4b11c98023427b`
- 产品开发分支：`scenegis/develop`

远程与分支模型：

```text
CesiumGS/cesium:main (upstream)
             |
             v
MingFanZhu/cesium:main (origin, clean mirror)
             |
       official release tag
             |
             v
MingFanZhu/cesium:scenegis/develop
        |             |
        v             v
   feature/*     upgrade/cesium-*
```

`origin/main` 不承载 SceneGIS 修改。`scenegis/develop` 是长期产品主线；官方版本升级通过专用 `upgrade/cesium-*` 分支合入稳定 release tag。

## 架构目标

SceneGIS 的主要目标是：

- 在 CesiumJS 基础上长期扩展 GIS 功能、数据能力和渲染表现力。
- 最大限度集中自有实现，使官方升级成本可观察、可测试、可回退。
- 对不得不修改的 Cesium 原文件建立明确、窄小、带理由的集成缝隙。
- 保持 Cesium 现有 engine、widgets、Sandcastle、构建和测试体系的总体结构。
- 让公共 API、渲染结果、资源生命周期和性能变化都能够被验证。

以下不是目标：

- 追求形式上的“零上游改动”，却使用 monkey patch、隐式全局状态或复制大段上游实现。
- 在不知道真实需求前预先设计所有 Shader、Worker 或资源构建方案。
- 为了目录整齐破坏 Cesium 现有包边界和依赖方向。
- 将 SceneGIS 私有实现误认为浏览器或 npm 层面不可访问的安全边界。

## 所有权模型

`.scenegis/upstream-base.json` 中提交已经包含的路径是 upstream-owned。SceneGIS-owned 路径由根 `AGENTS.md` 列出，核心区域包括：

```text
packages/engine/Source/SceneGIS/**
packages/engine/Specs/SceneGIS/**
packages/widgets/Source/SceneGIS/**
packages/widgets/Specs/SceneGIS/**
packages/sandcastle/gallery/scenegis-*/**
Specs/e2e/scenegis-*.spec.js
Documentation/SceneGIS/**
AgentDocs/**
.scenegis/**
scripts/scenegis/**
```

所有权按照“上游基线中是否已经存在该路径”判断，而不是按照当前分支中文件所在目录判断。修改 upstream-owned file 必须登记 SGP；新增 SceneGIS-owned file 不需要 SGP。

## Agent 协作文档边界

`AgentDocs/**` 是架构 Agent、执行 Agent 和评审 Agent 之间的持久协作区。它不属于 Cesium 或 SceneGIS 的运行时代码，不得被 engine、widgets、Sandcastle、构建或发布流程导入，也不进入 npm 产物。未来如果工具需要读取该目录，必须先通过 ADR 明确协议、失败行为和发布影响。

每个独立 SceneGIS 扩展对应一个稳定目录：

```text
AgentDocs/<extension-slug>/
├── README.md
├── plans/
├── discussions/
└── reviews/
```

扩展目录按产品能力或子系统划分，不按 Agent 对话、Git 分支、提交或单个缺陷划分。目录索引维护当前状态、范围、active plan、未决问题和工程链接；三个子目录分别保存可执行计划、提炼后的方案讨论和带处置状态的评审记录。

AgentDocs 是工作过程和交接记录，不建立新的规范层：

- `AGENTS.md` 定义强制执行约束。
- 本文档和 ADR 定义长期架构边界与决策。
- `.scenegis/upstream-patches.json` 定义上游补丁台账。
- 源码和自动化测试定义当前可执行行为。
- AgentDocs 引用上述事实，并记录尚未完成的计划、讨论、review 和 handoff。

讨论形成长期决定时必须提升为 ADR；形成跨扩展强制规则时必须同步提升到本文档或相应 `AGENTS.md`。原讨论保留并链接正式决定，以保存决策过程而不产生两个事实源。

## Engine 分层

SceneGIS engine 目录镜像 Cesium 的概念层，而不是建立独立平行引擎：

```text
SceneGIS/Core
      |
      v
SceneGIS/Renderer
      |
      v
SceneGIS/Scene
      |
      v
SceneGIS/DataSources
```

允许依赖关系如下：

| 层            | 可以依赖                                              | 不得依赖                              |
| ------------- | ----------------------------------------------------- | ------------------------------------- |
| `Core`        | Cesium Core、SceneGIS Core、无平台副作用工具          | Renderer、Scene、DataSources、Widgets |
| `Renderer`    | Core、Cesium Renderer、SceneGIS Renderer              | Scene、DataSources、Widgets           |
| `Scene`       | Core、Renderer、Cesium Scene、SceneGIS Scene          | DataSources、Widgets                  |
| `DataSources` | Core、Scene、Cesium DataSources、SceneGIS DataSources | Widgets                               |

UI 能力属于 `packages/widgets/Source/SceneGIS`。Sandcastle 只组装示例，不承载可复用业务实现。

## 公共 API 与私有语义

Cesium 当前由 [scripts/build.js](../../scripts/build.js) 递归发现普通 engine JS，并按文件 basename 生成根导出。这是扁平 API，不会根据目录生成命名空间。

SceneGIS 当前采用以下策略：

- 公共模块文件名、default export 和 JSDoc 类型名以 `SceneGIS` 开头，并保持一致。
- 公共 API 通过 Cesium 现有根入口暴露，不要求调用方 deep import。
- 文件内部 helper 优先保持文件作用域，不为猜测中的复用提前拆分。
- 跨文件私有模块 basename 使用 `_SceneGISFoo.js`，可以同时放在 `_private/`，并标记 `@private`。目录名不会进入根导出名。
- `@private` 表示不属于兼容性承诺；它默认从公开文档和类型声明隐藏，但仍可能出现在 JS barrel 或通过 deep import 访问。
- 不引入 `@package` 可见性层级。

当前不修改构建器来严格隐藏 `_` 模块。未来只有在真实内部模块数量、包体积或 API 污染问题出现后，才评估 barrel、JSDoc、类型、tree-shaking 和 npm 发布的完整影响。

## 上游集成策略

实现顺序从低耦合到高耦合：

1. 使用 Cesium 现有公共或内部扩展点。
2. 在 SceneGIS-owned 目录中通过组合实现。
3. 在 upstream-owned file 中增加一个窄小、显式、可测试的 hook，主体实现仍位于 SceneGIS。
4. 最后才直接修改 Cesium 算法、渲染流程或资源协议。

每个上游集成目的使用一个稳定的 `SGP-####`。SGP 记录在 [upstream-patches.json](../../.scenegis/upstream-patches.json) 中，并通过 `SCENEGIS_PATCH_BEGIN` / `SCENEGIS_PATCH_END` 标记具体文本 hunk。

SGP 生命周期：

```text
proposed -> active -> retired
```

- `proposed`：已确认需要上游缝隙，但尚未完成实现或验证。
- `active`：当前产品主线仍依赖该补丁。
- `retired`：官方已提供等价能力、设计已移除，或不再支持相关功能。

编号不得复用。官方升级时逐项复核所有 active SGP。

## 构建边界

当前已确认的构建行为：

| 扩展类型                       | 当前行为                              | 架构要求                                       |
| ------------------------------ | ------------------------------------- | ---------------------------------------------- |
| 普通 `Source/SceneGIS/**/*.js` | 自动进入 engine 与根 Cesium barrel    | default export；basename 唯一                  |
| `Specs/SceneGIS/**/*Spec.js`   | 自动进入 SpecList                     | 镜像源码目录                                   |
| GLSL                           | 当前主要扫描 `Source/Shaders/**`      | 首次需求时追踪完整 shader 转换链路             |
| Worker                         | 当前主要扫描 `Source/Workers/**`      | 首次需求时决定输出路径和运行时 URL             |
| 静态资源、WASM、图片           | 发布复制与测试访问链路不同            | 同时验证 workspace、release、npm 和 Sandcastle |
| CSS 与 UI                      | engine 与 widgets 规则不同            | UI 保持在 widgets 包边界内                     |
| 模块副作用                     | 受 tree-shaking 和 `sideEffects` 影响 | 优先显式安装或注册 API                         |

Shader builtin、SceneGIS Worker 输出结构以及严格私有 barrel 当前都是延迟决策，不在没有真实功能和源码证据时预设答案。

## 渲染扩展原则

渲染表现力扩展可能涉及 Primitive、DrawCommand、PostProcessStage、CustomShader、Model pipeline stage、Globe shader、FrameState 或 Scene render loop。选择接入层时遵循：

- 优先使用已有公开抽象；只有公开抽象无法表达需求时才进入内部渲染层。
- SceneGIS 计算和状态尽量封装在自有模块；Cesium 原文件只调用窄接口。
- 不通过 prototype 替换、加载时注入或隐式全局注册改变渲染流程。
- 明确 GPU/CPU 资源的创建、所有权、复用、失效和销毁时机。
- 热路径避免无依据的逐帧对象分配、Shader 重编译和状态抖动。
- 影响默认画面时提供稳定的像素回归场景；影响性能时记录可重复的基线和对比条件。

## 验证架构

SceneGIS 使用四层验证：

1. Jasmine 单元、契约和资源生命周期 Specs。
2. WebGL、Shader 和渲染 matcher 测试。
3. Sandcastle 可执行示例与人工视觉验收。
4. Playwright 关键交互和持久视觉回归。

Sandcastle 默认截图只能作为基础冒烟，不能覆盖参数组合、错误输入、销毁过程和性能变化。

## 官方版本升级

官方升级必须在 `upgrade/cesium-*` 分支完成：

1. 获取并核验新的官方 release tag。
2. 将 tag 合入升级分支，不混入新功能开发。
3. 逐项检查 active SGP：继续、调整或退役。
4. 复核所有 ADR 中记录的构建、运行时和升级检查点。
5. 运行构建、类型、Specs、关键 Sandcastle、E2E 和性能验证。
6. 更新 `upstream-base.json`，并使补丁清单反映新基线下的实际差异。
7. 验证完成后再合入 `scenegis/develop`。

## 架构决策记录

以下情况需要 ADR：

- 新子系统或新的跨层依赖。
- 公共 API 形态或兼容性承诺变化。
- Shader builtin、Worker、WASM、资源路径或构建发布方案。
- 修改 Scene、Renderer、Model pipeline 或其他高风险热路径。
- 引入新的运行时注册协议、缓存、线程或资源所有权模型。
- 对官方升级方式产生长期影响的决定。

ADR 放在 `Documentation/SceneGIS/Decisions/ADR-####-short-title.md`。首次需要时再创建目录和模板。ADR 至少包含：

- 状态与上下文。
- 当前 Cesium 版本的源码事实。
- 考虑过的方案。
- 最终决定与理由。
- 运行时、构建、发布和升级影响。
- 测试与性能验证。
- 相关 SGP（如有）。

局部、易回退且不形成长期约束的实现细节不需要 ADR。一个决定成熟为全局规则后，应把精简规则提升到本文档或相应 `AGENTS.md`，ADR 保留历史原因。

## 当前延迟决策

- SceneGIS GLSL 和 `czm_*` builtin 的最终目录与生成方式。
- SceneGIS Worker 的入口发现、输出目录、URL 和 inline worker 行为。
- 是否从根 JS barrel 严格排除 `_` 私有模块。
- SceneGIS 静态资源在 workspace、release、npm 和 CDN 中的统一定位方式。
- 持久视觉基线和性能基线的 CI 执行环境。

处理这些问题时必须以届时的 Cesium 源码为准；本文档不把当前推测升级为约束。
