#!/usr/bin/env python3
"""Generate deterministic, clearly labelled local placeholder art for bundled template packs."""
import json
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
PACKS = ROOT / "wordpress/plugin/templates/packs"

def color(value):
    value = value.lstrip("#")
    return tuple(int(value[i:i+2], 16) for i in (0, 2, 4))

def main():
    for pack in sorted(PACKS.iterdir()):
        data = json.loads((pack / "template.json").read_text())
        palette = data["designTokens"]["colors"]["light"]
        bg, primary, accent, surface = map(color, (palette["background"], palette["primary"], palette["accent"], palette["surface"]))
        title = data["template"]["name"]
        mark = title[:1].upper()
        logo = f'''<svg xmlns="http://www.w3.org/2000/svg" width="420" height="96" viewBox="0 0 420 96" role="img" aria-label="{title} mock logo"><rect x="4" y="12" width="68" height="68" rx="18" fill="{palette['primary']}"/><path d="M22 57 38 30l16 27H22Z" fill="{palette['accent']}"/><text x="92" y="61" font-family="Arial,sans-serif" font-size="38" font-weight="700" fill="{palette['text']}">{title}</text><text x="94" y="82" font-family="Arial,sans-serif" font-size="10" letter-spacing="3" fill="{palette['muted']}">PLACEHOLDER MOCK</text></svg>'''
        (pack / "assets" / f"{pack.name}" / "logo.svg").write_text(logo)
        assets = data["assets"]
        for index, name in enumerate(k for k in assets if k not in ("logo", "preview")):
            image = Image.new("RGB", (1280, 800), bg)
            draw = ImageDraw.Draw(image, "RGBA")
            # A deterministic architectural/geometric arrangement; no photographic material.
            draw.rounded_rectangle((70, 72, 1210, 730), radius=36, fill=surface)
            draw.polygon([(90, 650), (420 + index*26, 170), (760, 650)], fill=(*primary, 235))
            draw.polygon([(530, 650), (840, 230 + index*18), (1180, 650)], fill=(*accent, 205))
            draw.rectangle((180 + index*36, 390, 410 + index*36, 650), fill=(*bg, 230))
            draw.ellipse((890 - index*24, 115, 1100 - index*24, 325), fill=(*primary, 100))
            draw.line((105, 680, 1160, 680), fill=(*primary, 90), width=3)
            watermark = Image.new("RGBA", image.size, (0, 0, 0, 0))
            wd = ImageDraw.Draw(watermark)
            font = ImageFont.load_default(size=76)
            wd.text((830, 690), "MOCK", font=font, fill=(255,255,255,145), stroke_width=2, stroke_fill=(20,20,20,45))
            image = Image.alpha_composite(image.convert("RGBA"), watermark).convert("RGB")
            path = pack / assets[name]["source"]["path"]
            path.parent.mkdir(parents=True, exist_ok=True)
            image.save(path, "WEBP", quality=72, method=6)
            if path.stat().st_size > 200_000:
                image.save(path, "WEBP", quality=55, method=6)
        print(pack.name, "assets generated")

if __name__ == "__main__":
    main()
