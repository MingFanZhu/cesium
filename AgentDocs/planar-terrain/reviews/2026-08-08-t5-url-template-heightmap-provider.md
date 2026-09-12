# Review: T5 通用 URL Heightmap Provider 与 Terrain 案例

## Metadata

- Status: `approved`
- Reviewer role: `architecture`
- Created: `2026-08-08`
- Updated: `2026-08-08`
- Review target: `feature/planar-terrain` complete working-tree diff relative to
  `16983856e605280c709ca14f55a0f630d465202f`
- Related plan:
  [T5 URL Heightmap provider phase plan](../plans/2026-08-08-phase-t5-url-template-heightmap-provider.md)
- Related ADR:
  [ADR-0011](../../../Documentation/SceneGIS/Decisions/ADR-0011-planar-url-template-heightmap-terrain-provider.md)
- SGP: None；T5 upstream-owned files=`0`

## Review scope

- Public `SceneGISPlanarUrlTemplateHeightmapTerrainProvider` constructor、readonly structural terrain
  contract、Resource/Request/Credit ownership与generated API。
- Coordinate-agnostic canonical tiling identity、XYZ/TMS template、full-pyramid availability、child
  mask和geometric error curve。
- Image自然row order、显式RGBA structure、dimensions与ImageBitmap exactly-once close。
- LERC single-band/dimensions/mask/statistics/NoData/finite/global-range validation、decoded TypedArray
  ownership与failure propagation。
- Deterministic provider→World→TerrainData closure、Sandcastle best-effort公开组装、durable docs。
- Zero-upstream/zero-SGP、无T1-T4 runtime/Shader/Worker/build seam和generated delivery审计。

## Implementation summary

- Provider只接受caller-supplied `SceneGISPlanarTilingScheme`，源码没有CRS read、metadata discovery或
  projection。Resource clone保留query/header与caller Request；subdomains复制后deterministic选择。
- Image使用`fetchImage({ preferImageBitmap: true })`且不传`flipY`；要求显式`stride=4` structure，
  由`getImagePixels`按north-to-south row构造现有Heightmap TerrainData，并在所有post-fetch路径关闭
  可关闭image。
- LERC使用仓库既有dependency，接受一个完整有效numeric band；mask、statistics、NoData、actual
  sample、dimensions和global range任一无效即reject，不retry或重复raise provider event。
- Availability为`0..maximumLevel` full pyramid；中间tile child mask 15、末级0；default Level-0 error
  使用较疏sample轴spacing的0.25。
- 新Sandcastle显式组装EPSG:3857 World、OSM imagery、ArcGIS公开LERC terrain、Viewer、skybox与两个
  visible Credits；公网仅为best-effort人工案例，自动化完全stub。

## Validation evidence

完整命令、warnings与未运行理由见phase plan“结果与交接”。关键证据：

- Provider focused suite `13/13`，涵盖constructor/address、image/LERC、failure、availability与
  EPSG:3857 canonical World closure。
- `npm run build`、`build-ts`、`build-docs`、`tsc`、scoped ESLint/Prettier/Markdownlint、
  `git diff --check`与upstream audit均Exit 0。build-ts只含既有TSD-JSDoc warnings。
- no-embedding gallery处理`306` examples；no-embedding Sandcastle Vite build Exit 0。标准embedding
  仅因外部Hugging Face metadata fetch失败而Exit 1，未重试。
- engine/Cesium root runtime imports、两份d.ts和API class page均包含public provider；format/urlScheme
  unions与readonly properties精确；private LERC wrapper与generated status命中0。
- 公开Level-0 endpoint一次性只读检查为257×257、single band、0 invalid samples；没有保存公网tile。

## Ownership audit

- Upstream-owned files: `0`。
- T5 SGP: `0`；patch manifest、SGP-0001与SGP-0002 unchanged。
- New `SCENEGIS_PATCH` markers: `0`。
- T1-T4 runtime、Shader、Worker、Widget/Viewer/build seam: `0`。
- Generated delivery status: `0`。
- Product/Spec/demo diff全部位于T5 phase plan允许的SceneGIS-owned paths。

## Review targets

1. 确认conditional image `structure`要求与RGBA stride=4 fail-fast是ADR允许的安全选择，且没有把
   service-specific encoding写入generic API。
2. 核对LERC validation不会接受partial mask/NoData/non-finite/multi-band或超global range tile，
   同时不会复制decoded buffer或吞掉原始decode/network cause。
3. 核对above-maximum availability false、address preflight、TMS Y与geometric error没有unsafe
   arithmetic或hidden scheduling mutation。
4. 核对Sandcastle只演示显式application assembly、visible Credits与failure fallback，没有形成
   ArcGIS/EPSG:3857 provider contract或公网自动化依赖。
5. 复核public generation与zero-upstream/zero-SGP审计，并确认T5 review前不进入T6。

## Findings

| ID      | Severity | Status | Finding                                                                                                                                                                                                                                                                                                                                                                                                     | Required disposition / evidence                                                                                                                                                                                                                   |
| ------- | -------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T5-R001 | high     | fixed  | Image path调用`fetchImage({ preferImageBitmap: true })`，因此沿用`Resource.fetchImage`的`skipColorSpaceConversion=false`默认值。RGBA在这里是数值高程编码而不是颜色；浏览器对带gamma/profile的图片执行色彩空间转换会静默改变channel bytes，进而产生错误地形。现有Canvas fixture没有色彩profile，只锁定row order，无法发现该问题。                                                                            | 已显式传`skipColorSpaceConversion:true`并保持无`flipY`和exactly-once close；image Spec精确断言fetch options与原始channel解码，ADR/phase/Architecture/DevelopmentGuide同步numeric payload能力边界。                                                |
| T5-R002 | medium   | fixed  | `validateImageStructure`只检查`elementsPerHeight`和`stride`；`heightScale`/`heightOffset`的finite、`elementMultiplier>0`和`isBigEndian`类型仍等到tile fetch完成后由`SceneGISPlanarHeightmapTerrainData`检查。静态错误配置因此可以成功构造synchronously-ready provider、先发网络请求，再让每个tile重复失败；这违反phase plan中“构造错误使用DeveloperError”和constructor JSDoc的invalid structure fail-fast。 | Constructor现完整规范化并验证全部Structure字段与`width * height * stride`安全整数；参数化Spec证明静态错误均在fetch前抛出且image/array fetch为0。post-fetch close fixture改用合法structure和实际pixel global-range failure，仍exactly-once close。 |
| T5-R003 | medium   | fixed  | `createTerrainData`为每个tile新建`[provider._credit]`并写入`TerrainData.credits`。T5 phase plan明确要求构造TerrainData时传入“Credit之外”的tile data；Surface已经每帧单独提交`terrainProvider.credit`，随后又遍历render tiles的`terrainData.credits`。当前实现混淆global provider attribution与tile-specific credits，并在每个decode/upsample/render tile产生不必要的array、引用和CreditDisplay计数。        | `createTerrainData`不再复制global credit；Spec锁定`provider.credit`保留且`terrainData.credits === undefined`，Surface既有provider Credit提交路径不变。                                                                                            |

Reviewer独立核对了完整working-tree diff、当前`lerc` wrapper实际返回的`mask`语义、Surface terrain
Credit提交路径和`Resource.fetchImage`默认options，并运行focused provider suite：`13/13`，Exit 0。现有
suite确认已实现的XYZ/TMS、LERC、availability和World closure，但不覆盖上述三个finding。Reviewer还读取
当前公开ArcGIS metadata，确认案例显式配置的EPSG:3857、single band、LOD `0..16`、`257×257`采样和
`-450..8700`范围一致；这不替代尚未完成的浏览器GPU人工验收。

### Execution focused-fix evidence

- T5-R001：provider image request显式传入`preferImageBitmap:true`与
  `skipColorSpaceConversion:true`；原image direct case精确断言options、north-first channel decode与
  exactly-once close。
- T5-R002：constructor规范化并验证全部image structure字段与安全buffer length；既有constructor
  direct case参数化覆盖finite scale/offset、positive multiplier、boolean endian和overflow，断言
  `fetchImage`/`fetchArrayBuffer`调用均为0。post-fetch failure使用合法structure与真实pixel超出global
  range，保留close证据。
- T5-R003：global provider Credit不再写入`TerrainData.credits`；direct case锁定provider reference保留、
  tile credits为`undefined`。
- Focused provider suite：`13/13`，Exit 0；`npm run build`、scoped ESLint/Prettier、planar-terrain与
  SceneGIS Markdownlint、`git diff --check`均Exit 0。Upstream audit Exit 0：current delivery
  upstream-owned entries `0`、generated status `0`；T5 SGP=`0`、manifest/SGP-0001/0002 unchanged。

### Architecture focused re-review evidence

Architecture reviewer逐项核对产品代码、direct Specs与ADR/Architecture/DevelopmentGuide更新，并独立
运行focused provider suite `13/13`和`npm run build`，均Exit 0；随后复跑changed-scope Prettier、
SceneGIS Markdownlint、`git diff --check`和upstream audit，均Exit 0。复核确认：

- numeric image request显式禁用color-space conversion且不设置`flipY`；
- 完整Structure与buffer-length arithmetic在任何fetch前完成preflight，post-fetch failure仍关闭image；
- generic TerrainData不再持有global provider Credit，Surface既有global attribution路径不变。

`T5-R001`～`T5-R003`均由Architecture reviewer确认为`fixed`，没有unresolved finding。Public
JSDoc shape未变化，因此没有必要重复build-ts/build-docs/tsc或gallery矩阵。

## Remaining risks

- 公开terrain与OSM服务受CORS、授权、policy、availability和SLA影响；浏览器GPU人工画面检查因当前
  localhost控制环境限制未完成，需review环境复核。
- Generic provider无法证明caller URL数据与World CRS/extent一致，也不发现sparse availability或验证
  邻tile shared edge；错误由现有request failure与T3 fallback处理。
- 257×257 LERC decode和mesh仍在main thread；T5没有性能数据支持Worker或runtime改造，留待T6
  measured qualification。

## Conclusion

Architecture/code review结论为`approved`。Generic coordinate/URL/LERC/availability、numeric image
fidelity、constructor fail-fast、Credit分层、Sandcastle application assembly、public generation与
zero-upstream边界均成立；`T5-R001`～`T5-R003`已按要求修复并由Architecture reviewer确认。公开服务
GPU人工画面仍未冒充通过，作为best-effort案例风险保留，不阻断generic provider阶段完成。T5可以关闭
并形成独立本地提交检查点；本review不授权提前实现T6。
