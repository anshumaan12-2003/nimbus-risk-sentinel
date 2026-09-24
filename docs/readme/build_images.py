"""After `npm run docs:screenshots`: shrink the PNGs and build live-scan.gif from the scan frames (needs Pillow).

    python3 docs/readme/build_images.py
"""
from pathlib import Path

from PIL import Image, ImageChops

HERE = Path(__file__).parent
FRAME_MS, HOLD_LAST_MS, WIDTH = 250, 3000, 1200

paths = sorted((HERE / ".frames").glob("scan-*.png"))
if not paths:
    raise SystemExit("No frames: run `npm run docs:screenshots` in frontend/ first.")

frames, durations = [], []
for p in paths:
    img = Image.open(p).convert("RGB")
    img = img.resize((WIDTH, round(img.height * WIDTH / img.width)), Image.LANCZOS)
    if frames and not ImageChops.difference(img, frames[-1]).getbbox():
        durations[-1] += FRAME_MS          # identical to the previous frame: show it longer instead
        continue
    frames.append(img)
    durations.append(FRAME_MS)
durations[-1] = HOLD_LAST_MS

# One palette for every frame, taken from the finished (most colourful) frame, so colours don't flicker
palette = frames[-1].quantize(colors=255, method=Image.MEDIANCUT)
out = [f.quantize(palette=palette, dither=Image.NONE) for f in frames]
out[0].save(HERE / "live-scan.gif", save_all=True, append_images=out[1:], duration=durations, loop=0, optimize=True)
print(f"live-scan.gif: {len(out)} frames, {(HERE / 'live-scan.gif').stat().st_size // 1024} KB")

# Screenshots: 256-colour palette. UI shots have few colours, so this is visually lossless at ~1/3 the size.
for png in sorted(HERE.glob("*.png")):
    before = png.stat().st_size
    img = Image.open(png)
    if img.mode == "P":
        continue                            # already done
    img.convert("RGB").quantize(colors=256, method=Image.MEDIANCUT, dither=Image.NONE).save(png, optimize=True)
    print(f"{png.name}: {before // 1024} KB -> {png.stat().st_size // 1024} KB")
