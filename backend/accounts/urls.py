from django.urls import path

from accounts.views import CsrfTokenView, LoginView, LogoutView, MeView
from institutions.account_management import AccountActivationView

urlpatterns = [
    path("csrf/", CsrfTokenView.as_view(), name="csrf"),
    path("login/", LoginView.as_view(), name="login"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("me/", MeView.as_view(), name="me"),
    path("activate/", AccountActivationView.as_view(), name="activate-account"),
]
