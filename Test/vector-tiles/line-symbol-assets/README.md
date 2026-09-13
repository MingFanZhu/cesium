# 沿线标注 fixtures

`roads.pbf`、`sprite.json`、`sprite.png` 由 SceneGIS 自行编写，
运行 `node Test/vector-tiles/generate-line-symbol-fixture.mjs` 重新生成，无网络依赖。
道路覆盖曲线、反向路径、箭头、编号牌、锐角与短线。
字体复用相邻 `symbol-assets/` 的 Noto ASCII subset 与 OFL 许可证。

这些小型测试资源不进入 npm 包；公开地图 E2E 同时复用该普通 RGBA sprite。
