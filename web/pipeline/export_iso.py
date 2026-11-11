"""Oblique 3D views of the story scenes (-> web/public/data/scenes/{id}/iso_*.webp, git-ignored).

    uv run python web/pipeline/export_iso.py

Each scene is a 256 m square with a graded aerial photograph (0.25 m) and the LiDAR height above ground (0.5 m).
The square is turned 45 degrees and drawn from above at an angle: every pixel is lifted by its measured height, roofs
keep the colour of the photograph, walls are a darker tone of it. Buildings LiDAR measured as new between 2018 and 2025
can be tinted in the site's orange. Only the assets already exported for the scenes are needed.

  iso_{year}.webp        the block in that LiDAR year (2018, 2022, 2025)
  iso_{year}_new.webp    the same with the new buildings tinted
  iso_{year}_clay.webp   height only, without the photograph (what LiDAR sees)
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
SC = ROOT / "web/public/data/scenes"
PAPER, ORANGE, INK = np.array([241, 238, 232], float), np.array([255, 90, 31], float), np.array([27, 42, 58], float)
CY, KZ, OUT_PX = 0.66, 4.3, 1280          # ground foreshortening, screen pixels per metre of height, output size


def render(photo, h, tint):
    """photo (n, n, 3) float, h (n, n) metres, tint (n, n) bool -> RGB image of the turned, tilted block."""
    rot = lambda a, order: ndimage.rotate(a, 45, reshape=True, order=order, mode="constant", cval=np.nan if a.dtype == float else 0)
    hr = rot(h, 1)
    inside = ~np.isnan(hr)
    hr = np.where(inside, hr, 0)
    pr = np.stack([rot(photo[..., k], 1) for k in range(3)], -1)
    pr = np.where(inside[..., None], pr, 0)
    tr = rot(tint.astype(float), 0) > 0.5
    n = hr.shape[0]
    col = np.where(tr[..., None], 0.38 * pr + 0.62 * ORANGE, pr)
    # which way a wall faces: the roof continues to the right -> the wall faces left (lit), else right (shade)
    gx = ndimage.sobel(ndimage.gaussian_filter(hr, 1.5), axis=1)
    shade = np.where(gx > 0, 0.72, 0.52)
    top_pad = int(26 * KZ) + 20
    H = int(n * CY) + top_pad + 30
    out = np.tile(PAPER, (H, n, 1))
    xs = np.arange(n)
    span = int(26 * KZ) + 2
    for r in range(n):                                   # back to front
        ok = inside[r]
        if not ok.any():
            continue
        yb = int(round(r * CY)) + top_pad
        yt = np.round(r * CY - hr[r] * KZ).astype(int) + top_pad
        wall = col[r] * shade[r][:, None]
        tall = ok & (hr[r] > 1.5)
        for k in range(1, span):                         # walls, from just under the roof down to the ground
            yy = yt + k
            m = tall & (yy <= yb)
            if not m.any():
                break
            out[yy[m], xs[m]] = wall[m]
        out[yt[ok], xs[ok]] = col[r][ok]                  # the roof (or the ground) on top
    img = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))
    side = max(img.size)
    sq = Image.new("RGB", (side, side), tuple(PAPER.astype(int)))
    sq.paste(img, ((side - img.width) // 2, (side - img.height) // 2))
    return sq.resize((OUT_PX, OUT_PX), Image.LANCZOS)


def main():
    for sid in ("s1", "s2", "s3"):
        d = SC / sid
        scene = json.loads((d / "scene.json").read_text())
        mask = Image.new("L", (1024, 1024), 0)
        dr = ImageDraw.Draw(mask)
        for u in scene["units"]:
            if u["lidar_new"]["2018_2022"] or u["lidar_new"]["2022_2025"]:
                for ring in u["rings"]:
                    dr.polygon([tuple(p) for p in ring], fill=255)
        new = np.asarray(mask) > 0
        for year in (2018, 2022, 2025):
            photo = np.asarray(Image.open(d / f"photo_{year}.webp").convert("RGB"), float)
            h = np.asarray(Image.open(d / f"height_{year}.png").resize((1024, 1024), Image.BILINEAR), float) / 10
            h = ndimage.median_filter(h, 9)
            render(photo, h, np.zeros_like(new)).save(d / f"iso_{year}.webp", quality=84, method=6)
            # the same block as LiDAR alone sees it: no photograph, only height (paper to ink over 16 m)
            t = np.clip(h / 16, 0, 1)[..., None]
            clay = np.where(h[..., None] > 1.5, np.array([200, 204, 210.0]) + (INK - np.array([200, 204, 210.0])) * t,
                            np.array([228, 223, 213.0]))
            render(clay, h, np.zeros_like(new)).save(d / f"iso_{year}_clay.webp", quality=84, method=6)
            if year != 2018:
                # only where there is a building now: the tint follows the measured height, not the lot outline
                render(photo, h, new & (h > 2.0)).save(d / f"iso_{year}_new.webp", quality=84, method=6)
        print(sid, "done")


if __name__ == "__main__":
    main()
