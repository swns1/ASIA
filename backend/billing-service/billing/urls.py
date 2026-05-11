from rest_framework.routers import DefaultRouter
from .views import (
    FeeScheduleViewSet, FeeScheduleItemViewSet, DiscountTypeViewSet,
    StudentInvoiceViewSet, StudentPaymentViewSet, InvoiceInstallmentViewSet,
)

router = DefaultRouter()
router.register(r"fee-schedules",      FeeScheduleViewSet,        basename="fee-schedule")
router.register(r"fee-schedule-items", FeeScheduleItemViewSet,    basename="fee-schedule-item")
router.register(r"discount-types",     DiscountTypeViewSet,       basename="discount-type")
router.register(r"invoices",           StudentInvoiceViewSet,     basename="invoice")
router.register(r"payments",           StudentPaymentViewSet,     basename="payment")
router.register(r"installments",       InvoiceInstallmentViewSet, basename="installment")

urlpatterns = router.urls