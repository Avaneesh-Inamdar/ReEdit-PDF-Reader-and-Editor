"""Rasterize the repository's deliberately simple geometric mark for Windows icons."""
from pathlib import Path
from PIL import Image, ImageDraw
import shutil

root = Path(__file__).resolve().parents[1]
scale = 16
image = Image.new('RGBA', (64*scale, 64*scale))
draw = ImageDraw.Draw(image)
navy, paper, ink = '#253b48', '#faf5e8', '#df794d'
def points(values):
    return [(int(x*scale), int(y*scale)) for x, y in values]
def stroke(values, color=paper, width=3.5):
    draw.line(points(values), fill=color, width=round(width*scale), joint='curve')

draw.rounded_rectangle((2*scale, 2*scale, 62*scale, 62*scale), radius=13*scale, fill=navy)
stroke([(19, 14), (39, 14), (47, 22), (47, 33)])
stroke([(47, 45), (47, 51), (19, 51), (19, 14)])
stroke([(38, 14), (38, 23), (47, 23)])
stroke([(26, 30), (38, 30)])
stroke([(26, 37), (33, 37)])
draw.polygon(points([(35, 48), (38, 39), (50, 27), (56, 33), (44, 45)]), fill=ink)
stroke([(47, 30), (53, 36)], navy, 2)
stroke([(38, 39), (44, 45)], navy, 2)
icon = image.resize((256, 256), Image.Resampling.LANCZOS)
icon.save(root/'build/icon.ico', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
image.resize((512, 512), Image.Resampling.LANCZOS).save(root/'build/icon.png')
public = root/'src/renderer/public'
for name in ['icon.ico', 'icon.png', 'brand.svg']:
    shutil.copy2(root/'build'/name, public/name)
shutil.copy2(root/'build/icon.ico', public/'favicon.ico')
