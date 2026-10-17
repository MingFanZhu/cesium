# Review: 光谱转换与统一场景辐亮度

- Review target: [standalone plan](../plans/2026-10-16-environment-radiance.md)
- Status: `technical-pass / scoped-visual-accepted`，负责人授权本地提交；原生遗留测试失败及视觉边界见收口节
- Reviewer role: architecture / execution, current task self-review
- Created: `2026-10-16`; Updated: `2026-10-17`
- Related ADR: ADR-0044、ADR-0050、ADR-0053、ADR-0161、ADR-0164、ADR-0165、ADR-0166、ADR-0167
- Upstream-owned files / SGP: `Scene/GlobeSurfaceTileProvider.js`，SGP-0009；`Scene/Tonemapper.js`、`Scene/PostProcessStageCollection.js`，SGP-0060

## Findings

| ID     | Severity    | Finding                                                                     | Status / evidence                                                                                                                |
| ------ | ----------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| RAD-01 | P1          | 默认地表倍率 1 对背景 4 / 10，显式实例地表 10，受光与散射比例取决于创建入口 | fixed：双方默认 1；两个新增真实 GPU 用例验证双世界曝光前地表 / 天空像素在默认 / 显式及 HDR/LDR 切换后相同                        |
| RAD-02 | P2          | 以统一增亮倍率代替显示曝光，会使 LDR 正午亮部截白                           | fixed：采用中性 1，不改显示变换；浏览器诊断确认 4 的截白风险；显式艺术调节仍保留                                                 |
| RAD-03 | visual      | 中性标定下的默认天空、远景与整体显示观感                                    | partial：负责人已接受球面正午艺术预设及空气距离 0.5；Globe 全天 RAD-12 已验收；Planar 已完成本轮检查，最终观感 pending（RAD-13） |
| RAD-04 | P1          | 原始三波段光谱结果直接进入工作 RGB，缺少明确的颜色转换及默认显示能量基准    | fixed：恢复原实现 Sun / Sky 各自转换与共同 relative-luminance 单位，双世界 GPU 数值与当前中午读回通过；整体观感仍由 RAD-03 验收  |
| RAD-05 | P2          | 独立球面大气示例显式保留 background=4，覆盖中性默认并放大空气散射           | fixed：AdvancedEnvironment 日间与测试入口旧 4 / 10 均同步为 1；夜间专用预设不变                                                  |
| RAD-06 | P2          | 本地曝光 1 / PBR Neutral 与来源示例曝光 10 / AgX 未对齐                     | fixed：ADR-0164 / SGP-0060 接入 AgX，日间示例显式配置 10，保持引擎默认；此参考值的最终观感由 RAD-03 跟踪                         |
| RAD-12 | P2 / visual | Globe 固定 LDR 下晨昏比深夜更暗                                             | fixed / owner accepted：ADR-0167 的照度下限及 42 项相关 Specs、15 时段 / 212 分钟样本通过；负责人已确认通过                      |
| RAD-13 | P2 / visual | Planar 仍有旧角度门控的晨昏低谷                                             | technical fixed / visual pending：同步照度下限，27 项相关 Specs、15 时段 / 212 分钟样本通过；平板天空与方向近似边界见末节        |

## 历史：转换修复前的中午 HDR 诊断

负责人指出切换南京当地中午及 HDR 后仍灰暗，故不能再以低太阳高度或 LDR 解释当前画面。
实际时间为 2026-10-16T04:00:00Z，太阳高度 49.028°，nightFactor=0，
primaryLightScale=(1,1,1)，云 / 云影关闭，PBR_NEUTRAL、exposure=1、自动曝光关闭。

当前真实 Globe LUT 在相机所在地、距地面 1 米的水平接收面给出：

- direct spectral irradiance RGB samples = (1.0271, 1.1597, 1.0108)。
- sky spectral irradiance samples = (0.0431, 0.1059, 0.2286)。
- 白色 Lambert 输出 = (0.3406, 0.4029, 0.3945)。
- 使用建筑颜色 #ded6ca、按当前 gamma 解码后的屋顶输出 = (0.2511, 0.2739, 0.2363)。

这些是当前低层 spectral runtime 的量，不能标为 lux 或已经定标的线性 sRGB。
SceneGISBrunetonRuntime.glsl 的第 480 行起明确使用低层光谱函数，而包含
SUN / SKY_SPECTRAL_RADIANCE_TO_LUMINANCE 的包装被 #if 0 排除。
[Bruneton 原始 API](https://ebruneton.github.io/precomputed_atmospheric_scattering/atmosphere/model.h.html)
区分三波段光谱辐射量与转换后的线性 sRGB luminance / illuminance。
现有地表与天空取相同倍率只保证相对一致，不能证明颜色空间与显示基准正确。

32×32 网格采样当前画面近中景（归一化 x=0.3..0.9、从底部 y=0.1..0.75）：

| 条件                     | 显示平均 RGB（0–255）    | 曝光前平均 RGB           |
| ------------------------ | ------------------------ | ------------------------ |
| 当前 HDR、exposure=1     | 105.31 / 112.42 / 106.33 | 0.2145 / 0.2324 / 0.2090 |
| 关闭 aerial + height fog | 105.64 / 112.45 / 105.81 | 0.2157 / 0.2334 / 0.2090 |
| 保留大气、仅 exposure=3  | 179.34 / 189.35 / 180.47 | 与当前相同               |

因此当前近中景主要是显示亮度基准偏低，不能归因于雾叠加过强；远处仍有正常沿程散射。
曝光 3 仅为诊断，并非建议写入引擎默认值；它也会影响制图注记，不能代替源端标定。
诊断恢复 exposure=1 与原 aerial / fog，保留负责人要求的中午 / HDR，GL error=0；
临时 GPU 读回资源均已释放。

自动物理太阳以 LUT 的 solarIrradiance 与 primaryLightScale 供光；scene.light.intensity=2
是自动主光的 native 兼容值，并非物理地表上再次乘的太阳倍率。自定义 DirectionalLight
另有显式覆盖路径，不能混淆两者。当前未发现太阳方向、昼夜衰减或 LUT 透射异常。

后续须先明确光谱到工作 RGB 的转换、共享场景能量单位和默认手动显示基准，再决定
物理太阳强度控制；自动曝光继续默认关闭。29 项测试仍为有效回归证据，但不构成
完整颜色 / 光度标定验收。当时尚未修改转换代码，后续经负责人批准实施下方光谱修订。

## 历史：默认值修订阶段的 Validation

- Chrome Headless 155 / Windows：DefaultEnvironment 14 项通过，含 2 项新增跨显示 / 所有权
  GPU 回归，以及真实地形 / glTF、云切换、空气透视、高度雾、资源释放。
- 环境标定 / 地平线端点 5 项、ModelEnvironmentLighting 2 项、VectorEnvironment 8 项通过。
  矢量测试覆盖 flat / ground / Globe terrain / extrusion、不透明延迟与透明前向、pick 与借用资源。
- 当前公开 Globe 页面恢复原相机与固定时钟，LDR、自动曝光关闭、倍率均为 1；
  ready / tilesLoaded=true、GL error=0。原倍率与中性倍率均为 100 material draws、
  3 lighting draws、56,224,168 deferred bytes、1,448 frame commands，无新增运行成本。
- Planar 公开页面 ready / tilesLoaded=true、GL error=0，LDR 与自动曝光状态未改变。
- 完整 build、build-ts、tsc 通过；类型生成保留既有 JSDoc 告警。
- 改动 JS 的 ESLint / Prettier、改动 Markdown 的 Prettier / Markdownlint、
  git diff --check 通过。按 AgentDocs 规则执行全目录 Markdownlint 通过；全目录
  Prettier 仍报告大量未改动历史文档的格式问题，本次涉及文档已定向修正并通过。
  不借本次修复格式化其他扩展的历史记录。

## 历史：默认值修订阶段的 Scope and remaining risk

修改仅为两个 SceneGIS-owned JS 中的构造默认值、相应 Specs 与文档；没有改 Shader、LUT、
渲染调度、样式隐藏、注记遮挡、线宽、曝光算法或 SDK。没有新增帧缓冲、采样器和资源分配。
显式指定的旧倍率继续生效；依赖未指定默认值的应用会看到不同天空 / 云 / 远景亮度，
显式环境地表也不再自动放大十倍。迁移方式见 DevelopmentGuide。

当前低太阳高度、LDR 视角仍偏暗；本次修复的是相对标定，不承诺在所有光照下得到同样的
显示亮度。整体显示亮度由手动曝光 / HDR tone mapping 或后续应用预设负责。自动曝光保持
默认关闭，也没有加入全局补偿。历史 P4g 暂缓的反射探针和透明水面 SSR 边界不变。

本轮未提交，等待负责人视觉 gate；历史已验收提交不受影响。

## 当前：光谱转换实现与验证

负责人批准恢复固定来源提交的 Sun / Sky 系数，共同归一化到
`U=75717.29777245839`。系数、传输 / RGB 边界与更新条件已提升到 ADR-0044。

- Globe / Planar 表面、模型 / Tiles、矢量、天空、空气透视、云入射 / ground / haze、
  天空反射采用同域 RGB；Planar total irradiance 在光谱域先扣除 direct 后分别转换。
- 透射率、密度、LUT 不变。Moonlight / 自定义 RGB 主光的 CPU 分母同步到 solar RGB；
  readable-night、model lightColor、emissive、注记不套光谱系数。
- Height fog 保留艺术参数和消光模型，其源色在新的 RGB 基底计算。显示曝光、HDR/LDR
  契约未改，自动曝光默认关闭。
- 原有光谱 golden 换算为 RGB；地平线误差先除以 Sky 因子后仍用原误差预算。
  修补旧 Aerial / Planar fog 夹具缺少的深度和主光 uniform。反射测试在材质纹理完整加载
  后建立基线，避免加载时颜色变化被误认成反射源回归；未加入产品 settling frame。

Chrome Headless 155 / Windows 的 41 项不同相关 Specs 在定向运行及必要修复重跑后通过：

- DefaultEnvironment 14 项，含双世界默认 / 显式、HDR/LDR 曝光前像素一致性、真实地形 /
  glTF 自定义主光、云 / 雾切换与资源释放。
- EnvironmentEffects 11 项，含两个新增 Sun/Sky 公共分母、cloud incident、Sun disk、
  Globe sky、Planar ground 与自定义 RGB 灯光 GPU 用例，以及 Moonlight、readable-night、
  雾 / haze、表面倍率、双世界地平线连续性。
- ModelEnvironmentLighting 2 项、VectorEnvironment 8 项、SkyReflections 6 项。

完整 build、build-ts、tsc 通过，类型生成保留既有 JSDoc 告警。改动 JS 的 ESLint /
Prettier、改动 Markdown 的定向检查与补丁审计通过。按根基线逐路径检查，无 upstream-owned
改动，无新增 SGP，无生成文件入差异。AgentDocs 全目录的历史格式问题不纳入本次格式化。

当前南京中午、原相机、HDR / PBR_NEUTRAL / exposure=1 下的实际 GPU 读回：

| 量                | 转换后 scene-linear RGB        |
| ----------------- | ------------------------------ |
| 水平面太阳照度    | 1.332598 / 1.071442 / 0.887422 |
| 水平面天空照度    | 0.065479 / 0.099726 / 0.197213 |
| 白色 Lambert 表面 | 0.445022 / 0.372795 / 0.345250 |
| #ded6ca 屋顶      | 0.328072 / 0.253508 / 0.206785 |

与修复前光谱读回按对应 Sun / Sky 因子逐项一致。当前 Globe ready / tilesLoaded=true、
GL error=0、控制台无错误；100 material draws、3 lighting draws、56,224,168 bytes、
1,448 frame commands 与修复前相同。Planar 公开页 LDR 与低俯角 HDR 的 ready /
tilesLoaded=true、GL error=0。临时诊断 GPU 对象释放，Planar 检查页关闭；用户 Globe 页
保留南京中午 / HDR / exposure=1 及原视角。画面存于忽略的 Build 诊断产物，未入版本控制。

当前修改覆盖 SceneGIS-owned 构造默认值、CPU 主光分母、Shader 包装和消费者、Specs 与文档。
不改渲染调度、样式隐藏、注记遮挡、线宽、SDK；没有新增缓冲、采样器、资源或 pass。
Planar ground boundary 为分离 direct / sky 多一次已有 transmittance LUT 读取，其余为常数运算。

剩余风险：三波段转换是原实现固定 Earth 光谱的近似，不是任意光谱积分或 EV100 相机标定。
它修正颜色与单位，不能保证 exposure=1 下所有材料均明亮；整体显示亮度及负责人视觉 gate
仍待确认。旧倍率可显式保留，但不能恢复缺少颜色转换时的逐像素外观。当前未提交。

## 后续：太阳强度与曝光基准核查

本轮只更新诊断记录，没有运行时代码、Shader、测试、示例或上游文件改动。RAD-04 的 fixed
仅指光谱与共同相对能量单位；完整显示基准由 RAD-06 跟踪，不能把技术通过扩展为画面通过。

### 来源事实

继续使用 LUT 固定来源提交 `9c6dfd0054f077f3ad4695b802e74d4c6a814440`：

- [getSunLightColor.ts](https://github.com/takram-design-engineering/three-geospatial/blob/9c6dfd0054f077f3ad4695b802e74d4c6a814440/packages/atmosphere/src/getSunLightColor.ts#L93-L96)
  以 `transmittance * solarIrradiance * sunRadianceToRelativeLuminance` 得到太阳颜色。
  [SunDirectionalLight.ts](https://github.com/takram-design-engineering/three-geospatial/blob/9c6dfd0054f077f3ad4695b802e74d4c6a814440/packages/atmosphere/src/SunDirectionalLight.ts)
  没有增加额外太阳倍率；本地 native 兼容灯 intensity=2 不能当作物理太阳漏乘的证据。
- [aerialPerspectiveEffect.frag](https://github.com/takram-design-engineering/three-geospatial/blob/9c6dfd0054f077f3ad4695b802e74d4c6a814440/packages/atmosphere/src/shaders/aerialPerspectiveEffect.frag#L98-L108)
  同样以 albedo/pi * (sun + sky) 计算漫反射；albedoScale 默认 1。不存在本地重复除以 pi
  或需要删除 Lambert 归一化的证据。
- [MinimalSetup](https://github.com/takram-design-engineering/three-geospatial/blob/9c6dfd0054f077f3ad4695b802e74d4c6a814440/storybook/src/atmosphere/MinimalSetup.stories.tsx)、
  [Atmosphere-Basic](https://github.com/takram-design-engineering/three-geospatial/blob/9c6dfd0054f077f3ad4695b802e74d4c6a814440/storybook/src/atmosphere/Atmosphere-Basic.tsx#L50)、
  [Atmosphere-Vanilla](https://github.com/takram-design-engineering/three-geospatial/blob/9c6dfd0054f077f3ad4695b802e74d4c6a814440/storybook/src/atmosphere/Atmosphere-Vanilla.tsx#L127)
  使用手动曝光增益 10 和 AgX。相对曝光 1 是 +3.322 stops，但这属于示例显示配置，
  不是太阳单位换算常数，也不是 EV100 相机的绝对标定。

### 同页复现与实测

浏览器接口未返回负责人当前的 AdvancedEnvironment 标签页，故创建同 URL 的独立副本，
没有读取或修改负责人该页的运行时状态；以下数值只指副本与页面源码默认配置。

`球面物理大气.js` 的时间为 2026-06-21T02:30:00Z、南京、相机高 600 米；太阳高度
67.076°，HDR=true、PBR_NEUTRAL、exposure=1、gamma=2.2、自动曝光未启用。
background/surface/aerial 为 4/1/1；cloud、height fog 关闭。
`SceneGISEnvironmentEffectsAerialFS.glsl` 的散射源倍率是 background*aerial，
因此该示例仍有 4 倍空气散射；这与现已统一为 1 的引擎默认值不同。

在相机地理位置上方 1 米的水平面，实际 GPU LUT 读回：

| 量                | scene-linear RGB               |
| ----------------- | ------------------------------ |
| 太阳直接照度      | 1.648790 / 1.350820 / 1.154235 |
| 天空漫射照度      | 0.067935 / 0.104497 / 0.208690 |
| 白色 Lambert 输出 | 0.546451 / 0.463242 / 0.433833 |
| 18% Lambert 输出  | 0.098361 / 0.083384 / 0.078090 |

总照度按共享单位 U 和 Rec.709 亮度折回约 113,896 lux（三波段近似）；18% 灰面曝光前
Y=0.086186。未发现太阳强度缺失；不建议改 LUT 太阳常数或叠乘 native intensity。

把副本 background 调回 1，保持其余受光和相机不变；32×32 网格采样地表区域
uv=(0.05..0.95, 0.08..0.4)，在同一视口内依次对照：

| 手动曝光 | 曝光前平均 RGB                 | 显示平均 RGB（0–1）            |
| -------- | ------------------------------ | ------------------------------ |
| 1        | 0.131836 / 0.166622 / 0.041363 | 0.352941 / 0.403922 / 0.125490 |
| 10       | 与曝光 1 相同                  | 0.886275 / 0.976471 / 0.564706 |
| 2.55     | 与曝光 1 相同                  | 0.576471 / 0.647059 / 0.290196 |

曝光 10 明显提亮，但 PBR Neutral 与来源 AgX 不同，当前地表已很浅，不能直接宣称
曝光 10 即正确默认值。2.55 只用于一个可解释的诊断锚点：当前光照下 18% 灰面在
PBR Neutral 黑位偏移后约为显示线性 Y=0.18；不是全天候或所有内容的通用曝光。
两者均保持实际场景辐亮度不变。AgX 尚不在本地 Tonemapper 选项中，本轮未实现替代曲线。

GL error=0、页面控制台无 error、tilesLoaded=true；87 material draws、4 lighting draws、
29,765,736 bytes 在检查前后保持。临时读回资源已释放，诊断副本恢复并关闭，原用户页未动。
截图保存在忽略的 Build 目录，不入版本控制。只做诊断 / 文档检查，未重复运行已通过的
41 项代码回归或全量构建。

### 后续建议与剩余风险

执行角色先同步示例中性倍率；架构角色确定 HDR 手动曝光 / tone curve 的成对参考配置。
若目标是原实现观感，补齐 AgX 后使用来源曝光 10 作对照基线，再做实际材质和注记视觉验收。
自动曝光仍默认关闭，LDR 与显式用户设置不应被隐式覆写。运行时实现尚未开展，RAD-03、
RAD-05、RAD-06 保持 open；当前无新增 upstream-owned files / SGP，也未提交。

## 当前：中性示例与 AgX 交付

以上诊断阶段的未实现状态由本节更新。负责人批准后，按 ADR-0164 完成：

- `Tonemapper.AGX` 与原生 collection switch 是仅有的两个 upstream-owned 改动，
  都使用 SGP-0060；自有 factory / GLSL 保留 Three.js r179 的 MIT 许可与同步来源。
- 曝光、调色、AgX、原生 gamma 顺序明确；AgX 内部 2.2 次幂恢复线性颜色，不重复编码。
  手动 / 自动曝光均一次应用；引擎默认与 LDR 契约保持。
- 10 个 AdvancedEnvironment 日间示例的旧 background=4/10 改为 1，测试入口的旧倍率
  同步；日间示例显式 AGX / 10，夜间专用预设不变。物理大气和两种矢量地图增加显示控件，
  矢量示例显式开启 HDR / AGX / 10。样式、遮挡、几何、光源所有权及 SDK 不变。

### 自动化与基线隔离

Chrome Headless 155 / Windows：AgX 6 项、AutoExposure 11 项、ColorGrading 9 项全部通过。
覆盖独立参考色值、黑 / 负值 / HDR 高光、gamma、alpha、曝光一次、调色顺序、LDR、
stage / shader / target 复用以及切换和销毁。最后的工厂 import 别名调整后，构建和 AgX 6 项重跑通过。

原生 PostProcessStageCollection suite 为 14 成功 / 26 失败，不能记为全绿：

- 25 项旧 HDR 夹具通过不写深度的 OPAQUE ViewportPrimitive 绘制，触发既有延迟材质约束。
- 1 项旧 outputTexture identity 断言与现有 LDR 显示 stage 不一致。
- 临时将仅有的两个 AgX 上游接点替换为 HEAD 版本，重新生成并运行同一原生 suite，
  同样为 14 / 26，失败用例名逐项一致。随后完整恢复候选源码并重新构建。
  该对照仅隔离 AgX 接入，不等同于整个 HEAD checkout；没有新工作区、提交或 stash 操作。
  不通过产品测试特例、放宽深度约束或顺手改上游夹具消除已有失败。

完整 dev / release build、build-ts、tsc 通过；release 的 browser / ESM / CJS bundle 均保留
AgX 来源和 MIT notice。定向 ESLint / Prettier、文档检查与上游补丁审计见最终检查记录。
生成的 Shader JS、类型、bundle、日志和截图均为忽略产物，不进入提交。

### 浏览器结果与成本

Globe 物理大气与当前 Planar 矢量页面均为 HDR / AGX / exposure=10、倍率均 1、
ready / tilesLoaded=true，GL error=0；页面无 error。Planar 刷新后恢复负责人的原相机、
时间和 opacity=1，保留新的显示控件。Globe 为同 URL 的独立验收副本。

同一画面切换 PBR Neutral → AgX → 恢复，deferred 成本不变：

| 页面           | 材质绘制 | 光照绘制 | deferred bytes |
| -------------- | -------: | -------: | -------------: |
| Globe 物理大气 |      103 |        4 |     28,454,220 |
| Planar 矢量    |      136 |        3 |     46,302,256 |

AgX 只替换已有显示 stage 的逐像素算术，没有额外 pass / 纹理 / FBO；上述数值不表示
AgX 与 PBR Neutral 的 ALU 时间相同，没有宣称 GPU 耗时等价。资源生命周期由 Specs 验证。

**视觉仍待负责人确认。** 相比原 LDR / exposure=1，当前矢量图明显提亮，但曝光 10 下屋顶、
地表颜色和无光照的注记 / 图标一起变浅；背光墙面仍蓝暗。Globe 的背景和材质也偏浅。
这说明来源曝光 10 不能直接当作所有制图内容的通用默认值。现有全局 HDR 显示会处理注记，
本轮没有私自改变注记的显示域、遮挡或样式契约，也没有再放大太阳来平衡暗面。

### UE 对照与后续定位边界

按负责人要求查阅官方文档及公开论文配套源码，尚未移植 UE 算法：

1. [UE Sky Atmosphere](https://dev.epicgames.com/documentation/unreal-engine/sky-atmosphere-component-in-unreal-engine)
   将太阳、天空补光与空气散射区分；推荐太阳天顶 120,000 lux、水平总照度约 150,000 lux，
   天空约占 20%，Earth albedo=0.4。其 LUT 分别服务透射、多次散射、视点天空、空气透视和
   天空照明。当前 Bruneton ground_albedo=0.1，前述测量太阳高度 67°，不能直接用照度比
   推断缺失一个统一倍率。必须先匹配太阳角度、地面反照率和接收面。
2. [UE 公开大气实现](https://github.com/sebh/UnrealEngineSkyAtmosphere)是 2020 论文配套，
   不是 UE 5.8 引擎源码快照。[RenderSkyRayMarching.hlsl](https://github.com/sebh/UnrealEngineSkyAtmosphere/blob/master/Resources/RenderSkyRayMarching.hlsl)
   在单位照度传递函数上施加 SunIlluminance，并积分透射、单 / 多次散射；地面项保持
   albedo / pi。没有取消 Lambert 归一化或需要额外统一增亮大气的依据。
3. [UE Exposure](https://dev.epicgames.com/documentation/unreal-engine/auto-exposure-in-unreal-engine)
   的固定手动曝光同样有效；pre-exposure 用于缓冲数值范围，不增加物理光能。
   本地 exposure 是相对单位增益，并非已标定的 EV100 相机，不直接照搬 UE 的相机数值。

当前 Planar 漫射天空采用水平 irradiance 乘半球法线权重，没有该函数内的显式地面反弹项。
因此后续优先在同等太阳 / 反照率下检查天空与下半球补光，再决定制图注记是否需要独立于
物理曝光的显示约定；这些是由差异提出的待验证方向，不能据此宣称已经定位全部灰暗根因。
本增量不变更大气传输、光照架构或自动曝光默认。RAD-03 保持 open，当前未提交。

### 最终检查记录

改动 JS 的 ESLint、改动文件的定向 Prettier、AgentDocs 全目录 Markdownlint 与改动架构文档
Markdownlint、git diff --check 通过。强制执行 AgentDocs 全目录 Prettier，仍为 451 个未改动
历史文档警告；本次改动文档已通过，不顺手格式化历史文件。

补丁审计通过：当前交付恰为 2 个 upstream-owned 文件，SGP-0060 成对标记有效，
generated status=0。保持 scenegis/develop；既有两份 stash 未变，未提交 / 推送。
临时 Globe 页关闭，当前 Planar 页保留 AGX / 10 与原视角，控制台无 error。

## ADR-0165 增量：地面反弹与注记曝光补偿

负责人选择注记抵消曝光增亮、继续接受 tone mapping。实现完成，技术检查与当前视角
观察如下；RAD-03 保持 open，由负责人确认最终画面，不扩大为 UE GI 或所有材质的验收。

| ID     | Severity | Finding                                                        | Status / evidence                                                                                                                                                      |
| ------ | -------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RAD-07 | P2       | 镜面天空已有地面返回，漫反射只有上半球天空，侧墙缺少下半球补光 | fixed：双世界共享源补齐 albedo=0.1 的区域 Lambert 返回；真实 glTF / 模型类 Tiles 四项测试验证侧面、朝下与朝上表面、主光增益及显式 IBL 所有权                           |
| RAD-08 | P2       | 全局曝光 10 同时把制图文字与图标推向曲线高亮端                 | fixed：原有 symbol shader 仅补偿 premultiplied RGB；新增两项实际绘制测试覆盖文字 / 图标、0.5/1/10 手动增益、0 增益、LDR、稳定自动增益及当前 compensation、半透明和拾取 |

### 设计和自审

- 来源依据为 [UE Sky Lights](https://dev.epicgames.com/documentation/en-us/unreal-engine/sky-lights-in-unreal-engine)
  的环境漫反射职责，以及前节公开大气实现的 Lambert 地面项。原天空照度、太阳、地面
  反照率及 LUT 不变；未引入 UE 的全场景反弹、环境捕获或局部多次散射算法。
- Planar 及 Globe Model / Globe surface 消费同一 ground closure；地面直射使用主光方向、
  RGB gain 和云透射，天空保留真实太阳与 readable night。Globe 的高空贡献乘半径平方比。
  侧面 / 下向才增加采样，朝上不增加 ground；表面倍率和 Lambert 归一化只应用一次。
  AO 继续作用于整个间接光，显式 SH / IBL 仍由调用方拥有，未触碰上游 PBR BRDF。
- 注记在原 PASS / 原混合位置补偿，alpha、discard、opaque coverage、深度、地形锚点、
  外部 Model / Tiles 遮挡和样式先后均不改变；拾取派生仍覆盖最终颜色。
- 自动曝光继续默认关闭。启用时使用历史纹理 G 的自动 log gain，而不是含旧手动增益的 R；
  同时使用当前 manual gain / compensation。动态适应存在一帧比值偏差，锁定 / 稳定时抵消。
  不为此额外测光、读回或加 settling frame。HDR gain=0 不产生无穷补偿，LDR 恒为 1。
- 本增量全部为 SceneGIS-owned 源码，无新增 SGP；现有 AgX 两个上游接点继续归属 SGP-0060。

### 验证与成本

- Chrome Headless 155 / Windows：VectorSymbols 52、VectorEnvironment 8、ModelEnvironmentLighting 4
  共 64 项通过；包括现有透明 / 不透明样式顺序、地形与外部模型 / Tiles 遮挡、资源释放。
  Model / Tiles 四项分别验证 Globe 与 Planar，不能以矢量外观替代 PBR 路径验证。
- 原生 PBR Neutral 映射后的 Planar 侧面红通道因量化相同，测试改为比较 RGB 总亮度，
  不通过调整产品太阳或反照率迎合单通道断言。CustomShader 测试使用可变法线值，
  不向冻结的 Cartesian3 常量写入。测试夹具修复后四项全部通过。
- 开发构建、改动 JS 的 ESLint / Prettier、补丁审计通过；本轮审计为当前交付 2 个
  upstream-owned 文件、SGP-0060、generated status=0。未改生成文件、未提交 / 推送。
- 当前公开 Planar 页固定原相机 / 时钟、HDR / AgX / exposure=10、自动曝光关闭，
  修复前后背光侧面由深蓝变为较亮中性灰蓝，图标恢复蓝色及内部形状，文字不再整体冲白。
  屋顶和地表仍受曝光 10 / AgX 显示约定影响；未为消除明暗差再次提高太阳或整体亮度。
- Windows / Chrome IAB / RTX 3060 Ti、1001×826 同视角：deferred bytes=46,302,256、
  material draws=138、light draws=3，修复前后相同。无新增纹理 / FBO / PASS，斜面增加
  现有 LUT 和可选云影采样，symbol 增加标量运算及仅 AE 开启时的历史纹理读取。
- 暂停默认循环、每次 render 后 gl.finish 的 32 帧短样本（先运行 8 帧排除首次编译）：
  中位耗时 6.4 → 6.6 ms，P95 7.6 → 9.7 ms。这是同步 CPU+GPU 合计的小样本，
  不是纯 GPU 计时或零成本结论，不能据此声称不同设备 / 视角都无性能变化。

区域地面反弹不含局部纹理、建筑之间的多次反弹或每次反弹的几何可见性；没有复制 UE
完整 GI。最终视觉 gate 及动态自动曝光的一帧历史限制保留在 ADR-0165 / RAD-03。

### 默认环境补充回归

首轮默认环境测试发生浏览器 transport 断连，只有部分结果，未计为完整通过。
结束该测试进程后暂停示例连续渲染并重跑，DefaultEnvironment 14 项完整通过，包含真实
地形 / glTF、默认与显式所有权、云冷加载 / 释放、空气透视和高度雾；之后恢复示例交互。
AgentDocs 全目录 Markdownlint、改动文档 Markdownlint / Prettier 及 diff check 通过。
强制全目录 Prettier 仍为 451 个未改动历史文档警告，本增量文档无格式警告。

## 当前 LDR 反馈：已修复有限网格的天空误扣，整体观感仍 open

负责人认为关闭 HDR 后仍暗淡、缺少对比度 / 饱和度，不接受曝光作为整体根因。
当前 Planar / Berlin 视角的排查确认：

1. 建筑底色 #ded6ca 在 G-buffer 中为 (0.7368, 0.6797, 0.5986)，与 gamma=2.2 的一次
   解码一致。没有在该路径发现二次线性化。LDR 最终 stage 只执行 clamp 与一次输出 gamma。
2. 临时关闭 aerial / height fog 后近景仍暗；已恢复原设置。不能把整体问题归因于空气蒙灰。
3. **真实缺陷 RAD-09 / P1：** Planar 总照度 LUT (64x16) 与透射 LUT (256x64) 的边界
   sample height / Sun cosine 不同。以请求点直射扣除已插值总量，错误扣掉了天空能量。
   在总照度末列首行，实际 h=58.59375 m、mu=0.968994；应有 spectral sky
   (0.03856, 0.09611, 0.22053)，旧算法红通道为 -0.00559 再截为 0。
4. 按 ADR-0044 补充决策，先在各贡献 texel 上用与生成器一致的解析透射扣除直射，再
   插值 diffuse irradiance。资产格式 / 二进制 / 太阳 / 显示配置不变，无新资源或 PASS。
   RAD-09 fixed；真实冻结 LUT 的边缘、内部、高度与夜侧 GPU 回归验证独立 CPU 参考。
5. 修正后当前实际 RGB sky 由 (0, 0.04025, 0.14620) 变为 (0.05855, 0.09051, 0.19022)，
   direct 保持 (0.80439, 0.73311, 0.63145)。水平白面的输出仅由约 0.25 增至约 0.27；
   这证实有补光缺陷，也证实它不能单独解释或解决全部 LDR 观感。
6. 当前示例显式 DirectionalLight 的白色 intensity=1，primaryScale≈(0.523,0.585,0.596)，
   是调用方 RGB 照度契约；不能把它误认为自动物理太阳的 scale=1。临时切换自动 SunLight
   后 LDR 的受光面变亮，已恢复原灯光。此比较改变了光源及方向，不是曝光或同光照 A/B。
7. LDR 当前把场景相对辐亮度直接编码为显示 RGB，参考白未随物理场景标定。白面约 0.27
   对应约 140/255，而不是显示白；用户报告的暗淡仍存在。后续应以固定白 / 灰材质、
   统一太阳 / 天空条件核对 LDR/HDR 参考白，不能在本次局部修复后宣称完整光照已经正确。

后续修正的定向验证：真实 LUT 1、光谱转换 2、Model / Tiles 4、VectorEnvironment 8，
共 15 项通过。与此前不受此改动影响的 52 项注记及 14 项默认环境回归结合，相关证据共
81 项（不重复累计重跑）。开发构建、改动 JS ESLint / Prettier 通过。没有新增 upstream-owned
文件；当前全部上游修改仍为 Tonemapper / PostProcessStageCollection，SGP-0060。

当前原视角 LDR、exposure 控件值 6.8（LDR 忽略）、自动曝光关闭、原相机 / 固定时钟 / 原灯光
均已保留。渲染输出仍灰暗，RAD-03 保持 open，不请求以技术测试替代负责人视觉判断。

Planar 新采样最多读取 4 个 irradiance texel 并计算各中心的解析直射，无附加纹理 / FBO。
同视角 material draws=137、deferred bytes=46,302,256 不变。前后场景短样本分别为
7.4 / 6.1 ms 中位，但前者期间另有测试负载，不用于宣称性能提升。RTX 3060 Ti 上另外
交错测量旧 / 新采样、1024x1024 像素、16 次有效样本，CPU+gl.finish 中位均低于 0.1 ms
计时分辨率；这不是零开销结论，不外推到复杂云步进或其他设备。

### 公开 Planar 示例恢复默认物理太阳

负责人明确要求使用物理光照，已删除示例 DirectionalLight 覆盖。默认物理大气此前一直
启用；该覆盖仅替代主光方向、颜色和强度。Planar 默认太阳为固定 +Z，移除覆盖不等于
引入按地理位置 / 时间计算太阳方向的新行为。

重新加载修改后的示例确认 primaryScale=(1,1,1)、sunDirection=primaryDirection=(0,0,1)，
默认大气 enabled / ready，自动曝光 stage 未创建。保留用户 LDR、exposure 控件 6.8、
原相机和固定时钟；受光面更亮，整体观感仍由负责人确认。此前第 6 点恢复原自定义主光
仅为诊断时状态，现已由此结果替代。复用默认环境 14 项既有回归，本次无引擎或上游文件改动。

### 自动物理太阳之后：UE 对照诊断，尚未实现新方案

负责人仍指出天空 / 地面一起偏暗。浏览器确认默认物理太阳 scale=1、surface/background=1、
LDR、自动曝光未创建。本轮只检查和记录，不改变相机、显示参数、Shader 或 LUT。

- 算法来源需精确区分：Globe 使用 Bruneton 预计算；Planar 使用自有 flat-slab 适配。
  Planar provenance 的 groundBoundary 明确排除地面边界对 orders 2–4 的贡献，generator
  的入射积分也确实只有大气散射。ADR-0165 的地面向侧墙返回没有把该能量送回大气预计算。
  这是既有近似的质量边界，不能把恢复自动太阳等同于完成物理链路验收。
- UE 作者的 [公开参考实现](https://github.com/sebh/UnrealEngineSkyAtmosphere) 可与 Bruneton
  及 path tracer 对照。其 RenderSkyRayMarching.hlsl 中 NewMultiScattCS 使用 ground=true，
  IntegrateScatteredLuminance 加入地面 Lambert 反射，随后计算多次散射。
- 读取当前冻结 irradiance / transmittance 资产，按 runtime 边界采样及已恢复的 RGB 系数
  进行 CPU 计算：地面 / 天顶太阳直射约 116156 lux，天空约 6884 lux，总量约 123040 lux，
  天空比例 5.59%。这是固定参考点的资产计算，不是当前所有像素的 GPU 计量或新测试通过数。
- [UE 官方参考](https://dev.epicgames.com/documentation/en-us/unreal-engine/sky-atmosphere-component-in-unreal-engine)
  为天顶太阳 120000 lux、总量约 150000 lux、天空约 20%，同时指定 Earth Albedo=0.4 与
  multiscattering=1；本地 albedo=0.1 且为 flat-slab，不能直接用 20% 判定数值错误，也不能
  把 0.1 改成 0.4 当作修复。该比较说明优先检查天空比例 / 地面边界，而非任意加大太阳。
- 当前 scene unit 为约 75717 cd/m²；LDR 仅 clamp/gamma，没有参考白 / 相机标定。
  上述照明下，理想 18% 灰水平 Lambert 面的场景 Y≈0.0931，gamma=2.2 后约 87/255；
  若选择把参考灰映射到显示线性 0.18，则对应约 117/255。后者是可选择的显示目标，不是
  证明物理传输错误的定律。[UE 手动曝光](https://dev.epicgames.com/documentation/en-us/unreal-engine/auto-exposure-in-unreal-engine)
  也明确从 cd/m² 通过固定 exposure 映射到像素亮度，关闭自动适应并不取消该步骤。

RAD-03 继续 open。建议下一步先在同太阳、介质、反照率下核对 Planar 多次散射与地面边界，
同时用白 / 灰 Lambert 面分开标定 LDR/HDR 显示参考；自动曝光保持默认关闭。尚未批准算法
整体替换，也不宣称单个遗漏足以解释全部灰暗。本轮无新增 upstream-owned 改动或 SGP。

### 最新：球面正午 LDR 参考标定，等待视觉验收

负责人指定先处理当前球面物理大气页，固定南京当地 12:00、关闭 HDR，球面验收后再处理
平面。该范围替代上一节建议的先后顺序，Planar transport 仍 deferred。

- **RAD-10 / P2 / fixed，责任 architecture / execution：** 原共同单位约 75717.3 cd/m²
  来源于参考实现的 half-float 存储归一化，不是 LDR diffuse-white 标定。冻结 Globe LUT
  在海平面 / 天顶太阳下，白 Lambert 面 Y=0.52315、18% 灰面 Y=0.09417。
  ADR-0044 将共同单位明确为 40000 cd/m²；参考白约 0.990、参考灰约 0.178。
  这修正显示参考契约，不宣称修复了 Bruneton 的物理传输。没有放大太阳物理照度或改变
  Sun/Sky 比例，也没有添加逐帧曝光、色彩对比度或饱和度处理。
- CPU 自定义 RGB 主光分母同步，保持其调用方场景值契约；物理单位在双世界及 HDR/LDR
  之间一致。HDR 在相同手动曝光下也会受到新单位影响，后续应重新视觉确认参考曝光，
  不能把旧示例 exposure=10 当成新的统一推荐值。LDR 依然只 clamp/gamma，超过显示白
  的通道会截断，不宣称具备 HDR 的高光保留能力。
- `Test/AdvancedEnvironment/球面物理大气.js` 默认固定 2026-06-21T04:00:00Z、HDR=false，
  新增 HDR 显示控件。浏览器恢复原相机；当前 PBR_NEUTRAL / exposure=1（LDR 忽略），
  surface/background/aerial=1、自动太阳 primaryScale=(1,1,1)、自动曝光未创建。
  暂时用于诊断的倍率已移除，连续渲染恢复，未留下测试材质或临时 GPU 资源。
- Chrome Headless 实际执行 **82 项全通过**：默认环境 14、光谱转换 2、真实 Globe 白 / 灰
  标定 1、Planar LUT 网格 1、Model / Tiles 4、矢量光照 8、注记 52。包含地形 / 模型遮挡、
  样式规则、曝光补偿、资源销毁与所有权回归。旧单位的已读回数值不能满足新白 / 灰断言。
- 开发构建、改动 JS ESLint / Prettier、diff check、上游补丁审计通过。没有新增 pass、
  纹理、FBO 或 uniform；固定常量替换不增加运行时算术。原视角前后均 87 个 command、
  18 个缓存 shader；各 24 次 render + gl.finish 短样本中位均约 1 ms，GL error=0。
  该短样本只用于排查明显回归，不作性能提升或跨设备承诺。

AgentDocs 全目录 Markdownlint 通过；强制全目录 Prettier 仍报告 451 个既有文件警告，
本增量修改文档均已单独格式化且无警告。浏览器无 error 日志，生成文件状态为零。

已保存同视角修改前后截图供负责人核对。天空与地面比旧基准更亮，当前阶段仅建立明确的
白 / 灰参考；整体天空、远景、背光观感仍由 RAD-03 跟踪，不用数值测试代替视觉判断。
自审未发现新增集成或生命周期问题。当前增量没有修改 upstream-owned file；整个待交付
工作区的上游改动仍只有 `Scene/Tonemapper.js`、`Scene/PostProcessStageCollection.js`，
均为已有 AgX 接入 SGP-0060。未提交，先等待球面视觉反馈再推进平面。

### 球面仍暗 / 灰：方向性补光与主流引擎复核

负责人认为新标定有改善但仍偏暗 / 灰，要求先核对物理实现，再判断非 1 的艺术倍率。
RAD-03 继续 open。本轮未修改代码或页面参数，没有把白 / 灰标定扩大为完整物理验收。

**RAD-11 / P2 / open，责任 architecture / execution：** 现有非水平面天空照度为
`GetIrradiance * (1 + dot(normal, up)) / 2`。这是
[Bruneton 原实现](https://ebruneton.github.io/precomputed_atmospheric_scattering/atmosphere/functions.glsl.html)
明确注明的非水平面近似，并不等同于对实际天空按接收面余弦积分。

在当前太阳方向（当地高度角约 81.31°）、当地地表上方 1 m 参考点，用实际 Globe 资源
执行 64x128 均匀 mu / azimuth 方向积分，权重 max(NdotL,0) dOmega，不含太阳圆盘
及下半球地面反弹：

| 量                        | 照度       |
| ------------------------- | ---------- |
| 水平面太阳直射            | 114871 lux |
| 水平面天空 irradiance LUT | 8027 lux   |
| 水平面天空 radiance 积分  | 8086 lux   |
| 朝南竖直面现有天空近似    | 4013 lux   |
| 朝南竖直面天空方向积分    | 6258 lux   |

水平结果相差约 0.73%，支持该条件下天空输出与水平补光自洽；竖直面近似低估天空项
约 36%。这不是每个模型像素都暗 36%，也不是所有高度 / 朝向的统一误差，直射及地面
返回另计。探针资源均已销毁，GL error=0，未为只读诊断重跑整套 Specs。

三波段转换、有限 LUT、非水平面的半球近似、固定 albedo=0.1 的区域地面返回均是精度
边界。后者不包括局部材质、建筑间反弹与反弹方向可见性，不能称为完整场景 GI。
本参考点没有需要再把太阳整体翻倍的数值证据，不构成所有路径的严格证明。

主流引擎对照：

- [UE 物理天空参考](https://dev.epicgames.com/documentation/en-us/unreal-engine/sky-atmosphere-component-in-unreal-engine)
  推荐天顶太阳 120000 lux、总照度约 150000 lux，默认地面反照率 0.4、多次散射 1。
  这是特定参数参考，不是所有模板的默认太阳。不能拿天空 20% 直接否定本地 albedo=0.1。
- [UE 属性参考](https://dev.epicgames.com/documentation/en-us/unreal-engine/sky-atmosphere-component-properties-in-unreal-engine)
  的 Art Direction 区分 Sky Luminance Factor 与 Aerial Perspective Distance Scale；
  [Sky Light](https://dev.epicgames.com/documentation/en-us/unreal-engine/sky-lights-in-unreal-engine)
  独立负责天空对物体的照明。它们不是本地三个倍率的一一映射。
- Unity Graphics 当前公开
  [SkySettings 源码](https://github.com/Unity-Technologies/Graphics/blob/master/Packages/com.unity.render-pipelines.high-definition/Runtime/Sky/SkySettings.cs)
  默认 sky exposure=0 EV、multiplier=1；
  [PhysicallyBasedSky](https://github.com/Unity-Technologies/Graphics/blob/master/Packages/com.unity.render-pipelines.high-definition/Runtime/Sky/PhysicallyBasedSky/PhysicallyBasedSky.cs)
  的 color / alpha saturation、alpha multiplier 为 1，horizon / zenith tint 为白色。
  组件默认不等于项目 Volume / 模板配置，不存在可直接移植的通用倍率三元组。

本地关系为 background=B、surface=G、aerial=A：背景 B*Lsky，地表 G*Lsurface，
空气合成 T*(G*Lsurface)+B*A*S。background 不增强表面天空补光；surface 同时增强
直射与间接光；aerial 只乘入射散射，不改变 T。全 1 只是中性，不保证好看；提高
background 会同步增强远景雾幕，不能把它当作 UE 的独立 Sky Light 或空气厚度控制。

当前模型中心距相机约 7.15 / 22.14 / 51.80 km，本例有意展示长距离空气透视。
height fog / 自动曝光 / HDR 均关闭；保留用户移动后的相机及其他参数。
下一候选：基于既有天空建立方向性 diffuse irradiance，可评估 SH 或小型照度缓存，
先明确空间 / 更新范围及成本，再分离天空外观、间接补光与空气光学厚度的艺术控制。
尚未选定新 API、默认倍率或算法替换，未启动对应实现，球面仍先于平面。

### 已批准并实现：Globe 方向性天空照度

负责人同意先改善算法。RAD-11 的技术修复完成，RAD-03 的整体视觉 gate 保持 open。
仅使用现有冻结光谱 scattering 数据，按 NdotL 对上半球天空积分；排除太阳圆盘和独立
地面返回，保持太阳直射、固定地面反照率、显示单位以及所有权规则。没有提高艺术倍率。

实现为全局高度 / 太阳角度 / 法线倾角 / 相对方位 4D 照度表，冷创建一次。与原始照度
共同存储在 649×272 RGBA16F atlas（1412224 bytes，替代原 8192 bytes），运行时四次
双线性查询；没有新 sampler、资产请求或每帧预计算，不依相机缓存。每个接收点按自身
半径和太阳夹角采样。Globe 的模型、模型类 Tiles、地形、矢量建筑共用包装函数，显式
SH 保留。原始 scalar/cloud 查询仍使用原照度区域，Planar 原路径不变。

初始 32 个太阳坐标的夜暮插值不足，已调整为 65 个带零点、mu_s=[-0.5,1] 的非线性
样本，32×32 角度积分，16 高度 / 17 倾角 / 9 方位。以独立 64×128 积分为参考：

| 条件                      | 原近似   | 新方向表  | 参考积分  |
| ------------------------- | -------- | --------- | --------- |
| 正午 81.31°，上向水平面   | 8027 lux | 8051 lux  | 8086 lux  |
| 正午 81.31°，朝太阳竖直面 | 4013 lux | 6071 lux  | 6264 lux  |
| 正午 81.31°，135° 倾斜面  | 1176 lux | 2453 lux  | 2510 lux  |
| 太阳 -6°，朝太阳竖直面    | 5.89 lux | 22.77 lux | 22.67 lux |

修复参考侧墙的天空项误差从约 36% 降至 3.08%，不表示整幅画面亮度变化同样比例。
新的 GPU Spec 覆盖 12 个样本：上向、侧向、斜下、向下、背太阳、5 km、60 km、日间 /
日落后 -3°/-6°/-9°及刚体世界旋转，绝对误差小于 max(1 lux, 参考的 8%)，同时验证
静态资源复用和断开后销毁。第一轮夹具遗漏 disconnect host 参数而失败，修正后通过。

最终相关回归 **32 项通过**：方向表 1、光谱转换 2、真实白灰 1、Model / Tiles 4、
矢量光照 8、默认环境 14、Globe surface shader / aerial endpoints 2。已有注记补偿与
遮挡测试证据继续有效，本轮未修改其路径。开发构建与 JS 静态检查通过。

冷资源生成结束即释放 FBO / program 和原照度纹理，环境销毁释放 atlas；异常清理沿用
既有候选发布机制。浏览器 EXT_disjoint_timer_query_webgl2 单次预计算约 1.99 ms，
disjoint=false、GL error=0；含首次程序编译 / 分配的主线程测量约 601 ms。该编译暂停
是冷启动成本，不发生在每帧；时间为本机证据，不外推低端设备或驱动。

仍有有限角度积分 / 网格插值及三波段近似；下半球仍为固定 albedo=0.1 区域返回，不包含
局部纹理或建筑间 GI。天空背景与空气透视的倍率 / transport 未在本轮改变，不能把方向
补光修复称为整体观感已验收。Planar transport 继续 deferred，自动曝光默认关闭。
本轮所有实现均在 SceneGIS-owned 文件，无新 upstream seam；整个待交付工作区的上游
文件仍只有 `Scene/Tonemapper.js` 与 `Scene/PostProcessStageCollection.js`，均 SGP-0060。
未提交，等待负责人球面视觉判断。

最终浏览器已加载开发构建，恢复负责人原相机（高度约 2744 m）、南京正午、HDR=false、
PBR_NEUTRAL / exposure=1、三个物理倍率 1、自动曝光关闭。页面无 error 日志，GL error=0。
同视角中性参数下 command 前后均 71，24 帧 render+gl.finish 主线程短样本中位均约
1 ms；此数值不等于 GPU 帧耗时，只排查明显稳态回归。前后截图已保存在本机 Build
诊断产物中，最终反馈前不再添加代理视觉指标。开发构建、ESLint、改动文档格式、
全 AgentDocs Markdownlint、diff check 与 upstream audit 通过；generated status=0。

### 球面正午 LDR 艺术倍率预览（负责人后续反馈）

负责人继续反馈天空暗 / 灰，要求先保持球面、正午和 HDR 关闭。RAD-03 保持 open；
本轮没有修改渲染实现、示例源码或引擎中性默认，仅在当前页面比较公开参数并保存截图。

代码确认背景为 B*Lsky、空气合成为 T*(G*Lsurface)+B*A*S。B 同时作用于背景和沿程
散射，A 不改变透射 T。因此 B=2.5/A=0.4 虽保持沿程散射原值，却让背景与近地平线
地表产生明显亮度接缝；A=0.8 仍有较轻接缝。没有把这种降低散射输出的做法推荐为去灰。

当前预览选择 B=2.5、G=1.2、A=1.0，原相机 / 南京正午 / HDR=false / 自动曝光关闭。
天空及地面提亮，远景仍有空气散射导致的浅色效果，且 LDR 高光保留有限。该组合属于
当前场景的艺术预览，不是新的物理标定、SDK 默认或整场景质量验收。尚未固化到源码。
后续若负责人仍要求减少灰感，应先明确空气透视光学厚度 / 距离与气溶胶控制，再进入
实现；不能用只缩放 S、保留 T 的当前 A 参数冒充大气厚度。未开启该后续实现。

验证采用同相机的三组画面、公开参数状态和浏览器 error / GL 检查；没有产品行为变更，
不重复运行上一轮 32 项 GPU 回归。本轮 upstream-owned 文件及新增 SGP 均为零，未提交。

### 已批准并实现：Globe 空气透视距离

负责人批准调整空气透视。按 ADR-0166 新增公开 `aerialPerspectiveDistanceScale`，
默认 1、有限范围 [0, 8]，Planar 当前拒绝非 1 值。有限几何及云体前方的大气按缩放后的
路径同时查询 S/T，先排除初始真空段；0 返回 S=0/T=1，1 直接走原函数。实际几何深度、
云前后判断、height fog、光照与天空背景不变。没有新增 pass、附件、sampler 或 LUT；
setter 仅发布 warm uniform 与 requestRender。所有实现均为 SceneGIS-owned，无新 SGP。

新增 3 项 Spec 覆盖 API / warm 资源复用，独立有限路径参考的 0/0.5/1/2、太空入口与
入口前接收点、云影距离，以及实际 aerial FS 的几何 / 云前后遮挡 / clear sky 合成。
连同默认环境 14 项、linear/log 深度及远处接收点等回归，共 **22 项最终通过**。
首轮另有 2 项历史测试失败：它们继续调用原未缩放函数，但亮度区间和边界误差仍按光谱
单位断言，漏掉此前 RGB 转换。已在断言中除回 skyToScene，保留原始上下限 / 误差预算；
重跑 2 项通过。没有为通过测试修改底层有限路径求解器或放宽原光谱容差。

开发 / release 构建、生成类型与 tsc 均通过，新参数进入 constructor options 与实例属性。
定向 ESLint、改动文件格式、Markdownlint、diff check 和补丁审计均通过，generated status=0。
全 AgentDocs Prettier 仍报告 451 项既有文件格式问题，本轮不批量格式化无关文档。

当前球面示例显式保存天空 2.5、地表 1.2、空气亮度 1、距离 0.5，并提供距离控件；
引擎默认倍率保持 1。现场恢复负责人相机（约 2744 m 高）、南京正午、HDR=false、
自动曝光关闭、PBR_NEUTRAL / exposure=1。中远处模型颜色保留更多，远景雾幕减轻；
地平线仍可见薄蓝色过渡，非单位端点重映射不等于重建整个物理大气，RAD-03 视觉 gate
保持 open。未推进 Planar，未提交；下一步由负责人判断当前球面远景与边界。

同视角两组各 8 帧 GPU timer query，1/0.5 距离中位约 0.81/0.52 ms，样本总体范围
0.48–1.19 ms，disjoint=false、GL error=0；仅用于排查明显回归，不宣称性能提升。
command=71、shader=18，无额外资源；查询对象已释放、render loop 与预览参数已恢复。
页面 error 日志为空，最终截图保存在本机 Build 诊断产物中。

本轮改动 upstream-owned 文件为零。整个尚未提交的环境增量仍仅涉及已有的
`packages/engine/Source/Scene/Tonemapper.js` 和
`packages/engine/Source/Scene/PostProcessStageCollection.js`，对应 SGP-0060；
该历史集成并非本轮空气透视参数的新补丁。

### 球面正午验收通过；全时段检查

负责人明确接受当前正午画面，并确认前述蓝色区域是水面。撤销把该区域作为空气透视
接缝风险的判断；ADR-0166 正午视觉 gate 关闭，不将其扩大为全天或 Planar 验收。

按负责人要求在新停留视角检查 2026-06-21 南京全天，保持天空 2.5 / 地表 1.2 /
空气亮度 1 / 距离 0.5、HDR=false、自动曝光关闭、云 / 高度雾关闭。当前示例仍显式
showMoonlight=false。已检查北京时间 00、04、04:30、05、05:30、06、08、12、16、
18、19、19:30、20、22 时的画面，另保存 19:40 低谷画面。晨昏天空有暖色变化，日间
天空与远近接收点稳定，夜间星空正常；本场景未观察到模型消失、闪白或 GL/browser error。

RAD-12：太阳高度由日落降至约 -6° 时，真实暮光已接近消失，而原 readable-night
ambient 按 ADR-0050 仍为零；其后到 -12° 才渐入满强度。固定点显示 RGB 的证据：

| 北京时间 | 太阳高度 | 地表显示 RGB（8-bit） | 观察             |
| -------- | -------- | --------------------- | ---------------- |
| 04:00    | -11.35°  | 14 / 22 / 13          | 夜间补光接近全强 |
| 04:30    | -6.13°   | 2 / 2 / 2             | 清晨亮度低谷     |
| 05:00    | -0.65°   | 27 / 21 / 16          | 曙光恢复         |
| 19:00    | +1.76°   | 38 / 35 / 29          | 暮光             |
| 19:40    | -5.63°   | 3 / 2 / 3             | 黄昏亮度低谷     |
| 22:00    | -26.86°  | 14 / 22 / 13          | 夜间补光全强     |

固定地表采样点为 drawing buffer 归一化 (0.6, 0.15)，y 从底部计。03:50–05:30 与
18:50–20:40 共 212 个逐分钟样本，最大相邻分量差为 2/255，资源 identity 不变、
GL error=0。因此已复现的是平滑的先暗后亮，不能称为硬切换；单点数值不替代整幅画面。
它不是本轮距离缩放产生的新曝光问题，也不是自动曝光；原夜间补光是刻意的可读性设计，
不属于物理太阳或真实月光能量。

另在 22:00 临时开启月光，moonPhase≈0.2823、horizonFactor=1，主光倍率从零变为
(0.00936, 0.01396, 0.01955)，同地表点从 (14,22,13) 变为 (17,25,14)，说明开关响应
正常。Moon 使用 ADR-0053 的 readable 标定，不能据此宣称真实物理月光已验收；它共用
-6°/-12° 夜间过渡，不能填补此前的暮光低谷。月体在本示例本来隐藏，本次不更改该设置。

建议后续先明确保留可读夜景还是纯物理暗夜；若保持既有可读夜景，应让 ambient fill
与衰减中的暮光更早、平滑交接，避免等暮光耗尽后才启用。不得通过升高全局曝光掩盖低谷，
自动曝光默认保持关闭。RAD-12 仍 open，本轮只完成检查，没有擅改既有夜景风格。

现场参数、月光开关与原相机已恢复，时间回到正午，render loop 恢复，诊断引用已删除。
八时段对照页及原始画面 / 数值保存在本机 Build 诊断产物中。本轮只更新验收与检查记录，
无产品实现、upstream-owned 文件或 SGP 改动；不重复运行上一轮 22 项 Specs 或全量构建。

## Globe night ambient completion (2026-10-17)

负责人批准 ADR-0167 后，Globe 新增 `nightAmbientIntensity`：默认 1、有限 [0,8]、
0 关闭。以原深夜 RGB 照度为独立环境光下限，对各接收面的物理天空照度做 C1 smooth
maximum，替换旧 -6°/-12° 太阳角补光。天空背景、直射太阳 / 月光及其遮挡和曝光不变。
地表、Model / 模型类 Tiles、矢量建筑、地面返回、云与雾仍在各自原 ambient 入口消费。
Planar 保留旧过渡，本次不推断其视觉通过。高度雾保留原日间 ambient 标定，仅用原有
水平照度 LUT 的一次查询决定新增补光，不在此轮重新设计其全部照明模型。

### Verification and review

- 共 42 项不同的相关 Specs 最终通过：新 API / warm 资源、实际 GPU RGB 下限与昼暮
  过渡、原地表 / 云 / 雾 ambient、14 项默认环境、4 项 Model / Tiles、8 项矢量路径、
  延迟地表 / 透明地表接口、反射捕获及水面光照。无剩余失败。
- 扩展完整 frame record 后同步了手工构造记录的 fixture；补齐矢量独立 uniform map。
  完整雾 fixture 另补上此前空气距离参数的中性 uniform，未改变原断言含义。
- `build-release`、`build-ts`、`tsc`、最终 `build` 全部通过；生成声明包含 constructor
  option 与可写 property。ESLint、改动文档格式、AgentDocs markdownlint、diff check
  通过。AgentDocs 全量 Prettier 仍报告 451 个既有文件格式问题，不批量改动其他扩展。
- 上游审计通过，current delivery upstream-owned entries=3，generated status=0。
  本轮唯一新增上游改动是 `packages/engine/Source/Scene/GlobeSurfaceTileProvider.js`
  中 SGP-0009 原有成对标记内的一个 uniform。此前待提交的
  `packages/engine/Source/Scene/Tonemapper.js` 与
  `packages/engine/Source/Scene/PostProcessStageCollection.js` 仍对应 SGP-0060。

### Current camera day/night evidence

同一球面相机、2026-06-21 北京时间、LDR、自动曝光关闭、月光 / 云 / 高度雾关闭。
保留已接受的天空 2.5 / 地表 1.2 / 空气亮度 1 / 空气距离 0.5，夜间环境光默认 1。
固定地表点（屏幕 x=0.6、从底部 y=0.15）的 8-bit RGB：

| 时刻  | 修改前        | 修改后        |
| ----- | ------------- | ------------- |
| 04:30 | 2, 2, 2       | 14, 22, 13    |
| 05:00 | 27, 21, 16    | 27, 25, 19    |
| 06:00 | 73, 78, 65    | 73, 78, 65    |
| 12:00 | 152, 171, 110 | 152, 171, 110 |
| 19:00 | 38, 35, 29    | 38, 35, 29    |
| 19:40 | 3, 2, 3       | 14, 22, 13    |
| 22:00 | 14, 22, 13    | 14, 22, 13    |

15 个时段画面与 03:50–05:30、18:50–20:40 共 212 个逐分钟样本检查完成。
地表各通道最小值保持 14/22/13，相邻分钟最大变化 2/255；晨昏不再有低于深夜的低谷。
浏览器 render/console/WebGL errors=0，资源 identity 保持；强度 0 得 0/0/0，强度 2
得 19/30/18，恢复 1 得 14/22/13。画面显示暮光暖色与白天过渡仍在，正午 / 深夜保持。
当前页面已恢复正午与默认补光，原相机保持，增加北京时间与夜间环境光实时控件。
生成器 `Test/AdvancedEnvironment/tests/generate-daynight-review.mjs` 由本机 captures
生成忽略的 Build 对照页；页面含全天与原先最暗时段前后比较，截图/JSON 不提交。

同机 Chrome 155 / 1001×826、正午无云雾，16 帧 GPU timer 中位数修改前 0.626 ms、
修改后 0.571 ms，区间重叠；只能作为未见明显回归的有限证据，不能宣称性能提升。
两侧命令数均 72，环境资源类别保持相同；无新增 pass、纹理、FBO 或历史。
普通 surface 不增加天空查表，雾增加一次已有 horizontal irradiance 查询。

Architecture / code gate 通过，RAD-12 technical fixed；负责人最终夜景观感尚待确认。
夜间亮度沿用旧值，用户可单独调强度；它是艺术环境补光，不是物理月光或局部 GI。
RAD-03 的 Planar 视觉仍 deferred，当前 standalone plan 继续 active，尚未提交。

## Planar lighting and night transition (2026-10-17)

Globe RAD-12 owner visual gate 已由最新“通过”关闭。当前 review target 为授权的 Planar
同步；负责人角色仍为当前任务，technical / visual 状态按本节末尾更新。

### RAD-13 — Planar twilight below the deep-night floor

Severity: medium; owner: current architecture / execution role; status: implementation
complete, technical fixed / visual pending. 同一平面相机、LDR、天空 2.5 / 地表 1.2 / 空气 1 下，
04:30、05:00、19:40 固定地表点为 0/0/0，深夜为 18/26/29。旧 -6°/-12° 门控仍在
Planar surface / cloud / fog 中，错过物理天空已消退的时段。

将 ADR-0167 的相同 C1 RGB floor 移到共用 atmosphere helper，Globe 算术不变。
开放 Planar nightAmbientIntensity 并通过 shared Planar material map 提供 uniform；
地表、原生 Model / 模型类 Tiles、矢量共用；cloud/haze 和 fog 原 ambient 入口接入。
不添加 pass、纹理、FBO、历史或上游 hunk。平面仍用 fixed +Z / 原 Planar LUT；不套用
Globe 球壳、方向 atlas 或空气距离缩放，也不改镜面天空捕获和 Moon 方向光策略。

平面物理大气示例固定南京天文方向、2026-06-21 正午、HDR / 自动曝光关闭；采用天空
2.5 / 地表 1.2 / 空气 1，增加北京时间、夜间环境光和 HDR 控件。引擎中性默认不变。
视觉对照生成器增加 planar 参数，继续只生成忽略的 Build 产物。

### Planar verification and remaining boundary

- 27 项不同相关 Specs 最终通过：双模式照度 floor / API / warm 资源、Planar ambient
  实际 GPU、4 项 Model / Tiles、Globe ambient 回归、Planar 资源创建/复用/销毁、
  Planar P10 云阴影与 fog/haze、P11 月光、6 项天空反射和 8 项矢量光照。
- 为共用 helper 重新生成 Shader JS；不手改生成物。修正新参数测试中 Globe 不允许
  world 参数的 fixture，并补齐天空反射用例手工构造的 lighting record。已实测冷驱动
  编译使 Globe 综合 ambient 用例超过 30 秒，因此两个综合 ambient 用例显式限时 90 秒；
  保留全部断言，没有给产品增加等待、重试或降级。
- 完整 build-release / build-ts / tsc / 最终 build 通过；公开声明包含双模式 API。
  ESLint、改动文件格式、AgentDocs markdownlint、diff check 通过。AgentDocs 全量
  Prettier 仍有 451 个既有文件格式问题，不修改其他扩展。
- 上游补丁审计通过，generated status=0。本轮没有修改 upstream-owned file。
  整个当前未提交维护增量仍只有 GlobeSurfaceTileProvider.js（SGP-0009）、
  Tonemapper.js 与 PostProcessStageCollection.js（SGP-0060）三个上游文件。

15 个全日时段及 03:50–05:30、18:50–20:40 共 212 个分钟样本完成。固定地表点
屏幕 x=0.6 / 从底部 y=0.15 的 8-bit RGB：

| 时刻  | 修改前        | 修改后        |
| ----- | ------------- | ------------- |
| 04:30 | 0, 0, 0       | 18, 26, 29    |
| 05:00 | 0, 0, 0       | 18, 26, 29    |
| 06:00 | 90, 84, 75    | 90, 84, 75    |
| 12:00 | 194, 196, 172 | 194, 196, 172 |
| 19:00 | 28, 19, 23    | 28, 27, 30    |
| 19:40 | 0, 0, 0       | 18, 26, 29    |
| 22:00 | 18, 26, 29    | 18, 26, 29    |

晨昏地表最小 RGB 18/26/29，近处模型样本最小 18/1/1，均保持各自深夜值。
逐分钟相邻最大变化分别 3/255、5/255；天空为 21/255。Planar 固定平板大气在太阳
低于平面后无球面延长暮光，因此天空过渡较快，未把这一既有 transport 差异宣称为
已解决。方向 diffuse 仍为 Planar 的半球近似，空气距离仍为 1；本次没有移植 Globe
方向 atlas 或重建 Planar 多次散射资产。夜间 floor 是区域艺术补光，不是局部 GI。

夜间强度 0/1/2 对应地表 0/0/0、18/26/29、25/36/40；恢复 1 后回到原值。
场景 HDR=false、native auto exposure=false、SceneGIS auto exposure active=false；
render/console/WebGL errors=0，整个时段和 warm 强度变化保持环境资源 identity。
本机 Chrome 155、1185×667、正午无云雾，16 帧 GPU timer 中位数修改前 0.430 ms、
修改后 0.462 ms（约 +0.032 ms），样本区间重叠，不作跨设备性能保证。绘制命令均 4，
shader 数均 16，环境资源类别不变。

主平面示例已恢复正午，两个主示例恢复正常 render loop；生成的 Planar 对照页已打开，
附全天及原先最暗时段对照。修改前 captures 的旧 GUI 未 updateDisplay，但实际参数与
修改后相同，页面已注明；浏览器原始截图和采样记录仅在忽略的 Build 中保留。
Architecture/code gate 通过，RAD-13 technical fixed / owner visual pending；维护增量
仍未提交，RAD-03 Planar 最终观感由负责人验收。

## Planar ground feedback in multiple scattering (2026-10-17)

Review target: flat-slab generator v4 / regenerated PlanarEarth / actual GPU
consumers. Owner: current architecture / execution role. 用户明确保留平板大气，仅补齐
地面反射返回大气，HDR / 自动曝光关闭，不延长暮光或对齐球面颜色。

### RAD-14 — Missing reflected ground radiance in orders 2–4

Severity: medium; status: fixed / owner visual accepted (2026-10-17).
旧 generator 的入射辐亮度只有大气项；原 provenance 明确排除了地面反射。
新的独立第二阶回归在旧实现失败：应有红通道源项约 3.4909e-9，实测为零。

按 ADR-0042 amendment，第 n 阶入射加入
`T_to_ground * albedo / pi * E_ground[n-2]`。E0 为直射，E1 / E2 为单阶上半球
余弦积分，不把累计照度重注入每一阶。最终 scattering 不含最后一次可见地面反射，
runtime 原有边界项只计算一次。固定 albedo=0.1、太阳角、光谱单位、倍率及夜间 floor
均不变。三个纹理的布局/字节数不变，transmittance 完全不变；只重新生成 scattering、
irradiance 和 provenance，package verifier 同步 v4 manifest。

### Verification and visual evidence

- 14 项 Node generator tests 通过，含新增 Lambert / 透射第二阶参考、E1 / E2 阶次
  归属、黑地面、负太阳角零源项、最终地面反射排除，以及原有水平极限、独立密积分、
  deterministic full regeneration、篡改拒绝和原子发布回滚。完整重生成约 42 秒。
- 保留 12×8 角度规则；E1 与独立 48×32 积分在测试点约 5% 差异，按已有单次 Mie
  峰的有限采样边界记录，E2 检查为 2%。不宣称方向平均或四阶截断已是完整传输。
- 六项实际 GPU 回归最终通过：新照度参考、水平空气/不透明表面连续性、夜间环境光、
  资源复用/释放、完整介质合成。合成夹具此前遗漏 Planar transport module，并沿用
  旧 depth / 非 phased-ray 假设；已补齐模块、raw-depth 状态、零 jitter / 非 phased
  设置，并将旧有精度损失 mutation 改为 native vec4 重载，保留全部原有阈值和断言。
  这些是测试组装修正，未为测试改动任何 runtime Shader。
- 开发构建和复制后 PlanarEarth 的 canonical verifier 通过。无公共 API / 类型变化，
  不重复无关全量发布与类型检查。ESLint 通过；全 AgentDocs markdownlint 通过，
  全量 Prettier 仍为 451 个既有格式问题，当前改动文档单独格式化。
- 同一页面 05:30 / 12:00 / 19:00 / 19:40 使用匹配相机和显示配置对照；清晨及日落前
  改善温和，正午天空/侧面补光增强，19:40 仍基本黑天。没有改日落时间或颜色倍率。
  地面、太阳在天顶的固定 LUT 参考点，天空照度从约 6884 到 7908 lux（+14.9%），
  该数值不代表全画面亮度提高相同比例。
- 当前浏览器 commands=4、shaders=16 与修改前相同；LUT bytes 仍为
  131072 / 8388608 / 8192。运行时 Shader、uniform、lookup、pass 均未改变，
  不作整帧 GPU 提速声明。浏览器无 warning/error，主例恢复原视角、正午和 LDR。
- [对照页生成器](../../../Test/AdvancedEnvironment/tests/generate-planar-ground-review.mjs)
  只生成忽略的 Build 页面/截图；图片保留相机与参数面板，负责人已确认本轮视觉通过。

本轮无 upstream-owned 文件改动、无新增/扩展 SGP。当前维护工作区中此前已有的
GlobeSurfaceTileProvider.js / SGP-0009、Tonemapper.js 和 PostProcessStageCollection.js /
SGP-0060 保持原状。本增量未提交，平板暮光及既有高阶近似仍是明确的剩余边界。
Architecture/code technical gate 通过；负责人确认清晨、正午、黄昏及日落后对照通过，
RAD-14 visual gate 关闭。验收范围为本轮平面地面反射增量及上述固定配置；不据此扩大
其他 HDR、自动曝光或未复查场景的验收范围。HDR / 自动曝光继续关闭。

## Accepted appearance engine defaults (2026-10-17)

Review target: SceneGISEnvironmentEffects constructor/JSDoc, automatic Scene
ownership, two physical atmosphere examples. Owner: current architecture /
execution role; status: implemented / technical approved. 负责人明确授权提升已验收参数，
不是重新调整物理照明或推定其他历史视觉项已通过。

- 默认值：双世界 backgroundRadianceScale=2.5、surfaceRadianceScale=1.2；Globe
  aerialPerspectiveDistanceScale=0.5、Planar=1。aerial/cloud 相对亮度及夜间环境光仍为 1。
  默认 Scene 和显式构造共用同一入口，显式零值和单位值均优先。HDR 与自动曝光源码原本
  已默认关闭，无需修改 Scene 或曝光模块。两个示例移除重复倍率，直接继承引擎默认。
- ADR-0044 / ADR-0166、Architecture、DevelopmentGuide 和公共 JSDoc 同步新默认。
  这取代此前中性外观默认，不改变共同光度单位、LUT、传输方程、Shader 或资源数量。
- 18 项相关 Specs 通过：完整 14 项 SceneGISDefaultEnvironment（真实 Globe / Planar
  线性像素、默认/显式所有权、HDR/LDR、模型光源、生命周期、云和雾），以及构造契约、
  空气距离范围/warm 资源、距离成对传输及自动曝光默认关闭 4 项回归。所有阈值保持。
- 完整 dev build、build-ts、tsc 及定向 ESLint / Prettier 通过。类型生成仍输出已有 JSDoc
  警告，但成功生成公开默认值说明，tsc 通过。仅构造默认和文档调整，不重复发布打包、
  全天采样或热路径性能矩阵。
- AgentDocs 全量及本轮规范文档 markdownlint 通过，diff check 通过；全量 AgentDocs
  Prettier 仍为 451 个既有格式问题，本轮文档定向检查通过，未扩散格式修改。
- 刷新两个浏览器示例后，确认新默认值与 HDR=false、native auto exposure=false、
  SceneGIS auto exposure disabled；两页 ready 且无 warning/error。恢复球面原视角，
  平面视角及双方正午保持。截图仅保存在忽略的 Build 中。

本轮无 upstream-owned 文件修改，无新增/扩展 SGP；当前维护工作区此前已有的三个
上游文件及 SGP-0009 / SGP-0060 保持原状。默认值不覆盖应用已显式传入的倍率，
也不改变既有平板暮光、方向平均和四阶截断边界。当前改动未提交。

## Local checkpoint authorization (2026-10-17)

负责人要求提交本轮环境维护及已验收默认参数。Architecture/code gate 允许按当前
standalone 范围建立本地检查点；前文未提交状态仅为历史记录。Globe 全天及本轮 Planar
LDR / 清晨正午黄昏对照和默认值按已记录证据收口；不把尚未复查的 HDR 观感或其他
场景标记为通过。原生 collection 的 26 项既有失败、全量 AgentDocs 的 451 个既有
格式问题及物理近似边界继续保留，不通过删除 finding 消除历史问题。

本检查点所有 upstream-owned 改动为：GlobeSurfaceTileProvider.js（SGP-0009），
Tonemapper.js 与 PostProcessStageCollection.js（SGP-0060）。对应成对标记与清单一致；
PlanarEarth 二进制是 ADR-0042 允许的离线生成、自有受控资产，不包含 Build、Shader JS、
barrel、声明文件或浏览器截图。提交只建立本地检查点，不推送远程。

提交前补丁审计通过：本检查点 upstream-owned entries=3、generated status=0。
首次提交钩子发现昼夜对照页生成器遗漏 `node:process` 导入（ESLint no-undef）；已补齐
显式导入，输出逻辑不变，不绕过钩子。格式 / lint / 类型检查由再次提交钩子确认。
