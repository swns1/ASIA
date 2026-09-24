-- Resync every serial/identity sequence to its table's current maximum.
-- ====================================================================
--
-- Why this is needed
-- ------------------
-- `seed_data.sql` inserts rows with EXPLICIT primary keys. A literal
-- `INSERT INTO students (student_id, ...) VALUES (151, ...)` does not advance
-- `students_student_id_seq`, so after loading it the sequence still points at
-- whatever it reached before -- while the table already holds far higher ids.
--
-- The next INSERT that lets the sequence assign the key then collides:
--
--     duplicate key value violates unique constraint "students_pkey"
--     DETAIL:  Key (student_id)=(100) already exists.
--
-- Found by running the demo seeders against a database restored this way.
-- Three core tables were affected at once -- `students` (seq 7, max 151),
-- `households` (seq 100, max 151) and `enrollments` (seq 7, max 268) --
-- which means the application could not create a learner, a household or an
-- enrollment at all. Nothing reports this until someone tries to write, and
-- the error names a constraint rather than the cause, so it reads like data
-- corruption instead of a sequence that was never advanced.
--
-- Run this after ANY of:
--   * loading seed_data.sql
--   * restoring from scripts/restore.ps1
--   * importing rows with explicit ids from a spreadsheet or another database
--
-- It is safe to run at any time: setval to the current maximum is idempotent,
-- and a sequence already ahead of its table is left alone.

DO $$
DECLARE
    r        record;
    seq_name text;
    max_id   bigint;
    last_val bigint;
    fixed    int := 0;
BEGIN
    FOR r IN
        SELECT c.relname AS tbl, a.attname AS col
        FROM pg_class c
        JOIN pg_namespace n
          ON n.oid = c.relnamespace AND n.nspname = 'public'
        JOIN pg_attribute a
          ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
        WHERE c.relkind = 'r'
          AND pg_get_serial_sequence(n.nspname || '.' || c.relname, a.attname) IS NOT NULL
        ORDER BY c.relname
    LOOP
        seq_name := pg_get_serial_sequence('public.' || r.tbl, r.col);

        EXECUTE format('SELECT COALESCE(MAX(%I), 0) FROM public.%I', r.col, r.tbl)
           INTO max_id;
        EXECUTE format('SELECT last_value FROM %s', seq_name)
           INTO last_val;

        -- Only move a sequence FORWARD. Dragging one backward to match an
        -- emptied table would hand out ids that rows deleted in this session
        -- may still be referenced by in an open transaction elsewhere.
        IF last_val < max_id THEN
            -- is_called = true, so the NEXT nextval() returns max_id + 1
            -- rather than max_id itself.
            EXECUTE format('SELECT setval(%L, %s, true)', seq_name, max_id);
            RAISE NOTICE 'resynced %: % -> %', r.tbl, last_val, max_id;
            fixed := fixed + 1;
        END IF;
    END LOOP;

    IF fixed = 0 THEN
        RAISE NOTICE 'All sequences already ahead of their tables. Nothing to do.';
    ELSE
        RAISE NOTICE 'Resynced % sequence(s).', fixed;
    END IF;
END $$;

-- Audit (run on its own to see the state without changing anything):
--
--   SELECT c.relname AS tbl, a.attname AS col,
--          pg_get_serial_sequence('public.'||c.relname, a.attname) AS seq
--     FROM pg_class c
--     JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname='public'
--     JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0
--    WHERE c.relkind='r'
--      AND pg_get_serial_sequence('public.'||c.relname, a.attname) IS NOT NULL;
