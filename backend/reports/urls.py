from django.urls import path

from reports.views import EmergencyReportDetailView, EmergencyReportListView

urlpatterns = [
    path("emergencies/", EmergencyReportListView.as_view(), name="report-emergencies"),
    path(
        "emergencies/<uuid:emergency_id>/",
        EmergencyReportDetailView.as_view(),
        name="report-emergency-detail",
    ),
]
