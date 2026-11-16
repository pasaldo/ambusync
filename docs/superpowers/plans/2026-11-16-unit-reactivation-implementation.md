# Unit Reactivation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reactivar unidades desde administración web/PWA sin recuperar asignaciones anteriores.

**Architecture:** Reutilizar el estado lógico `Ambulance.enabled` con endpoint explícito
y transaccional. Extender listado administrativo y auditoría, conservando los
selectores operativos restringidos a unidades habilitadas.

**Tech Stack:** Django/DRF/PostgreSQL, React/TypeScript/Vite, Node/Playwright.

**Spec:** `docs/superpowers/plans/2026-11-16-unit-reactivation-design.md`.

**Resultado de ejecución —16/11/2026:** Task1 yTask2 completadas y verificadas.
Backend319/319, frontendunidades/cuentas/9reactivación/20auditoría-archivo/
30integridad/54unit/tipos/buildPASS. Revisión final del autor sin hallazgos
críticos/importantes; no revisión independiente. Sin nuevas migraciones.
Contrato/limitaciones y ajustes del plan en `docs/PRUEBAS_REACTIVACION_UNIDADES.md`.
Se conserva la lista original de pasos como plan aprobado; recargarDaphne8000/8001
requiere autorización específica y la aceptación manual permanece pendiente.

## Global Constraints

- Sin modelos, migraciones ni dependencias nuevas.
- Mismos límites institucionales que la baja; usuario → unidad en bloqueos.
- No restaurar asignaciones, sesiones ni instituciones deshabilitadas.
- Sin push/merge/despliegue público/L–M ni cambios reales de datos para probar.
- Preservar correcciones móviles locales existentes.

## Review Focus

- ID ajeno o institución deshabilitada: rechazar sin revelar ni modificar la unidad.
- Petición repetida:204 sin duplicar auditoría ni asignaciones.
- Alta/listado con unidades desactivadas: no ofrecerlas para asignar hasta reactivar.
- Transporte incierto o sesión caducada: sin falso éxito ni repetición automática.
- Respuesta tardía tras abandonar el ámbito: no restaurar datos ni controles viejos.

### Task 1: API y auditoría

**Files:**
- Modify: `backend/institutions/unit_management.py`, `backend/institutions/urls.py`.
- Modify: `backend/institutions/account_management.py`, `backend/audit/views.py`.
- Test: `backend/institutions/tests_unit_management.py`, `backend/audit/tests.py`.

**Interfaces:**
- Produces: `ManagedAmbulanceReactivateView.post(request, ambulance_id)` →204.
- Produces: `can_reactivate` boolean en cada unidad del listado administrativo.
- Produces: evento permitido `ambulance.reactivated`, objeto `ambulance`.
- Consumes: `lock_management_users`, `can_deactivate_unit`, `audit_unit_action`.

- [ ] Escribir pruebas: disabled→enabled mismoID; asignaciones anteriores siguen
  inactivas; segunda petición204 y un solo evento; ya habilitada sin nuevo evento.
- [ ] Probar denegación de usuario sin administración, ámbito ajeno, operadora
  deshabilitada y cuerpo distinto de `{}`; listado conserva filtro por defecto.
- [ ] Ejecutar `uv run python manage.py test institutions.tests_unit_management audit`
  con base TEST exclusiva por ejecución, sin runners sobre base compartida;
  confirmar RED por ausencia del endpoint/capacidad/evento.
- [ ] Implementar endpoint con validación de cuerpo y bloqueos según la baja,
  revalidación del ámbito y cambio de estado/auditoría atómicos.
- [ ] Exponer `can_reactivate` solo para estado desactivado y ámbito administrable;
  añadir evento a la allowlist de auditoría y comprobar presentación autorizada.
- [ ] Repetir pruebas hasta GREEN; ejecutar toda la suite backend con TEST exclusiva
  y checks/Ruff/OpenAPI según comandos vigentes del repositorio.
- [ ] Revisar diff y registrar evidencia; commit solo de archivos de esta tarea
  si se decide conservar checkpoint local, sin publicar.

### Task 2: Administración web/PWA

**Files:**
- Modify: `frontend/src/lib/backend.ts`.
- Modify: `frontend/src/screens/local/AdminAccountsPanel.tsx`.
- Modify: `frontend/src/screens/local/AdministrativeAuditPanel.tsx`.
- Test: `frontend/scripts/unit-management-test.mjs`,
  `frontend/scripts/mock-auth-api.mjs`, `frontend/scripts/reports-test.mjs`.
- Document: `docs/PRUEBAS_REACTIVACION_UNIDADES.md`, `docs/ETAPA_1.md`, `AGENTS.md`.

**Interfaces:**
- Consumes: POST de Task1, `can_reactivate`, evento `ambulance.reactivated`.
- Produces: `reactivateManagedAmbulance(id: string, isCurrent?: () => boolean): Promise<void>`.
- Extends: `ManagedAmbulance.can_reactivate: boolean`.
- Extends: listado para solicitar desactivadas explícitamente desde administración
  sin alterar el valor predeterminado para otros consumidores.

- [ ] Escribir regresiones que fallen: mostrar desactivada con acción autorizada,
  confirmar/cancelar reactivación, impedir doble envío, refrescar estado y selectores.
- [ ] Probar que reactivar no asigna operadores; transporte incierto exige refresco;
  401 y respuesta tardía tras cambio de ámbito no anuncian éxito ni reviven estado.
- [ ] Ejecutar `npm run test:units` y pruebas específicas de auditoría para confirmar RED.
- [ ] Implementar helper con guardia CSRF existente, listado administrativo ampliado,
  botón con confirmación y bloqueo mediante maquinaria `mutate`; conservar filtros
  `enabled` en creación/asignación y no alterar bajas actuales.
- [ ] Añadir rótulo/filtro «Unidad reactivada» en auditoría y fixture sintético.
- [ ] Ejecutar `npm run test:units`, `npm run test:accounts`, `npm run test:reports`,
  `npm run test:local-integrity`, `npm run test:unit` y `npm run build`; todos exit0.
- [ ] Revisar estados habilitada/desactivada/sin permiso a390 y1280px con datos
  sintéticos; verificar controles accesibles, sin desbordamientos y detector UI.
- [ ] Documentar evidencia real y guía manual; regenerar build local y comprobar
  que HTTPS sirve la nueva versión sin reiniciar servicios ni hacer pruebas reales.
- [ ] Revisión final del contrato/diff; comunicar pruebas y pendientes, sin push
  ni atribuir aceptación manual o suite backend verde sin haberlas ejecutado.
