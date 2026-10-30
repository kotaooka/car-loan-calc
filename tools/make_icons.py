# アプリアイコンを作る（方眼の上に、回ごとに低くなる残高の棒と、車の横顔）。python tools/make_icons.py（Pillow が必要）
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / 'icons'
BG, GRID, WHITE, BAR, ACC = (29, 92, 150), (50, 112, 168), (255, 255, 255), (170, 205, 240), (240, 160, 122)

def draw(size, maskable=False):
    s = 4 * size  # 4 倍で描いて縮小（縁を滑らかにする）
    im = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if maskable:
        d.rectangle([0, 0, s, s], fill=BG)
        k = 0.72  # 円形に切り抜かれても収まる大きさ
    else:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=s * 0.2, fill=BG)
        k = 1.0
    step = s / 8
    for i in range(1, 8):
        d.line([i * step, 0, i * step, s], fill=GRID, width=max(1, s // 256))
        d.line([0, i * step, s, i * step], fill=GRID, width=max(1, s // 256))
    if not maskable:
        mask = Image.new('L', (s, s), 0); ImageDraw.Draw(mask).rounded_rectangle([0, 0, s - 1, s - 1], radius=s * 0.2, fill=255)
        im.putalpha(mask)
        d = ImageDraw.Draw(im)
    c = s / 2
    # 残高の棒（左から右へ低くなる）
    base = c + s * 0.22 * k
    left, width = c - s * 0.32 * k, s * 0.64 * k
    nb = 6
    bw = width / nb
    for i in range(nb):
        h = s * 0.50 * k * (1 - i / nb * 0.8)
        d.rectangle([left + i * bw + bw * 0.12, base - h, left + (i + 1) * bw - bw * 0.12, base], fill=BAR)
    # 車の横顔（下側）
    cy = base - s * 0.02 * k
    body = [left + s * 0.02 * k, cy - s * 0.12 * k, left + width - s * 0.02 * k, cy]
    d.rounded_rectangle(body, radius=s * 0.04 * k, fill=WHITE)
    roof = [(left + s * 0.14 * k, cy - s * 0.12 * k), (left + s * 0.22 * k, cy - s * 0.21 * k), (left + s * 0.44 * k, cy - s * 0.21 * k), (left + s * 0.53 * k, cy - s * 0.12 * k)]
    d.polygon(roof, fill=WHITE)
    rw = s * 0.055 * k
    for x in (left + s * 0.15 * k, left + width - s * 0.15 * k):
        d.ellipse([x - rw, cy - rw * 0.4, x + rw, cy + rw * 1.6], fill=ACC)
    return im.resize((size, size), Image.LANCZOS)

OUT.mkdir(exist_ok=True)
draw(512).save(OUT / 'icon-512.png')
draw(192).save(OUT / 'icon-192.png')
draw(512, maskable=True).save(OUT / 'icon-maskable-512.png')
im = draw(180)
bg = Image.new('RGBA', im.size, BG + (255,)); bg.alpha_composite(im); bg.convert('RGB').save(OUT / 'apple-touch-icon.png')
