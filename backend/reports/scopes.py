from institutions.models import InstitutionMembership


def receiver_institution_ids(user):
    if (
        not user.is_active
        or user.groups.filter(name="system_admin").exists()
        or not user.groups.filter(name="urgencias").exists()
    ):
        return InstitutionMembership.objects.none().values_list("institution_id", flat=True)
    return InstitutionMembership.objects.filter(
        user=user, active=True, institution__enabled=True
    ).values_list("institution_id", flat=True)


def has_report_permission(user):
    return (
        user.is_active
        and not user.groups.filter(name="system_admin").exists()
        and user.groups.filter(name="urgencias").exists()
        and user.groups.filter(name="view_reports").exists()
    )
