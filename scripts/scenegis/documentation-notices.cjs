"use strict";

// Product support notes are separate from translations of native source prose.
const environmentLink = "{@link SceneGISEnvironmentEffects}";
const notices = [
  {
    ids: [
      "SkyAtmosphere",
      "SkyAtmosphere#show",
      "Scene#skyAtmosphere",
      "SkyBox",
      "SkyBox#show",
      "Scene#skyBox",
      "Sun",
      "Sun#show",
      "Scene#sun",
      "Scene#sunBloom",
    ],
    text: `当前 SceneGIS WebGL 延迟渲染路径跳过原生天空大气、天空盒、太阳及太阳泛光的准备与绘制；这些对象的 show 和 Scene.sunBloom 不会恢复原生视觉效果。请使用 ${environmentLink} 配置物理天空、太阳、星空与泛光。关闭高级环境也不会恢复原生路径；绕过内部渲染门控强行启用旧路径不属于维护和验证范围。`,
  },
  {
    ids: ["Fog", "Fog#renderable", "Scene#fog"],
    text: `当前 SceneGIS WebGL 延迟渲染路径关闭原生可视雾，Fog.renderable 不会恢复它。Fog.enabled、density 等仍参与原生地形瓦片裁剪与 LOD 调度，不应据此认为整个 Fog API 已失效。可视雾请使用 ${environmentLink} 的 showHeightFog 及 heightFog 系列参数；关闭高级环境也不会恢复原生可视雾。绕过内部渲染门控的旧视觉路径不属于维护和验证范围。`,
  },
  {
    ids: ["Globe", "Globe#showGroundAtmosphere", "Globe#enableLighting"],
    text: `当前 SceneGIS WebGL 延迟渲染路径跳过 Globe.showGroundAtmosphere 的原生地表大气及 Globe.enableLighting 的原生昼夜着色分支，相关原生调色参数不控制高级环境。地表、模型与云的物理受光请使用 ${environmentLink} 和 Scene.light；几何阴影继续由 Viewer.shadows、Scene.shadowMap 等公开接口控制。球面 Moon 与星历基础设施仍保留。关闭高级环境不会恢复上述原生视觉分支，绕过内部渲染门控的旧路径不属于维护和验证范围。`,
  },
];

const byId = new Map(
  notices.flatMap(({ ids, text }) => ids.map((id) => [id, text])),
);

module.exports = function appendDocumentationNotices(doclets) {
  for (const doclet of doclets) {
    const text = byId.get(doclet.longname);
    if (text) {
      doclet.description += `\n<p class="scenegis-api-note"><strong>SceneGIS 渲染限制：</strong>${text}</p>`;
    }
  }
};
