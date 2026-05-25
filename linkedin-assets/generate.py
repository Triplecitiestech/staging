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
    bg_src = Image.open(HERO_BG).convert("RGBA")
    bg = crop_cover(bg_src, size, size)
    # Slight dark overlay to make logo pop, keep tech-mesh visible
    bg = darken(bg, 0.35)

    # Soft radial-ish vignette: corners darker
    vignette = Image.new("L", (size, size), 0)
    vd = ImageDraw.Draw(vignette)
    # draw a bright disc, then blur; invert -> darker corners
    vd.ellipse((-size*0.1, -size*0.1, size*1.1, size*1.1), fill=255)
    vignette = vignette.filter(ImageFilter.GaussianBlur(radius=size*0.18))
    vignette = ImageChops.invert(vignette)
    dark_corners = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    dark_corners.putalpha(vignette.point(lambda v: int(v * 0.45)))
    bg = Image.alpha_composite(bg, dark_corners)

    # Place the original logo (with its native white background) inside a
    # clean rounded white card centred on the hero. The TCT mark is designed
    # for a white backdrop, so this preserves the brand exactly while still
    # showing the website's hero texture around the edges.
    card_size = int(size * 0.66)
    radius    = int(card_size * 0.18)

    card = Image.new("RGBA", (card_size, card_size), (255, 255, 255, 255))
    mask = Image.new("L", (card_size, card_size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, card_size, card_size), radius=radius, fill=255
    )

    # Load logo on its native white background and fit inside the card
    # with a little internal padding so the mark breathes.
    logo_src = Image.open(LOGO).convert("RGBA")
    inner = int(card_size * 0.86)
    logo_src.thumbnail((inner, inner), Image.LANCZOS)
    lx_in = (card_size - logo_src.width) // 2
    ly_in = (card_size - logo_src.height) // 2
    card.paste(logo_src, (lx_in, ly_in), logo_src)

    # Soft shadow under the card
    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    sx = (size - card_size) // 2
    sy = (size - card_size) // 2
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle(
        (sx, sy + int(size * 0.015), sx + card_size, sy + card_size + int(size * 0.015)),
        radius=radius, fill=(0, 0, 0, 140)
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=size * 0.025))
    bg = Image.alpha_composite(bg, shadow)

    # Composite the rounded card onto the hero
    card_rgba = Image.new("RGBA", (card_size, card_size), (0, 0, 0, 0))
    card_rgba.paste(card, (0, 0), mask)
    bg.paste(card_rgba, (sx, sy), card_rgba)

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

    # --- Headline: "Triple Cities Tech" (white, font-black) ---
    headline = "Triple Cities Tech"
    # Target headline width ≈ 55% of cover width so the tagline fits below
    head_font = fit_font(headline, FONT_BOLD, int(w * 0.58), start_size=int(h * 0.42))

    # --- Tagline: "We turn IT into a competitive advantage." (cyan-400) ---
    tagline = "We turn IT into a competitive advantage."
    tag_font = fit_font(tagline, FONT_REG, int(w * 0.62), start_size=int(h * 0.22))

    # Measure
    hb = head_font.getbbox(headline)
    tb = tag_font.getbbox(tagline)
    hw, hh = hb[2] - hb[0], hb[3] - hb[1]
    tw, th = tb[2] - tb[0], tb[3] - tb[1]

    gap = int(h * 0.06)
    block_h = hh + gap + th
    block_top = (h - block_h) // 2 - int(h * 0.04)

    # Centre horizontally
    hx = (w - hw) // 2 - hb[0]
    hy = block_top - hb[1]
    tx = (w - tw) // 2 - tb[0]
    ty = block_top + hh + gap - tb[1]

    # Subtle text shadow for legibility on the textured bg
    shadow_off = max(1, int(h * 0.012))
    draw.text((hx + shadow_off, hy + shadow_off), headline,
              font=head_font, fill=(0, 0, 0, 180))
    draw.text((hx, hy), headline, font=head_font, fill=WHITE)

    draw.text((tx + shadow_off, ty + shadow_off), tagline,
              font=tag_font, fill=(0, 0, 0, 160))
    draw.text((tx, ty), tagline, font=tag_font, fill=CYAN_400)

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
