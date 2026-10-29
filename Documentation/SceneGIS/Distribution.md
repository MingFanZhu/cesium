# SceneGIS 引擎发行与 SDK 接入

## 构建与交付

在引擎仓库根目录执行 `npx gulp buildSceneGIS`，生成完整的 `Build/SceneGIS`。
仅重新生成文档可执行 `npx gulp buildSceneGISDocs`。原 `build`、`buildRelease`、
`buildTs`、`buildDocs` 与测试链继续保留。生成物不提交 Git，不向 SDK 目录复制。

```text
SceneGIS/
├── SceneGIS.js             浏览器 IIFE，全局 SceneGIS
├── index.js                单一 ESM，命名导出
├── SceneGIS.d.ts           ESM 声明及 export as namespace SceneGIS
├── index.d.ts              相对 index.js 导入的类型入口
├── package.json            @scenegis/engine，本地安装入口
├── Workers/                原生及 SceneGIS module Workers / shared chunks
├── Assets/                 纹理、字体、大气等资源及来源许可
├── ThirdParty/             WASM、解码器等原生资源
├── Widgets/                合并 CSS 与 UI 静态资源
├── Documentation/          可独立部署的完整静态 API 文档
│   ├── index.html
│   ├── api-doclets.json
│   ├── api-index.json
│   └── ...                API 页面、图片、样式、搜索脚本
├── LICENSE.md
├── ThirdParty.json
├── ThirdParty.extra.json
└── README.md               本接入说明
```

发行脚本经过 minify，保留参数 debug 校验；不提供 CommonJS 目标。
原 Cesium 的输出与全局名称不变。原生 Scene、ImageryLayer、I3SLayer、Panorama、
VERSION、Viewer、Cesium3DTileset、CesiumWidget 和 SceneGIS 扩展都保持原名。
内部 workspace、源码路径和 Worker 内部标识不会因发行品牌而重命名。

## 浏览器脚本

通过 HTTP(S) 部署完整目录，保持上述相对结构，并给容器明确尺寸。

```html
<link rel="stylesheet" href="/vendor/SceneGIS/Widgets/widgets.css" />
<div id="map" style="width: 100%; height: 600px"></div>
<script>
  window.SCENEGIS_BASE_URL = "/vendor/SceneGIS/";
</script>
<script src="/vendor/SceneGIS/SceneGIS.js"></script>
<script>
  const viewer = new SceneGIS.Viewer("map", {
    baseLayer: false,
    baseLayerPicker: false,
    geocoder: false,
  });
  // Destroy on application teardown: viewer.destroy();
</script>
```

## 单一 ESM 入口

可将整个发行目录安装为本地包：`npm install ./SceneGIS`，再从
`@scenegis/engine` 命名导入。也可直接以浏览器 ESM 导入发行目录中的 index.js。
两种方式消费同一个入口；不要再同时引入 Cesium IIFE、源码或另一个 engine 包。

```js
globalThis.SCENEGIS_BASE_URL = "/vendor/SceneGIS/";
const { Viewer, Cartesian3 } = await import("/vendor/SceneGIS/index.js");

const viewer = new Viewer("map", {
  planarWorld: {
    extent: {
      minimumX: -1000,
      minimumY: -1000,
      maximumX: 1000,
      maximumY: 1000,
    },
    crs: "LOCAL", // Opaque identifier; coordinates are meters, not reprojected.
    maximumLevel: 4,
  },
});
viewer.scene.camera.setView({
  destination: new Cartesian3(0, 0, 1000),
  orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
});
// The Viewer owns its Scene and World.
viewer.destroy();
```

平面 Viewer 不设置球面专用的 baseLayer；需要影像时通过已创建 World 的公开平面接口配置。
球面使用上面的默认 Viewer 入口。TypeScript 可从包入口或相对 index.js 导入；
普通 script 的全局用法通过 `/// <reference path="./SceneGIS/SceneGIS.d.ts" />` 引用声明。
ESM 文件使用显式 import；类型声明不向运行时安装额外全局。

## 资源基址规则

首次资源解析按以下顺序选择，并缓存结果：

1. 显式 `buildModuleUrl.setBaseUrl(value)` 已设置的实例内模块基址。
2. `SCENEGIS_BASE_URL`。
3. `CESIUM_BASE_URL`，保留原 Cesium 集成方式；两者同时设置时新变量优先。
4. 直接 ESM 的 `import.meta.url` 所在目录。
5. IIFE 的 SceneGIS.js / Cesium.js 所在目录。

全局基址指向包含 Workers、Assets、ThirdParty 的目录，可带或不带结尾斜线。
显式调用 setBaseUrl 时传入带结尾斜线的目录 URL；原有 RequireJS 用法保持不变。
根目录和多级子目录部署均可自动定位，脚本 URL 的 query/hash 不影响识别。
重命名 IIFE、把 ESM 再打包到 SDK bundle 或把资源放到 CDN 时，在导入前明确设置
SCENEGIS_BASE_URL，避免以 SDK bundle 的路径作为资源根。修改基址不迁移已经加载的资源。
CSS 由应用单独加载。Worker/资源跨域须由服务端提供相应访问许可；原生 IIFE
保留 embedded Worker/blob 机制，ESM 使用发行包中的 module Workers。

SDK 负责把发行资源复制到自己的部署产物，并配置唯一入口；引擎不访问 SDK 源码。
SDK 与引擎的同名导出由 SDK 后续显式组合；引擎侧不增加别名层、版本锁或自动兼容校验。

## 静态 API 与元数据

将 Documentation 整个目录部署到任意 HTTP(S) 路径即可独立访问。它由本次发行的
engine/Widgets 源码经现有 JSDoc、自定义标签和模板生成，覆盖原生及扩展公开 API。
页面保留参数、返回值、typedef、枚举、事件、继承、示例和类型链接；搜索无需远程服务。
不从压缩脚本提取，也不指向最新版官网作为替代。private/undocumented 实现不属于公开 API。

两个 JSON 都具有 `schemaVersion: 1`、`namespace: "SceneGIS"`、`version` 和
`generator: { name, version }`。版本仅描述发行内容，不参与运行时校验。

api-doclets.json 的 `doclets` 是 JSDoc 语义对象数组。保留原生 `longname`、`name`、
`kind`、`scope`、`memberof`、`params`、`returns`、`properties`、`type`、`augments`、
`examples`、`exceptions`、事件字段及 `isInternalConstructor`、`performance`、`demo`、
`experimental`、`optional` 等自定义标签。移除 AST/meta.code、raw comment、Taffy 内部字段和
本机绝对路径；meta 只保留仓库相对 filename 与源码行列。

额外字段 `id` 使用原始 longname 作为稳定符号标识，`displayName` 为 SceneGIS 限定名，
`exportName` 为相关顶层运行时导出名（全局类型专用符号可省略），`url` 为 Documentation 内相对页面和锚点。
少量原生 JSDoc alias 与文件导出不同的情况由生成器映射，原始 ID 不受展示名影响。
同一符号的重载 doclet 可共享 ID；SDK 应按 ID 分组，不使用源码行号作为标识。

api-index.json 的 `symbols` 按 id 排序并去重，包含 id、name、displayName、kind、
scope、memberof、exportName、url 和摘要，供 SDK 搜索。枚举索引 kind 为 enum，原始 doclet
保留 JSDoc kind/isEnum。类型标识引用原始 longname；SDK 可用索引建立类型链接映射，
用自己的文档页面替换 url。参数中的 string/number 等内置类型无需 API 页面。
示例中的 Cesium 命名空间仅在生成期映射到 SceneGIS，原生类名不变。

## 验证命令

```powershell
npx gulp buildSceneGIS
node --test scripts/scenegis/distribution.test.mjs scripts/scenegis/documentation.test.mjs
npx playwright test -c scripts/scenegis/playwright.distribution.config.mjs
```

交付验证覆盖 IIFE/ESM 的球面与平面创建/销毁、根目录/子目录资源识别、全局变量优先级、
真实 Worker/WASM 解码及纹理、声明与实际导出、文档元数据、静态搜索和页面/锚点链接。
构建不会发布到 registry，也不会修改 SDK。
