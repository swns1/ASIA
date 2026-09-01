"""
Lightweight, local, deterministic image cleanup applied to OCR uploads.

Targets the common "bad phone photo" failure modes: wrong orientation, poor
lighting, oversized files.

The size and quality below are what measurement settled, not defaults. At the
previous 2000px/q90 this function made files *bigger* — the real sample was
436 KB in and 605 KB out, because it already sat under the cap so nothing
downscaled and it was then re-saved at higher fidelity than the source. At
1400px/q80 the same page is 278 KB with no loss in anchor-label recovery: the
labels are large print, and it is the handwritten *values* that would benefit
from more pixels, which is what the cloud fallback is for.
"""

from io import BytesIO

from PIL import Image, ImageOps

MAX_DIMENSION = 1400  # px -- measured; see module docstring
JPEG_QUALITY = 80


def preprocess_for_ocr(image_bytes: bytes) -> bytes:
    img = Image.open(BytesIO(image_bytes))
    img = ImageOps.exif_transpose(img)  # respect phone rotation metadata
    if img.mode != "RGB":
        img = img.convert("RGB")  # drop alpha/CMYK edge cases
    img = ImageOps.autocontrast(img, cutoff=1)  # cheap per-channel contrast stretch
    img.thumbnail((MAX_DIMENSION, MAX_DIMENSION), Image.LANCZOS)
    out = BytesIO()
    img.save(out, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    return out.getvalue()
