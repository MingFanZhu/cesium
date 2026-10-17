// Generate the review page after capturing the fixed Planar views in Build/.
import { writeFile } from "node:fs/promises";

const views = [
  ["0530", "05:30 清晨 · 朝东北"],
  ["1200", "12:00 正午 · 朝北"],
  ["1900", "19:00 日落前 · 朝西北"],
  ["1940", "19:40 黄昏 · 朝西北"],
];
const rows = views.map(
  ([id, label]) =>
    `<section><h2>${label}</h2><div class="pair">${["before", "after"]
      .map((state) => {
        const file = `planar-ground-${state}-${id}.png`;
        const title = state === "before" ? "修改前" : "补齐地面反射后";
        return `<figure><figcaption>${title}</figcaption><a href="${file}"><img src="${file}" alt="${label} · ${title}"></a></figure>`;
      })
      .join("")}</div></section>`,
);

await writeFile(
  "Build/planar-ground-review.html",
  `<!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><title>平板大气 · 地面反射对比</title>
<style>
*{box-sizing:border-box}body{margin:0;padding:18px;background:#101723;color:#e8edf5;font:14px/1.5 system-ui,sans-serif}
main{max-width:1120px;margin:auto}h1{font-size:24px;margin:0 0 8px}h2{font-size:17px;margin:16px 0 7px}
p{color:#bac7d9;margin:6px 0}.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}
figure{margin:0;background:#202b3c;overflow:hidden;border-radius:6px}figcaption{padding:7px 12px}
img{display:block;width:100%}a{color:inherit}
</style><main><h1>平板大气 · 地面反射参与多次散射</h1>
<p>2026-06-21 · 南京天文参考 · 高度 600 m / 俯角 5° · 每组相机与参数一致<br>
HDR / 自动曝光关闭 · 天空 2.5 / 地表 1.2 / 空气 1 · 地面反照率 0.1</p>
<p>仅补齐地面返回大气的能量；保留平板模型、四阶截断和既有方向平均近似。不延长暮光，不调整颜色倍率。点击图片查看原图。</p>
${rows.join("\n")}
</main></html>`,
  "utf8",
);
