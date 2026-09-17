# Test 第三方浏览器库

此目录只保存 `Test/**` 开发示例需要的本地浏览器第三方库，不属于 SceneGIS 产品 runtime 或 npm 交付。

新增库时在下表登记固定版本、上游来源、许可证和使用页面，并将对应许可证文本与分发文件一同提交。
禁止提交无法确认许可证的文件、远程动态 loader、access token 或经过本地修改却未说明来源的 minified bundle。

| Library | Version | Upstream URL                            | License | Used by                                                                                                                                                       |
| ------- | ------- | --------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| lil-gui | 0.21.0  | https://github.com/georgealways/lil-gui | MIT     | `Test/平面环境.html`, `Test/高级环境.html`, `Test/高级环境-平面.html`, `Test/vector-tiles/examples/平面地图.html`, `Test/vector-tiles/examples/球面地图.html` |

## lil-gui provenance

- npm package：`https://registry.npmjs.org/lil-gui/-/lil-gui-0.21.0.tgz`
- Distribution：`package/dist/lil-gui.esm.min.js`，原始字节未修改
- Distribution SHA-256：`609142ae792244de064029d61f25ae8dcdeae76d4996d9eea95a4671d93a954d`
- License：`package/LICENSE.md`，保存为`Test/lib/lil-gui/LICENSE.md`
- License SHA-256：`8cf4a9691239b14c715613ed8e41580d18ee433c862e263058393b35be6c8e53`
