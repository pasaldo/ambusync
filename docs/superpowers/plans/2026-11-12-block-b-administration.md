# Bloque B — administración segura de unidades y asignaciones

> Ejecutar inline con TDD y una revisión independiente final. Base: `9754edf`, rama `feature/pilot-completion`. No merge/push/despliegue.

**Goal:** completar reasignación/retiro y baja lógica de unidades con continuidad, ámbito y auditoría verificables.
**Architecture:** servicios transaccionales compartidos para asignación, retiro, desactivación de cuenta y unidad; React consume acciones explícitas del mismo origen. PostgreSQL es autoridad. No cambios destructivos del historial.
**Tech Stack:** stack/lockfiles existentes, sin dependencias nuevas.
**Spec:** D-005/D-015 en ETAPA_0, ETAPA_1 y plan maestro `2026-11-12-pilot-completion.md`.

## Global Constraints
- Solo datos sintéticos; no borrar base local ni publicar. Al cerrar se entregan instrucciones de arranque y aceptación manual (nuevo requisito del responsable).
- Institución combinada gestiona solo sus unidades. Receptora administra cuentas de su institución o creadas por esa persona, dentro de operadoras habilitadas. Asignación destino debe coincidir con membresía institucional del operador.
- Directorio legado compartido no concede por sí solo permiso para desactivar unidades ajenas: baja permitida por institución propia, relación explícita a operadora o unidad creada auditadamente por el actor.
- Episodios no terminales: notificada, en_traslado, llegado. Cancelada/cerrada no bloquean continuidad ni baja.
- Retirar/reasignar/desactivar el último operador habilitado se rechaza si hay episodios no terminales; invitación pendiente, cuenta inactiva o membresía inválida no cuentan como reemplazo.
- Retiro no desactiva cuenta. Baja de unidad termina asignaciones activas, conserva histórico y no cambia estados de episodios.
- No crear cuentas sin unidad al alta; sí permitir asignar de nuevo a una cuenta cuya unidad fue retirada.
- UI no es autoridad: permisos, CSRF, validación, bloqueo concurrente y auditoría en servidor.

## Review Focus
- Dos administradores retiran simultáneamente los dos últimos operadores: como máximo una operación puede confirmar.
- Creación de emergencia concurrente con retiro/baja: orden común de bloqueo, no crear episodio para una unidad sin operador/habilitación.
- Reintento de asignación/baja no duplica historia ni auditoría; edición obsoleta no mueve silenciosamente al operador.
- Desactivación ordinaria solo cuenta episodios no terminales; nunca elimina ni reescribe autoría histórica.
- Entrada inválida, ID ajeno, cuenta sin asignación y callbacks tardíos de la interfaz no amplían ámbito.

## Contratos
- POST `management/accounts/{user_id}/assignment/`: JSON exacto `{ambulance_id: UUID|null, expected_ambulance_id: UUID|null}`. Null explícito retira; omisión no es retiro. 200 `{id,code}` asigna/reasigna; 204 retira. 400 entrada/continuidad, 404 cuenta ajena, 409 asignación cambió. Repetir destino ya vigente es no-op, sin nueva auditoría. Mantiene la ruta existente y documenta el nuevo control optimista.
- POST `management/ambulances/{uuid}/deactivate/`: cuerpo `{}`; 204 incluso si ya está desactivada, 400 con episodio no terminal, 404 fuera de ámbito.
- GET `management/ambulances/`: por defecto habilitadas (compatibilidad); `include_disabled=true` para administración de bajas. Añade `enabled` y `can_deactivate` sin revelar contenido clínico.
- GET cuentas añade `institution_id` para filtrar destinos de asignación en UI. No concede nuevos permisos.
- Auditoría: `ambulance.created`, `ambulance.deactivated`, `ambulance.assignment_started`, `ambulance.assignment_ended`; actor, institución, unidad, referencia a asignación/unidad y correlación, sin datos del episodio. Reasignación correlaciona fin e inicio.
- Orden de bloqueo: usuarios implicados ordenados por PK; unidades implicadas ordenadas por PK; asignaciones propias. No bloquear usuarios al desactivar unidad. Consulta de reemplazos bajo bloqueo de unidad. Revisar bloqueo de creación/transiciones de emergencias para respetar ese orden.

## Files
- Crear `backend/institutions/unit_management.py`: servicios/acciones de unidades y asignaciones, validación y continuidad compartidas.
- Modificar `account_management.py`, `urls.py`, `emergencies/views.py`: integrar servicios y coordinación de bloqueo; sin duplicar reglas.
- Crear `tests_unit_management.py`: API/PostgreSQL, permisos, auditoría, idempotencia, entradas y concurrencia real.
- Modificar `openapi.json`: rutas existentes no documentadas y contratos nuevos.
- Modificar `frontend/src/lib/backend.ts`, `AdminAccountsPanel.tsx`, mock de transporte; crear `scripts/unit-management-test.mjs`, incorporar a CI.
- Documentar evidencia y guía `docs/PRUEBAS_B.md`, actualizar ETAPA_1/guía/AGENTS.

### Task 1: reglas backend y contratos
- [x] Escribir regresiones de último operador, pertenencia, retiro/reasignación sin asignación previa, baja y terminales; ejecutarlas RED.
- [x] Implementar servicios transaccionales y validación estricta de UUID/campos; unir desactivación de cuenta a continuidad compartida.
- [x] Probar auditoría, no-op, asignación obsoleta, CSRF/ámbito y revocación de acceso HTTP; verificar GREEN.
- [x] Prueba TransactionTestCase de retiros simultáneos y creación vs retiro/baja, con conexiones cerradas en cada hilo. Completar OpenAPI.

### Task 2: interfaz
- [x] Prueba Playwright RED de asignar, retirar, reasignar tras retiro y baja de unidad, con rechazo visible.
- [x] Incorporar selector por institución, control explícito de retiro y baja confirmada; unidades inactivas nunca ofrecidas al asignar/crear cuenta.
- [x] Evitar escrituras concurrentes locales y no anunciar éxito tras error/red perdida; refresco explícito antes de decidir nuevo intento, sin autoenvío.
- [x] Verificar permisos y callbacks tras cambio de sesión; GREEN y regresión frontend.

### Task 3: cierre
- [x] Suite backend completa PostgreSQL sin keepdb, Ruff/formato/check/migraciones/OpenAPI; todas las suites frontend/tipos/build/Mermaid.
- [x] Revisión independiente del diff B, hallazgos importantes con RED->GREEN y suite final.
- [x] Commit local acotado y guía de arranque de esta rama + casos manuales con resultados esperados; distinguir mocks de pruebas reales. Mantener main intacto.
