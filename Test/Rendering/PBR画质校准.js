/* global document, fetch, Image */
const root = "./pbr-data/local/calibration/";
const labels = {
  "runtime-controlled": "SceneGIS · 受控光照",
  "cycles-full": "Cycles · 多次反弹",
  "cycles-direct": "Cycles · 零反弹",
  "runtime-original": "SceneGIS · 原始设置",
  "runtime-effects": "SceneGIS · AO + SSR",
  "runtime-noaa": "SceneGIS · 无 AA",
  "material-basecolor": "材质 · 基础色",
  "material-roughness": "材质 · 粗糙度",
  "material-metalness": "材质 · 金属度",
  "material-normal": "材质 · 世界法线",
  "material-occlusion": "材质 · 贴图 AO",
};
const pairs = {
  reference: [
    "runtime-controlled",
    "cycles-full",
    "先看拱门内、窗框与背光立面的层次；再看明亮石墙和铺装的材质响应。",
  ],
  transport: [
    "cycles-direct",
    "cycles-full",
    "只改变 Cycles 反弹次数，观察拱门中的暖色回光、右侧立面及路面的间接光。",
  ],
  effects: [
    "runtime-controlled",
    "runtime-effects",
    "保持 4×MSAA、相机、光照与雾设置一致，观察 AO 和 SSR 的共同贡献。",
  ],
  aa: [
    "runtime-noaa",
    "runtime-controlled",
    "无 AA / 4×MSAA：用原始像素模式检查细杆、栏杆与斜边。此静态图不能评估运动中的 TAA。",
  ],
};
const byId = (id) => document.getElementById(id);
const selects = [byId("select-left"), byId("select-right")];
for (const select of selects) {
  for (const [value, label] of Object.entries(labels)) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.append(option);
  }
  select.addEventListener("change", () => {
    byId("description").textContent =
      "自选图像对照；请结合下方说明区分材质输入与光照结果。";
    update();
  });
}
let revision = 0;
async function update() {
  const current = ++revision;
  const values = selects.map((select) => select.value);
  try {
    const images = await Promise.all(
      values.map(async (name) => {
        const img = new Image();
        img.src = `${root}${name}.png`;
        await img.decode();
        return img;
      }),
    );
    if (current !== revision) {
      return;
    }
    if (
      images[0].naturalWidth !== images[1].naturalWidth ||
      images[0].naturalHeight !== images[1].naturalHeight
    ) {
      throw new Error("左右图尺寸不一致，请从同一份配置重新生成。");
    }
    ["left", "right"].forEach((side, i) => {
      byId(side).src = images[i].src;
      byId(`${side}-caption`).textContent = labels[values[i]];
    });
    byId("comparison").style.setProperty(
      "--width",
      `${images[0].naturalWidth}px`,
    );
    byId("comparison").hidden = false;
    byId("error").textContent = "";
  } catch (error) {
    if (current !== revision) {
      return;
    }
    byId("comparison").hidden = true;
    byId("error").textContent =
      `对照图未就绪：${error.message} 请按下方复现步骤生成本机资源。`;
  }
}
function pair(name) {
  const [left, right, description] = pairs[name];
  selects[0].value = left;
  selects[1].value = right;
  byId("description").textContent = description;
  update();
}
document.querySelectorAll("[data-pair]").forEach((button) => {
  button.addEventListener("click", () => pair(button.dataset.pair));
});
byId("split").addEventListener("input", (event) => {
  byId("comparison").style.setProperty("--split", `${event.target.value}%`);
});
byId("native").addEventListener("change", (event) => {
  byId("comparison").classList.toggle("native", event.target.checked);
});
try {
  const response = await fetch(`${root}reference-report.json`);
  if (!response.ok) {
    throw new Error(`参考记录读取失败 (${response.status})`);
  }
  const report = await response.json();
  const [width, height] = report.snapshot.resolution;
  byId("status").textContent =
    `${width} × ${height} · Blender ${report.blender} / Cycles ${report.samples} 采样 · ${report.materials} 个材质 · 曝光 ${report.output.exposure} / gamma ${report.output.gamma}`;
  pair("reference");
} catch (error) {
  byId("status").textContent = "尚未生成本机参考。";
  byId("error").textContent = `${error.message}。请按下方复现步骤准备资源。`;
}
