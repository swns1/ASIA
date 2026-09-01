"""
The only module that knows PaddleOCR exists.

Everything downstream consumes `ParsedDocument`, so this file is the seam: a
different engine means a second class here, not a rewrite. It is also the only
part of the package that needs paddle installed, which is what keeps the
anchor and reconciliation logic testable in CI without a 1 GB dependency.

Configuration below is not arbitrary — it is what the task-1 measurement
settled, against the real PSA birth certificate and two Form 137s:

    v6 medium (default)   92s   16/17 anchor labels
    v6 small              29s   15/17          <- chosen
    v6 tiny              8.6s   11/17          too lossy to anchor on

`enable_mkldnn=False` is mandatory, not a tuning choice: paddlepaddle 3.3.1's
oneDNN path raises `ConvertPirAttribute2RuntimeAttribute` on these model
graphs and the prediction never returns. Disabling it costs the CPU
acceleration, which is most of why a page takes ~29s rather than ~5s. Revisit
when paddle fixes it upstream — the speed is entirely recoverable.
"""

import logging
import math
import threading
from io import BytesIO

from PIL import Image, ImageOps

from .types import ParsedDocument, TextBlock

logger = logging.getLogger(__name__)

ENGINE_NAME = "paddle"

# Chosen by measurement — see module docstring.
DET_MODEL = "PP-OCRv6_small_det"
REC_MODEL = "PP-OCRv6_small_rec"

# Loading the models takes ~10s. Doing that per request would dominate the
# scan; the pipeline object is stateless across predictions, so it is built
# once behind a lock and reused.
_pipeline = None
_pipeline_lock = threading.Lock()


def _build_pipeline():
    from paddleocr import PaddleOCR

    return PaddleOCR(
        # Both are extra model loads that cost seconds and buy nothing here:
        # documents arrive from a phone camera with EXIF already applied by
        # the preprocessor, and unwarping targets curved book pages.
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
        enable_mkldnn=False,
        lang="en",
        text_detection_model_name=DET_MODEL,
        text_recognition_model_name=REC_MODEL,
    )


def get_pipeline():
    global _pipeline
    if _pipeline is None:
        with _pipeline_lock:
            if _pipeline is None:
                logger.info("Loading PaddleOCR models (%s / %s)", DET_MODEL, REC_MODEL)
                _pipeline = _build_pipeline()
    return _pipeline


def _to_box(raw) -> tuple[float, float, float, float]:
    """
    Normalise whatever the detector returned to an axis-aligned box.

    PaddleOCR gives either `rec_boxes` (axis-aligned, shape (4,)) or
    `dt_polys` (a rotated quadrilateral, shape (4, 2)) — both as numpy arrays
    of int16. Dispatch on array *shape*, never on element type: numpy scalars
    fail `isinstance(v, int)`, so a type check silently sends every
    axis-aligned box down the polygon path and yields a zero-area box, which
    in turn makes every anchor unresolvable.
    """
    import numpy as np

    arr = np.asarray(raw, dtype=float).reshape(-1)
    if arr.size == 4:
        x0, y0, x1, y1 = arr
    elif arr.size >= 8 and arr.size % 2 == 0:
        pts = arr.reshape(-1, 2)
        x0, y0 = pts[:, 0].min(), pts[:, 1].min()
        x1, y1 = pts[:, 0].max(), pts[:, 1].max()
    else:
        return (0.0, 0.0, 0.0, 0.0)
    return (float(min(x0, x1)), float(min(y0, y1)),
            float(max(x0, x1)), float(max(y0, y1)))


def _estimate_skew(polys) -> float:
    """
    Median text-line angle in degrees, from the detected quadrilaterals.

    Anchors read values from a region *beside* or *below* their label, so a
    page photographed at an angle silently shifts every value into the wrong
    neighbour's region. Correcting the median line angle is cheap insurance;
    the median (not the mean) keeps one wildly-rotated stamp or signature
    from dragging the estimate.
    """
    angles = []
    for poly in polys or []:
        pts = list(poly)
        if len(pts) < 2 or isinstance(pts[0], (int, float)):
            continue
        (x0, y0), (x1, y1) = pts[0], pts[1]
        dx, dy = float(x1) - float(x0), float(y1) - float(y0)
        if abs(dx) < 1e-6:
            continue
        angle = math.degrees(math.atan2(dy, dx))
        if abs(angle) <= 20:  # ignore vertical text and detector noise
            angles.append(angle)
    if not angles:
        return 0.0
    angles.sort()
    return angles[len(angles) // 2]


class PaddleReader:
    """Pixels in, `ParsedDocument` out."""

    engine = ENGINE_NAME

    # Below this the page is rotated before a second pass. Under a degree or
    # so the geometry tolerance in the anchor resolver already absorbs it, and
    # re-running recognition costs another ~29s.
    SKEW_THRESHOLD_DEG = 1.5

    def read(self, image_bytes: bytes, *, deskew: bool = True) -> ParsedDocument:
        pipeline = get_pipeline()
        img = self._open(image_bytes)
        parsed = self._predict(pipeline, img)

        if deskew and parsed.blocks:
            angle = parsed.__dict__.pop("_skew", 0.0)
            if abs(angle) >= self.SKEW_THRESHOLD_DEG:
                logger.info("Deskewing page by %.2f°", -angle)
                rotated = img.rotate(angle, expand=True, fillcolor=(255, 255, 255),
                                     resample=Image.BICUBIC)
                parsed = self._predict(pipeline, rotated)
                parsed.__dict__.pop("_skew", None)

        return parsed

    # Task 1 measured latency at this size. Reading a phone photo at full
    # resolution cost 46s against 29s here, for no gain in anchor-label
    # recovery — the labels are large print, and it is the *values* that
    # would benefit from more pixels, which the fallback handles anyway.
    MAX_DIMENSION = 1400

    @classmethod
    def _open(cls, image_bytes: bytes) -> Image.Image:
        img = ImageOps.exif_transpose(Image.open(BytesIO(image_bytes)))
        if img.mode != "RGB":
            img = img.convert("RGB")
        img.thumbnail((cls.MAX_DIMENSION, cls.MAX_DIMENSION), Image.LANCZOS)
        return img

    def _predict(self, pipeline, img: Image.Image) -> ParsedDocument:
        # PaddleOCR's predict() takes a path, a URL, or a numpy array. numpy
        # avoids writing a temp file on every scan.
        import numpy as np

        result = pipeline.predict(input=np.array(img)[:, :, ::-1])  # RGB -> BGR
        if not result:
            return ParsedDocument(width=img.width, height=img.height, engine=self.engine)

        page = result[0]
        texts = page.get("rec_texts") or []
        scores = page.get("rec_scores") or []
        boxes = page.get("rec_boxes")
        polys = page.get("dt_polys")
        raw_boxes = boxes if boxes is not None and len(boxes) else polys

        blocks = []
        for i, text in enumerate(texts):
            if not str(text).strip():
                continue
            try:
                box = _to_box(raw_boxes[i])
            except (IndexError, TypeError, ValueError):
                box = (0.0, 0.0, 0.0, 0.0)
            blocks.append(TextBlock(
                text=str(text).strip(),
                box=box,
                confidence=float(scores[i]) if i < len(scores) else 0.0,
            ))

        parsed = ParsedDocument(
            blocks=blocks,
            width=img.width,
            height=img.height,
            engine=self.engine,
        )
        parsed.__dict__["_skew"] = _estimate_skew(polys)
        return parsed
