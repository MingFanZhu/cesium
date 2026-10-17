// Generate the local visual-review artifact from browser captures in Build/.
// Run from the repository root after capturing <mode>-daynight-after-*.png.
// Pass "planar" to generate the Planar review; Globe remains the default.
import { writeFile } from "node:fs/promises";
import process from "node:process";

const mode = process.argv[2] ?? "globe";
if (mode !== "globe" && mode !== "planar") {
  throw new Error("Expected globe or planar review mode.");
}
const label = mode === "globe" ? "球面" : "平面";
const before = mode === "globe" ? "globe-daynight" : "planar-daynight-before";
const distance = mode === "globe" ? "0.5" : "1";
const geometryNote =
  mode === "planar"
    ? "平面仍使用平板大气：太阳落到地平线以下后，天空比球面更快变黑；本轮未改变这一特征。修改前截图使用相同亮度参数，旧面板读数未刷新。"
    : "";
const views = [
  ["4", "04:00 凌晨"],
  ["4-5", "04:30 破晓"],
  ["5", "05:00 日出前"],
  ["6", "06:00 清晨"],
  ["12", "12:00 正午"],
  ["19", "19:00 日落前"],
  ["19-40", "19:40 黄昏"],
  ["22", "22:00 夜晚"],
];
function figure(path, caption) {
  return `<figure><a href="${path}"><img src="${path}" alt="${caption}"></a><figcaption>${caption}</figcaption></figure>`;
}
const current = views.map(([hour, label]) =>
  figure(`${mode}-daynight-after-${hour}.png`, label),
);
const comparison = views
  .filter(([hour]) => hour === "4-5" || hour === "19-40")
  .flatMap(([hour, label]) => [
    figure(`${before}-${hour}.png`, `${label} · 修改前`),
    figure(`${mode}-daynight-after-${hour}.png`, `${label} · 修改后`),
  ]);
await writeFile(
  `Build/${mode}-daynight-review.html`,
  `<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<title>${label}大气 · 昼夜检查</title>
<style>
*{box-sizing:border-box}body{margin:0;padding:20px;background:#101723;color:#e8edf5;font:14px/1.5 system-ui,sans-serif}
h1{margin:0 0 6px;font-size:24px}h2{font-size:18px;margin:22px 0 10px}p{color:#bac7d9;margin:6px 0 16px}
main{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}figure{min-width:0;margin:0;background:#1e293b;border-radius:6px;overflow:hidden}
img{display:block;width:100%}figcaption{padding:8px;font-size:13px}a{color:inherit}.note{padding:12px;background:#1b3031;border-left:3px solid #72bea4}
</style>
<h1>${label}大气 · 夜间环境光修复后</h1>
<p>2026-06-21，北京时间 · 原视角 · HDR / 自动曝光关闭 · 夜间环境光 1<br>
天空 2.5 / 地表 1.2 / 空气亮度 1 / 空气距离 ${distance} · 月光、云、高度雾关闭</p>
<main>${current.join("\n")}</main>
<p class="note">晨昏逐分钟样本：未再出现低于深夜的地表亮度低谷。保留正午和原深夜亮度。图片可点击放大；主示例新增北京时间与夜间环境光控件，最终观感待确认。</p>
${geometryNote ? `<p>${geometryNote}</p>` : ""}
<h2>原先最暗时段 · 修改前后</h2>
<main>${comparison.join("\n")}</main>
</html>`,
  "utf8",
);
