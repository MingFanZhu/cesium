# 测试夹具第三方浏览器库

此目录保存共享浏览器夹具用的第三方库。

新增库时在下表登记固定版本、上游来源、许可证和使用页面，并将对应许可证文本与分发文件一同提交。
禁止提交无法确认许可证的文件、远程动态 loader、access token 或经过本地修改却未说明来源的 minified bundle。

| Library | Version | Upstream URL                            | License | Used by                                                                                |
| ------- | ------- | --------------------------------------- | ------- | -------------------------------------------------------------------------------------- |
| lil-gui | 0.21.0  | https://github.com/georgealways/lil-gui | MIT     | `fixtures/Planar/`、`fixtures/AdvancedEnvironment/`、`fixtures/vector-tiles/examples/` |

## lil-gui provenance

平面和高级环境夹具只定位外层 controls 容器，使用未经修改的 lil-gui 样式。

- npm package：`https://registry.npmjs.org/lil-gui/-/lil-gui-0.21.0.tgz`
- Distribution：`package/dist/lil-gui.esm.min.js`，原始字节未修改
- Distribution SHA-256：`609142ae792244de064029d61f25ae8dcdeae76d4996d9eea95a4671d93a954d`
- License：`package/LICENSE.md`，保存为 [`lil-gui/LICENSE.md`](lil-gui/LICENSE.md)
- License SHA-256：`8cf4a9691239b14c715613ed8e41580d18ee433c862e263058393b35be6c8e53`
