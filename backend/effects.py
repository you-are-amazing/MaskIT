import math
import os
import random
from functools import lru_cache

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

EMOJIS = ["😎", "😀", "🤖", "🐱", "🐶", "🎭", "⭐", "👽"]
FONTS = [
    "/usr/share/fonts/truetype/noto-color-emoji/NotoColorEmoji.ttf",
    "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf",
    "C:/Windows/Fonts/seguiemj.ttf",
    "/System/Library/Fonts/Apple Color Emoji.ttc",
]


def crop_box(size, bbox, pad=0.2):
    x1, y1, x2, y2 = bbox
    w, h = x2 - x1, y2 - y1
    W, H = size
    return (max(0, int(x1 - w * pad)), max(0, int(y1 - h * pad)), min(W, int(x2 + w * pad)), min(H, int(y2 + h * pad)))


def _paste(img, region, box, feather=True):
    if not feather:
        return img.paste(region, box[:2])
    m = Image.new("L", region.size, 0)
    ImageDraw.Draw(m).ellipse((0, 0, region.width - 1, region.height - 1), fill=255)
    img.paste(region, box[:2], m.filter(ImageFilter.GaussianBlur(max(1, min(region.size) // 25))))


def blur(img, box, k=0.85, feather=True):
    r = img.crop(box)
    _paste(img, r.filter(ImageFilter.GaussianBlur(max(10, int(r.width * 0.3 * k) + 4))), box, feather)


def pixelate(img, box, k=0.85, feather=True):
    r = img.crop(box)
    w, h = r.size
    n = max(3, int(24 - 20 * k))
    _paste(img, r.resize((n, max(1, int(n * h / w))), Image.BILINEAR).resize((w, h), Image.NEAREST), box, feather)


def blackout(img, box, k=1, feather=True):
    ImageDraw.Draw(img).rectangle(box, fill=(12, 14, 16))


def glitch(img, box, k=0.85, feather=True):
    rnd = random.Random(box[0] * 31 + box[1])  # stable per face, so slider tweaks do not reshuffle
    r = img.crop(box).filter(ImageFilter.GaussianBlur(max(8, img.crop(box).width // 5)))
    h, step = r.height, max(4, r.height // 14)
    for y in range(0, h, step):
        s = ImageChops.offset(r.crop((0, y, r.width, min(h, y + step))), rnd.randint(-int(r.width * 0.3 * k), int(r.width * 0.3 * k)), 0)
        r.paste(s, (0, y))
    _paste(img, r, box, feather)


def _heart(draw, cx, cy, s, color=(224, 49, 78)):
    pts = []
    for i in range(120):
        t = 2 * math.pi * i / 120
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((cx + x * s / 16, cy - y * s / 16))
    draw.polygon(pts, fill=color)


def hearts(img, box, k=0.85, feather=True):
    blur(img, box, k, feather)
    x1, y1, x2, y2 = box
    w, h = x2 - x1, y2 - y1
    d = ImageDraw.Draw(img)
    for fx, fy in [(0.3, 0.33), (0.68, 0.45), (0.45, 0.72)]:
        _heart(d, x1 + w * fx, y1 + h * fy, min(w, h) * 0.3)


@lru_cache(maxsize=None)
def _base_sprite(ch):
    for p in FONTS:
        if os.path.exists(p):
            try:
                t = Image.new("RGBA", (160, 160), (0, 0, 0, 0))
                ImageDraw.Draw(t).text((80, 80), ch, font=ImageFont.truetype(p, 109), anchor="mm", embedded_color=True)
                bb = t.getbbox()
                if bb:
                    return t.crop(bb)
            except Exception:
                continue
    return None


def emoji(img, box, k=0.85, feather=True):
    blur(img, box, k, feather)
    size = int(min(box[2] - box[0], box[3] - box[1]) * 0.9)
    base = _base_sprite(EMOJIS[((box[0] + box[2]) // 16 + (box[1] + box[3]) // 16) % len(EMOJIS)])
    sprite = base.resize((size, size), Image.LANCZOS) if base else None
    if sprite is None:
        return hearts(img, box, k, feather)
    cx, cy = (box[0] + box[2]) // 2, (box[1] + box[3]) // 2
    img.paste(sprite, (cx - size // 2, cy - size // 2), sprite)


APPLY = {"blur": blur, "pixelate": pixelate, "blackout": blackout, "glitch": glitch, "emoji": emoji, "hearts": hearts}