-- Status values the code already uses but older databases refuse
-- ==============================================================
-- Two CHECK constraints predate features that write new values:
--
--   enrollments.enrollment_status      'transferred_out'
--     Written by POST /api/enrollments/{id}/transfer-out/ (enrollment-service
--     enrollments/views.py::transfer_out) when a learner leaves mid-year.
--
--   invoice_installments.status        'voided'
--     Written by billing's close_out_invoice_for_transfer() when a
--     transferred-out learner's remaining installments are cancelled.
--
-- schema.sql already has both values, so a database built from it is fine; a
-- database created before them rejects every transfer-out, and the invoice
-- close-out after it, with a CHECK violation (a 500 in the app).
--
-- Idempotent: each constraint is dropped and re-created with the full list, so
-- re-running changes nothing. Only widens what's allowed -- no existing row
-- can violate the new lists.
--
--   psql -U postgres -d "SLIS THESIS FINAL" -f scripts/2026-09-status-values.sql

BEGIN;

ALTER TABLE public.enrollments
  DROP CONSTRAINT IF EXISTS enrollments_enrollment_status_check;
ALTER TABLE public.enrollments
  ADD CONSTRAINT enrollments_enrollment_status_check
  CHECK (enrollment_status IN ('enrolled', 'pending', 'cancelled', 'completed', 'transferred_out'));

ALTER TABLE public.invoice_installments
  DROP CONSTRAINT IF EXISTS invoice_installments_status_check;
ALTER TABLE public.invoice_installments
  ADD CONSTRAINT invoice_installments_status_check
  CHECK (status IN ('pending', 'partially_paid', 'paid', 'overdue', 'voided'));

COMMIT;
