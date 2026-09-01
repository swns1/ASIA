"""
The shared vocabulary between the reader and everything downstream.

`ParsedDocument` is deliberately engine-agnostic: it is what a reader must
produce, not what any particular OCR library happens to return. That is what
lets the anchor resolver, the verifier and every test above this layer run
without PaddleOCR installed — a hand-built ParsedDocument is a perfectly good
stand-in for a scanned page, and it is far easier to reason about than a
fixture image.
"""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class TextBlock:
    """
    One recognised run of text and where it sits on the page.

    `box` is (x0, y0, x1, y1) in pixels of the *deskewed* image, origin
    top-left. Anchor resolution is entirely geometric, so a reader that emits
    rotated quadrilaterals must normalise them to an axis-aligned bounding box
    before constructing one of these.

    `confidence` is the recogniser's own 0-1 score. Unlike an LLM's
    self-reported "high/medium/low" this is a real model output, which is why
    it can be thresholded to decide whether to escalate to the fallback.
    """

    text: str
    box: tuple[float, float, float, float]
    confidence: float = 1.0

    @property
    def x0(self) -> float:
        return self.box[0]

    @property
    def y0(self) -> float:
        return self.box[1]

    @property
    def x1(self) -> float:
        return self.box[2]

    @property
    def y1(self) -> float:
        return self.box[3]

    @property
    def height(self) -> float:
        return max(0.0, self.y1 - self.y0)

    @property
    def center_y(self) -> float:
        return (self.y0 + self.y1) / 2.0


@dataclass
class ParsedDocument:
    """
    A page as the rest of the pipeline sees it.

    `tables` holds recognised table structures as row-major lists of cell
    strings — Form 137 is a grades table, and reading it as one is far more
    reliable than re-deriving rows from scattered boxes.
    """

    blocks: list[TextBlock] = field(default_factory=list)
    tables: list[list[list[str]]] = field(default_factory=list)
    width: int = 0
    height: int = 0
    engine: str = ""

    @property
    def text(self) -> str:
        """All recognised text as one string — what keyword matching reads."""
        return "\n".join(b.text for b in self.blocks)

    @property
    def mean_confidence(self) -> float:
        """
        Average recognition confidence across the page. One of the three
        signals that escalates a document to the cloud fallback: a page the
        recogniser itself is unsure about is not a page to trust anchors on.
        Returns 0.0 for an empty parse so "nothing was read" escalates rather
        than looking like perfect confidence.
        """
        if not self.blocks:
            return 0.0
        return sum(b.confidence for b in self.blocks) / len(self.blocks)
