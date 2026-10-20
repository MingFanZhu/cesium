# ADR-0171：Draco Worker 的 Node 内建模块打包兼容

- Status: accepted；验证通过
- Date: 2026-10-20
- Scope: 构建维护，不创建新的运行时扩展
- Upstream baseline: Cesium 1.144，`6d5d8b1f0725b6f831b336463f4b11c98023427b`
- Upstream files / patches: `scripts/build.js` / SGP-0061；`packages/engine/Source/Scene/Scene.js` / SGP-0046

## 事实与决定

`release → buildRelease → buildEngine → bundleWorkers` 先完成 engine ESM，再打包浏览器 Worker。
原生 `decodeDraco.js` 使用 Draco 的通用 Emscripten 包装文件
`draco3d/draco_decoder_nodejs.js`；文件名包含 nodejs，但包装内显式区分 Node、浏览器与 Worker。

依赖声明 `draco3d: ^1.5.1`，仓库沿用上游对 lockfile 的忽略规则。本机既有安装为 1.5.7；
新安装可取得 1.5.9，其 Node 分支从 `require("fs")` 改为 `require("node:fs")`。
以 1.5.9 实际发布包复现：原 `external: ["fs", "path"]` 报 `Could not resolve "node:fs"`，
追加 `node:fs` 后编译通过。同事机器的具体安装版本尚未直接读取，日志与该失败模式一致。

在 `bundleWorkers` 的现有外部模块列表中追加精确的 `node:fs`，覆盖 ESM 与 IIFE inline 两条路径。
保留 browser 平台、原环境判断、decoder、WASM 和资源路径；不将浏览器包改成 Node 包，
不提供空文件系统 polyfill，不忽略所有 `node:*`，不修改依赖范围或顺带升级官方基线。
已有 bare `fs` / `path` 保留，以兼容旧安装。

## 实施与验证计划

1. 自有 Node 回归调用真实 `bundleWorkers`，在隔离临时根目录构造最小 Worker。
   显式覆盖 bare 与 prefixed 导入，在没有 Node `process` / `require` 的 Worker 环境中执行输出。
2. 用安装包的实际 decoder、WASM 与 bunny 数据验证解码，而不仅断言编译成功。
   覆盖独立 ESM 和压缩 IIFE inline，测试可显式指定待验证 Draco 包目录。
3. 分别验证本机旧包和隔离下载的 1.5.9；使用本机依赖执行完整 `npm run release`，
   检查原生 Worker 解码、类型检查及补丁审计。新版包保持隔离，不替换当前依赖目录。
   下载包、生成文件和日志不提交。
4. 只在 confirmed integration seam 加成对 SGP 标记；没有公共 API、渲染预算或运行时协议变更。

## 升级与剩余边界

升级 Cesium 或 Draco 时重新检查包装内的环境判断和 Node 内建依赖，不能把本项视为任意
Node 依赖均可在浏览器执行的保证。安装环境需满足根 `package.json` 的 Node 版本要求。
锁定全部依赖与其他发布问题属于独立维护范围，不以本次局部修复声称整个新安装依赖树已锁定。

## 完整发布暴露的第二处阻塞

首次完整发布已完成主包与 Worker，但 `buildDocs --pedantic` 报告 `Scene.msaaSamples` 的
`@type` 不允许描述。既有 SGP-0046 的开始标记位于 JSDoc `@type {number}` 后，被当作 tag 文本。
将成对标记移到该注释块外，并把 MSAA 说明移至主描述，保留 `@default 1` 和全部运行时实现。
继续复用 SGP-0046；不修改 JSDoc strict 配置、不屏蔽告警。

## 验证结果

- 原构建配置对隔离的 Draco 1.5.9 发布包复现 `node:fs` 解析失败；修复后通过。
- 自有回归分别使用已安装 1.5.7 和隔离 1.5.9，通过独立 ESM 与压缩 IIFE 的实际 WASM mesh 解码。
- 已安装依赖下完整 `npm run release` 通过，包含 engine、widgets、两种主包、类型生成与严格文档构建。
- Chromium 使用压缩 release 包的原生 `TaskProcessor("decodeDraco")` 成功解码 bunny：
  208353 个索引，transferable 输入正确移交，processor 正常销毁，无 page error。
- 根 TypeScript `tsc --noEmit` 与 upstream patch audit 通过。类型生成仍输出既有私有 doclet
  parent/type 告警；本项未将这些告警视为新的发布故障。
- 1.5.9 的验证范围为隔离的真实 Worker 构建和解码；未替换本机依赖，也未声称已验证同事的完整依赖树。
