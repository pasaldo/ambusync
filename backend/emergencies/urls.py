from django.urls import path

from emergencies.views import EmergencyArrivalView, EmergencyDetailView, EmergencyListCreateView

urlpatterns = [
    path("", EmergencyListCreateView.as_view(), name="emergency-list-create"),
    path("<uuid:emergency_id>/", EmergencyDetailView.as_view(), name="emergency-detail"),
    path(
        "<uuid:emergency_id>/arrival/",
        EmergencyArrivalView.as_view(),
        name="emergency-arrival",
    ),
]
