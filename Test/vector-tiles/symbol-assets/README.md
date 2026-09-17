# 本地点标注资源

`points.pbf` 和 `sprite.png/json` 是 SceneGIS 自行编写的确定性数据，随仓库许可证分发。
图标为自绘医院符号，不来自在线 sprite。此页面没有外网运行依赖。

各数字 range 的 `.pbf` 保留 OpenFreeMap Noto Sans Regular 的原始 glyph bitmap/metrics，
只选择 ASCII 和 `../symbol-cases.mjs` 使用的字；fontstack 元数据改名为
`SceneGIS Test Noto Subset`。这是测试子集，不能用于完整在线地图。
获取时间为 2026-09-13，来源为
[OpenFreeMap 字体服务](https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular/0-255.pbf)。
Noto 按 SIL Open Font License 1.1 分发，保留
[Noto Sans 授权](OFL.txt) 与 [Noto CJK 授权](OFL-CJK.txt)。

重新获取并生成：`node Test/vector-tiles/generate-symbol-fixture.mjs`。
此离线准备命令需要网络；生成后的页面和 CI 不需要网络。
公开页 E2E 将字体请求映射到这里的 ASCII 子集、图标映射到自绘 sprite，
用于验证资源协议、文字像素和生命周期，不用于比较在线字体设计。
