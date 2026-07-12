"""
Lightweight, local, deterministic image cleanup applied to OCR uploads
before they're sent to Groq. Targets the most common "bad phone photo"
failure modes: wrong orientation, poor lighting/contrast, oversized files.
"""

from io import BytesIO

from PIL import Image, ImageOps

MAX_DIMENSION = 2000  # px -- plenty for OCR; keeps payload/latency down


def preprocess_for_ocr(image_bytes: bytes) -> bytes:
    img = Image.open(BytesIO(image_bytes))
    img = ImageOps.exif_transpose(img)  # respect phone rotation metadata
    if img.mode != "RGB":
        img = img.convert("RGB")  # drop alpha/CMYK edge cases
    img = ImageOps.autocontrast(img, cutoff=1)  # cheap per-channel contrast stretch
    img.thumbnail((MAX_DIMENSION, MAX_DIMENSION), Image.LANCZOS)
    out = BytesIO()
    img.save(out, format="JPEG", quality=90)
    return out.getvalue()
