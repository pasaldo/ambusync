"""Current, institution-scoped references; never reconstructed historical names."""

from uuid import UUID

from institutions.models import Ambulance, AmbulanceAssignment, InstitutionMembership


def numeric_id(value):
    try:
        parsed = int(value)
        return parsed if 0 < parsed <= 9223372036854775807 else None
    except ValueError, TypeError:
        return None


def unit_id(value):
    try:
        return UUID(str(value))
    except ValueError, TypeError:
        return None


def administrative_displays(events):
    institutions = {row.institution_id for row in events}
    assignment_ids = {
        numeric_id(row.object_id) for row in events if row.object_type == "ambulance_assignment"
    } - {None}
    assignments = {
        (row["ambulance__institution_id"], row["pk"]): row
        for row in AmbulanceAssignment.objects.filter(
            pk__in=assignment_ids, ambulance__institution_id__in=institutions
        ).values("pk", "user_id", "ambulance_id", "ambulance__institution_id")
    }
    account_ids = {row.actor_id for row in events if row.actor_id is not None}
    account_ids |= {numeric_id(row.object_id) for row in events if row.object_type == "account"} - {
        None
    }
    account_ids |= {row["user_id"] for row in assignments.values()}
    current_institutions = dict(
        InstitutionMembership.objects.filter(user_id__in=account_ids, active=True).values_list(
            "user_id", "institution_id"
        )
    )
    names = {
        (row["institution_id"], row["user_id"]): row["user__username"]
        for row in InstitutionMembership.objects.filter(
            user_id__in=account_ids, institution_id__in=institutions
        ).values("institution_id", "user_id", "user__username")
        if current_institutions.get(row["user_id"], row["institution_id"]) == row["institution_id"]
    }
    unit_ids = {row.ambulance_id for row in events if row.ambulance_id is not None}
    unit_ids |= {unit_id(row.object_id) for row in events if row.object_type == "ambulance"} - {
        None
    }
    units = {
        (row["institution_id"], row["pk"]): row["code"]
        for row in Ambulance.objects.filter(
            pk__in=unit_ids, institution_id__in=institutions
        ).values("institution_id", "pk", "code")
    }
    result = {}
    for row in events:
        actor = (
            names.get(
                (row.institution_id, row.actor_id),
                f"Cuenta fuera de la institución (ID {row.actor_id})",
            )
            if row.actor_id is not None
            else "Proceso técnico"
        )
        account = None
        unit = None
        if row.object_type == "account":
            account = names.get(
                (row.institution_id, numeric_id(row.object_id)),
                f"Cuenta no disponible (ID {row.object_id})",
            )
        elif row.object_type == "ambulance":
            unit = units.get(
                (row.institution_id, unit_id(row.object_id)),
                f"Unidad no disponible (ID {row.object_id})",
            )
        elif row.object_type == "ambulance_assignment":
            assignment = assignments.get((row.institution_id, numeric_id(row.object_id)))
            account = "Cuenta no disponible para esta asignación"
            unit = units.get((row.institution_id, row.ambulance_id), "Unidad no disponible")
            if assignment and assignment["ambulance_id"] == row.ambulance_id:
                account = names.get(
                    (row.institution_id, assignment["user_id"]),
                    "Cuenta no disponible en esta institución",
                )
        result[row.pk] = {
            "actor": actor,
            "account": account,
            "unit": unit,
            "reference_basis": "current_records",
        }
    return result
