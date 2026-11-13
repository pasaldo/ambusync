from django.urls import path

from emergencies.destination_change import EmergencyDestinationChangeView
from emergencies.milestones import EmergencyPreparationView, EmergencyReadView
from emergencies.patient_records import PatientDeactivateView
from emergencies.updates import (
    EmergencyMeasurementsView,
    EmergencyRectificationView,
    EmergencyUpdateView,
)
from emergencies.views import (
    EmergencyArrivalView,
    EmergencyCancelView,
    EmergencyCloseView,
    EmergencyDetailView,
    EmergencyListCreateView,
    EmergencyTransferStartView,
)

urlpatterns = [
    path(
        "<uuid:emergency_id>/patient-deactivate/",
        PatientDeactivateView.as_view(),
        name="patient-deactivate",
    ),
    path(
        "<uuid:emergency_id>/change-destination/",
        EmergencyDestinationChangeView.as_view(),
        name="emergency-change-destination",
    ),
    path("<uuid:emergency_id>/read/", EmergencyReadView.as_view(), name="emergency-read"),
    path(
        "<uuid:emergency_id>/prepare/", EmergencyPreparationView.as_view(), name="emergency-prepare"
    ),
    path("<uuid:emergency_id>/update/", EmergencyUpdateView.as_view(), name="emergency-update"),
    path(
        "<uuid:emergency_id>/measurements/",
        EmergencyMeasurementsView.as_view(),
        name="emergency-measurements",
    ),
    path(
        "<uuid:emergency_id>/measurements/rectify/",
        EmergencyRectificationView.as_view(),
        name="emergency-rectify",
    ),
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
