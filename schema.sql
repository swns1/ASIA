--
-- PostgreSQL database dump
--
-- The authoritative schema for the shared "SLIS THESIS FINAL" database, was
-- previously hand-built via pgAdmin over time with no tracked source (see
-- README's Database setup section) -- this is a `pg_dump --schema-only`
-- snapshot, the only artifact that fully captures it: 55 tables, 2
-- validation triggers (trg_billing_item_parent_category_match,
-- trg_validate_grading_period) and their functions, and one view
-- (student_invoice_balances, an invoice-balance calculation currently also
-- reimplemented in Python in billing/serializers.py -- none of which
-- Django's ORM/migrations layer can see or reproduce on its own.
--
-- To (re)create a database from scratch:
--   psql -U postgres -c 'CREATE DATABASE "SLIS THESIS FINAL"'
--   psql -U postgres -d "SLIS THESIS FINAL" -f schema.sql
--   psql -U postgres -d "SLIS THESIS FINAL" -f seed_data.sql   -- optional sample data
--
-- To regenerate this file after a real schema change made via pgAdmin:
--   pg_dump -h <host> -U postgres -d "SLIS THESIS FINAL" --schema-only --no-owner --no-privileges -f schema.sql
-- (strip any \restrict/\unrestrict lines pg_dump 17+ adds at the top/bottom
-- -- they make the file fail to load on older psql clients and add nothing
-- for a tracked reference file.)

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: trg_billing_item_parent_category_match(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_billing_item_parent_category_match() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_parent_category VARCHAR(30);
BEGIN
    IF NEW.parent_billing_item_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT item_category
    INTO v_parent_category
    FROM billing_items
    WHERE billing_item_id = NEW.parent_billing_item_id;

    IF v_parent_category IS NULL THEN
        RAISE EXCEPTION 'Invalid parent_billing_item_id: %', NEW.parent_billing_item_id;
    END IF;

    IF v_parent_category <> NEW.item_category THEN
        RAISE EXCEPTION
            'Child category (%) must match parent category (%)',
            NEW.item_category, v_parent_category;
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: trg_validate_grading_period(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_validate_grading_period() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_school_level VARCHAR(20);
BEGIN
    SELECT e.school_level
      INTO v_school_level
      FROM enrollments e
     WHERE e.enrollment_id = NEW.enrollment_id;

    IF v_school_level IS NULL THEN
        RAISE EXCEPTION 'Invalid enrollment_id: %', NEW.enrollment_id;
    END IF;

    IF v_school_level = 'senior_highschool' THEN
        IF NEW.grading_period NOT IN ('1st_semester', '2nd_semester') THEN
            RAISE EXCEPTION
                'Invalid grading_period "%" for SHS. Allowed: 1st_semester, 2nd_semester',
                NEW.grading_period;
        END IF;
    ELSE
        IF NEW.grading_period NOT IN ('1st_quarter', '2nd_quarter', '3rd_quarter', '4th_quarter') THEN
            RAISE EXCEPTION
                'Invalid grading_period "%" for non-SHS. Allowed: 1st_quarter..4th_quarter',
                NEW.grading_period;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: academic_calendar_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.academic_calendar_events (
    event_id bigint NOT NULL,
    school_year character varying(20) NOT NULL,
    title character varying(150) NOT NULL,
    event_type character varying(30) DEFAULT 'other'::character varying NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: academic_calendar_events_event_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.academic_calendar_events_event_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: academic_calendar_events_event_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.academic_calendar_events_event_id_seq OWNED BY public.academic_calendar_events.event_id;


--
-- Name: attendance_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance_records (
    attendance_id bigint NOT NULL,
    enrollment_id bigint NOT NULL,
    date date NOT NULL,
    status character varying(1) NOT NULL,
    remarks text,
    recorded_by integer,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: attendance_records_attendance_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.attendance_records ALTER COLUMN attendance_id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.attendance_records_attendance_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    log_id bigint NOT NULL,
    user_id bigint,
    user_name character varying(150) DEFAULT 'Unknown user'::character varying NOT NULL,
    user_role character varying(50) DEFAULT 'unknown'::character varying NOT NULL,
    action character varying(120) NOT NULL,
    module character varying(80) NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    status character varying(30) DEFAULT 'success'::character varying NOT NULL,
    details text DEFAULT ''::text NOT NULL,
    ip_address inet,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: audit_logs_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_logs_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_logs_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_logs_log_id_seq OWNED BY public.audit_logs.log_id;


--
-- Name: auth_group; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_group (
    id integer NOT NULL,
    name character varying(150) NOT NULL
);


--
-- Name: auth_group_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.auth_group ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.auth_group_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: auth_group_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_group_permissions (
    id bigint NOT NULL,
    group_id integer NOT NULL,
    permission_id integer NOT NULL
);


--
-- Name: auth_group_permissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.auth_group_permissions ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.auth_group_permissions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: auth_permission; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_permission (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    content_type_id integer NOT NULL,
    codename character varying(100) NOT NULL
);


--
-- Name: auth_permission_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.auth_permission ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.auth_permission_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: auth_user; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_user (
    id integer NOT NULL,
    password character varying(128) NOT NULL,
    last_login timestamp with time zone,
    is_superuser boolean NOT NULL,
    username character varying(150) NOT NULL,
    first_name character varying(150) NOT NULL,
    last_name character varying(150) NOT NULL,
    email character varying(254) NOT NULL,
    is_staff boolean NOT NULL,
    is_active boolean NOT NULL,
    date_joined timestamp with time zone NOT NULL
);


--
-- Name: auth_user_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_user_groups (
    id bigint NOT NULL,
    user_id integer NOT NULL,
    group_id integer NOT NULL
);


--
-- Name: auth_user_groups_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.auth_user_groups ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.auth_user_groups_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: auth_user_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.auth_user ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.auth_user_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: auth_user_user_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_user_user_permissions (
    id bigint NOT NULL,
    user_id integer NOT NULL,
    permission_id integer NOT NULL
);


--
-- Name: auth_user_user_permissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.auth_user_user_permissions ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.auth_user_user_permissions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: axes_accessattempt; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.axes_accessattempt (
    id integer NOT NULL,
    user_agent character varying(255) NOT NULL,
    ip_address inet,
    username character varying(255),
    http_accept character varying(1025) NOT NULL,
    path_info character varying(255) NOT NULL,
    attempt_time timestamp with time zone NOT NULL,
    get_data text NOT NULL,
    post_data text NOT NULL,
    failures_since_start integer NOT NULL,
    CONSTRAINT axes_accessattempt_failures_since_start_check CHECK ((failures_since_start >= 0))
);


--
-- Name: axes_accessattempt_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.axes_accessattempt ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.axes_accessattempt_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: axes_accessattemptexpiration; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.axes_accessattemptexpiration (
    access_attempt_id integer NOT NULL,
    expires_at timestamp with time zone NOT NULL
);


--
-- Name: axes_accessfailurelog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.axes_accessfailurelog (
    id integer NOT NULL,
    user_agent character varying(255) NOT NULL,
    ip_address inet,
    username character varying(255),
    http_accept character varying(1025) NOT NULL,
    path_info character varying(255) NOT NULL,
    attempt_time timestamp with time zone NOT NULL,
    locked_out boolean NOT NULL
);


--
-- Name: axes_accessfailurelog_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.axes_accessfailurelog ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.axes_accessfailurelog_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: axes_accesslog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.axes_accesslog (
    id integer NOT NULL,
    user_agent character varying(255) NOT NULL,
    ip_address inet,
    username character varying(255),
    http_accept character varying(1025) NOT NULL,
    path_info character varying(255) NOT NULL,
    attempt_time timestamp with time zone NOT NULL,
    logout_time timestamp with time zone,
    session_hash character varying(64) NOT NULL
);


--
-- Name: axes_accesslog_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.axes_accesslog ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.axes_accesslog_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: billing_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_items (
    billing_item_id bigint NOT NULL,
    item_code character varying(50) NOT NULL,
    item_name character varying(150) NOT NULL,
    item_category character varying(30) NOT NULL,
    parent_billing_item_id bigint,
    CONSTRAINT billing_items_check CHECK (((parent_billing_item_id IS NULL) OR (parent_billing_item_id <> billing_item_id))),
    CONSTRAINT billing_items_item_category_check CHECK (((item_category)::text = ANY ((ARRAY['tuition'::character varying, 'misc'::character varying, 'other'::character varying])::text[])))
);


--
-- Name: billing_items_billing_item_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.billing_items_billing_item_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: billing_items_billing_item_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.billing_items_billing_item_id_seq OWNED BY public.billing_items.billing_item_id;


--
-- Name: discount_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.discount_types (
    discount_type_id bigint NOT NULL,
    discount_code character varying(50) NOT NULL,
    discount_name character varying(150) NOT NULL,
    discount_mode character varying(20) NOT NULL,
    discount_value numeric(12,2) NOT NULL,
    CONSTRAINT discount_types_check CHECK (((((discount_mode)::text = 'percentage'::text) AND (discount_value <= (100)::numeric)) OR ((discount_mode)::text = 'fixed_amount'::text))),
    CONSTRAINT discount_types_discount_mode_check CHECK (((discount_mode)::text = ANY ((ARRAY['fixed_amount'::character varying, 'percentage'::character varying])::text[]))),
    CONSTRAINT discount_types_discount_value_check CHECK ((discount_value >= (0)::numeric))
);


--
-- Name: discount_types_discount_type_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.discount_types_discount_type_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: discount_types_discount_type_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.discount_types_discount_type_id_seq OWNED BY public.discount_types.discount_type_id;


--
-- Name: django_admin_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.django_admin_log (
    id integer NOT NULL,
    action_time timestamp with time zone NOT NULL,
    object_id text,
    object_repr character varying(200) NOT NULL,
    action_flag smallint NOT NULL,
    change_message text NOT NULL,
    content_type_id integer,
    user_id integer NOT NULL,
    CONSTRAINT django_admin_log_action_flag_check CHECK ((action_flag >= 0))
);


--
-- Name: django_admin_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.django_admin_log ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.django_admin_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: django_content_type; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.django_content_type (
    id integer NOT NULL,
    app_label character varying(100) NOT NULL,
    model character varying(100) NOT NULL
);


--
-- Name: django_content_type_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.django_content_type ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.django_content_type_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: django_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.django_migrations (
    id bigint NOT NULL,
    app character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    applied timestamp with time zone NOT NULL
);


--
-- Name: django_migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.django_migrations ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.django_migrations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: django_session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.django_session (
    session_key character varying(40) NOT NULL,
    session_data text NOT NULL,
    expire_date timestamp with time zone NOT NULL
);


--
-- Name: document_extractions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_extractions (
    document_extraction_id bigint NOT NULL,
    requirement_code character varying(50) NOT NULL,
    family character varying(50),
    source_label character varying(150) NOT NULL,
    extracted_json jsonb NOT NULL,
    field_confidence_json jsonb NOT NULL,
    blocks_json jsonb NOT NULL,
    document_type_seen character varying(100),
    is_expected_document boolean NOT NULL,
    source_engine character varying(20) NOT NULL,
    mean_confidence double precision,
    scanned_by bigint,
    created_at timestamp with time zone NOT NULL,
    student_id bigint
);


--
-- Name: document_extractions_document_extraction_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.document_extractions ALTER COLUMN document_extraction_id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.document_extractions_document_extraction_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: email_delivery_failures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_delivery_failures (
    email_delivery_failure_id bigint NOT NULL,
    to_email character varying(150) NOT NULL,
    subject character varying(200) NOT NULL,
    context jsonb NOT NULL,
    error_message text NOT NULL,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: email_delivery_failures_email_delivery_failure_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.email_delivery_failures ALTER COLUMN email_delivery_failure_id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.email_delivery_failures_email_delivery_failure_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: enrollment_overrides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.enrollment_overrides (
    enrollment_override_id bigint NOT NULL,
    enrollment_id bigint NOT NULL,
    override_reason text NOT NULL,
    overridden_by integer NOT NULL,
    overridden_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: enrollment_overrides_enrollment_override_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.enrollment_overrides_enrollment_override_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: enrollment_overrides_enrollment_override_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.enrollment_overrides_enrollment_override_id_seq OWNED BY public.enrollment_overrides.enrollment_override_id;


--
-- Name: enrollment_scholarships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.enrollment_scholarships (
    enrollment_scholarship_id bigint NOT NULL,
    enrollment_id bigint NOT NULL,
    scholarship_type_id bigint NOT NULL,
    approved_at timestamp without time zone,
    notes text
);


--
-- Name: enrollment_scholarships_enrollment_scholarship_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.enrollment_scholarships_enrollment_scholarship_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: enrollment_scholarships_enrollment_scholarship_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.enrollment_scholarships_enrollment_scholarship_id_seq OWNED BY public.enrollment_scholarships.enrollment_scholarship_id;


--
-- Name: enrollment_transfers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.enrollment_transfers (
    transfer_id bigint NOT NULL,
    transfer_type character varying(20) NOT NULL,
    effective_date date NOT NULL,
    reason text NOT NULL,
    from_grade_level character varying(20),
    from_section character varying(50),
    from_strand character varying(50),
    to_grade_level character varying(20),
    to_section character varying(50),
    to_strand character varying(50),
    destination_school_name character varying(150),
    origin_school_name character varying(150),
    initiated_by integer NOT NULL,
    created_at timestamp with time zone NOT NULL,
    enrollment_id bigint NOT NULL
);


--
-- Name: enrollment_transfers_transfer_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.enrollment_transfers ALTER COLUMN transfer_id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.enrollment_transfers_transfer_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: enrollments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.enrollments (
    enrollment_id bigint NOT NULL,
    student_id bigint NOT NULL,
    school_year character varying(20) NOT NULL,
    school_level character varying(20) NOT NULL,
    grade_level character varying(20) NOT NULL,
    section character varying(50) NOT NULL,
    strand character varying(50),
    semester character varying(20),
    enrollment_status character varying(20) DEFAULT 'enrolled'::character varying NOT NULL,
    CONSTRAINT enrollments_check CHECK (((((school_level)::text = 'senior_highschool'::text) AND ((semester)::text = ANY ((ARRAY['1st'::character varying, '2nd'::character varying])::text[]))) OR (((school_level)::text <> 'senior_highschool'::text) AND (semester IS NULL)))),
    CONSTRAINT enrollments_enrollment_status_check CHECK (((enrollment_status)::text = ANY ((ARRAY['enrolled'::character varying, 'pending'::character varying, 'cancelled'::character varying, 'completed'::character varying, 'transferred_out'::character varying])::text[]))),
    CONSTRAINT enrollments_school_level_check CHECK (((school_level)::text = ANY ((ARRAY['nursery'::character varying, 'kindergarten'::character varying, 'elementary'::character varying, 'junior_highschool'::character varying, 'senior_highschool'::character varying])::text[])))
);


--
-- Name: enrollments_enrollment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.enrollments_enrollment_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: enrollments_enrollment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.enrollments_enrollment_id_seq OWNED BY public.enrollments.enrollment_id;


--
-- Name: fee_schedule_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fee_schedule_items (
    fee_schedule_item_id bigint NOT NULL,
    fee_schedule_id bigint NOT NULL,
    item_category character varying(20) NOT NULL,
    item_name character varying(150) NOT NULL,
    amount numeric(12,2) NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    CONSTRAINT fee_schedule_items_amount_check CHECK ((amount >= (0)::numeric)),
    CONSTRAINT fee_schedule_items_item_category_check CHECK (((item_category)::text = ANY ((ARRAY['tuition'::character varying, 'misc'::character varying, 'other'::character varying])::text[])))
);


--
-- Name: fee_schedule_items_fee_schedule_item_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fee_schedule_items_fee_schedule_item_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fee_schedule_items_fee_schedule_item_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fee_schedule_items_fee_schedule_item_id_seq OWNED BY public.fee_schedule_items.fee_schedule_item_id;


--
-- Name: fee_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fee_schedules (
    fee_schedule_id bigint NOT NULL,
    school_level character varying(20) NOT NULL,
    grade_level character varying(20) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    notes text,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT fee_schedules_school_level_check CHECK (((school_level)::text = ANY ((ARRAY['nursery'::character varying, 'kindergarten'::character varying, 'elementary'::character varying, 'junior_highschool'::character varying, 'senior_highschool'::character varying])::text[])))
);


--
-- Name: fee_schedules_fee_schedule_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fee_schedules_fee_schedule_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fee_schedules_fee_schedule_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fee_schedules_fee_schedule_id_seq OWNED BY public.fee_schedules.fee_schedule_id;


--
-- Name: grades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.grades (
    grade_id bigint NOT NULL,
    enrollment_id bigint NOT NULL,
    subject_id bigint NOT NULL,
    grading_period character varying(20) NOT NULL,
    numeric_grade numeric(5,2) NOT NULL,
    remarks character varying(20),
    recorded_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT grades_grading_period_check CHECK (((grading_period)::text = ANY ((ARRAY['1st_quarter'::character varying, '2nd_quarter'::character varying, '3rd_quarter'::character varying, '4th_quarter'::character varying, '1st_semester'::character varying, '2nd_semester'::character varying])::text[]))),
    CONSTRAINT grades_numeric_grade_check CHECK (((numeric_grade >= (0)::numeric) AND (numeric_grade <= (100)::numeric))),
    CONSTRAINT grades_remarks_check CHECK (((remarks)::text = ANY ((ARRAY['passed'::character varying, 'failed'::character varying, 'incomplete'::character varying, 'dropped'::character varying])::text[])))
);


--
-- Name: grades_grade_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.grades_grade_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: grades_grade_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.grades_grade_id_seq OWNED BY public.grades.grade_id;


--
-- Name: grading_components; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.grading_components (
    grading_component_id bigint NOT NULL,
    grading_template_id bigint NOT NULL,
    component_name character varying(100) NOT NULL,
    weight numeric(5,2) NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    CONSTRAINT grading_components_weight_check CHECK (((weight > (0)::numeric) AND (weight <= (100)::numeric)))
);


--
-- Name: grading_components_grading_component_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.grading_components_grading_component_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: grading_components_grading_component_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.grading_components_grading_component_id_seq OWNED BY public.grading_components.grading_component_id;


--
-- Name: grading_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.grading_templates (
    grading_template_id bigint NOT NULL,
    template_name character varying(150) NOT NULL,
    description text,
    school_level character varying(20) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT grading_templates_school_level_check CHECK (((school_level)::text = ANY ((ARRAY['nursery'::character varying, 'kindergarten'::character varying, 'elementary'::character varying, 'junior_highschool'::character varying, 'senior_highschool'::character varying])::text[])))
);


--
-- Name: grading_templates_grading_template_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.grading_templates_grading_template_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: grading_templates_grading_template_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.grading_templates_grading_template_id_seq OWNED BY public.grading_templates.grading_template_id;


--
-- Name: guardians; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guardians (
    guardian_id bigint NOT NULL,
    student_id bigint NOT NULL,
    relationship character varying(20) NOT NULL,
    full_name character varying(150) NOT NULL,
    occupation character varying(100),
    email_address character varying(150),
    mobile_number character varying(20),
    is_primary_contact boolean DEFAULT false NOT NULL,
    user_id bigint,
    CONSTRAINT guardians_relationship_check CHECK (((relationship)::text = ANY ((ARRAY['mother'::character varying, 'father'::character varying, 'guardian'::character varying])::text[])))
);


--
-- Name: guardians_guardian_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.guardians_guardian_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: guardians_guardian_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.guardians_guardian_id_seq OWNED BY public.guardians.guardian_id;


--
-- Name: households; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.households (
    household_id bigint NOT NULL,
    parent_marital_status character varying(30),
    living_arrangement character varying(30),
    is_4ps_beneficiary boolean DEFAULT false NOT NULL,
    four_ps_id character varying(50),
    CONSTRAINT households_check CHECK ((((is_4ps_beneficiary = true) AND (four_ps_id IS NOT NULL) AND (length(TRIM(BOTH FROM four_ps_id)) > 0)) OR ((is_4ps_beneficiary = false) AND (four_ps_id IS NULL)))),
    CONSTRAINT households_living_arrangement_check CHECK (((living_arrangement)::text = ANY ((ARRAY['both_parents'::character varying, 'mother_only'::character varying, 'father_only'::character varying, 'guardian'::character varying, 'relative'::character varying, 'independent'::character varying, 'others'::character varying])::text[]))),
    CONSTRAINT households_parent_marital_status_check CHECK (((parent_marital_status)::text = ANY ((ARRAY['married'::character varying, 'separated'::character varying, 'annulled'::character varying, 'single_parent'::character varying, 'widowed'::character varying])::text[])))
);


--
-- Name: households_household_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.households_household_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: households_household_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.households_household_id_seq OWNED BY public.households.household_id;


--
-- Name: invoice_installments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_installments (
    installment_id bigint NOT NULL,
    invoice_id bigint NOT NULL,
    sequence integer NOT NULL,
    due_date date NOT NULL,
    amount numeric(12,2) NOT NULL,
    amount_paid numeric(12,2) DEFAULT 0 NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    CONSTRAINT invoice_installments_amount_check CHECK ((amount >= (0)::numeric)),
    CONSTRAINT invoice_installments_amount_paid_check CHECK ((amount_paid >= (0)::numeric)),
    CONSTRAINT invoice_installments_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'partially_paid'::character varying, 'paid'::character varying, 'overdue'::character varying, 'voided'::character varying])::text[])))
);


--
-- Name: invoice_installments_installment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.invoice_installments_installment_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: invoice_installments_installment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.invoice_installments_installment_id_seq OWNED BY public.invoice_installments.installment_id;


--
-- Name: narrative_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.narrative_categories (
    category_id bigint NOT NULL,
    name character varying(150) NOT NULL,
    description text,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: narrative_categories_category_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.narrative_categories_category_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: narrative_categories_category_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.narrative_categories_category_id_seq OWNED BY public.narrative_categories.category_id;


--
-- Name: narrative_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.narrative_reports (
    report_id bigint NOT NULL,
    enrollment_id bigint NOT NULL,
    category_id bigint NOT NULL,
    grading_period character varying(20) NOT NULL,
    rating character varying(20) NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: narrative_reports_report_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.narrative_reports_report_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: narrative_reports_report_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.narrative_reports_report_id_seq OWNED BY public.narrative_reports.report_id;


--
-- Name: previous_schools; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.previous_schools (
    previous_school_id bigint NOT NULL,
    student_id bigint NOT NULL,
    school_name character varying(150) NOT NULL,
    school_address text NOT NULL
);


--
-- Name: previous_schools_previous_school_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.previous_schools_previous_school_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: previous_schools_previous_school_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.previous_schools_previous_school_id_seq OWNED BY public.previous_schools.previous_school_id;


--
-- Name: requirement_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.requirement_types (
    requirement_type_id bigint NOT NULL,
    requirement_code character varying(50) NOT NULL,
    requirement_name character varying(150) NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: requirement_types_requirement_type_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.requirement_types_requirement_type_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: requirement_types_requirement_type_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.requirement_types_requirement_type_id_seq OWNED BY public.requirement_types.requirement_type_id;


--
-- Name: risk_assessment_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.risk_assessment_runs (
    run_id bigint NOT NULL,
    school_year character varying(20) NOT NULL,
    grading_period character varying(20) NOT NULL,
    school_level character varying(20),
    grade_level character varying(20),
    weights_json jsonb NOT NULL,
    triggered_by bigint,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: risk_assessment_runs_run_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.risk_assessment_runs ALTER COLUMN run_id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.risk_assessment_runs_run_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: scholarship_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scholarship_types (
    scholarship_type_id bigint NOT NULL,
    scholarship_code character varying(50) NOT NULL,
    scholarship_name character varying(150) NOT NULL,
    description text,
    discount_mode character varying(20) NOT NULL,
    discount_value numeric(12,2) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    CONSTRAINT scholarship_types_check CHECK (((((discount_mode)::text = 'percentage'::text) AND (discount_value <= (100)::numeric)) OR ((discount_mode)::text = 'fixed_amount'::text))),
    CONSTRAINT scholarship_types_discount_mode_check CHECK (((discount_mode)::text = ANY ((ARRAY['percentage'::character varying, 'fixed_amount'::character varying])::text[]))),
    CONSTRAINT scholarship_types_discount_value_check CHECK ((discount_value >= (0)::numeric))
);


--
-- Name: scholarship_types_scholarship_type_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.scholarship_types_scholarship_type_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: scholarship_types_scholarship_type_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.scholarship_types_scholarship_type_id_seq OWNED BY public.scholarship_types.scholarship_type_id;


--
-- Name: school_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.school_settings (
    setting_id bigint NOT NULL,
    current_school_year character varying(20) NOT NULL,
    sy_start_date date NOT NULL,
    sy_end_date date NOT NULL,
    early_bird_days integer DEFAULT 7 NOT NULL,
    school_name character varying(150) DEFAULT 'South Lakes Integrated School'::character varying NOT NULL,
    school_address text,
    contact_email character varying(150),
    contact_phone character varying(50),
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: school_settings_setting_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.school_settings_setting_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: school_settings_setting_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.school_settings_setting_id_seq OWNED BY public.school_settings.setting_id;


--
-- Name: score_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.score_entries (
    score_entry_id bigint NOT NULL,
    enrollment_id bigint NOT NULL,
    subject_id bigint NOT NULL,
    grading_component_id bigint NOT NULL,
    grading_period character varying(20) NOT NULL,
    label character varying(100) NOT NULL,
    score numeric(7,2) NOT NULL,
    max_score numeric(7,2) NOT NULL,
    recorded_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT score_entries_check CHECK ((score <= max_score)),
    CONSTRAINT score_entries_grading_period_check CHECK (((grading_period)::text = ANY ((ARRAY['1st_quarter'::character varying, '2nd_quarter'::character varying, '3rd_quarter'::character varying, '4th_quarter'::character varying, '1st_semester'::character varying, '2nd_semester'::character varying])::text[]))),
    CONSTRAINT score_entries_max_score_check CHECK ((max_score > (0)::numeric)),
    CONSTRAINT score_entries_score_check CHECK ((score >= (0)::numeric))
);


--
-- Name: score_entries_score_entry_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.score_entries_score_entry_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: score_entries_score_entry_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.score_entries_score_entry_id_seq OWNED BY public.score_entries.score_entry_id;


--
-- Name: section_advisories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.section_advisories (
    advisory_id bigint NOT NULL,
    teacher_user_id bigint NOT NULL,
    school_year character varying(20) NOT NULL,
    school_level character varying(20) NOT NULL,
    grade_level character varying(20) NOT NULL,
    section character varying(50) NOT NULL,
    strand character varying(50),
    created_at timestamp with time zone NOT NULL
);


--
-- Name: section_advisories_advisory_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.section_advisories ALTER COLUMN advisory_id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.section_advisories_advisory_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: siblings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.siblings (
    sibling_id bigint NOT NULL,
    student_id bigint NOT NULL,
    full_name character varying(150) NOT NULL,
    age integer,
    CONSTRAINT siblings_age_check CHECK (((age >= 0) AND (age <= 100)))
);


--
-- Name: siblings_sibling_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.siblings_sibling_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: siblings_sibling_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.siblings_sibling_id_seq OWNED BY public.siblings.sibling_id;


--
-- Name: student_invoice_discounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_invoice_discounts (
    invoice_discount_id bigint NOT NULL,
    invoice_id bigint NOT NULL,
    discount_type_id bigint,
    description character varying(255) NOT NULL,
    amount numeric(12,2) NOT NULL,
    CONSTRAINT student_invoice_discounts_amount_check CHECK ((amount >= (0)::numeric))
);


--
-- Name: student_invoice_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_invoice_items (
    invoice_item_id bigint NOT NULL,
    invoice_id bigint NOT NULL,
    billing_item_id bigint,
    description character varying(255) NOT NULL,
    amount numeric(12,2) NOT NULL,
    CONSTRAINT student_invoice_items_amount_check CHECK ((amount >= (0)::numeric))
);


--
-- Name: student_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_invoices (
    invoice_id bigint NOT NULL,
    enrollment_id bigint NOT NULL,
    invoice_no character varying(50) NOT NULL,
    invoice_date date DEFAULT CURRENT_DATE NOT NULL,
    status character varying(20) DEFAULT 'unpaid'::character varying NOT NULL,
    payment_plan character varying(20) DEFAULT 'monthly'::character varying NOT NULL,
    recalculated_at timestamp without time zone,
    due_date date,
    CONSTRAINT student_invoices_payment_plan_check CHECK (((payment_plan)::text = ANY ((ARRAY['monthly'::character varying, 'quarterly'::character varying, 'semi_annual'::character varying, 'annual'::character varying])::text[]))),
    CONSTRAINT student_invoices_status_check CHECK (((status)::text = ANY ((ARRAY['unpaid'::character varying, 'partially_paid'::character varying, 'paid'::character varying, 'void'::character varying])::text[])))
);


--
-- Name: student_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_payments (
    payment_id bigint NOT NULL,
    invoice_id bigint NOT NULL,
    payment_date date DEFAULT CURRENT_DATE NOT NULL,
    amount_paid numeric(12,2) NOT NULL,
    payment_method character varying(30) NOT NULL,
    reference_number character varying(100),
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT student_payments_amount_paid_check CHECK ((amount_paid > (0)::numeric)),
    CONSTRAINT student_payments_payment_method_check CHECK (((payment_method)::text = ANY ((ARRAY['cash'::character varying, 'bank_transfer'::character varying, 'gcash'::character varying, 'card'::character varying, 'check'::character varying, 'others'::character varying])::text[])))
);


--
-- Name: student_invoice_balances; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.student_invoice_balances AS
 SELECT i.invoice_id,
    i.enrollment_id,
    i.invoice_no,
    i.invoice_date,
    i.status,
    i.payment_plan,
    i.due_date,
    i.recalculated_at,
    (COALESCE(items.total_items, (0)::numeric))::numeric(12,2) AS total_items,
    (COALESCE(discounts.total_discounts, (0)::numeric))::numeric(12,2) AS total_discounts,
    ((COALESCE(items.total_items, (0)::numeric) - COALESCE(discounts.total_discounts, (0)::numeric)))::numeric(12,2) AS net_amount,
    (COALESCE(payments.total_paid, (0)::numeric))::numeric(12,2) AS total_paid,
    (((COALESCE(items.total_items, (0)::numeric) - COALESCE(discounts.total_discounts, (0)::numeric)) - COALESCE(payments.total_paid, (0)::numeric)))::numeric(12,2) AS balance,
    COALESCE(installments.installment_count, (0)::bigint) AS installment_count,
    COALESCE(installments.paid_installments, (0)::bigint) AS paid_installments,
    installments.next_due_date
   FROM ((((public.student_invoices i
     LEFT JOIN ( SELECT student_invoice_items.invoice_id,
            sum(student_invoice_items.amount) AS total_items
           FROM public.student_invoice_items
          GROUP BY student_invoice_items.invoice_id) items ON ((items.invoice_id = i.invoice_id)))
     LEFT JOIN ( SELECT student_invoice_discounts.invoice_id,
            sum(student_invoice_discounts.amount) AS total_discounts
           FROM public.student_invoice_discounts
          GROUP BY student_invoice_discounts.invoice_id) discounts ON ((discounts.invoice_id = i.invoice_id)))
     LEFT JOIN ( SELECT student_payments.invoice_id,
            sum(student_payments.amount_paid) AS total_paid
           FROM public.student_payments
          GROUP BY student_payments.invoice_id) payments ON ((payments.invoice_id = i.invoice_id)))
     LEFT JOIN ( SELECT invoice_installments.invoice_id,
            count(*) AS installment_count,
            count(*) FILTER (WHERE ((invoice_installments.status)::text = 'paid'::text)) AS paid_installments,
            min(invoice_installments.due_date) FILTER (WHERE ((invoice_installments.status)::text = ANY ((ARRAY['pending'::character varying, 'partially_paid'::character varying, 'overdue'::character varying])::text[]))) AS next_due_date
           FROM public.invoice_installments
          GROUP BY invoice_installments.invoice_id) installments ON ((installments.invoice_id = i.invoice_id)));


--
-- Name: student_invoice_discounts_invoice_discount_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.student_invoice_discounts_invoice_discount_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: student_invoice_discounts_invoice_discount_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.student_invoice_discounts_invoice_discount_id_seq OWNED BY public.student_invoice_discounts.invoice_discount_id;


--
-- Name: student_invoice_items_invoice_item_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.student_invoice_items_invoice_item_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: student_invoice_items_invoice_item_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.student_invoice_items_invoice_item_id_seq OWNED BY public.student_invoice_items.invoice_item_id;


--
-- Name: student_invoices_invoice_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.student_invoices_invoice_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: student_invoices_invoice_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.student_invoices_invoice_id_seq OWNED BY public.student_invoices.invoice_id;


--
-- Name: student_payments_payment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.student_payments_payment_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: student_payments_payment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.student_payments_payment_id_seq OWNED BY public.student_payments.payment_id;


--
-- Name: student_requirement_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_requirement_submissions (
    student_requirement_submission_id bigint NOT NULL,
    student_id bigint NOT NULL,
    requirement_type_id bigint NOT NULL,
    is_submitted boolean DEFAULT false NOT NULL,
    image_url text,
    remarks text,
    submitted_at timestamp without time zone,
    verified_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: student_requirement_submissio_student_requirement_submissio_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.student_requirement_submissio_student_requirement_submissio_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: student_requirement_submissio_student_requirement_submissio_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.student_requirement_submissio_student_requirement_submissio_seq OWNED BY public.student_requirement_submissions.student_requirement_submission_id;


--
-- Name: student_risk_scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_risk_scores (
    score_id bigint NOT NULL,
    student_id bigint NOT NULL,
    enrollment_id bigint NOT NULL,
    grade_component double precision,
    attendance_component double precision,
    narrative_component double precision,
    risk_score double precision NOT NULL,
    risk_level character varying(20) NOT NULL,
    run_id bigint NOT NULL,
    trend_component double precision,
    reasons_json jsonb NOT NULL,
    signals_present integer NOT NULL,
    attendance_rate double precision,
    average_grade double precision,
    failing_subject_count integer NOT NULL,
    grade_delta double precision
);


--
-- Name: student_risk_scores_score_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.student_risk_scores ALTER COLUMN score_id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.student_risk_scores_score_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: student_siblings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_siblings (
    student_sibling_id bigint NOT NULL,
    student_id bigint NOT NULL,
    sibling_student_id bigint NOT NULL,
    relationship_note character varying(20) DEFAULT 'sibling'::character varying,
    CONSTRAINT student_siblings_check CHECK ((student_id <> sibling_student_id))
);


--
-- Name: student_siblings_student_sibling_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.student_siblings_student_sibling_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: student_siblings_student_sibling_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.student_siblings_student_sibling_id_seq OWNED BY public.student_siblings.student_sibling_id;


--
-- Name: students; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.students (
    student_id bigint NOT NULL,
    student_number character varying(30) NOT NULL,
    lrn character varying(20) NOT NULL,
    first_name character varying(50) NOT NULL,
    middle_name character varying(50),
    last_name character varying(50) NOT NULL,
    suffix character varying(10),
    age integer,
    sex character varying(10) NOT NULL,
    religion character varying(50),
    birth_date date NOT NULL,
    email character varying(150),
    mobile_number character varying(20),
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    current_address text NOT NULL,
    permanent_address text NOT NULL,
    household_id bigint,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT students_age_check CHECK (((age >= 3) AND (age <= 100))),
    CONSTRAINT students_sex_check CHECK (((sex)::text = ANY ((ARRAY['male'::character varying, 'female'::character varying])::text[]))),
    CONSTRAINT students_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'inactive'::character varying, 'transferred'::character varying, 'graduated'::character varying, 'dropped'::character varying])::text[])))
);


--
-- Name: students_student_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.students_student_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: students_student_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.students_student_id_seq OWNED BY public.students.student_id;


--
-- Name: subjects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subjects (
    subject_id bigint NOT NULL,
    subject_code character varying(30) NOT NULL,
    subject_name character varying(150) NOT NULL,
    school_level character varying(20) NOT NULL,
    grade_level character varying(20) NOT NULL,
    strand character varying(50),
    semester character varying(20),
    grading_template_id bigint,
    CONSTRAINT subjects_check CHECK (((((school_level)::text = 'senior_highschool'::text) AND ((semester)::text = ANY ((ARRAY['1st'::character varying, '2nd'::character varying])::text[]))) OR (((school_level)::text <> 'senior_highschool'::text) AND (semester IS NULL)))),
    CONSTRAINT subjects_school_level_check CHECK (((school_level)::text = ANY ((ARRAY['nursery'::character varying, 'kindergarten'::character varying, 'elementary'::character varying, 'junior_highschool'::character varying, 'senior_highschool'::character varying])::text[])))
);


--
-- Name: subjects_subject_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.subjects_subject_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: subjects_subject_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.subjects_subject_id_seq OWNED BY public.subjects.subject_id;


--
-- Name: token_blacklist_blacklistedtoken; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.token_blacklist_blacklistedtoken (
    id bigint NOT NULL,
    blacklisted_at timestamp with time zone NOT NULL,
    token_id bigint NOT NULL
);


--
-- Name: token_blacklist_blacklistedtoken_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.token_blacklist_blacklistedtoken ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.token_blacklist_blacklistedtoken_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: token_blacklist_outstandingtoken; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.token_blacklist_outstandingtoken (
    id bigint NOT NULL,
    token text NOT NULL,
    created_at timestamp with time zone,
    expires_at timestamp with time zone NOT NULL,
    user_id integer,
    jti character varying(255) NOT NULL
);


--
-- Name: token_blacklist_outstandingtoken_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.token_blacklist_outstandingtoken ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.token_blacklist_outstandingtoken_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    user_id bigint NOT NULL,
    name character varying(100) NOT NULL,
    email character varying(150) NOT NULL,
    role character varying(30) NOT NULL,
    password character varying(255) NOT NULL,
    profile_picture text,
    current_session_id uuid,
    CONSTRAINT users_role_check CHECK (((role)::text = ANY (ARRAY['super_admin'::text, 'admin'::text, 'registrar'::text, 'teacher'::text, 'accounting'::text, 'guardian'::text])))
);


--
-- Name: users_user_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_user_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_user_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_user_id_seq OWNED BY public.users.user_id;


--
-- Name: academic_calendar_events event_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.academic_calendar_events ALTER COLUMN event_id SET DEFAULT nextval('public.academic_calendar_events_event_id_seq'::regclass);


--
-- Name: audit_logs log_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs ALTER COLUMN log_id SET DEFAULT nextval('public.audit_logs_log_id_seq'::regclass);


--
-- Name: billing_items billing_item_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_items ALTER COLUMN billing_item_id SET DEFAULT nextval('public.billing_items_billing_item_id_seq'::regclass);


--
-- Name: discount_types discount_type_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discount_types ALTER COLUMN discount_type_id SET DEFAULT nextval('public.discount_types_discount_type_id_seq'::regclass);


--
-- Name: enrollment_overrides enrollment_override_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollment_overrides ALTER COLUMN enrollment_override_id SET DEFAULT nextval('public.enrollment_overrides_enrollment_override_id_seq'::regclass);


--
-- Name: enrollment_scholarships enrollment_scholarship_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollment_scholarships ALTER COLUMN enrollment_scholarship_id SET DEFAULT nextval('public.enrollment_scholarships_enrollment_scholarship_id_seq'::regclass);


--
-- Name: enrollments enrollment_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollments ALTER COLUMN enrollment_id SET DEFAULT nextval('public.enrollments_enrollment_id_seq'::regclass);


--
-- Name: fee_schedule_items fee_schedule_item_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_schedule_items ALTER COLUMN fee_schedule_item_id SET DEFAULT nextval('public.fee_schedule_items_fee_schedule_item_id_seq'::regclass);


--
-- Name: fee_schedules fee_schedule_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_schedules ALTER COLUMN fee_schedule_id SET DEFAULT nextval('public.fee_schedules_fee_schedule_id_seq'::regclass);


--
-- Name: grades grade_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grades ALTER COLUMN grade_id SET DEFAULT nextval('public.grades_grade_id_seq'::regclass);


--
-- Name: grading_components grading_component_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grading_components ALTER COLUMN grading_component_id SET DEFAULT nextval('public.grading_components_grading_component_id_seq'::regclass);


--
-- Name: grading_templates grading_template_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grading_templates ALTER COLUMN grading_template_id SET DEFAULT nextval('public.grading_templates_grading_template_id_seq'::regclass);


--
-- Name: guardians guardian_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guardians ALTER COLUMN guardian_id SET DEFAULT nextval('public.guardians_guardian_id_seq'::regclass);


--
-- Name: households household_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.households ALTER COLUMN household_id SET DEFAULT nextval('public.households_household_id_seq'::regclass);


--
-- Name: invoice_installments installment_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_installments ALTER COLUMN installment_id SET DEFAULT nextval('public.invoice_installments_installment_id_seq'::regclass);


--
-- Name: narrative_categories category_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_categories ALTER COLUMN category_id SET DEFAULT nextval('public.narrative_categories_category_id_seq'::regclass);


--
-- Name: narrative_reports report_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_reports ALTER COLUMN report_id SET DEFAULT nextval('public.narrative_reports_report_id_seq'::regclass);


--
-- Name: previous_schools previous_school_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.previous_schools ALTER COLUMN previous_school_id SET DEFAULT nextval('public.previous_schools_previous_school_id_seq'::regclass);


--
-- Name: requirement_types requirement_type_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.requirement_types ALTER COLUMN requirement_type_id SET DEFAULT nextval('public.requirement_types_requirement_type_id_seq'::regclass);


--
-- Name: scholarship_types scholarship_type_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scholarship_types ALTER COLUMN scholarship_type_id SET DEFAULT nextval('public.scholarship_types_scholarship_type_id_seq'::regclass);


--
-- Name: school_settings setting_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_settings ALTER COLUMN setting_id SET DEFAULT nextval('public.school_settings_setting_id_seq'::regclass);


--
-- Name: score_entries score_entry_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.score_entries ALTER COLUMN score_entry_id SET DEFAULT nextval('public.score_entries_score_entry_id_seq'::regclass);


--
-- Name: siblings sibling_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.siblings ALTER COLUMN sibling_id SET DEFAULT nextval('public.siblings_sibling_id_seq'::regclass);


--
-- Name: student_invoice_discounts invoice_discount_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_invoice_discounts ALTER COLUMN invoice_discount_id SET DEFAULT nextval('public.student_invoice_discounts_invoice_discount_id_seq'::regclass);


--
-- Name: student_invoice_items invoice_item_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_invoice_items ALTER COLUMN invoice_item_id SET DEFAULT nextval('public.student_invoice_items_invoice_item_id_seq'::regclass);


--
-- Name: student_invoices invoice_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_invoices ALTER COLUMN invoice_id SET DEFAULT nextval('public.student_invoices_invoice_id_seq'::regclass);


--
-- Name: student_payments payment_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_payments ALTER COLUMN payment_id SET DEFAULT nextval('public.student_payments_payment_id_seq'::regclass);


--
-- Name: student_requirement_submissions student_requirement_submission_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_requirement_submissions ALTER COLUMN student_requirement_submission_id SET DEFAULT nextval('public.student_requirement_submissio_student_requirement_submissio_seq'::regclass);


--
-- Name: student_siblings student_sibling_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_siblings ALTER COLUMN student_sibling_id SET DEFAULT nextval('public.student_siblings_student_sibling_id_seq'::regclass);


--
-- Name: students student_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students ALTER COLUMN student_id SET DEFAULT nextval('public.students_student_id_seq'::regclass);


--
-- Name: subjects subject_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subjects ALTER COLUMN subject_id SET DEFAULT nextval('public.subjects_subject_id_seq'::regclass);


--
-- Name: users user_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN user_id SET DEFAULT nextval('public.users_user_id_seq'::regclass);


--
-- Name: academic_calendar_events academic_calendar_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.academic_calendar_events
    ADD CONSTRAINT academic_calendar_events_pkey PRIMARY KEY (event_id);


--
-- Name: attendance_records attendance_records_enrollment_id_date_a00fb354_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_enrollment_id_date_a00fb354_uniq UNIQUE (enrollment_id, date);


--
-- Name: attendance_records attendance_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_pkey PRIMARY KEY (attendance_id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (log_id);


--
-- Name: auth_group auth_group_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_group
    ADD CONSTRAINT auth_group_name_key UNIQUE (name);


--
-- Name: auth_group_permissions auth_group_permissions_group_id_permission_id_0cd325b0_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_group_permissions
    ADD CONSTRAINT auth_group_permissions_group_id_permission_id_0cd325b0_uniq UNIQUE (group_id, permission_id);


--
-- Name: auth_group_permissions auth_group_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_group_permissions
    ADD CONSTRAINT auth_group_permissions_pkey PRIMARY KEY (id);


--
-- Name: auth_group auth_group_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_group
    ADD CONSTRAINT auth_group_pkey PRIMARY KEY (id);


--
-- Name: auth_permission auth_permission_content_type_id_codename_01ab375a_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_permission
    ADD CONSTRAINT auth_permission_content_type_id_codename_01ab375a_uniq UNIQUE (content_type_id, codename);


--
-- Name: auth_permission auth_permission_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_permission
    ADD CONSTRAINT auth_permission_pkey PRIMARY KEY (id);


--
-- Name: auth_user_groups auth_user_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_user_groups
    ADD CONSTRAINT auth_user_groups_pkey PRIMARY KEY (id);


--
-- Name: auth_user_groups auth_user_groups_user_id_group_id_94350c0c_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_user_groups
    ADD CONSTRAINT auth_user_groups_user_id_group_id_94350c0c_uniq UNIQUE (user_id, group_id);


--
-- Name: auth_user auth_user_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_user
    ADD CONSTRAINT auth_user_pkey PRIMARY KEY (id);


--
-- Name: auth_user_user_permissions auth_user_user_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_user_user_permissions
    ADD CONSTRAINT auth_user_user_permissions_pkey PRIMARY KEY (id);


--
-- Name: auth_user_user_permissions auth_user_user_permissions_user_id_permission_id_14a6b632_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_user_user_permissions
    ADD CONSTRAINT auth_user_user_permissions_user_id_permission_id_14a6b632_uniq UNIQUE (user_id, permission_id);


--
-- Name: auth_user auth_user_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_user
    ADD CONSTRAINT auth_user_username_key UNIQUE (username);


--
-- Name: axes_accessattempt axes_accessattempt_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.axes_accessattempt
    ADD CONSTRAINT axes_accessattempt_pkey PRIMARY KEY (id);


--
-- Name: axes_accessattempt axes_accessattempt_username_ip_address_user_agent_8ea22282_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.axes_accessattempt
    ADD CONSTRAINT axes_accessattempt_username_ip_address_user_agent_8ea22282_uniq UNIQUE (username, ip_address, user_agent);


--
-- Name: axes_accessattemptexpiration axes_accessattemptexpiration_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.axes_accessattemptexpiration
    ADD CONSTRAINT axes_accessattemptexpiration_pkey PRIMARY KEY (access_attempt_id);


--
-- Name: axes_accessfailurelog axes_accessfailurelog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.axes_accessfailurelog
    ADD CONSTRAINT axes_accessfailurelog_pkey PRIMARY KEY (id);


--
-- Name: axes_accesslog axes_accesslog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.axes_accesslog
    ADD CONSTRAINT axes_accesslog_pkey PRIMARY KEY (id);


--
-- Name: billing_items billing_items_item_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_items
    ADD CONSTRAINT billing_items_item_code_key UNIQUE (item_code);


--
-- Name: billing_items billing_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_items
    ADD CONSTRAINT billing_items_pkey PRIMARY KEY (billing_item_id);


--
-- Name: discount_types discount_types_discount_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discount_types
    ADD CONSTRAINT discount_types_discount_code_key UNIQUE (discount_code);


--
-- Name: discount_types discount_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discount_types
    ADD CONSTRAINT discount_types_pkey PRIMARY KEY (discount_type_id);


--
-- Name: django_admin_log django_admin_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.django_admin_log
    ADD CONSTRAINT django_admin_log_pkey PRIMARY KEY (id);


--
-- Name: django_content_type django_content_type_app_label_model_76bd3d3b_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.django_content_type
    ADD CONSTRAINT django_content_type_app_label_model_76bd3d3b_uniq UNIQUE (app_label, model);


--
-- Name: django_content_type django_content_type_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.django_content_type
    ADD CONSTRAINT django_content_type_pkey PRIMARY KEY (id);


--
-- Name: django_migrations django_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.django_migrations
    ADD CONSTRAINT django_migrations_pkey PRIMARY KEY (id);


--
-- Name: django_session django_session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.django_session
    ADD CONSTRAINT django_session_pkey PRIMARY KEY (session_key);


--
-- Name: document_extractions document_extractions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_extractions
    ADD CONSTRAINT document_extractions_pkey PRIMARY KEY (document_extraction_id);


--
-- Name: email_delivery_failures email_delivery_failures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_delivery_failures
    ADD CONSTRAINT email_delivery_failures_pkey PRIMARY KEY (email_delivery_failure_id);


--
-- Name: enrollment_overrides enrollment_overrides_enrollment_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollment_overrides
    ADD CONSTRAINT enrollment_overrides_enrollment_id_unique UNIQUE (enrollment_id);


--
-- Name: enrollment_overrides enrollment_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollment_overrides
    ADD CONSTRAINT enrollment_overrides_pkey PRIMARY KEY (enrollment_override_id);


--
-- Name: enrollment_scholarships enrollment_scholarships_enrollment_id_scholarship_type_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollment_scholarships
    ADD CONSTRAINT enrollment_scholarships_enrollment_id_scholarship_type_id_key UNIQUE (enrollment_id, scholarship_type_id);


--
-- Name: enrollment_scholarships enrollment_scholarships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollment_scholarships
    ADD CONSTRAINT enrollment_scholarships_pkey PRIMARY KEY (enrollment_scholarship_id);


--
-- Name: enrollment_transfers enrollment_transfers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollment_transfers
    ADD CONSTRAINT enrollment_transfers_pkey PRIMARY KEY (transfer_id);


--
-- Name: enrollments enrollments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollments
    ADD CONSTRAINT enrollments_pkey PRIMARY KEY (enrollment_id);


--
-- Name: fee_schedule_items fee_schedule_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_schedule_items
    ADD CONSTRAINT fee_schedule_items_pkey PRIMARY KEY (fee_schedule_item_id);


--
-- Name: fee_schedules fee_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_schedules
    ADD CONSTRAINT fee_schedules_pkey PRIMARY KEY (fee_schedule_id);


--
-- Name: fee_schedules fee_schedules_school_level_grade_level_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_schedules
    ADD CONSTRAINT fee_schedules_school_level_grade_level_key UNIQUE (school_level, grade_level);


--
-- Name: grades grades_enrollment_id_subject_id_grading_period_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grades
    ADD CONSTRAINT grades_enrollment_id_subject_id_grading_period_key UNIQUE (enrollment_id, subject_id, grading_period);


--
-- Name: grades grades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grades
    ADD CONSTRAINT grades_pkey PRIMARY KEY (grade_id);


--
-- Name: grading_components grading_components_grading_template_id_component_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grading_components
    ADD CONSTRAINT grading_components_grading_template_id_component_name_key UNIQUE (grading_template_id, component_name);


--
-- Name: grading_components grading_components_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grading_components
    ADD CONSTRAINT grading_components_pkey PRIMARY KEY (grading_component_id);


--
-- Name: grading_templates grading_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grading_templates
    ADD CONSTRAINT grading_templates_pkey PRIMARY KEY (grading_template_id);


--
-- Name: grading_templates grading_templates_template_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grading_templates
    ADD CONSTRAINT grading_templates_template_name_key UNIQUE (template_name);


--
-- Name: guardians guardians_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guardians
    ADD CONSTRAINT guardians_pkey PRIMARY KEY (guardian_id);


--
-- Name: households households_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.households
    ADD CONSTRAINT households_pkey PRIMARY KEY (household_id);


--
-- Name: invoice_installments invoice_installments_invoice_id_sequence_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_installments
    ADD CONSTRAINT invoice_installments_invoice_id_sequence_key UNIQUE (invoice_id, sequence);


--
-- Name: invoice_installments invoice_installments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_installments
    ADD CONSTRAINT invoice_installments_pkey PRIMARY KEY (installment_id);


--
-- Name: narrative_categories narrative_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_categories
    ADD CONSTRAINT narrative_categories_pkey PRIMARY KEY (category_id);


--
-- Name: narrative_reports narrative_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_reports
    ADD CONSTRAINT narrative_reports_pkey PRIMARY KEY (report_id);


--
-- Name: narrative_reports narrative_reports_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_reports
    ADD CONSTRAINT narrative_reports_uniq UNIQUE (enrollment_id, category_id, grading_period);


--
-- Name: previous_schools previous_schools_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.previous_schools
    ADD CONSTRAINT previous_schools_pkey PRIMARY KEY (previous_school_id);


--
-- Name: requirement_types requirement_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.requirement_types
    ADD CONSTRAINT requirement_types_pkey PRIMARY KEY (requirement_type_id);


--
-- Name: requirement_types requirement_types_requirement_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.requirement_types
    ADD CONSTRAINT requirement_types_requirement_code_key UNIQUE (requirement_code);


--
-- Name: risk_assessment_runs risk_assessment_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risk_assessment_runs
    ADD CONSTRAINT risk_assessment_runs_pkey PRIMARY KEY (run_id);


--
-- Name: scholarship_types scholarship_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scholarship_types
    ADD CONSTRAINT scholarship_types_pkey PRIMARY KEY (scholarship_type_id);


--
-- Name: scholarship_types scholarship_types_scholarship_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scholarship_types
    ADD CONSTRAINT scholarship_types_scholarship_code_key UNIQUE (scholarship_code);


--
-- Name: school_settings school_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_settings
    ADD CONSTRAINT school_settings_pkey PRIMARY KEY (setting_id);


--
-- Name: score_entries score_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.score_entries
    ADD CONSTRAINT score_entries_pkey PRIMARY KEY (score_entry_id);


--
-- Name: section_advisories section_advisories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.section_advisories
    ADD CONSTRAINT section_advisories_pkey PRIMARY KEY (advisory_id);


--
-- Name: section_advisories section_advisories_teacher_user_id_school_y_0c1100eb_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.section_advisories
    ADD CONSTRAINT section_advisories_teacher_user_id_school_y_0c1100eb_uniq UNIQUE (teacher_user_id, school_year, school_level, grade_level, section, strand);


--
-- Name: siblings siblings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.siblings
    ADD CONSTRAINT siblings_pkey PRIMARY KEY (sibling_id);


--
-- Name: student_invoice_discounts student_invoice_discounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_invoice_discounts
    ADD CONSTRAINT student_invoice_discounts_pkey PRIMARY KEY (invoice_discount_id);


--
-- Name: student_invoice_items student_invoice_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_invoice_items
    ADD CONSTRAINT student_invoice_items_pkey PRIMARY KEY (invoice_item_id);


--
-- Name: student_invoices student_invoices_invoice_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_invoices
    ADD CONSTRAINT student_invoices_invoice_no_key UNIQUE (invoice_no);


--
-- Name: student_invoices student_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_invoices
    ADD CONSTRAINT student_invoices_pkey PRIMARY KEY (invoice_id);


--
-- Name: student_payments student_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_payments
    ADD CONSTRAINT student_payments_pkey PRIMARY KEY (payment_id);


--
-- Name: student_requirement_submissions student_requirement_submissio_student_id_requirement_type_i_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_requirement_submissions
    ADD CONSTRAINT student_requirement_submissio_student_id_requirement_type_i_key UNIQUE (student_id, requirement_type_id);


--
-- Name: student_requirement_submissions student_requirement_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_requirement_submissions
    ADD CONSTRAINT student_requirement_submissions_pkey PRIMARY KEY (student_requirement_submission_id);


--
-- Name: student_risk_scores student_risk_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_risk_scores
    ADD CONSTRAINT student_risk_scores_pkey PRIMARY KEY (score_id);


--
-- Name: student_risk_scores student_risk_scores_run_id_student_id_d5a03505_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_risk_scores
    ADD CONSTRAINT student_risk_scores_run_id_student_id_d5a03505_uniq UNIQUE (run_id, student_id);


--
-- Name: student_siblings student_siblings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_siblings
    ADD CONSTRAINT student_siblings_pkey PRIMARY KEY (student_sibling_id);


--
-- Name: student_siblings student_siblings_student_id_sibling_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_siblings
    ADD CONSTRAINT student_siblings_student_id_sibling_student_id_key UNIQUE (student_id, sibling_student_id);


--
-- Name: students students_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_email_key UNIQUE (email);


--
-- Name: students students_lrn_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_lrn_key UNIQUE (lrn);


--
-- Name: students students_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_pkey PRIMARY KEY (student_id);


--
-- Name: students students_student_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_student_number_key UNIQUE (student_number);


--
-- Name: subjects subjects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subjects
    ADD CONSTRAINT subjects_pkey PRIMARY KEY (subject_id);


--
-- Name: subjects subjects_subject_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subjects
    ADD CONSTRAINT subjects_subject_code_key UNIQUE (subject_code);


--
-- Name: token_blacklist_blacklistedtoken token_blacklist_blacklistedtoken_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_blacklist_blacklistedtoken
    ADD CONSTRAINT token_blacklist_blacklistedtoken_pkey PRIMARY KEY (id);


--
-- Name: token_blacklist_blacklistedtoken token_blacklist_blacklistedtoken_token_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_blacklist_blacklistedtoken
    ADD CONSTRAINT token_blacklist_blacklistedtoken_token_id_key UNIQUE (token_id);


--
-- Name: token_blacklist_outstandingtoken token_blacklist_outstandingtoken_jti_hex_d9bdf6f7_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_blacklist_outstandingtoken
    ADD CONSTRAINT token_blacklist_outstandingtoken_jti_hex_d9bdf6f7_uniq UNIQUE (jti);


--
-- Name: token_blacklist_outstandingtoken token_blacklist_outstandingtoken_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_blacklist_outstandingtoken
    ADD CONSTRAINT token_blacklist_outstandingtoken_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (user_id);


--
-- Name: attendance_records_enrollment_id_3c51c395; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attendance_records_enrollment_id_3c51c395 ON public.attendance_records USING btree (enrollment_id);


--
-- Name: audit_logs_module_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_module_idx ON public.audit_logs USING btree (module);


--
-- Name: audit_logs_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_occurred_at_idx ON public.audit_logs USING btree (occurred_at);


--
-- Name: audit_logs_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_status_idx ON public.audit_logs USING btree (status);


--
-- Name: audit_logs_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_user_id_idx ON public.audit_logs USING btree (user_id);


--
-- Name: audit_logs_user_role_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_user_role_idx ON public.audit_logs USING btree (user_role);


--
-- Name: auth_group_name_a6ea08ec_like; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_group_name_a6ea08ec_like ON public.auth_group USING btree (name varchar_pattern_ops);


--
-- Name: auth_group_permissions_group_id_b120cbf9; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_group_permissions_group_id_b120cbf9 ON public.auth_group_permissions USING btree (group_id);


--
-- Name: auth_group_permissions_permission_id_84c5c92e; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_group_permissions_permission_id_84c5c92e ON public.auth_group_permissions USING btree (permission_id);


--
-- Name: auth_permission_content_type_id_2f476e4b; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_permission_content_type_id_2f476e4b ON public.auth_permission USING btree (content_type_id);


--
-- Name: auth_user_groups_group_id_97559544; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_user_groups_group_id_97559544 ON public.auth_user_groups USING btree (group_id);


--
-- Name: auth_user_groups_user_id_6a12ed8b; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_user_groups_user_id_6a12ed8b ON public.auth_user_groups USING btree (user_id);


--
-- Name: auth_user_user_permissions_permission_id_1fbb5f2c; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_user_user_permissions_permission_id_1fbb5f2c ON public.auth_user_user_permissions USING btree (permission_id);


--
-- Name: auth_user_user_permissions_user_id_a95ead1b; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_user_user_permissions_user_id_a95ead1b ON public.auth_user_user_permissions USING btree (user_id);


--
-- Name: auth_user_username_6821ab7c_like; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_user_username_6821ab7c_like ON public.auth_user USING btree (username varchar_pattern_ops);


--
-- Name: axes_accessattempt_ip_address_10922d9c; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX axes_accessattempt_ip_address_10922d9c ON public.axes_accessattempt USING btree (ip_address);


--
-- Name: axes_accessattempt_user_agent_ad89678b; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX axes_accessattempt_user_agent_ad89678b ON public.axes_accessattempt USING btree (user_agent);


--
-- Name: axes_accessattempt_user_agent_ad89678b_like; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX axes_accessattempt_user_agent_ad89678b_like ON public.axes_accessattempt USING btree (user_agent varchar_pattern_ops);


--
-- Name: axes_accessattempt_username_3f2d4ca0; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX axes_accessattempt_username_3f2d4ca0 ON public.axes_accessattempt USING btree (username);


--
-- Name: axes_accessattempt_username_3f2d4ca0_like; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX axes_accessattempt_username_3f2d4ca0_like ON public.axes_accessattempt USING btree (username varchar_pattern_ops);


--
-- Name: axes_accessfailurelog_ip_address_2e9f5a7f; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX axes_accessfailurelog_ip_address_2e9f5a7f ON public.axes_accessfailurelog USING btree (ip_address);


--
-- Name: axes_accessfailurelog_user_agent_ea145dda; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX axes_accessfailurelog_user_agent_ea145dda ON public.axes_accessfailurelog USING btree (user_agent);


--
-- Name: axes_accessfailurelog_user_agent_ea145dda_like; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX axes_accessfailurelog_user_agent_ea145dda_like ON public.axes_accessfailurelog USING btree (user_agent varchar_pattern_ops);


--
-- Name: axes_accessfailurelog_username_a8b7e8a4; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX axes_accessfailurelog_username_a8b7e8a4 ON public.axes_accessfailurelog USING btree (username);


--
-- Name: axes_accessfailurelog_username_a8b7e8a4_like; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX axes_accessfailurelog_username_a8b7e8a4_like ON public.axes_accessfailurelog USING btree (username varchar_pattern_ops);


--
-- Name: axes_accesslog_ip_address_86b417e5; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX axes_accesslog_ip_address_86b417e5 ON public.axes_accesslog USING btree (ip_address);


--
-- Name: axes_accesslog_user_agent_0e659004; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX axes_accesslog_user_agent_0e659004 ON public.axes_accesslog USING btree (user_agent);


--
-- Name: axes_accesslog_user_agent_0e659004_like; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX axes_accesslog_user_agent_0e659004_like ON public.axes_accesslog USING btree (user_agent varchar_pattern_ops);


--
-- Name: axes_accesslog_username_df93064b; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX axes_accesslog_username_df93064b ON public.axes_accesslog USING btree (username);


--
-- Name: axes_accesslog_username_df93064b_like; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX axes_accesslog_username_df93064b_like ON public.axes_accesslog USING btree (username varchar_pattern_ops);


--
-- Name: django_admin_log_content_type_id_c4bce8eb; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX django_admin_log_content_type_id_c4bce8eb ON public.django_admin_log USING btree (content_type_id);


--
-- Name: django_admin_log_user_id_c564eba6; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX django_admin_log_user_id_c564eba6 ON public.django_admin_log USING btree (user_id);


--
-- Name: django_session_expire_date_a5c62663; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX django_session_expire_date_a5c62663 ON public.django_session USING btree (expire_date);


--
-- Name: django_session_session_key_c0390e0f_like; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX django_session_session_key_c0390e0f_like ON public.django_session USING btree (session_key varchar_pattern_ops);


--
-- Name: document_ex_student_78f1c7_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_ex_student_78f1c7_idx ON public.document_extractions USING btree (student_id, requirement_code);


--
-- Name: document_extractions_requirement_code_e305d275; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_extractions_requirement_code_e305d275 ON public.document_extractions USING btree (requirement_code);


--
-- Name: document_extractions_requirement_code_e305d275_like; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_extractions_requirement_code_e305d275_like ON public.document_extractions USING btree (requirement_code varchar_pattern_ops);


--
-- Name: document_extractions_student_id_79696111; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_extractions_student_id_79696111 ON public.document_extractions USING btree (student_id);


--
-- Name: enrollment_transfers_enrollment_id_7d9260fd; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX enrollment_transfers_enrollment_id_7d9260fd ON public.enrollment_transfers USING btree (enrollment_id);


--
-- Name: guardians_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX guardians_user_id_idx ON public.guardians USING btree (user_id);


--
-- Name: idx_enrollment_overrides_enrollment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_enrollment_overrides_enrollment_id ON public.enrollment_overrides USING btree (enrollment_id);


--
-- Name: idx_fee_schedule_items_schedule; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fee_schedule_items_schedule ON public.fee_schedule_items USING btree (fee_schedule_id);


--
-- Name: idx_invoice_installments_invoice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_installments_invoice ON public.invoice_installments USING btree (invoice_id);


--
-- Name: idx_score_entries_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_score_entries_lookup ON public.score_entries USING btree (enrollment_id, subject_id, grading_component_id, grading_period);


--
-- Name: section_advisories_teacher_user_id_3e169d9d; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX section_advisories_teacher_user_id_3e169d9d ON public.section_advisories USING btree (teacher_user_id);


--
-- Name: student_risk_scores_enrollment_id_152ba7f9; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX student_risk_scores_enrollment_id_152ba7f9 ON public.student_risk_scores USING btree (enrollment_id);


--
-- Name: student_risk_scores_run_id_b25982f7; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX student_risk_scores_run_id_b25982f7 ON public.student_risk_scores USING btree (run_id);


--
-- Name: student_risk_scores_student_id_3accb086; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX student_risk_scores_student_id_3accb086 ON public.student_risk_scores USING btree (student_id);


--
-- Name: students_last_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX students_last_name_idx ON public.students USING btree (last_name);


--
-- Name: students_lrn_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX students_lrn_idx ON public.students USING btree (lrn);


--
-- Name: students_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX students_status_idx ON public.students USING btree (status);


--
-- Name: students_student_number_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX students_student_number_idx ON public.students USING btree (student_number);


--
-- Name: token_blacklist_outstandingtoken_jti_hex_d9bdf6f7_like; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX token_blacklist_outstandingtoken_jti_hex_d9bdf6f7_like ON public.token_blacklist_outstandingtoken USING btree (jti varchar_pattern_ops);


--
-- Name: token_blacklist_outstandingtoken_user_id_83bc629a; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX token_blacklist_outstandingtoken_user_id_83bc629a ON public.token_blacklist_outstandingtoken USING btree (user_id);


--
-- Name: uq_enrollments_student_sy; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_enrollments_student_sy ON public.enrollments USING btree (student_id, school_year) WHERE ((enrollment_status)::text = ANY ((ARRAY['enrolled'::character varying, 'pending'::character varying])::text[]));


--
-- Name: uq_guardian_primary_per_student; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_guardian_primary_per_student ON public.guardians USING btree (student_id) WHERE (is_primary_contact = true);


--
-- Name: uq_student_siblings_pair; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_student_siblings_pair ON public.student_siblings USING btree (LEAST(student_id, sibling_student_id), GREATEST(student_id, sibling_student_id));


--
-- Name: billing_items validate_billing_item_parent_category; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validate_billing_item_parent_category BEFORE INSERT OR UPDATE ON public.billing_items FOR EACH ROW EXECUTE FUNCTION public.trg_billing_item_parent_category_match();


--
-- Name: grades validate_grading_period_on_grades; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validate_grading_period_on_grades BEFORE INSERT OR UPDATE ON public.grades FOR EACH ROW EXECUTE FUNCTION public.trg_validate_grading_period();


--
-- Name: score_entries validate_grading_period_on_scores; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validate_grading_period_on_scores BEFORE INSERT OR UPDATE ON public.score_entries FOR EACH ROW EXECUTE FUNCTION public.trg_validate_grading_period();


--
-- Name: attendance_records attendance_records_enrollment_id_3c51c395_fk_enrollmen; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_enrollment_id_3c51c395_fk_enrollmen FOREIGN KEY (enrollment_id) REFERENCES public.enrollments(enrollment_id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: auth_group_permissions auth_group_permissio_permission_id_84c5c92e_fk_auth_perm; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_group_permissions
    ADD CONSTRAINT auth_group_permissio_permission_id_84c5c92e_fk_auth_perm FOREIGN KEY (permission_id) REFERENCES public.auth_permission(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: auth_group_permissions auth_group_permissions_group_id_b120cbf9_fk_auth_group_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_group_permissions
    ADD CONSTRAINT auth_group_permissions_group_id_b120cbf9_fk_auth_group_id FOREIGN KEY (group_id) REFERENCES public.auth_group(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: auth_permission auth_permission_content_type_id_2f476e4b_fk_django_co; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_permission
    ADD CONSTRAINT auth_permission_content_type_id_2f476e4b_fk_django_co FOREIGN KEY (content_type_id) REFERENCES public.django_content_type(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: auth_user_groups auth_user_groups_group_id_97559544_fk_auth_group_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_user_groups
    ADD CONSTRAINT auth_user_groups_group_id_97559544_fk_auth_group_id FOREIGN KEY (group_id) REFERENCES public.auth_group(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: auth_user_groups auth_user_groups_user_id_6a12ed8b_fk_auth_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_user_groups
    ADD CONSTRAINT auth_user_groups_user_id_6a12ed8b_fk_auth_user_id FOREIGN KEY (user_id) REFERENCES public.auth_user(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: auth_user_user_permissions auth_user_user_permi_permission_id_1fbb5f2c_fk_auth_perm; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_user_user_permissions
    ADD CONSTRAINT auth_user_user_permi_permission_id_1fbb5f2c_fk_auth_perm FOREIGN KEY (permission_id) REFERENCES public.auth_permission(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: auth_user_user_permissions auth_user_user_permissions_user_id_a95ead1b_fk_auth_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_user_user_permissions
    ADD CONSTRAINT auth_user_user_permissions_user_id_a95ead1b_fk_auth_user_id FOREIGN KEY (user_id) REFERENCES public.auth_user(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: axes_accessattemptexpiration axes_accessattemptex_access_attempt_id_6b73a47a_fk_axes_acce; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.axes_accessattemptexpiration
    ADD CONSTRAINT axes_accessattemptex_access_attempt_id_6b73a47a_fk_axes_acce FOREIGN KEY (access_attempt_id) REFERENCES public.axes_accessattempt(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: billing_items billing_items_parent_billing_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_items
    ADD CONSTRAINT billing_items_parent_billing_item_id_fkey FOREIGN KEY (parent_billing_item_id) REFERENCES public.billing_items(billing_item_id) ON DELETE RESTRICT;


--
-- Name: django_admin_log django_admin_log_content_type_id_c4bce8eb_fk_django_co; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.django_admin_log
    ADD CONSTRAINT django_admin_log_content_type_id_c4bce8eb_fk_django_co FOREIGN KEY (content_type_id) REFERENCES public.django_content_type(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: django_admin_log django_admin_log_user_id_c564eba6_fk_auth_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.django_admin_log
    ADD CONSTRAINT django_admin_log_user_id_c564eba6_fk_auth_user_id FOREIGN KEY (user_id) REFERENCES public.auth_user(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: document_extractions document_extractions_student_id_79696111_fk_students_student_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_extractions
    ADD CONSTRAINT document_extractions_student_id_79696111_fk_students_student_id FOREIGN KEY (student_id) REFERENCES public.students(student_id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: enrollment_overrides enrollment_overrides_enrollment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollment_overrides
    ADD CONSTRAINT enrollment_overrides_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES public.enrollments(enrollment_id) ON DELETE CASCADE;


--
-- Name: enrollment_scholarships enrollment_scholarships_enrollment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollment_scholarships
    ADD CONSTRAINT enrollment_scholarships_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES public.enrollments(enrollment_id) ON DELETE CASCADE;


--
-- Name: enrollment_scholarships enrollment_scholarships_scholarship_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollment_scholarships
    ADD CONSTRAINT enrollment_scholarships_scholarship_type_id_fkey FOREIGN KEY (scholarship_type_id) REFERENCES public.scholarship_types(scholarship_type_id) ON DELETE RESTRICT;


--
-- Name: enrollment_transfers enrollment_transfers_enrollment_id_7d9260fd_fk_enrollmen; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollment_transfers
    ADD CONSTRAINT enrollment_transfers_enrollment_id_7d9260fd_fk_enrollmen FOREIGN KEY (enrollment_id) REFERENCES public.enrollments(enrollment_id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: enrollments enrollments_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollments
    ADD CONSTRAINT enrollments_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(student_id) ON DELETE CASCADE;


--
-- Name: fee_schedule_items fee_schedule_items_fee_schedule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_schedule_items
    ADD CONSTRAINT fee_schedule_items_fee_schedule_id_fkey FOREIGN KEY (fee_schedule_id) REFERENCES public.fee_schedules(fee_schedule_id) ON DELETE CASCADE;


--
-- Name: student_invoices fk_invoice_enrollment; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_invoices
    ADD CONSTRAINT fk_invoice_enrollment FOREIGN KEY (enrollment_id) REFERENCES public.enrollments(enrollment_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;


--
-- Name: grades grades_enrollment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grades
    ADD CONSTRAINT grades_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES public.enrollments(enrollment_id) ON DELETE CASCADE;


--
-- Name: grades grades_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grades
    ADD CONSTRAINT grades_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(subject_id) ON DELETE RESTRICT;


--
-- Name: grading_components grading_components_grading_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grading_components
    ADD CONSTRAINT grading_components_grading_template_id_fkey FOREIGN KEY (grading_template_id) REFERENCES public.grading_templates(grading_template_id) ON DELETE CASCADE;


--
-- Name: guardians guardians_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guardians
    ADD CONSTRAINT guardians_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(student_id) ON DELETE CASCADE;


--
-- Name: invoice_installments invoice_installments_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_installments
    ADD CONSTRAINT invoice_installments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.student_invoices(invoice_id) ON DELETE CASCADE;


--
-- Name: narrative_reports narrative_reports_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_reports
    ADD CONSTRAINT narrative_reports_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.narrative_categories(category_id) ON DELETE RESTRICT;


--
-- Name: narrative_reports narrative_reports_enrollment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_reports
    ADD CONSTRAINT narrative_reports_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES public.enrollments(enrollment_id) ON DELETE CASCADE;


--
-- Name: previous_schools previous_schools_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.previous_schools
    ADD CONSTRAINT previous_schools_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(student_id) ON DELETE CASCADE;


--
-- Name: score_entries score_entries_enrollment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.score_entries
    ADD CONSTRAINT score_entries_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES public.enrollments(enrollment_id) ON DELETE CASCADE;


--
-- Name: score_entries score_entries_grading_component_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.score_entries
    ADD CONSTRAINT score_entries_grading_component_id_fkey FOREIGN KEY (grading_component_id) REFERENCES public.grading_components(grading_component_id) ON DELETE RESTRICT;


--
-- Name: score_entries score_entries_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.score_entries
    ADD CONSTRAINT score_entries_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(subject_id) ON DELETE RESTRICT;


--
-- Name: siblings siblings_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.siblings
    ADD CONSTRAINT siblings_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(student_id) ON DELETE CASCADE;


--
-- Name: student_invoice_discounts student_invoice_discounts_discount_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_invoice_discounts
    ADD CONSTRAINT student_invoice_discounts_discount_type_id_fkey FOREIGN KEY (discount_type_id) REFERENCES public.discount_types(discount_type_id) ON DELETE SET NULL;


--
-- Name: student_invoice_discounts student_invoice_discounts_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_invoice_discounts
    ADD CONSTRAINT student_invoice_discounts_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.student_invoices(invoice_id) ON DELETE CASCADE;


--
-- Name: student_invoice_items student_invoice_items_billing_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_invoice_items
    ADD CONSTRAINT student_invoice_items_billing_item_id_fkey FOREIGN KEY (billing_item_id) REFERENCES public.billing_items(billing_item_id) ON DELETE SET NULL;


--
-- Name: student_invoice_items student_invoice_items_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_invoice_items
    ADD CONSTRAINT student_invoice_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.student_invoices(invoice_id) ON DELETE CASCADE;


--
-- Name: student_invoices student_invoices_enrollment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_invoices
    ADD CONSTRAINT student_invoices_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES public.enrollments(enrollment_id) ON DELETE CASCADE;


--
-- Name: student_payments student_payments_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_payments
    ADD CONSTRAINT student_payments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.student_invoices(invoice_id) ON DELETE CASCADE;


--
-- Name: student_requirement_submissions student_requirement_submissions_requirement_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_requirement_submissions
    ADD CONSTRAINT student_requirement_submissions_requirement_type_id_fkey FOREIGN KEY (requirement_type_id) REFERENCES public.requirement_types(requirement_type_id) ON DELETE RESTRICT;


--
-- Name: student_requirement_submissions student_requirement_submissions_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_requirement_submissions
    ADD CONSTRAINT student_requirement_submissions_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(student_id) ON DELETE CASCADE;


--
-- Name: student_risk_scores student_risk_scores_run_id_b25982f7_fk_risk_asse; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_risk_scores
    ADD CONSTRAINT student_risk_scores_run_id_b25982f7_fk_risk_asse FOREIGN KEY (run_id) REFERENCES public.risk_assessment_runs(run_id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: student_siblings student_siblings_sibling_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_siblings
    ADD CONSTRAINT student_siblings_sibling_student_id_fkey FOREIGN KEY (sibling_student_id) REFERENCES public.students(student_id) ON DELETE CASCADE;


--
-- Name: student_siblings student_siblings_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_siblings
    ADD CONSTRAINT student_siblings_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(student_id) ON DELETE CASCADE;


--
-- Name: students students_household_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(household_id) ON DELETE SET NULL;


--
-- Name: subjects subjects_grading_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subjects
    ADD CONSTRAINT subjects_grading_template_id_fkey FOREIGN KEY (grading_template_id) REFERENCES public.grading_templates(grading_template_id) ON DELETE SET NULL;


--
-- Name: token_blacklist_blacklistedtoken token_blacklist_blacklistedtoken_token_id_3cc7fe56_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_blacklist_blacklistedtoken
    ADD CONSTRAINT token_blacklist_blacklistedtoken_token_id_3cc7fe56_fk FOREIGN KEY (token_id) REFERENCES public.token_blacklist_outstandingtoken(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: token_blacklist_outstandingtoken token_blacklist_outs_user_id_83bc629a_fk_auth_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_blacklist_outstandingtoken
    ADD CONSTRAINT token_blacklist_outs_user_id_83bc629a_fk_auth_user FOREIGN KEY (user_id) REFERENCES public.auth_user(id) DEFERRABLE INITIALLY DEFERRED;


--
-- PostgreSQL database dump complete
--

