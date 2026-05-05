from django.db import models

class User(models.Model):
    user_id = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=100)
    email = models.EmailField(unique=True)
    role = models.CharField(max_length=30)
    password = models.CharField(max_length=255)

    class Meta:
        db_table = "users"
        managed = False  # IMPORTANT: do not let Django manage this table