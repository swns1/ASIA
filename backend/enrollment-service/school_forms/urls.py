from django.urls import path

from .views import SF1View, SF2View, SF10View

urlpatterns = [
    path("school-forms/sf1/", SF1View.as_view(), name="school-form-sf1"),
    path("school-forms/sf2/", SF2View.as_view(), name="school-form-sf2"),
    path("school-forms/sf10/<int:student_id>/", SF10View.as_view(), name="school-form-sf10"),
]
