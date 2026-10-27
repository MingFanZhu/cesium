# 原创素材生成记录

2026-10-27，使用内置 imagegen 工具；按用户允许自制素材的要求生成。以下图片不是参考视频的截图或贴图提取。原始输出保存在 `source-art/`；加工脚本只缩小和推导近似 PBR 通道，不把这些通道称为实测材质。

## limestone.png

```text
Use case: stylized-concept
Asset type: seamless square architectural facade base-color texture for a real-time PBR city engine, 1024 x 1024.
Primary request: original New York limestone office building facade, restrained architectural visualization style, elegant cream and warm pale beige limestone with charcoal blue gray recessed rectangular windows. Exactly FOUR evenly spaced columns and FOUR evenly spaced floor rows of identical window openings. Each cell has one tall double-pane rectangular window occupying about 48% of cell width and 62% of cell height, narrow dark metal mullion, subtle stone jamb, broad masonry piers between windows. Narrow horizontal stone sill band just beneath each row; small natural variation in glass tone and stone blocks, some subtle closed blinds. Strong readable geometry and refined tactile stone grain. Material colors rather than painted illumination.
Composition: perfectly flat orthographic front elevation, entire square filled by repeating facade, windows centered in an exact 4 by 4 grid; left/right and top/bottom edges tile seamlessly, each edge halfway between neighboring window cells. No building outline, no cornice, no ground floor, no roof, no perspective.
Lighting: unlit diffuse albedo texture, uniform neutral exposure; no directional cast shadows, no ambient occlusion baked around windows, no bright reflections or sky/cloud imagery.
Constraints: opaque image, no text, no labels, no logos, no borders, no people, no plants. Not a city scene or render, just a physically repeatable texture.
```

## brick.png

```text
Use case: stylized-concept
Asset type: seamless square building facade albedo texture for a real-time PBR city, 1024 x 1024.
Primary request: original warm terracotta red-brown brick New York apartment facade, restrained stylized architectural visualization. Exactly FOUR equal window columns by FOUR equal floor rows, regular 4 by 4 cell grid. Each cell has one narrow upright double-hung window, dark slate blue glass and dark charcoal frame, thin warm gray stone sill and lintel, glass opening about 42% of cell width and 60% of cell height. A slim horizontal center sash divides each window into two panes. Broad brick piers, fine brick courses with pale gray mortar, modest organic color variation. Mostly unlit muted blue-gray windows, a few neutral subdued cream closed blinds; no illuminated yellow windows. Brick should read as muted russet and brown, not saturated orange.
Composition: flat front orthographic texture only, no perspective, no facade outline, entire image filled. Repeating tile edges match with uninterrupted brick; grid centered so all edges are halfway between window cells, seamless both directions. No roof, no ground floor, no cornice.
Lighting: uniform neutral diffuse base color, no directional shadows, no baked sky highlights, no strong ambient occlusion.
Constraints: no text, no logos, no people, no plants, no balconies, no fire escapes, no border. Opaque. Not a picture of a building, only a repeatable unlit texture.
```

## roof-flat.png

```text
Use case: stylized-concept
Asset type: seamless square PBR base-color texture of a flat city roof, 1024 x 1024.
Primary request: original muted medium gray commercial rooftop surface, flat overhead orthographic material map, refined stylized architectural visualization. A 16 meter by 16 meter repeating patch of gray bitumen membrane with rectangular panels and fine subtle seams, a few small low-profile rectangular metal ventilation grilles, a pair of small silver air conditioning fan panels near one corner, and subtle patches of gravel and wear. Mostly quiet unobstructed gray roof surface, technical details occupy less than 12 percent of total area. Metal mechanical details are flat overhead shapes with concentric circular fan grilles. Seamless repeat in both axes; edges only plain continuous roof membrane.
Lighting: unlit neutral diffuse albedo, no cast shadows, no directional light, no bright specular highlights.
Constraints: no building perimeter or parapet, no perspective, no sky, no text, no logos, no grass, no vehicles, no people. Opaque material map only, not a rendered scene.
```
