#!/usr/bin/env python3
"""Generate LinkedIn company-page assets matching the Triple Cities Tech website hero."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops, ImageEnhance
import os

OUT_DIR = "/home/user/staging/linkedin-assets"
HERO_BG = "/home/user/staging/public/herobg.webp"
LOGO    = "/home/user/staging/public/logo/tctlogo.webp"

FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REG  = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

# Hero palette (sampled from /herobg.webp + Tailwind cyan-400)
CYAN_400 = (34, 211, 238)   # text-cyan-400
WHITE    = (255, 255, 255)
NAVY     = (8, 14, 38)      # deep navy seen in hero

os.makedirs(OUT_DIR, exist_ok=True)


def crop_cover(img: Image.Image, target_w: int, target_h: int, y_bias: float = 0.20) -> Image.Image:
    """Cover-crop an image to fill target dimensions (like CSS object-fit: cover).

    y_bias=0.0 keeps the top, 1.0 keeps the bottom. The hero's hex mesh is
    densest in the lower portion of the source, so use y_bias ≈ 0.85 for the
    wide cover to pull that texture into the frame.
    """
    src_w, src_h = img.size
    src_ratio = src_w / src_h
    tgt_ratio = target_w / target_h
    if src_ratio > tgt_ratio:
        # source is wider relative to target — crop sides
        new_w = int(src_h * tgt_ratio)
        x = (src_w - new_w) // 2
        img = img.crop((x, 0, x + new_w, src_h))
    else:
        # source is taller relative to target — crop top/bottom with y_bias
        new_h = int(src_w / tgt_ratio)
        y = int((src_h - new_h) * y_bias)
        y = max(0, min(y, src_h - new_h))
        img = img.crop((0, y, src_w, y + new_h))
    return img.resize((target_w, target_h), Image.LANCZOS)


def horizontal_gradient(size, left_alpha=0.55, right_alpha=0.0):
    """Black gradient overlay — darker on the left, transparent on the right.
    Used under the LinkedIn logo overlap zone to keep text readable."""
    w, h = size
    grad = Image.new("L", (w, 1))
    for x in range(w):
        t = x / max(1, w - 1)
        alpha = left_alpha + (right_alpha - left_alpha) * t
        grad.putpixel((x, 0), int(255 * alpha))
    grad = grad.resize(size)
    overlay = Image.new("RGBA", size, (0, 0, 0, 0))
    overlay.putalpha(grad)
    return overlay


def load_logo_transparent(target_size: int, tint=None) -> Image.Image:
    """Load the TCT logo, drop the white background to transparent, return RGBA.

    The TCT mark is a two-tone shield (cyan bars + white shape). On a dark
    background, treating only pure-white as transparent leaves the white
    shape's edges floating disconnected from its outline. To get a clean
    rendering on dark backgrounds, the caller should pass `tint` — which
    flattens the entire visible mark to a single colour silhouette.
    """
    src = Image.open(LOGO).convert("RGBA")

    # Use the inverted luminance as the alpha channel — this captures the
    # ENTIRE shield silhouette (both cyan and white parts) as opaque, with
    # the white background as transparent.
    gray = src.convert("L")
    # Anything darker than near-white is "foreground"
    alpha = gray.point(lambda v: 0 if v >= 240 else 255 if v <= 200 else int((240 - v) * 255 / 40))

    if tint is None:
        src.putalpha(alpha)
        out = src
    else:
        out = Image.new("RGBA", src.size, tint + (0,))
        out.putalpha(alpha)

    # Trim transparent margins so we can scale to fit.
    bbox = out.getbbox()
    if bbox:
        out = out.crop(bbox)
    out.thumbnail((target_size, target_size), Image.LANCZOS)
    return out


def load_logo_brand_colours(target_size: int) -> Image.Image:
    """Load the TCT logo at its native colours, preserving the file's own
    alpha channel. tctlogo.webp already has a transparent background — earlier
    versions of this script were dropping it by converting to RGB first.
    """
    out = Image.open(LOGO).convert("RGBA")
    # The transparent pixels in this file have dark-grey RGB values stored
    # under them. Replace them with the matching foreground colour at
    # alpha=0 so any feathering doesn't bleed dark grey around the mark.
    import numpy as np
    arr = np.array(out)
    transparent = arr[:, :, 3] == 0
    arr[transparent] = [255, 255, 255, 0]
    out = Image.fromarray(arr, "RGBA")

    bbox = out.getbbox()
    if bbox:
        out = out.crop(bbox)
    out.thumbnail((target_size, target_size), Image.LANCZOS)
    return out


def darken(img: Image.Image, alpha: float) -> Image.Image:
    overlay = Image.new("RGBA", img.size, (0, 0, 0, int(255 * alpha)))
    return Image.alpha_composite(img.convert("RGBA"), overlay)


def vignette_gradient(size, top=0.0, bottom=0.55):
    """Vertical black gradient overlay matching the hero's bottom fade."""
    w, h = size
    grad = Image.new("L", (1, h))
    for y in range(h):
        t = y / max(1, h - 1)
        alpha = top + (bottom - top) * t
        grad.putpixel((0, y), int(255 * alpha))
    grad = grad.resize(size)
    overlay = Image.new("RGBA", size, (0, 0, 0, 0))
    overlay.putalpha(grad)
    return overlay


def fit_font(text, font_path, max_width, start_size, min_size=10):
    size = start_size
    while size > min_size:
        f = ImageFont.truetype(font_path, size)
        bbox = f.getbbox(text)
        if (bbox[2] - bbox[0]) <= max_width:
            return f
        size -= 2
    return ImageFont.truetype(font_path, min_size)


# ---------------------------------------------------------------------------
# 1) Company-page profile / logo image — 400x400 (LinkedIn optimal)
#    Also export 1080x1080 for max quality (LinkedIn accepts up to 8MP).
# ---------------------------------------------------------------------------
def build_profile(size: int, filename: str):
    # Pull the square crop from the lower-centre of the hero so the dense
    # hex band is visible behind the mark (matches the cover treatment).
    bg_src = Image.open(HERO_BG).convert("RGBA")
    if size >= 800:
        bg_src = bg_src.resize((bg_src.width * 2, bg_src.height * 2), Image.LANCZOS)
    bg = crop_cover(bg_src, size, size, y_bias=0.75)

    # Boost saturation/contrast to make the cyan mesh pop, then a light
    # darken so the foreground logo dominates.
    bg = ImageEnhance.Color(bg.convert("RGB")).enhance(1.25).convert("RGBA")
    bg = ImageEnhance.Contrast(bg.convert("RGB")).enhance(1.10).convert("RGBA")
    bg = darken(bg, 0.30)

    # Soft inner vignette — darker corners so the centered logo reads cleanly
    # at LinkedIn's small (~80px feed) display sizes.
    vignette = Image.new("L", (size, size), 0)
    ImageDraw.Draw(vignette).ellipse(
        (-size * 0.05, -size * 0.05, size * 1.05, size * 1.05), fill=255
    )
    vignette = vignette.filter(ImageFilter.GaussianBlur(radius=size * 0.22))
    vignette = ImageChops.invert(vignette)
    dark_corners = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    dark_corners.putalpha(vignette.point(lambda v: int(v * 0.55)))
    bg = Image.alpha_composite(bg, dark_corners)

    # Load the logo in its NATIVE brand colours — cyan bars + solid white
    # shield — with only the canvas-edge white made transparent. This keeps
    # the brand mark intact (no silhouette flattening, no white "card") and
    # lets it sit directly on the hero texture without disconnected pieces.
    logo_max = int(size * 0.74)
    logo = load_logo_brand_colours(logo_max)

    # Soft drop shadow so the logo lifts off the textured bg.
    shadow_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    sx = (size - logo.width) // 2
    sy = (size - logo.height) // 2
    shadow_alpha = logo.split()[-1].point(lambda v: int(v * 0.55))
    shadow_only = Image.new("RGBA", logo.size, (0, 0, 0, 0))
    shadow_only.putalpha(shadow_alpha)
    shadow_layer.paste(shadow_only, (sx, sy + int(size * 0.015)), shadow_only)
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(radius=size * 0.018))
    bg = Image.alpha_composite(bg, shadow_layer)

    bg.paste(logo, (sx, sy), logo)

    bg.convert("RGB").save(os.path.join(OUT_DIR, filename), "PNG", optimize=True)


# ---------------------------------------------------------------------------
# 2) Company-page cover / banner — 1128x191 (LinkedIn optimal)
#    Also export 2256x382 (2x) for retina-sharp display.
# ---------------------------------------------------------------------------
def build_cover(w: int, h: int, filename: str):
    bg_src = Image.open(HERO_BG).convert("RGBA")

    # For the 2x cover, upscale the source first so the cropped strip still
    # has the natural hex density at output resolution (Lanczos ≈ 1.76x).
    if w > 1500:
        new_w = int(bg_src.width * 2)
        new_h = int(bg_src.height * 2)
        bg_src = bg_src.resize((new_w, new_h), Image.LANCZOS)

    # Pull the crop from the LOWER portion of the source — that's where the
    # hexagonal mesh is densest. The original `object-[center_20%]` bias used
    # on the website hero is wrong for a 5.9:1 strip; it lands on the sparse
    # top sky. y_bias≈0.85 lands on the dense hex band instead.
    bg = crop_cover(bg_src, w, h, y_bias=0.85)

    # Boost the blue/cyan saturation so the hex pattern reads more vividly.
    bg = ImageEnhance.Color(bg.convert("RGB")).enhance(1.25).convert("RGBA")
    bg = ImageEnhance.Contrast(bg.convert("RGB")).enhance(1.10).convert("RGBA")

    # Lighter overall darken — keeps the hex mesh prominent.
    bg = darken(bg, 0.22)

    # Left-side dark gradient under the LinkedIn logo overlap (roughly the
    # left 18% of the cover) so the brand mark still reads on busy texture.
    left_grad = horizontal_gradient((int(w * 0.35), h), left_alpha=0.55, right_alpha=0.0)
    bg.paste(left_grad, (0, 0), left_grad)

    # Subtle bottom fade to match the hero's gradient transition.
    bg = Image.alpha_composite(bg, vignette_gradient((w, h), top=0.0, bottom=0.25))

    draw = ImageDraw.Draw(bg)

    # Headline only — same size & position as the previous tagline version,
    # tagline simply not drawn. The (phantom) tagline still participates in
    # the vertical block math so the headline sits where it did before
    # (upper-centre), leaving the lower-left clear for the avatar overlap.
    headline = "Triple Cities Tech"
    head_font = fit_font(headline, FONT_BOLD, int(w * 0.50), start_size=int(h * 0.36))

    hb = head_font.getbbox(headline)
    hw, hh = hb[2] - hb[0], hb[3] - hb[1]

    # Centre the headline in the full cover, both axes
    hx = (w - hw) // 2 - hb[0]
    hy = (h - hh) // 2 - hb[1]

    # Subtle text shadow for legibility on the textured bg
    shadow_off = max(1, int(h * 0.012))
    draw.text((hx + shadow_off, hy + shadow_off), headline,
              font=head_font, fill=(0, 0, 0, 180))
    draw.text((hx, hy), headline, font=head_font, fill=WHITE)

    bg.convert("RGB").save(os.path.join(OUT_DIR, filename), "PNG", optimize=True)


if __name__ == "__main__":
    # LinkedIn company-page logo: 400x400 is LinkedIn's stated optimal.
    # We also export 1080x1080 so the asset stays crisp on retina / future redesigns.
    build_profile(400,  "linkedin-company-logo-400x400.png")
    build_profile(1080, "linkedin-company-logo-1080x1080.png")

    # LinkedIn company-page cover: 1128x191 is LinkedIn's stated optimal display size.
    # We also export a 2x version (2256x382) so retina screens render sharp text.
    build_cover(1128, 191, "linkedin-company-cover-1128x191.png")
    build_cover(2256, 382, "linkedin-company-cover-2256x382@2x.png")

    print("Done.")
    for f in sorted(os.listdir(OUT_DIR)):
        size = os.path.getsize(os.path.join(OUT_DIR, f))
        print(f"  {f}: {size/1024:.1f} KB")
