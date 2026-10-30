# API 文档翻译维护

本目录保存通用 JSDoc 语言数据，独立于引擎源码与发行品牌。工具位于
[scripts/docs-i18n](../../scripts/docs-i18n/)，所有生成结果位于 Build。
不修改上游注释，不从压缩 bundle 或生成 HTML 反推 API，不调用在线翻译服务。

## 构建与产物

`npx gulp buildSceneGISDocs` 或完整的 `npx gulp buildSceneGIS` 同时生成：

- `Build/SceneGIS/Documentation/`：完整英文 HTML、api-doclets.json、api-index.json。
- `Build/SceneGIS/Documentation/zh-CN/`：完整中文页面树与相同结构的元数据；未译字段保留英文。
- 英文目录的 `translation-source.json`：品牌映射前的原始英文翻译单元。
- 中文目录的 `translation-report.json`：覆盖数量、missing/stale 单元和 unused 词条。
- 英文目录的 `locales.json`：语言名称与相对目录，供 SDK 选择语言。

HTML 顶部可切换同一符号的语言，保留搜索词和锚点。搜索仅匹配侧栏列出的 API 名称，不搜索说明或成员方法。完整 API 索引仍保留给 SDK。
原 Cesium `buildDocs` 目标保持不变；中文只由新增文档目标组合生成。

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

翻译时参考 [术语表](zh-CN/glossary.json)。完整保留原文的坐标系、单位、取值范围、默认值、
限制和所有权语义。HTML 标签及属性、inline link 目标、code/pre 内容和反引号代码必须原样保留；
允许翻译链接显示文字。示例仅翻译 caption，代码及代码中的注释都不在翻译单元内。
UI 文案位于对应语言的 ui.json，只在复制到 Build 的模板中进行有界替换。

## SDK 消费

按 locales.json 选择目录后，读取该目录 api-doclets.json/api-index.json。元数据包含
locale、sourceLocale，符号 id、类型、exportName 和相对 URL 保持语言间一致。
中文 doclet.i18n.translatedFields/fallbackFields 指明字段覆盖状态；API 的示例代码与签名保持不变。
覆盖以自然语言字段计数，不能以页面数量或中文界面代替翻译完成度。

本次只提交首批优先词条，不宣称完整中文翻译。其余字段仍有完整英文说明，后续持续增补。
