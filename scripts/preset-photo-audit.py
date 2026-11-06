"""Generate a transparent inventory of local template photography."""
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]
base = (root / "src/data/presets.ts").read_text(encoding="utf-8")
extra = (root / "src/data/presets-extra.ts").read_text(encoding="utf-8")
photos = (root / "src/data/presetImages.ts").read_text(encoding="utf-8")
names = re.findall(r"id: '([^']+)',\s*name: '([^']+)'", base)
names += [("preset-" + id_, name) for id_, name in re.findall(r"^ \['([^']+)','([^']+)'", extra, re.M)]
image_map = {}
for key, body in re.findall(r'"(preset-[^"]+)":\s*\{(.*?)\}', photos, re.S):
    fields = dict(re.findall(r'"(src|source|author|license|licenseUrl)":\s*"([^"]+)"', body))
    image_map[key] = fields
lines = ["# V3 模板图片核查清单", "", f"共 {len(names)} 个模板。已核实并使用独立摄影照片 {len(image_map)} 个；其余显示本地占位图，待逐一搜索、核实和下载。", "", "| 活动名称 | 图片来源 | 图片链接 | 摄影师 | 授权情况 | 本地资源路径 |", "| --- | --- | --- | --- | --- | --- |"]
for key, name in names:
    image = image_map.get(key)
    if image:
        lines.append(f"| {name} | Pexels | {image.get('source','')} | {image.get('author','')} | [Pexels License]({image.get('licenseUrl','')}) | {image.get('src','')} |")
    else:
        lines.append(f"| {name} | 待补充 | — | — | 待核实 | /images/activity-templates/fallback.svg |")
(root / "public/images/activity-templates/V3_PHOTO_AUDIT.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
