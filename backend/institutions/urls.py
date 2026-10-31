from django.urls import path

from institutions.account_management import (
    AccountManagementConfigView,
    ManagedAccountDeactivateView,
    ManagedAccountListCreateView,
    ManagedAccountResendActivationView,
    ManagedAmbulanceListView,
)
from institutions.views import DestinationListView

urlpatterns = [
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
        "management/config/",
        AccountManagementConfigView.as_view(),
        name="account-management-config",
    ),
]
