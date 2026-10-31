from django.urls import path

from emergencies.views import (
    EmergencyArrivalView,
    EmergencyCancelView,
    EmergencyCloseView,
    EmergencyDetailView,
    EmergencyListCreateView,
    EmergencyTransferStartView,
)

urlpatterns = [
    path("", EmergencyListCreateView.as_view(), name="emergency-list-create"),
    path("<uuid:emergency_id>/", EmergencyDetailView.as_view(), name="emergency-detail"),
    path(
        "<uuid:emergency_id>/arrival/",
        EmergencyArrivalView.as_view(),
        name="emergency-arrival",
    ),
    path(
        "<uuid:emergency_id>/transfer-start/",
        EmergencyTransferStartView.as_view(),
        name="emergency-transfer-start",
    ),
    path(
        "<uuid:emergency_id>/cancel/",
        EmergencyCancelView.as_view(),
        name="emergency-cancel",
    ),
    path(
        "<uuid:emergency_id>/close/",
        EmergencyCloseView.as_view(),
        name="emergency-close",
    ),
]
