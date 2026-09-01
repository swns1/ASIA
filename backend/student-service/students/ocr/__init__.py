"""
Document scanning for student enrollment.

The package is layered so that the part most likely to change — which engine
reads the pixels — is the thinnest and most isolated piece:

    reader.py      pixels  -> ParsedDocument      (PaddleOCR / PP-StructureV3)
    policy.py      which documents deserve a full extraction, and which only
                   need to be confirmed as the right paper for this student
    anchors.py     ParsedDocument -> fields, by keying off the printed labels
                   of a fixed-layout form (no model, no training data)
    verify.py      ParsedDocument -> "is this the right document, for this
                   student?" — pure string work, no model call at all
    groq_vision.py the previous cloud path, now the fallback for when anchors
                   cannot resolve a document
    reconcile.py   many documents -> one ledger of claims per field, with
                   conflicts surfaced instead of silently overwritten

Everything above `reader.py` consumes `ParsedDocument` rather than an image,
so the bulk of the logic is testable without PaddleOCR installed and without
a network call.
"""
