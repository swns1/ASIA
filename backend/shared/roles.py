ROLE_CHOICES = [
    ("super_admin", "Super Admin"),
    ("admin",       "Admin"),
    ("registrar",   "Registrar"),
    ("teacher",     "Teacher"),
    ("accounting",  "Accounting"),
    ("guardian",    "Guardian"),
]

# Every role but the guardian: the frontend's STAFF_ALL (utils/auth.js).
STAFF_ROLES = frozenset(role for role, _label in ROLE_CHOICES if role != "guardian")
