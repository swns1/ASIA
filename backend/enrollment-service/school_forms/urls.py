from django.urls import path

from .views import CORView, SF1View, SF2View, SF9View, SF10View

urlpatterns = [
    path("school-forms/sf1/", SF1View.as_view(), name="school-form-sf1"),
    path("school-forms/sf2/", SF2View.as_view(), name="school-form-sf2"),
    path("school-forms/sf9/<int:enrollment_id>/", SF9View.as_view(), name="school-form-sf9"),
    path("school-forms/sf10/<int:student_id>/", SF10View.as_view(), name="school-form-sf10"),
    path("school-forms/cor/<int:enrollment_id>/", CORView.as_view(), name="school-form-cor"),
]
