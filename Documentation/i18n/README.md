# API 文档翻译维护

本目录保存 Cesium 原生 JSDoc 的外部翻译数据及文档 UI 文案，独立于引擎源码与发行品牌。工具位于
[scripts/docs-i18n](../../scripts/docs-i18n/)，所有生成结果位于 Build。
不修改上游注释，不从压缩 bundle 或生成 HTML 反推 API，不调用在线翻译服务。
SceneGIS 自有公开 API 的自然语言直接维护在源码中文 JSDoc 中，不进入外部翻译词条、
原文清单、缺失统计或待复核报告。新增或修改自有 API 时直接更新其 JSDoc。

## 构建与产物

`npx gulp buildSceneGISDocs` 或完整的 `npx gulp buildSceneGIS` 生成单一中文文档：

- `Build/SceneGIS/Documentation/`：完整 HTML、api-doclets.json、api-index.json。
- 同目录 `translation-source.json`：品牌映射前的 Cesium 原生英文翻译单元。
- 同目录 `translation-report.json`：原生翻译的覆盖数量、missing/stale 单元和 unused 词条。

不再生成重复英文树、语言目录发现或切换按钮。搜索仅匹配侧栏列出的 API 名称，
不搜索说明或成员方法。完整 API 索引仍保留给 SDK。
原 Cesium `buildDocs` 的配置、扫描和模板路径保持不变；中文发行由新增文档目标组合生成。

## 词条格式

每个 `zh-CN/api/*.json` 是同一语言的一个维护分组，不要求与源码模块一一对应。

```json
{
  "schemaVersion": 1,
  "locale": "zh-CN",
  "entries": [
    {
      "id": "Scene#pick",
      "field": "params/windowPosition/description",
      "sourceHash": "sha256:<64 lowercase hexadecimal characters>",
      "text": "窗口坐标，原点位于左上角。"
    }
  ]
}
```

`id` 是原始 JSDoc longname，不包含发行品牌前缀。字段选择器包括 description、classdesc、
summary、deprecated；params/参数名/description、properties/属性名/description；
returns/序号/description、exceptions/序号/description、yields/序号/description；
performance/序号、experimental/序号及 examples/序号/caption。
参数名和属性名保留完整点号名称；选择器内部的 `~`、`/` 分别转义为 `~0`、`~1`。

原文摘要仅规范化 CRLF，再计算 SHA-256。相同 longname 和字段的重载通过原文摘要区分。
原文已变时不使用旧译文；报告列出 stale 和 source-changed。已删除字段列为 field-removed。
重复词条、非法格式或破坏 HTML/链接/代码的翻译使文档构建失败。

这是一项构建时检查，不监听上游仓库或官网。合入 Cesium 更新或本地修改注释后，重新运行
文档构建才会发现变化。只统一换行，不忽略空格、链接或文字差异，所以纯编辑性变化也会
标记待复核。摘要不判断语义等价或中文译文是否正确，是否修改译文由维护者确认。

## 增补与复核

先构建最新文档，然后提取缺失或原文已变的候选：

```sh
node scripts/docs-i18n/catalog.mjs --source Build/SceneGIS/Documentation/translation-source.json --catalog Documentation/i18n/zh-CN/api --locale zh-CN --output Build/docs-i18n/zh-CN.pending.json
```

候选保留原文 source、选择器、当前摘要和空 text。填写并校对 text 后，按模块加入维护词条文件；
未填写的候选不可直接作为有效词条。复核变化时同时删除或修正已被替代的旧摘要词条。
构建不会自动更新维护文件或接受旧译文，也不会把未译字段统计为已译。
`translation-source.json` 和 `translation-report.json` 每次构建覆盖生成；受版本管理的
翻译词条不会被构建覆盖。这两个清单只反映原生英文 API。

翻译时参考 [术语表](zh-CN/glossary.json)。完整保留原文的坐标系、单位、取值范围、默认值、
限制和所有权语义。HTML 标签及属性、inline link 目标、code/pre 内容和反引号代码必须原样保留；
允许翻译链接显示文字。示例仅翻译 caption，代码及代码中的注释都不在翻译单元内。
UI 文案位于对应语言的 ui.json，只在复制到 Build 的模板中进行有界替换。

## SDK 消费

直接读取 Documentation/api-doclets.json 和 api-index.json。根元数据包含
`locale: "zh-CN"` 和 `sourceLocales: ["en-US", "zh-CN"]`，符号 id、类型、exportName
和相对 URL 保持原始身份。每个 doclet 的 sourceLocale 标识源码语言。
自有中文 doclet.i18n.sourceFields 指明直接维护的字段；原生英文 doclet.i18n 的
translatedFields/fallbackFields 指明翻译或保留原文的字段。示例代码与签名保持不变。
覆盖以自然语言字段计数，不能以页面数量或中文界面代替翻译完成度。

SceneGIS 自有公开说明已完整中文化；Cesium 原生翻译只覆盖优先词条，其余字段保留
完整英文说明，后续持续增补。原生翻译报告不计入自有中文说明。
