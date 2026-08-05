# SceneGIS Engine Agent 约束

本文件适用于 `packages/engine/**`，并补充仓库根 `AGENTS.md`。

## 源码布局与依赖方向

普通 engine 扩展放在：

```text
Source/SceneGIS/
├── Core/
├── Renderer/
├── Scene/
└── DataSources/
```

只创建实际需要的目录。依赖必须保持单向：

- `SceneGIS/Core` 只能依赖 Cesium Core、SceneGIS Core 和无平台副作用的第三方工具。
- `SceneGIS/Renderer` 可以依赖 Core 和 Renderer，不得依赖 Scene、DataSources 或 Widgets。
- `SceneGIS/Scene` 可以依赖 Core、Renderer 和 Scene，不得依赖 DataSources 或 Widgets。
- `SceneGIS/DataSources` 可以依赖 Core、Scene 和 DataSources，不得依赖 Widgets。
- UI 组件放入 `packages/widgets/Source/SceneGIS`，不得塞入 engine。
- 新的反向依赖或跨层循环必须先形成 ADR。

## 导入与公共 API

- engine 内部使用相对路径直接导入源码模块。不得从 engine 内部自引用 `@cesium/engine`、根 `cesium` 或生成的 `index.js`。
- SceneGIS 公共文件名、default export 符号名和 JSDoc 类型名必须一致，并以 `SceneGIS` 开头，例如 `SceneGISAtmosphere.js`。
- 公共 API 延续 Cesium 当前的扁平导出方式；目录名不会形成命名空间。
- 普通 engine JS 会被构建器按 basename 自动重导出，因此所有被源码 glob
  命中的文件必须提供 default export，且 basename 在整个 engine 中唯一。
- 不在 `Source/SceneGIS` 下创建局部 `index.js`。需要聚合模块时使用能表达职责的名称。
- named export 不会自动提升到根 barrel；不得把只能通过 deep import 获取的 named export 当作稳定公共 API。

## 私有实现

- 优先把 helper 写成文件作用域的 `function` 或 `const`，不要为了复用猜测而提前拆分文件。
- 私有属性使用 `_name`。私有成员函数仅在确实需要多态或成员访问时使用 `_method`，否则使用文件作用域 helper。
- 必须跨文件共享的内部模块 basename 使用 `_SceneGISFoo.js`，可以同时放在
  `_private/` 目录，并在模块级 JSDoc 标记 `@private`。目录名不会进入根导出名，
  因此不能只依靠 `_private/` 表达私有。
- Cesium 当前采用软私有：`@private` 默认从公开文档和类型声明隐藏，但模块仍可能出现在 JS barrel 或被 deep import。不得向调用方承诺私有模块兼容性。
- 当前不修改构建器来物理隐藏私有模块。若未来需要严格排除，先调查构建、类型、文档和发布影响并形成 ADR；修改上游构建文件时登记 SGP。
- 不使用 `@package` 创造另一套可见性语义。需要完全忽略文档和类型时才使用 `@ignore`，并说明原因。

## JSDoc 与错误处理

- 公共 API 必须按 Cesium 现有风格提供完整英文 JSDoc，包括参数、返回值、异常、生命周期和必要示例。
- 不暴露尚未稳定的实现细节。实验 API 必须明确标记并记录兼容性预期。
- 使用 Cesium 现有的 `Check`、`DeveloperError`、`RuntimeError`、`defined` 等约定，不引入平行的错误体系。
- 热路径避免无依据的逐帧分配、隐式状态和全局注册；必要开销必须有测量依据。

## Shader、Worker 与资源

- 不假设 `Source/SceneGIS/Shaders`、`Workers`、CSS、WASM 或静态资源会自动进入正确的构建产物。
- 第一次引入某类特殊资源时，先追踪当前 `scripts/build.js`、运行时 URL、npm 包、
  Sandcastle、Specs 和 release build 的完整链路。
- 形成长期接入方案后记录 ADR。需要修改现有构建文件时，使用 SGP 标记和补丁清单。
- 优先使用显式的 `install`、`register` 或实例配置 API，避免依赖模块导入副作用。确需副作用时验证 tree-shaking 和 `package.json#sideEffects`。

## Specs

测试路径镜像源码路径：

```text
Source/SceneGIS/Core/SceneGISFoo.js
Specs/SceneGIS/Core/SceneGISFooSpec.js

Source/SceneGIS/Scene/SceneGISBar.js
Specs/SceneGIS/Scene/SceneGISBarSpec.js
```

- Spec 文件必须以 `Spec.js` 结尾，测试描述使用 `SceneGIS/<layer>/<symbol>`。
- 公共 API 测试优先从 engine 根入口导入，以验证真实导出；内部行为测试可以直接导入源码模块。
- 渲染功能使用 Cesium 现有 WebGL matcher，并覆盖默认画面、关键状态变化、资源释放和错误路径。
- 改动渲染热路径时记录测试场景、设备/浏览器条件和性能对比，避免只凭肉眼判断。
- Sandcastle 示例不能替代 Specs；复杂交互或持久视觉基线放入 `Specs/e2e/scenegis-*.spec.js`。

## 禁止修改的生成物

不得手工修改本包的 `index.js`、`index.d.ts`、`Build/**` 或 `Specs/SpecList.js`。新增 API 后通过构建和类型生成验证结果。
