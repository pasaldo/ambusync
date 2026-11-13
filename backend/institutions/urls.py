from django.urls import path

from audit.views import AdministrativeAuditView
from institutions.account_management import (
    AccountManagementConfigView,
    ManagedAccountAssignmentView,
    ManagedAccountDeactivateView,
    ManagedAccountListCreateView,
    ManagedAccountResendActivationView,
    ManagedAmbulanceCreateView,
    ManagedAmbulanceListView,
)
from institutions.unit_management import ManagedAmbulanceDeactivateView
from institutions.views import DestinationListView

urlpatterns = [
    path("audit/", AdministrativeAuditView.as_view(), name="institution-administrative-audit"),
    path("destinations/", DestinationListView.as_view(), name="destination-list"),
    path(
        "management/accounts/",
        ManagedAccountListCreateView.as_view(),
        name="managed-account-list-create",
    ),
    path(
        "management/accounts/<int:user_id>/deactivate/",
        ManagedAccountDeactivateView.as_view(),
        name="managed-account-deactivate",
    ),
    path(
        "management/accounts/<int:user_id>/resend-activation/",
        ManagedAccountResendActivationView.as_view(),
        name="managed-account-resend-activation",
    ),
    path(
        "management/ambulances/", ManagedAmbulanceListView.as_view(), name="managed-ambulance-list"
    ),
    path(
        "management/ambulances/create/",
        ManagedAmbulanceCreateView.as_view(),
        name="managed-ambulance-create",
    ),
    path(
        "management/ambulances/<uuid:ambulance_id>/deactivate/",
        ManagedAmbulanceDeactivateView.as_view(),
        name="managed-ambulance-deactivate",
    ),
    path(
        "management/accounts/<int:user_id>/assignment/",
        ManagedAccountAssignmentView.as_view(),
        name="managed-account-assignment",
    ),
    path(
        "management/config/",
        AccountManagementConfigView.as_view(),
        name="account-management-config",
    ),
]
