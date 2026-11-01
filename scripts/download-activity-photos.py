import concurrent.futures, json, sys, urllib.request
from pathlib import Path
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'.image-tools.local'))
from PIL import Image,ImageOps,ImageDraw
items=json.loads((root/'scripts/activity-photo-sources.json').read_text(encoding='utf-8'))
originals=root/'.photo-originals.local';originals.mkdir(exist_ok=True)
out=root/'public/images/activity-templates';out.mkdir(parents=True,exist_ok=True)
def run(item):
 try: return download(item)
 except Exception as error: return (item['activity'],'FAILED',str(error))
def download(item):
 target=originals/item['original']
 if not target.exists():
  request=urllib.request.Request(item['download'],headers={'User-Agent':'Mozilla/5.0'})
  with urllib.request.urlopen(request,timeout=40) as response: target.write_bytes(response.read())
 with Image.open(target) as image:
  image=ImageOps.exif_transpose(image).convert('RGB')
  fitted=ImageOps.fit(image,(960,540),method=Image.Resampling.LANCZOS,centering=(0.5,0.5))
  file=root/('public'+item['src']);fitted.save(file,'WEBP',quality=83,method=6)
  return item['activity'],image.size,file.stat().st_size
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 for item,result in zip(items,pool.map(lambda item: run(item),items)): print(result)
