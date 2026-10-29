from django.urls import path

from emergencies.views import EmergencyDetailView, EmergencyListCreateView

urlpatterns = [
    path("", EmergencyListCreateView.as_view(), name="emergency-list-create"),
    path("<uuid:emergency_id>/", EmergencyDetailView.as_view(), name="emergency-detail"),
]
