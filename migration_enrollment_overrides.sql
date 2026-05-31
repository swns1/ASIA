-- ============================================================
-- Migration: Create enrollment_overrides audit table
-- Run once against the SLIS THESIS FINAL PostgreSQL database:
--   psql -U postgres -d "SLIS THESIS FINAL" -f migration_enrollment_overrides.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS enrollment_overrides (
    enrollment_override_id BIGSERIAL PRIMARY KEY,
    enrollment_id          BIGINT       NOT NULL REFERENCES enrollments(enrollment_id) ON DELETE CASCADE,
    override_reason        TEXT         NOT NULL,
    overridden_by          INTEGER      NOT NULL,  -- user_id from identity-service
    overridden_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT enrollment_overrides_enrollment_id_unique UNIQUE (enrollment_id)
);

CREATE INDEX IF NOT EXISTS idx_enrollment_overrides_enrollment_id
    ON enrollment_overrides (enrollment_id);
