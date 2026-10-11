# SLIS — AI QA Audit

| | |
|---|---|
| **Date** | 2026-10-11 |
| **Scope** | Every AI-backed feature in the repository at `main` (`9a16cbba`) |
| **Environment** | Local Windows dev stack, database `slis_v2`, `DEBUG=True`, Gemini + Groq keys from the local `.env` |
| **Method** | Source inspection → risk-based plan → in-process tests (no DB, no network) → live provider probes with synthetic data → regression of all suites |
| **Status of this document** | Findings as of the audit. **QA-01, QA-02, QA-03 and QA-16 fixed on 2026-10-11** (uncommitted) — see "Fix status" below. Everything else is still open. |

### Fix status (2026-10-11, after the audit)

| ID | Fix | Verified by |
|---|---|---|
| QA-01 | Model ids moved to settings with working defaults (`GROQ_TEXT_MODEL=openai/gpt-oss-120b`, `GROQ_VISION_MODEL=qwen/qwen3.8-27b`); new `manage.py check_ai_providers` exits 1 on a retired id. | Live: Groq answered both AI features (HTTP 200, 2–3 s); command passes, and fails when pointed at `llama-3.3-70b-versatile`. `ai/test_provider_fallback.py`. |
| QA-16 | An empty provider answer now counts as a failure, so the next provider is tried (part of making the fallback work). | Audit `B11` now passes; `ai/test_provider_fallback.py`. |
| QA-02 | Every grade and cluster average is labelled in code with `grading.deped.descriptor` before the model sees it; prompts tell the model to copy, never derive. Analytics sends cluster figures as validated data (`clusters`) instead of prose. The `/ai/cluster/` naming prompt carries descriptors too. | Live (Groq): 73.8 → "Did Not Meet Expectations", 74.60 → DNME, 75 → Fairly Satisfactory; group names like "Near-Pass Learners". Gemini returned the grade report correctly; its clustering run could not be re-sampled (quota exhausted). `ai/test_deped_descriptors.py`. |
| QA-03 | Whole surname (spacing-insensitive) **and** every given name must appear as whole words; no 3-letter floor; new `name_match` field; a surname-only match is reported as "may be a sibling's or a relative's document" in the UI. | Audit `G3`, `G3b`, `G4`, `G5`, `G6` now pass; `students/ocr/test_verify_names.py`. |

Regression after the fixes: enrollment 816, student 435, frontend 923 — all pass; `manage.py check` clean; lint 0 errors.

**Rules followed.** No application code, configuration, schema or data was modified. Nothing was committed or pushed. Tests run with pytest-django's database blocker on and every ORM entry point patched, so an accidental query would have failed loudly instead of writing. Every payload sent to a third-party provider was synthetic (no names, LRNs or seeded records). The only files added to the repo are in `docs/qa/` (this report and the test scripts).

---

## 1. Executive summary

**Overall assessment: the authorization boundaries are sound; the AI's *output quality and resilience* are not yet what the documentation and thesis claim.**

What held up:
- Every AI/OCR route is role-gated and fails closed (70+ role/identity checks). Guardians and accounting cannot reach any of them; teachers see only their own advisory roster.
- The AI has **no tools, no record access and no write path.** Its only input is what the browser sends, and its only output goes back to the requester. A prompt-injection attempt therefore cannot reach data or take an action.
- No document image leaves the system today (all 13 requirement types are VERIFY, and the cloud vision path is unreachable).
- Clustering and risk-score arithmetic are correct, deterministic and NaN-safe on normal input.
- Regression is clean: **2,382 existing tests pass** across all five suites.

What did not hold up (34 of 177 audit test cases fail; all triaged as real behaviour):

| Sev | ID | One-line |
|---|---|---|
| **High** | QA-01 | The Groq fallback has never worked on this account — both configured model ids return **404**; Gemini is the only working provider and rate-limited under 25 calls. |
| **High** | QA-02 | The LLM mislabels DepEd bands: a group averaging **73.8** was described as "Fairly Satisfactory" (passing is 75). Reproduced on both clean reads. |
| **High** | QA-03 | Document verification accepts the **wrong person** — a sibling's birth certificate, a different "Dela …" family, any same first name, any name containing the given name. |
| Medium | QA-04 | The "no identifying field leaves the system" filter is top-level only; names/LRNs nested in allowed keys or typed into `section` reach the provider. |
| Medium | QA-05 | A grade report with no grades is accepted and the model **fabricates a full set of grades** (3 of 3 attempts). UI-gated, API-reachable. |
| Medium | QA-06 | No bound on prompt size (1.59 M characters forwarded in one request). |
| Medium | QA-07 | Gemini calls have **no timeout**; a stall holds a worker thread (LAN: indefinitely; Railway: 120 s then the whole worker is killed). |
| Medium | QA-08 | Risk `weights` of `1e999` makes every score `NaN` → every student "critical", persisted, and reads of that run then 500. |
| Medium | QA-09 | Unexpected LLM JSON shapes (a bare list, `cluster_names` as dict/string) 500 the clustering page or put garbage in group labels. |
| Medium | QA-10 | Document-type check is substring-based: `esc`, `acr` match ordinary words, so 3 of 13 types accept unrelated pages. |
| Medium | QA-11 | Verify-only scans still persist the page's full transcription (including health-record content). |
| Low | QA-12 … QA-19 | Stale/misleading docs and UI labels; malformed bodies → 500; non-numeric ids → 500 / echoed Python errors; dead prompts; empty-text-as-success; contradictory custom-weight result; non-image upload reported as success. |

**Release readiness: CONDITIONAL.** Safe to demonstrate — no data-exposure or privilege path was found. Not safe to *describe as designed*: three claims in the docs/thesis do not hold today (Gemini→Groq fallback, "LLM computes nothing", verified-document check). Fix QA-01, 02, 03 (and ideally 04, 07, 08) or reword before the panel. See §8.

---

## 2. What the AI actually is (verified from code)

There is **no conversational or agentic AI** in SLIS. A repo-wide search found no chat endpoint, no tool/function calling, no LLM-driven reads or writes, and no financial action performed by a model. The AI surface is four things:

| # | Endpoint | Roles | Provider order | What leaves the system | Persisted |
|---|---|---|---|---|---|
| 1 | `POST /api/ai/interpret/` (enrollment-service `ai/views.py`) | super_admin, admin, registrar | Gemini 2.5 Flash-Lite → Groq `llama-3.3-70b-versatile` | Browser-built payload, filtered to a per-context key allowlist. UI sends only `grade_report` (one learner's subject × quarter grades, no name) and `clustering_insights` (cluster aggregates). | No |
| 2 | `GET /api/ai/cluster/` (`ai/analytics_views.py`) | same | Groq → Gemini | Per-cluster aggregates only (count, avg grade/attendance/behaviour). **K-Means itself is local scikit-learn.** | No |
| 3 | `POST /api/ai/risk-assessment/run/`, `GET …/latest/`, `GET …/trend/` | run: admin roles; read: + teacher (own roster) | none — **deterministic weighted formula** | nothing | Yes (`risk_assessment_runs`, `student_risk_scores`) |
| 4 | `POST /api/ocr/scan/`, `GET /api/ocr/reconciled/` (student-service `students/ocr/`) | super_admin, admin, registrar | PaddleOCR (local). Groq/Gemini vision path exists but is **unreachable** (every code resolves to VERIFY). | nothing | Yes (`document_extractions`) |

**Test categories from the brief that do not apply** because the capability does not exist: intent recognition, context retention, follow-up questions, tool/function calling, LLM-issued database queries, AI-performed record changes and confirmation-after-success, AI-initiated financial actions. They were not "passed"; there is nothing to test. The equivalents that *do* exist (payload handling, output handling, authorization of the endpoints) are covered below.

---

## 3. Test plan and coverage

Risk-ranked: privacy and authorization first (the brief's stated priority), then academic-record correctness, then resilience.

| Area | Risk | Method | Cases |
|---|---|---|---|
| A. Authorization | Cross-role / cross-record access | `HasRole` matrix over all routes × 6 roles + 6 malformed identities; teacher scoping on read paths; route-completeness check | 64 |
| B. `/ai/interpret/` input & provider handling | PII egress, injection, cost, crashes | Mocked providers; capture the exact prompt sent | 23 |
| C. `/ai/cluster/` | Wrong groups, crashes, untrusted LLM output | Synthetic 30-student cohort with planted structure; LLM output fuzzing | 29 |
| D. Risk scoring | Wrong scores, unsafe inputs | Property tests (bounds, monotonicity, batch independence, thresholds), input abuse | 18 |
| F–H. Document AI | Wrong-person acceptance, PII retention, egress | Synthetic `ParsedDocument` pages; view with reader/DB patched | 43 (F 20, G 14, H 9) |
| L. Live provider behaviour | Hallucination, injection, availability | ~30 real calls with synthetic payloads (Gemini answered; Groq failed — see QA-01) | 8 scenarios |
| R. Regression | Collateral breakage | Full existing suites for all services + frontend | 2,382 |

**Totals — new audit cases: 177 (143 pass / 34 fail). Regression: enrollment 776, student 421, identity 110, billing 152, frontend 923 (92 files) = 2,382 — all pass.**

---

## 4. Controls verified working (evidence: test id)

| Control | Evidence |
|---|---|
| Each AI/OCR route allows exactly its intended roles; guardian & accounting denied everywhere | `A1`, `F1` |
| Unauthenticated, `None`, `ADMIN`, `"admin "`, unknown, attribute-less identities all denied | `A2`, `F2` |
| Every routed AI view is covered by the matrix and declares `required_roles` | `A3` |
| Teacher cannot read trend for a student outside their roster; no advisory ⇒ denied; latest-run rows and summary are roster-filtered | `A4`, `A5`, `A6` |
| Top-level identifiers (`student_name`, `lrn`, `student_id`) are stripped before the provider | `B4` |
| `str.format` placeholders in payload values are not re-expanded | `B10` |
| Gemini failure falls through to Groq; both down → generic 503 with no detail/key leak; none configured → 503 | `B12`, `B13`, `B14` |
| Worst case is 4 provider calls, 2 s backoff, Groq 20 s timeout each | `B16` |
| Clustering recovers planted groups, orders weakest→strongest, bands/colours correct, every learner once, stats match independent recompute, deterministic, strict-JSON-safe with missing signals | `C1`–`C5` |
| `n_clusters` validation; cohorts of 2 or identical learners → 400 | `C6`, `C7` |
| Risk scores bounded, level matches thresholds, monotone in every signal, independent of batch, boundary reasons correct, a failing subject is never "low" | `D1`–`D6` |
| Same-day re-run replaces rather than duplicates (structure) | `D10` |
| No document is sent to a cloud model; reader-unavailable degrades to "not checked" without a false claim | `F4`–`F6`, `H1` |
| Upload size cap; missing image → 400; generic 500; ledger id integer-validated; page text not echoed in response | `H4`, `H5`, `H8`, `H9`, `H7` |
| Model output is rendered as React text nodes (no `dangerouslySetInnerHTML`) | code read, `AIInsightPanel.jsx:15-78` |
| Injection through `section` / a subject key was **not** followed by Gemini | probe S3, S4 |

---

## 5. Confirmed defects

Severity rubric — **High:** a control or claim the system relies on is demonstrably ineffective, or output is wrong in a way users will act on, in normal use. **Medium:** needs authenticated staff + unusual input, *or* a privacy/robustness weakness with a plausible real trigger. **Low:** hygiene and observations. **Critical:** cross-boundary data exposure or integrity loss — none found.

### QA-01 · High · Groq fallback has never worked (both configured models are 404)
- **Evidence.** `POST api.groq.com/openai/v1/chat/completions` with the configured key and model `llama-3.3-70b-versatile` → **HTTP 404 `model_not_found`** ("does not exist or you do not have access"). `GET /models` with the same key → 200, listing 11 models; neither `llama-3.3-70b-versatile` nor the OCR model `qwen/qwen3.6-27b` is among them (a `qwen/qwen3.8-27b` is). App log: `Provider groq exhausted: 404 Client Error`.
- **Impact.** Gemini is the only working provider. During ~25 calls Gemini returned **429 RESOURCE_EXHAUSTED** and **503 UNAVAILABLE**, so `/ai/interpret/` answered "temporarily unavailable" with nothing behind it. `/ai/cluster/` degrades gracefully to rank-based names. The documented resilience design is not real.
- **Code.** `ai/views.py:188`, `ai/analytics_views.py:229`, `students/ocr/groq_vision.py:37`.
- **Root cause.** Hard-coded model ids; no startup/health validation; every test mocks the provider, so none can notice.
- **Caveat.** Verified against the key in this machine's `.env`. A hosted key/account may differ — worth a one-line check there.

### QA-02 · High · LLM misclassifies DepEd grade bands
- **Evidence (live, Gemini).** Cluster summary with Group C `avg grade=73.8`. Output: *"Group C … Average grade of 73.8. This group falls in the 'Fairly Satisfactory' band, close to 'Satisfactory.'"* The prompt's own scale: 75–79 Fairly Satisfactory; **below 75 = Did Not Meet Expectations.** Reproduced on both clean readings (probe 1 and a later re-run). An automated count of 4/4 in a larger run included parser false positives, so it is **not** cited as a rate.
- **Impact.** A group of failing learners is described to teachers as passing — an academic-standing error in output staff will act on.
- **Why it matters for the thesis.** The framing "the LLM computes nothing — every number comes from SQL/Python" is true of the *numbers*, but the prompts (`ai/views.py:39-100`) ask the model to map those numbers to DepEd bands, which is a computation, and it gets it wrong near the boundary.
- **Root cause.** Deterministic classification delegated to the model.

### QA-03 · High · Document verification accepts the wrong person
- **Evidence.** `G3`, `G3b`, `G4`, `G5`, `G6` (synthetic pages). Student *Juan Dela Cruz*:
  - a document for *Pedro Santos Dela Cruz* (sibling) → "names the student" (matched `dela`);
  - a document for *Pedro Garcia Dela **Rosa*** → matched on `dela`;
  - a document for *Juan Pablo Garcia* → matched on `juan`;
  - student *Ana Lim* vs *Mariana Santana Roxas* → matched `ana` inside `mariana`;
  - student *Juan Uy* vs *Juan Miguel Santos* → accepted (surname `uy` is under the 3-char floor and never checked).
- **Impact.** The check exists to catch "the wrong file attached to this student" (`verify.py:79-83`) and is blind to its most plausible form — siblings enrolled together. Because extraction was retired, this check is now the *only* thing OCR does.
- **Code.** `students/ocr/verify.py:52,93-99` — `names_student = bool(surname_hit or given_hit)`, substring `t in text`, 3-char token floor, compound surnames split into separate tokens.

### QA-04 · Medium · Payload allowlist is top-level only
- **Evidence.** `B5`: `grades_by_subject: {"Math": {...}, "student_name": "Ana Cruz", "lrn": "…"}` → both reach the prompt. `B6`: `section: "Ana Cruz (LRN …)"` → reaches the prompt.
- **Impact.** The comment at `ai/views.py:114-118` says anything not listed is dropped; true for keys, not for values. Today's UI sends none of this, so no leak occurs in normal use — but the server does not enforce what the docs say it enforces.
- **Code.** `ai/views.py:165`.

### QA-05 · Medium · No-data grade report → model fabricates grades
- **Evidence (live, Gemini, 3/3).** Payload `{"grade_level": "Grade 8", "total_grades": 0}` returned a full report: *"MTB-MLE: 92 (Outstanding) · English: 88 · Science: 86 · Mathematics: 78 …"*; second run invented `76, 77, 78, 79, 83, 85`.
- **Reachability.** The UI hides the panel when there are no grades (`GradesPage.jsx:910`), so this needs a direct API call. The backend has no guard and the prompt has no "if data is absent, say so" rule.

### QA-06 · Medium · Prompt size unbounded
- **Evidence.** `B7`: 40,000-entry `grades_by_subject` → **1,589,893 characters** forwarded in one request (limited only by Django's 2.5 MB body cap). Cost/latency/quota amplification, staff-only.

### QA-07 · Medium · Gemini calls have no timeout
- **Evidence.** Offline check: `HttpOptions.timeout=None` → httpx effective timeout `{connect: None, read: None, write: None, pool: None}`. Groq calls set 15–20 s; Gemini calls do not (`ai/views.py:178`, `analytics_views.py:243`).
- **Impact.** A stalled Gemini connection holds a synchronous thread. LAN/waitress (16 threads) has no request deadline; Railway/gunicorn kills the whole worker at 120 s, aborting its other in-flight requests (guardian pages included). Not exercised against a real stall.

### QA-08 · Medium · `weights` can poison a persisted run with NaN
- **Evidence.** `D8`: body `weights:{"grade":1e999,…}` passes validation (`risk_views.py:259-262`, `isinstance(float) and >= 0`, `sum>0`); `bulk_create` receives `risk_score=nan`. Offline: a student with 88 average and 99 % attendance scores `nan` → `_risk_level(nan)` = **"critical"**. `D9`: strict JSON rendering rejects NaN, so reading that run 500s until the same-day re-run replaces it.
- **Reachability.** Authenticated staff with a crafted request; the UI never sends `weights`.

### QA-09 · Medium · Untrusted LLM JSON is not shape-checked in `/ai/cluster/`
- **Evidence (`C9`, `C10`).** Model returns a bare JSON list → `AttributeError` (500); `cluster_names` a dict → `KeyError` (500); `cluster_names` a string → labels become `H`,`i`,`g`; non-string entries (`1`, `{"x":1}`) become labels; non-string `interpretation` passes through; a 600-character name is stored unbounded.
- **Impact.** The clustering itself succeeded — a naming call takes the page down. The docstring promises "Never raises". LLM output is nondeterministic, so this is a matter of when, not whether.
- **Code.** `ai/analytics_views.py:583-590`.

### QA-10 · Medium · Document-type markers are substring matches
- **Evidence (`G9`).** `esc_completers` accepts an electricity bill (`esc` ⊂ "de**sc**ription"); `esc_transferee_qc` accepts a grocery receipt; `alien_certificate` accepts "Sacramento…" (`acr` ⊂ "S**acr**amento").
- **Code.** `ocr/verify.py:45-48,57`.

### QA-11 · Medium · Full OCR transcription is stored for verify-only scans
- **Evidence (`H6`).** A health-record scan persists every recognised line (diagnosis, allergies, …) with boxes into `document_extractions.blocks_json`, though the check only needs name/marker matches. `ocr/views.py:145-148`. Data-minimisation concern under RA 10173; confirm retention/deletion rules.

### Low severity

| ID | Finding | Evidence / code |
|---|---|---|
| QA-12 | **Docs and UI misdescribe the AI.** README says PSA birth certificate is extracted and Form 137 "falls through to the cloud fallback" (178-184) and hosted checks "use the Groq cloud path" (479); code verifies all 13 locally and makes no cloud call. Hosted image installs only `requirements.txt`, so **every hosted scan is "not checked"**. UI says "Gemini-powered" (`GradesPage.jsx:913`); backend never returns `provider` (`B15`) so the footer is always generic; a dead branch says "Groq (Llama 4)" (`AIInsightPanel.jsx:286`) though the model is Llama 3.3. | `B15`, `F4`–`F6`, `backend/Dockerfile:30-31` |
| QA-13 | JSON array/string/number/null body, or `context_type` as list/dict → unhandled exception (500). | `B8`, `B9`; `ai/views.py:143,146` |
| QA-14 | `GET /api/ai/cluster/?subject_id=abc` → `ValueError` (500). | `C8`; `services.py:439` |
| QA-15 | Non-numeric `student_id` on scan returns Python text (`invalid literal for int() with base 10: 'abc'`) to the client. | `H3`; `ocr/views.py:195-196` |
| QA-16 | Gemini returning empty text (safety block) is treated as success: no Groq retry, `{"interpretation": null}`. | `B11`; `ai/views.py:182,214` |
| QA-17 | Two prompts (`dashboard_insights`, `scholarship_eligibility`) are listed as valid in the 400 body but can never run (no allowlist entry). | `B2`, `B3`; `ai/views.py:63,102,119` |
| QA-18 | Custom weights that zero every available signal give `risk_level="low"`, score 0, alongside a "Failing 3 subjects" high-severity reason. API-only. | `D7`; `services.py:1029-1031` |
| QA-19 | A non-image upload returns `200 success:true` (with a "not checked" note) instead of a client error. Arguably by design. | `H2` |

---

## 6. Potential risks (not demonstrated)

- **Provider terms / residency.** Grade matrices go to Google (and Groq). Whether Google may use submitted content for product improvement depends on the Gemini API tier; confirm the tier and record it in the privacy notice. The UI names only "Gemini".
- **LLM naming order is not enforced** (`C11`): a model that inverts the order would label the red group "High Achievers". Not observed in 6 live naming runs (0/6), so recorded as an absent control, not a defect.
- **Concurrent first runs** can create two same-day runs: the `select_for_update` only locks an existing row and there is no unique constraint. Needs a DB to demonstrate.
- **Image decompression**: `Image.open` on a ≤10 MB PNG with ~100 M pixels may use hundreds of MB; staff-only. Not exercised.
- **Leaked key**: README (line 216) records a live Gemini key in commit `5bcd352`. Not independently verified here; rotate if not already done.
- **Policy question, not a bug:** excused absences count as missed in the attendance rate (`services.py:624`). Confirm against the school's DepEd interpretation.
- **Gemini stall impact** (QA-07) was inferred from configuration, not reproduced.

---

## 7. Recommended fixes, ranked (nothing implemented)

1. **QA-01** Replace both model ids with ones the key can use; add a startup/`/health` probe that calls `GET /models` and warns if a configured id is absent; add one non-mocked smoke test behind an env flag.
2. **QA-02** Compute the DepEd band per cluster/subject in code and pass the label in the payload (`avg 73.8 → "Did Not Meet Expectations"`); instruct the model to use the supplied band verbatim. Optionally post-check the output for band words that contradict the supplied label.
3. **QA-03** Require the **surname and a given-name token** to match as whole words; match multi-word surnames as a phrase; lower or remove the 3-char floor for surnames; return `names_student: null` ("can't tell") rather than `true` on a single-token match.
4. **QA-04 / 05 / 06** Deep-validate the payload per context (types, numeric ranges, string length ≤ N, key count ≤ N, total size cap); reject a `grade_report` with no grade data; add "if data is missing say so" to the prompt.
5. **QA-07** Set `HttpOptions(timeout=…)` (ms) on every Gemini client; keep total provider time inside the gunicorn/waitress budget.
6. **QA-08** Validate weights: finite, ≤ a sane maximum, at least one positive weight among *available* signals; reject `bool`; guard `score_students` against non-finite results and never persist them.
7. **QA-09** Validate the cluster LLM response: dict with `cluster_names: list[str]` of length n, each ≤ ~40 chars, `interpretation: str`; otherwise fall back to rank names.
8. **QA-10 / 11** Match markers on word boundaries and drop `esc`/`acr`; for VERIFY scans store only the match result, or a redacted/truncated transcription with a retention period.
9. **QA-12** Correct README (OCR flow, hosted behaviour), `GradesPage` description, and the `AIInsightPanel` label; return `provider` from the interpret endpoint or remove the dead branch.
10. **QA-13 … 19** Return 400 for malformed bodies/ids; stop echoing `str(exc)`; treat empty provider text as failure; delete or wire the two dead prompts; decide QA-19 deliberately.

---

## 8. Release-readiness assessment

**Conditional.**

- *For a demonstration:* ready. No path to another user's data, no privilege escalation, no outbound document transfer; regression is green.
- *For the thesis claims as currently written:* not ready. (a) "Gemini with Groq fallback" is false (QA-01). (b) "The LLM only turns finished numbers into sentences" needs the QA-02 caveat. (c) "Documents are checked against the student" overstates what QA-03/QA-10 allow, and on the hosted image the check never runs (QA-12).
- *Minimum before the panel:* QA-01, 02, 03, plus 04, 07, 08 — all small, local changes. The remainder is a backlog.

**Practical note:** this audit's ~30 live calls exhausted Gemini's rate limit (it was returning 429/503 at the end). Expect AI panels to say "temporarily unavailable" for a while; wait before demoing.

---

## 9. Untested areas and limitations

- **Real HTTP stack** (JWT/session middleware, throttling, CORS, audit middleware) — endpoints were exercised in-process; existing tests cover pieces.
- **Real database**: `build_student_features` SQL against live rows; FK/IntegrityError paths; run de-duplication under concurrency; DB-level NaN storage (inferred from PostgreSQL float8 semantics).
- **Groq output quality** — untestable (QA-01). **Gemini sampling** is a handful of runs per scenario, not a statistical sample; the quota blocked more.
- **OCR engine accuracy on real documents** — deliberately not tested (the repo's own rules forbid using real civil-registry images; all pages were synthetic text).
- **Frontend behaviour on malformed model output** (error boundaries) — not exercised.
- **Load/latency under concurrent stalls**; **hosted (Railway) environment** and its keys.
- **Identity/billing/guardian portal** beyond their existing suites — no AI there.

---

## 10. Reproduction

```powershell
# from backend/enrollment-service
..\..\.venv\Scripts\python.exe -m pytest -c pytest.ini ..\..\docs\qa\ai-audit\test_qa_ai_enrollment.py -p no:cacheprovider -q
# from backend/student-service
..\..\.venv\Scripts\python.exe -m pytest -c pytest.ini ..\..\docs\qa\ai-audit\test_qa_ai_student.py -p no:cacheprovider -q
# live probes (spend provider quota; synthetic data only) — from backend/enrollment-service
..\..\.venv\Scripts\python.exe ..\..\docs\qa\ai-audit\probe_live.py
```

Each test asserts the **correct** behaviour, so a failing test id *is* the defect reference used above. After a fix, the corresponding test(s) should turn green. QA-01 can be re-checked with one `GET https://api.groq.com/openai/v1/models`.

| Finding | Test ids |
|---|---|
| QA-03 | `G3`, `G3b`, `G4`, `G5`, `G6` |
| QA-04 | `B5`, `B6` |
| QA-06 | `B7` |
| QA-08 | `D8`, `D9` |
| QA-09 | `C9[*]`, `C10` |
| QA-10 | `G9[*]` |
| QA-11 | `H6` |
| QA-12 | `B15` |
| QA-13 | `B8[*]`, `B9[*]` |
| QA-14 | `C8` |
| QA-15 | `H3` |
| QA-16 | `B11` |
| QA-17 | `B2` |
| QA-18 | `D7` |
| QA-19 | `H2` |
| QA-01, 02, 05, 07 | live probes / offline checks (§5) |
