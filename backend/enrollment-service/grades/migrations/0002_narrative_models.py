from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("grades", "0001_initial"),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
                CREATE TABLE IF NOT EXISTS narrative_categories (
                    category_id bigserial    PRIMARY KEY,
                    name        varchar(150) NOT NULL,
                    description text,
                    sort_order  integer      NOT NULL DEFAULT 0,
                    is_active   boolean      NOT NULL DEFAULT true
                );

                CREATE TABLE IF NOT EXISTS narrative_reports (
                    report_id      bigserial   PRIMARY KEY,
                    enrollment_id  bigint      NOT NULL REFERENCES enrollments(enrollment_id) ON DELETE CASCADE,
                    category_id    bigint      NOT NULL REFERENCES narrative_categories(category_id) ON DELETE RESTRICT,
                    grading_period varchar(20) NOT NULL,
                    rating         varchar(20) NOT NULL,
                    recorded_at    timestamptz NOT NULL DEFAULT NOW(),
                    CONSTRAINT narrative_reports_uniq
                        UNIQUE (enrollment_id, category_id, grading_period)
                );
            """,
            reverse_sql="""
                DROP TABLE IF EXISTS narrative_reports;
                DROP TABLE IF EXISTS narrative_categories;
            """,
        ),
        migrations.CreateModel(
            name="NarrativeCategory",
            fields=[
                ("category_id", models.BigAutoField(primary_key=True, serialize=False)),
                ("name",        models.CharField(max_length=150)),
                ("description", models.TextField(blank=True, null=True)),
                ("sort_order",  models.IntegerField(default=0)),
                ("is_active",   models.BooleanField(default=True)),
            ],
            options={
                "db_table": "narrative_categories",
                "ordering": ["sort_order", "name"],
                "managed":  False,
            },
        ),
        migrations.CreateModel(
            name="NarrativeReport",
            fields=[
                ("report_id",      models.BigAutoField(primary_key=True, serialize=False)),
                ("grading_period", models.CharField(max_length=20)),
                ("rating", models.CharField(
                    max_length=20,
                    choices=[
                        ("outstanding",       "Outstanding"),
                        ("satisfactory",      "Satisfactory"),
                        ("needs_improvement", "Needs Improvement"),
                    ],
                )),
                ("recorded_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "db_table": "narrative_reports",
                "managed":  False,
            },
        ),
    ]