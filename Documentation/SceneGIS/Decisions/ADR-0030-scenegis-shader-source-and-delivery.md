# ADR-0030：SceneGIS Shader Source 与交付

## 状态

- Status：`approved`
- Date：`2026-08-12`
- Decision owners：Architecture Agent
- Related plan：
  `AgentDocs/planar-surface-styling/plans/2026-08-12-phase-s1-shader-source-foundation.md`
- Related patch：无；upstream-owned files=`0`、SGP=None

## 上下文与源码事实

Cesium 1.144 的 `scripts/build.js#glslToJavaScript` 扫描
`packages/engine/Source/Shaders/**/*.glsl`，将每个 source 转换为相邻 default-export string `.js`。
`buildEngine` 在 index generation 与 bundling 前执行转换；development 保留注释，release 会剥离普通注释并压缩空白。
`packages/engine/.gitignore` 已忽略 `Source/Shaders/**/*.js`，engine npm package 的 `files` 包含 `Source` 与
`Build`。因此新的 SceneGIS shader 子目录无需修改 build glob、package manifest 或 ignore rule 即可进入
development、release 与 installed tarball。

S1 前，private planar Surface builder 在 JS template literals 中保存三个固定 vertex shader，并动态生成
fragment declarations、imagery composition 与 lighting。private planar Ground shader aggregator 在 JS 中保存
area/line 的四个固定 shader。普通 public planar Primitive 继续使用 Cesium Appearance/Primitive shader，不属于
本决定范围。

## 决策

1. 建立 SceneGIS-owned root：`packages/engine/Source/Shaders/SceneGIS/**/*.glsl`。子目录按产品职责组织，
   shader basename 在整个 engine shader tree 中全局唯一并以 `SceneGIS` 开头。
2. 复用现有 GLSL-to-JS converter、dev/release build 与 npm `Source` delivery；不修改 `scripts/build.js`、
   package manifest、`.gitignore` 或 builtin registry。
3. 相邻生成 `.js` 是 build artifact，不手工编辑或提交。SceneGIS runtime 使用显式相对 import 引用这些模块；
   不使用 side-effect import、运行时文件读取、全局 registry 或自定义 include preprocessor。
4. 固定 shader 主体进入 `.glsl`。只有运行时才可知的 variant selection、per-layer uniform declarations 与
   imagery composition 留在 JS。Planar Surface fragment 使用单个有效 token 注入一个 layer composition function；
   lighting 与 normal variant 由前置 compile-time defines 选择，固定 main 与 lighting 数学仍位于 GLSL source。
5. Generated shader modules 是 private runtime dependency，不因 build index 或 deep import 可达而成为 SceneGIS
   public API。S1 不改变 shader cache key、uniform map、pixels、commands、normal/lighting 或资源生命周期。

## 不采用的方案

### 继续内嵌所有 shader

不采用。Surface 与 Ground 已包含多个稳定 shader 主体，继续内嵌会降低独立审阅、构建交付审计和后续 styling
复用的清晰度。

### 修改 build glob 或增加 SceneGIS shader preprocessor

不采用。现有递归 glob 已覆盖新 root；额外 build seam、include 语法或运行时 loader 没有当前需求，并会扩大
upstream patch、release 与 package 风险。

### 把每个 imagery layer count 生成为独立静态 shader

不采用。layer count 与 shown layers 是 runtime variant，静态枚举会造成 variant 文件爆炸，且不能替代现有
texture-unit fail-fast 与 cache contract。

## 运行时、构建、发布与升级影响

运行时仍由现有 private builders 创建 ShaderProgram；没有新增 request、texture、buffer、command、cache 或
ownership。Build 会按 `.glsl` 时间戳生成 ignored `.js`，再完成 engine index/bundle。发布资格必须同时证明
development build、release build 与 installed engine tarball 中 `.glsl`、生成 `.js` 和 importing private module
可以加载，不能只依赖本机残留 generated files。

每次官方 Cesium 升级必须复核：shader glob 与转换顺序、release comment/whitespace minification、相邻 `.js`
ignore、basename/index collision、engine package `files`、显式 import resolution，以及 dev/release/tarball focused
shader loading。若官方提供新的 source loader，或现有 converter不再生成相邻模块，应重新评估本决定；不得用
手工生成物维持旧链路。

## 测试与验证

- Surface shader source 与 aggregate Surface focused Specs覆盖zero/multi-layer、geometric/smooth lighting、像素、
  cache/command/resource warm identity。
- Ground Primitive focused Spec覆盖area/line generated sources、depth clamp、gamma、classification与生命周期。
- 至少一个真实 Context terrain qualification覆盖生成 import、lit/unlit pixel、warm identity与destroy balance。
- `npm run build`、`npm run build-release` 与 installed tarball smoke覆盖三种交付形态。
- ownership audit 必须保持 upstream-owned files=`0`、SGP=None，generated `.js`、index与Build不进入交付 diff。
