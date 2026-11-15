from django.urls import path

from institutions.geocoding_views import GeocodingView
from institutions.system_management import (
    SystemInstitutionDeactivateView,
    SystemInstitutionDetailView,
    SystemInstitutionListCreateView,
    SystemInstitutionReactivateView,
)

urlpatterns = [
    path("geocoding/", GeocodingView.as_view(), name="system-geocoding"),
    path(
        "institutions/", SystemInstitutionListCreateView.as_view(), name="system-institution-list"
    ),
    path(
        "institutions/<uuid:institution_id>/",
        SystemInstitutionDetailView.as_view(),
        name="system-institution-detail",
    ),
    path(
        "institutions/<uuid:institution_id>/deactivate/",
        SystemInstitutionDeactivateView.as_view(),
        name="system-institution-deactivate",
    ),
    path(
        "institutions/<uuid:institution_id>/reactivate/",
        SystemInstitutionReactivateView.as_view(),
        name="system-institution-reactivate",
    ),
]
