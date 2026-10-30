# 引擎 API 中文文档

本页从当前发行版本的引擎和 Widgets 源码生成，包含原生 API 和扩展 API。
使用侧栏搜索框查找类、命名空间等 API 名称；搜索不匹配说明或成员方法。

SceneGIS 自有扩展的说明直接来自中文 JSDoc。Cesium 原生 API 的翻译逐步完善，
未翻译或原文已发生变化、等待复核的字段保留英文，
请查阅[原生翻译报告](translation-report.json)。API 名称、参数名、类型、默认值、
链接目标和示例代码保持原样；术语表统一坐标、渲染和资源所有权的表述。

SDK 网站可直接读取本目录的 [api-doclets.json](api-doclets.json) 和
[api-index.json](api-index.json)。locale 为 zh-CN，符号 ID 保留原始 JSDoc 身份。
每个文档条目的 sourceLocale 标识源码语言，i18n 字段区分中文原文、已翻译和保留英文的字段。

类名带有 SceneGIS 前缀的独立扩展仍沿用实际公开名称。
发行入口、资源基址及最小调用示例见发行包根目录的 README.md。
