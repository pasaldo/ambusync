"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""

from django.contrib import admin
from django.urls import include, path

from emergencies.patient_records import PatientListView, PatientUpdateView
from institutions.symptom_views import SymptomDeactivateView, SymptomListCreateView

urlpatterns = [
    path("api/v1/reports/", include("reports.urls")),
    path("api/v1/patients/", PatientListView.as_view(), name="patients"),
    path(
        "api/v1/patients/<uuid:patient_id>/update/",
        PatientUpdateView.as_view(),
        name="patient-update",
    ),
    path("api/v1/institutions/symptoms/", SymptomListCreateView.as_view(), name="symptoms"),
    path(
        "api/v1/institutions/symptoms/<uuid:symptom_id>/deactivate/",
        SymptomDeactivateView.as_view(),
        name="symptom-deactivate",
    ),
    path("admin/", admin.site.urls),
    path("api/v1/auth/", include("accounts.urls")),
    path("api/v1/institutions/", include("institutions.urls")),
    path("api/v1/system/", include("institutions.system_urls")),
    path("api/v1/emergencies/", include("emergencies.urls")),
]
