# Standalone Plan: 光谱转换与统一场景辐亮度

- Plan type: `standalone`
- Status: `completed`（2026-10-17，负责人授权本地提交；验收边界见收口节）
- Owner role: architecture / execution, current task
- Architecture review: `confirmed`
- Created: `2026-10-16`; Updated: `2026-10-17`
- Related ADR: ADR-0042、ADR-0044、ADR-0161、ADR-0164、ADR-0165、ADR-0166、ADR-0167
- SGP: 光谱与 Planar 同步无新增；Globe 夜间 uniform SGP-0009；AgX 接入 SGP-0060
- Related review: [技术结果与视觉 gate](../reviews/2026-10-16-environment-radiance.md)

## 目标与源码事实

负责人要求先统一引擎地表与大气辐亮度，自动曝光保持默认关闭。
默认环境把 surfaceRadianceScale 从显式构造的 10 压到 1，背景却继续使用
Globe 4 / Planar 10；空气透视乘 backgroundRadianceScale * aerialRadianceScale。
这是几何受光与沿程散射不一致的默认标定，不是曝光未收敛。
现有 Shader 已共享物理 LUT，但其三波段光谱输出被直接当作 RGB 使用。
负责人进一步批准补齐原实现光谱转换；不替换传输方程或重生成 LUT。

## 实现边界

1. 两个世界、默认及显式实例均以 surfaceRadianceScale=backgroundRadianceScale=1
   作为中性 scene-linear 基准，aerial / cloud 相对倍率继续为 1。
2. 删除默认实例单独覆盖地表倍率的逻辑；保留调用方显式的独立艺术调节。
3. HDR/LDR 只选择最终显示变换，不改物理倍率。保留 gamma-only LDR 与现有 HDR
   tone mapping、手动曝光；不改自动曝光算法、默认状态、补偿或 SDK 预设。
4. 按 LUT 来源固定提交 `9c6dfd0054f077f3ad4695b802e74d4c6a814440` 的
   `packages/atmosphere/src/AtmosphereParameters.ts` 恢复两组系数：Sun
   `(98242.786222, 69954.398112, 66475.012354)`，Sky
   `(114974.916437, 71305.954816, 65310.548555)`；二者共同除以 Sun 系数的
   Rec.709 亮度 `dot(Sun, (0.2126, 0.7152, 0.0722))`。这是原实现的
   relative luminance 单位，非任意增亮或逐通道白平衡。写入 HDR 的是除以该基准的
   线性 sRGB 光度量，不是未经归一化的 lux / cd/m²。
5. 在 `SceneGISBrunetonAtmosphere.glsl` 的 SceneGIS 包装边界做一次转换：
   Globe 天空 / 空气透视及 Sun/Sky irradiance 包装、Planar 散射与 ground boundary。
   Planar LUT 含直射和散射，必须先在光谱域扣除直射，再分别使用 Sun / Sky 系数。
   地表、模型 / Tiles、矢量、云、物理天空反射共用该边界；height fog 的艺术源接到同一 RGB
   单位。LUT、无量纲透射率、光学厚度、密度不转换。
6. 月光、readable-night、调用方 DirectionalLight / model lightColor、emissive、注记颜色
   已是场景 RGB；不二次转换。CPU 主光 scale 的分母同步改为转换后的太阳照度，保持
   显式 RGB 主光和月光原有强度 / 颜色契约。自动太阳仍来自物理 LUT，不叠乘 native 兼容强度。
7. 不改 PASS、深度 / 样式隐藏、曝光或资源。Planar ground boundary 为拆分直射增加
   一次已有 transmittance LUT 读取，其余边界只增加常数运算。GLSL 由现有构建器生成 JS；
   不编辑生成文件。全部为 SceneGIS 自有文件，无新增 SGP。
8. 更新 ADR-0044、架构 / 开发说明，明确三波段近似、公共归一化单位及显示曝光边界。

当前相机和正午的浏览器诊断已复现共同倍率 4 在 LDR 正午使大片地表截白。
因此不以任意全局增亮倍率替代本次一致性修复；需要更亮的 HDR 画面由手动曝光负责。

## 验证与退出条件

- 双世界默认 / 显式一致，切换 HDR/LDR 后线性光照输入与资源不变，自动曝光仍关闭。
- GPU 数值验证转换系数 / 公共分母、Sun/Sky 分离、Planar ground、cloud / sky reflection
  与表面同域；CPU 自定义主光与月光保留 RGB。已有实际光照 / 云 / 夜景 / 端点测试作回归。
- 既有真实 GPU 默认环境测试覆盖地形 / 模型、天空 / 空气透视、云切换及生命周期。
- 定向环境标定、模型及矢量受光回归；完整 build、类型与改动文件静态检查。
- 当前矢量页面及 Planar 页面保留手动曝光，对照截图；不改用户原相机与时钟。
- 记录 review 和剩余视觉 gate；负责人确认前不把画面标记为通过。

## 当前结果

中午 HDR 诊断发现原默认值计划不足；负责人批准的原实现光谱转换现已补齐，见 RAD-04。
41 项相关 Specs 在定向运行及必要修复重跑后通过；实际中午 GPU 读回与转换系数吻合。
完整 build / build-ts / tsc 及改动文件检查通过。无新增资源或绘制，Planar ground boundary
增加一次已有 transmittance LUT 读取以分离 direct / sky；没有 upstream-owned 改动或新 SGP。
Globe 页面保留中午 / HDR / exposure=1 与原视角；Planar 页面完成检查后关闭。
技术 gate 通过，计划维持 active / visual-pending；等待负责人确认当前画面，尚未提交。

## 后续诊断：太阳强度与显示基准

负责人要求继续对照来源检查偏暗；本轮只诊断，不改变运行时代码或曝光默认值。
已实现部分的技术 gate 仍有效，不能据此宣称显示基准完成。RAD-05 / RAD-06 记录：

- 独立 `Test/AdvancedEnvironment/球面物理大气.js` 显式保留 background=4、surface=1，
  覆盖中性默认值，并把空气透视源项放大 4 倍。
- 来源固定提交的 MinimalSetup、Atmosphere-Basic、Atmosphere-Vanilla 均设曝光 10 / AgX；
  本地页面为曝光 1 / PBR_NEUTRAL，AgX 尚无现成选项。此 10 是示例的显示增益，不能当作
  太阳缺失倍率，也不能不加区分地写入引擎默认值或 LDR 路径。
- 当前公式与来源的相对光度单位、太阳透射和 Lambert 1/pi 一致。实际 LUT 折回光度量的
  水平总照度约 113,896 lux；日间 primaryLightScale=1 无异常衰减。
- 后续建议先同步示例中性倍率，再确定 HDR 手动曝光与 tone curve 的成对参考配置；
  若以原效果为目标，补齐 AgX 后用来源曝光 10 对照验收。自动曝光继续默认关闭。
  更改 tone mapper / 显示公共契约前需更新正式设计、测试和必要 SGP，当前未启动该实现。

## 已批准：中性示例与 AgX

负责人批准同步示例倍率为 1、补齐 AgX；若仍不合适则对照 UE 大气。按 ADR-0164 实现：

1. 在 Tonemapper 增加 AGX，collection switch 调用自有 stage factory；仅此两处上游文件，
   登记 SGP-0060。自有 GLSL 对齐来源 Three.js r179 算法与许可证。
2. 复用原生曝光、调色、输出 gamma、LDR 覆盖和 stage 生命周期，无新增绘制 / 附件；
   保持引擎 PBR Neutral / exposure=1 和自动曝光 disabled 默认。
3. 同步 AdvancedEnvironment 示例的旧 4/10 倍率；日间物理大气示例显式使用 AGX / 10，
   增加显示对照控件。当前矢量示例提供相同显示控制，保留样式 / 遮挡与自定义灯光。
4. 新增实际 GPU AgX 参考 / 曝光 / 调色 / LDR / 生命周期测试，运行相关原生测试与 build/types。
5. 在双世界实际画面确认显示对齐，记录成本与剩余视觉问题；有明确差异再查 UE，
   不以任意太阳常数或大气倍率调整掩盖问题。保持未提交直到负责人视觉验收。

### 本轮执行结果

已完成上述中性示例、AgX 与显示控件；详见同名 review 当前交付节。AgX / 调色 / 自动曝光
26 项专项通过，完整 dev / release / types 通过。原生 collection 14 成功 / 26 既有失败，
去掉 AgX 两个接点的对照逐项复现，候选源码已恢复。当前两个 upstream-owned 文件归属
SGP-0060；生成产物不入差异。

双世界画面与资源切换已检查；来源曝光 10 在本地材质 / 制图注记上仍偏浅，RAD-03 保持
visual-pending。已完成 UE 官方物理光照 / 曝光与公开大气实现的首轮对照，后续定位应匹配
光照条件并分开核对天空补光、地面反弹与注记显示域，尚未批准或实现大气算法替换。

## 已批准：地面反弹与注记曝光补偿

负责人要求继续修复背光面，并选择文字 / 图标抵消曝光增亮、仍保留 tone mapping。
按 ADR-0165 补齐共享漫反射来源的下半球地面返回，保留固定 Earth albedo=0.1、太阳
与天空原有能量及显式 IBL 所有权。矢量 symbol 在原混合位置补偿曝光，不迁移 PASS。
自动曝光保持默认关闭；显式启用时复用上一完成帧的增益，动态期间一帧比值变化见 ADR。

修改前已追踪 vectorSurfaceRadiance → sceneGISModelSkyIrradiance → Planar/Globe helpers，
native Model/Tiles 的 diffuse IBL 也消费同一来源。修复不能仅靠矢量建筑画面验收；增加
共享源 GPU 方向测试与模型 / Tiles 验证，保留已有注记样式顺序、外部遮挡、pick 回归。
构建继续由根 gulp 生成 shader modules，Specs 用 ChromeHeadless，不手改生成文件。
本次不引入 UE 全场景 GI、局部反射探针或新自动曝光默认，待实际画面与技术检查完成后更新 review。

### 地面反弹与注记执行结果

ADR-0165 实现及当前 Planar 视角检查完成，64 项模型 / Tiles / 矢量 / 注记专项通过。
图标不再随全局曝光冲白，背光面偏蓝减轻；自动曝光仍关闭，原相机与时钟已恢复。
相关模型、矢量、地形共用修复，显式 SH 保留；没有新增 PASS 或资源，仅增加斜面 LUT
采样及注记曝光运算。成本与近似边界见 review 的 ADR-0165 增量；RAD-03 仍待负责人视觉
确认，计划保持 active，scenegis/develop 工作区继续未提交。

### 当前 LDR 反馈与有限网格修正

负责人指出关闭 HDR 后仍暗淡、缺少对比度和饱和度，故不接受把曝光作为根因。
实测材质 #ded6ca 进入 G-buffer 的线性 RGB 正确；关闭 aerial / height fog 后近景仍暗。
但 Planar 天空分离存在已复现错误：64x16 总照度与 256x64 透射网格不对齐，直接相减
使天顶地面红色天空能量由应有约 0.03856 变成负值再截为 0，绿色也偏低。
在既有光照修复范围内按 ADR-0044 补充决策修正：先逐总照度 texel 扣除同一物理位置
的解析直射，再插值天空；不变更 LUT、太阳或曝光。新增真实资产 GPU 回归及采样成本检查。
LDR 的 gamma-only 显示基准另行诊断，不能承诺这个局部缺陷解释全部整体观感。

采样修正已实现：真实 LUT 1、转换 2、模型 / Tiles 4、矢量环境 8 项通过。当前原视角中
RGB sky 恢复为 (0.05855,0.09051,0.19022)，水平白面输出仍仅约 0.27。原始材质解码与
输出 gamma 未发现重复；当前显式主光强度 1 和 LDR 参考白契约仍是后续诊断对象。
恢复用户 HDR=false / exposure 控件 6.8、原灯光 / 相机 / 时钟，整体视觉 gate 继续 open。

### 已批准：示例使用默认物理太阳

负责人要求使用引擎物理光照。公开 Planar 示例移除显式白色 DirectionalLight，直接保留
默认环境的自动主光。此前物理大气一直启用，只有主光方向与照度被示例覆盖；并非关闭
整个物理环境。Planar 默认太阳为固定 +Z，并非依据示例经纬度和时钟的天文太阳。
重新加载源码后恢复原相机、时钟、LDR 与 exposure 控件 6.8，实测 primaryScale=(1,1,1)、
太阳及主光方向均为 +Z，大气 ready，自动曝光未创建。该状态替代上节保留自定义主光的状态。
本次只修改自有示例配置；复用此前 14 项默认环境所有权 / 自动恢复测试，整体视觉 gate 仍 open。

### 已批准：球面正午 LDR 优先验收

负责人要求先在球面物理大气页固定南京正午、关闭 HDR，球面验收后再处理平面。
GPU 读取冻结 Globe LUT 得到天顶太阳 / 海平面白 Lambert 面 Y=0.52315、18% 灰面 Y=0.09417。
当前 U=75717.3 来源于原实现的 half-float 存储归一化，没有建立 LDR 白参考。
按 ADR-0044 新增显示参考修订，将共享物理场景单位明确为 40000 cd/m²；此固定值对应
约 125664 lux 照明下的理想白面，使当前 Earth LUT 的参考灰 Y 接近 0.18。不是逐帧测光。

实施边界：只变更 Sun / Sky 共同换算分母及 CPU RGB 主光分母，保持光谱、LUT、散射比例、
Lambert 项、默认 surface/background=1、LDR clamp/gamma 和自动曝光关闭。单位在 HDR/LDR
及双世界保持一致；不为世界类型另设单位。平面 transport 修正与画面验收仍暂缓。
示例固定 2026-06-21T04:00:00Z / LDR，增加 HDR 状态控件，保留原相机及测试模型。

验证：新增真实 Globe LUT 白 / 灰参考 GPU 断言，旧单位下应失败；回归转换、默认环境、
模型 / Tiles、矢量光照及既有注记曝光行为。构建由 gulp 生成，资源 / 提交预算保持不变。
不改公共 API / upstream 文件，不提交，最终以负责人球面画面验收为准。

执行完成：82 项相关 Specs 全通过，开发构建、改动 JS 静态检查和补丁审计通过。当前
球面页面已加载新单位，原相机、正午、LDR、全部物理倍率 1、自动曝光关闭；前后 command
与 shader 数量相同，短样本无明显成本回归。技术状态及 HDR / LDR 边界见 review 末节。
球面 RAD-03 视觉 gate 仍 open；Planar transport 与视觉调整 deferred，工作区未提交。

负责人反馈有改善但仍暗 / 灰。2026-10-17 只读复核新增 RAD-11：当前太阳下，水平天空
积分与 irradiance LUT 约 0.73% 差异，朝南竖直面半球近似较方向积分低约 36%。参考点、
积分及主流引擎对照见 review 末节。下一候选为改善方向性 diffuse sky 与明确艺术调节
语义，尚未选定新 API / 默认倍率或启动对应实现。球面先于平面的范围不变。

### 已批准：球面方向性天空照度

负责人同意先改善算法。基于 RAD-11，用当前冻结 scattering LUT 对上半球天空进行余弦
积分，按高度、太阳高度、法线倾角及相对太阳方位建立方向照度表，代替非水平面半球近似。
不引入相机区域 SH，因此全球各接收点使用自身位置，不随相机转向或时间重建。

仅在 Globe 环境资源创建时计算一次。验证后的预算为 16 高度 × 65 太阳 × 17 法线倾角 ×
9 相对方位，32×32 角度积分；运行时四次双线性查询完成四维插值。把原始 64×16 照度
和方向照度放在同一个 649×272 RGBA16F atlas，不增加材质 sampler、资产下载或每帧 pass。
源数据仍为光谱值，原转换边界、太阳 / 地面返回、光照所有权及 Planar 路径不变。

实现路径为自有 Bruneton Common / Atmosphere、一个新预计算片元 shader 与 renderer
资源创建。首次生成完整后才发布，临时 FBO / program 和原始 irradiance texture 当场释放；
环境销毁释放 atlas。gulp 自动生成 shader JS，不能手改生成文件。

验证独立高采样积分的水平 / 倾斜 / 各方位竖直 / 向下响应、昼夜及高度边界；原失败点
必须改善，且旋转世界坐标不改变结果。测试资源冷创建、静态复用、销毁及 Planar 不变；
回归 Model / Tiles / 地形 / 矢量光照。当前球面原视角比较及冷启动 / 稳态成本决定是否满足
预算，不通过则调整表分辨率 / 积分而不以提高倍率掩盖误差。保持自动曝光关闭，不提交。

执行完成：初始 32 太阳样本在日落后 -6° 的插值误差约 49%，因此改为 65 个带零点、
覆盖 mu_s=[-0.5,1] 的样本，积分增加至 32×32；该点误差降至约 0.47%。正午参考侧墙
误差从约 36% 降至 3.08%。最终 atlas 为 649×272 RGBA16F，1412224 bytes；不增加
sampler 或每帧 pass。32 项相关回归最终通过，包括新增 12 点独立方向积分对照、坐标
旋转、资源复用 / 销毁。第一轮测试只因新生命周期夹具遗漏 host 参数失败，修正后通过，
产品实现没有为测试加入 fallback。现场 GPU 积分约 1.99 ms、首次编译及分配约 601 ms，
均为本机单次测量；不作为跨设备性能承诺。视觉 gate 仍 open，Planar transport 未推进。

### 球面正午 LDR 艺术倍率预览

负责人仍认为天空偏暗 / 灰，要求在球面正午且 HDR 关闭时评估天空、地表与空气倍率。
本轮只比较既有公开参数，不改变引擎中性默认或物理单位，也不把方向补光技术通过视为
整体视觉通过。保留当前相机，比较 B/G/A=(2.5/1/0.4)、(2.5/1.2/1)、(2.5/1.2/0.8)。
第一组保持 B*A=1，却在地平线造成明显明暗接缝；第三组仍能看到较轻接缝。
因此当前页面保留第二组作为艺术预览，未写入示例源码或 SDK 默认：天空 2.5、地表 1.2、
空气 1.0。天空与地面变亮，但远景灰感未宣称解决。后续若需去灰，应评估空气光学厚度 /
距离或气溶胶参数的独立控制，而非仅降低散射输出倍率；该实现尚未启动。

### 已批准：空气透视距离控制

负责人要求按上述建议调整空气透视。按 ADR-0166 为 Globe 增加默认 1 的
`aerialPerspectiveDistanceScale`，以同一缩放后的 Bruneton 路段计算散射 S 和透射 T。
原实际深度继续控制遮挡、云前后选择、拾取和 height fog；云体前方的空气也使用此距离。
真空入口不参与缩放。Planar 本次仅允许中性值，保持 transport 后续验证边界。
初步页面探针的 0.5 距离比降低 radiance 更能保留模型颜色，已释放临时 shader。

修改自有 controller / renderer uniform / atmosphere helper / aerial FS、Specs 和当前示例，
没有上游缝隙。新公共参数完整 build/types；GPU 验证 S/T 成对变化、单位恒等、零值、
真空入口、几何 / 云样本与深度规则，页面确认地平线和近远景。用户原相机及正午 LDR 保持；
天空 2.5 / 地表 1.2 / 空气亮度 1 的艺术预览继续，不改变引擎中性默认。视觉 gate 仍 open。

实现完成，新增公开参数及示例控件；22 项最小相关回归通过，包括 3 项新测试、14 项默认
环境、真实 linear/log depth 与远处不透明接收点连续性。两项历史边界测试的固定数值
没有随此前光谱 RGB 转换调整，已在断言中换回原光谱单位，保持原误差限，随后通过。
没有修改底层有限路段求解器来迎合测试；完整构建与现场视觉证据见 review 末节。

### 正午通过后的全时段检查

负责人接受球面正午画面，并明确蓝色区域是水面；该区域不再作为大气接缝问题。
按要求保持当前参数 / 视角 / LDR，检查 14 个时段及晨昏 212 个逐分钟样本，另临时对照
月光开关。未观察到渲染报错或硬切换；复现 RAD-12：约 04:30 / 19:40 暮光地表比深夜
更暗，根因为既有 readable-night ambient 到太阳低于 -6° 才渐入、-12° 达全强。
检查已完成，数值与画面边界见 review；后续夜景风格与过渡修订尚待明确，未改运行时。
当前球面正午视觉通过不等于全时段 / Planar 通过；Planar 保持 deferred，未提交。

## Globe night ambient follow-up (2026-10-17)

用户授权按天空照度衔接独立可配置夜间环境光，保持球面、LDR、自动曝光关闭。
执行 ADR-0167：新增 warm `nightAmbientIntensity`，默认 1、范围 [0,8]、0 关闭；
以已有物理天空照度对固定夜间 RGB 照度做 C1 smooth maximum，替换 Globe 旧太阳角
门控。地表、模型与矢量建筑保留材质/法线/AO，云和雾在原 ambient 入口衔接；
Planar 与 Moon 方向光规则不变。只扩展 SGP-0009 的一个 uniform，不新增 GPU 资源。

顺序：公共配置与 shader/consumer 接入；实际 GPU floor/边界/关闭/消费者回归和 warm
资源检查；完整构建/类型检查；同一视角全时段与晨昏逐分钟复查。以原 RAD-12 低谷
复现和深夜/正午保持为验收依据，记录结果后开放负责人视觉验收。

实施和 technical review 完成：42 项不同相关 Specs、完整 release/types/tsc/dev 构建、
补丁审计通过。当前相机 15 个时段与晨昏 212 个分钟样本不再出现低于深夜的地表低谷；
正午和深夜保持，原页面恢复正午、LDR、自动曝光关闭，已更新昼夜对照页。RAD-12
technical fixed / visual pending，Planar 仍 deferred，数值与资源边界见同一 review 末节。

## Planar lighting and night transition follow-up (2026-10-17)

负责人已验收 Globe 全时段（RAD-12 visual accepted），授权同步平面光照和昼夜过渡，
保持 HDR / 自动曝光关闭。Planar 已共用光谱 RGB 单位、下半球地面返回和材质接口；
实测同一 LDR 相机 04:30、05:00、19:40 地表为黑，而深夜为 RGB 18/26/29，
直接复现旧太阳角门控的低谷。本次将 ADR-0167 的照度 floor 扩展到 Planar surface、
Model / Tiles / vector、cloud / haze 与 fog ambient，保持 fixed +Z、真实 Planar LUT、
Moon 方向光及既有样式/遮挡。不移植 Globe 方向 atlas 或改变 Planar transport。

复用 frame-local lighting record 和 warm uniform，开放同一 nightAmbientIntensity
范围；不增加上游缝隙、纹理、pass。物理示例固定正午、LDR、天空 2.5 / 地表 1.2 / 空气 1，
增加时间和夜间环境光控件。空气距离仍为 Planar 的中性 1，镜面天空捕获保持独立。
更新真实 GPU 的 Planar ambient / day identity / warm / model-Tiles 回归，并执行公开 API
完整 build/types。最后复查全天及晨昏分钟样本、资源及成本，交付可复现的视觉对照。

Planar 实现与 technical review 完成：27 项不同相关 Specs、完整 release / types / tsc /
dev 构建和上游审计通过。15 时段与 212 个晨昏分钟样本的地表及模型不再低于各自深夜；
正午、深夜保持，资源 identity 不变。主例恢复正午、LDR、自动曝光关闭，对照页已生成。
平板大气天空较快变黑及半球 diffuse 近似保留；没有暗中移植球面 transport。RAD-13
technical fixed / owner visual pending；完整结果与性能边界见 review 最新节，尚未提交。

## Planar ground-to-atmosphere recurrence (2026-10-17)

负责人授权保留 flat-slab，只补齐地面反射参与多次散射；不延长暮光、不对齐球面颜色，
HDR / 自动曝光关闭。当前 generator 的 orders 2–4 仅积分大气入射，遗漏地面边界。

实现复用现有离线 source grid 和 binary16 资产布局。在第 n 阶源项中加入
`T_to_ground * albedo / pi * E_ground[n-2]`；E0 为地面直射，后续 En 为对应单阶大气
辐亮度的上半球余弦积分。不能把累计总照度反复注入每一阶。最终 scattering LUT 仍只
存大气散射，最后一次地面反射继续由 runtime 负责；固定 albedo=0.1 与太阳角规则不变。
原方向平均近似保留，不新增运行时 API、pass、纹理、Shader 或上游缝隙。

修改 generator、其 Node tests、ADR-0042 和由 generator 生成的 PlanarEarth 自有资产；
更新 deterministic manifest / provenance。先证明原算法缺失正能量，再验证黑地面退化、
各阶正确使用 E[n-2]、Lambert / 透射归一化、日落后零太阳能量及不重复添加可见地面。
复跑现有 transport / 再生成测试和真实资产 GPU 照度、Planar composition / 资源回归。
开发构建后在固定相机比较 05:30、12:00、19:00 / 19:40；显示倍率不变，恢复原页面。
技术结果和剩余近似回写同一 review，最终画面由负责人确认；本增量不提交。

实施与自审完成：14 项离线测试和 6 项实际 GPU 回归通过，完整 dev build、复制资产
验证及定向静态检查通过。新物理资产没有新增运行时开销；固定参考点的天空照度约
+14.9%，晨昏视觉变化较温和，日落后黑天保持。相机 / 正午 / LDR 已恢复，前后对照页
已生成。负责人随后确认本轮清晨、正午、黄昏及日落后对照通过，RAD-14 technical
fixed / visual accepted。本轮验收关闭；保留平板暮光、四阶和方向平均近似，尚未提交。

## Accepted appearance as engine defaults (2026-10-17)

负责人要求把验收预设提升为引擎默认：天空 2.5、地表 1.2、Globe 空气距离 0.5、
Planar 空气距离 1；HDR 和自动曝光默认关闭。后两项源码已满足，不额外修改 Scene。
修改统一的 SceneGISEnvironmentEffects 构造默认及 JSDoc，默认 Scene 实例与显式构造
共用；保留调用方显式值（包括零）和 warm setter。示例移除重复预设以直接验证默认。
以 ADR-0044 / ADR-0166 补充取代先前中性默认，不改变共同场景单位、LUT 或 transport。

验证复用双世界默认/显式所有权与 HDR/LDR 的真实线性像素回归、公开构造/范围/warm
测试和自动曝光默认关闭用例；完成完整构建、类型生成及检查。没有渲染热路径或资源布局
变化，不重复全天采样或性能测量。技术结果回写同一 review；当前增量不提交。

本增量实施与 technical gate 完成：18 项相关 Specs、完整 dev build、build-ts / tsc、
定向 ESLint / Prettier 通过。浏览器重新加载后，两页直接继承新默认值且 ready；HDR / 两套
自动曝光均关闭、无 warning/error，原视角与正午保持。没有上游文件或 SGP 变更。
已显式配置旧倍率的应用继续保留其配置，不会被新默认覆盖；既有 transport 近似不变。

## Local checkpoint closeout (2026-10-17)

负责人在默认参数完成后要求提交，授权本轮环境维护作为一个 standalone 检查点进入
`scenegis/develop`，不推送远程。完成范围包括光谱 RGB / 统一场景单位、AgX、共享地面
反弹、Globe 方向天空补光、注记曝光补偿、空气距离、双世界夜间环境光、Planar 地面
多次散射反馈和最终默认值。前述不提交状态由本次授权取代。

复用各增量已有的自动化、构建和视觉证据；最终默认值 18 项回归及 build / types / tsc
通过。提交前仅检查范围、文档、补丁和生成文件边界，不重复完整渲染矩阵。Globe / Planar
LDR 的已记录验收有效，未复查的 HDR 艺术效果不因此获得验收；既有原生测试失败及
平板暮光、方向平均、四阶截断边界保留在 review，无待执行的本轮实现任务。
