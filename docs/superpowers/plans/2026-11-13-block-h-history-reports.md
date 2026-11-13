# Bloque H — histórico autorizado, resúmenes y auditoría administrativa

> Contrato aprobado por el responsable; ejecución inline con `executing-plans`, TDD y una revisión independiente final, manteniendo el método A–G. Implementación verificada localmente, aceptación manualH pendiente en PRUEBAS_H.

**Goal:** consultar histórico/resúmenes clínicos del destino con permiso adicional y auditoría administrativa propia sin clínica.
**Architecture:** módulo Django `reports` sin modelos nuevos, consultas HTTP paginadas/filtradas en servidor, PostgreSQL como autoridad. Frontera de terminales también en rutas legadas de lectura; conservar vías de resolución idempotenteA–G. React separa bandeja operativa, informes y auditoría, con estado volátil por ámbito.
**Tech Stack:** versiones actuales fijadas, Node24.20.0/npm11.19.0, Django/DRF/PostgreSQL; sin dependencias nuevas.
**Spec:** `2026-11-13-block-h-design.md`, ETAPA_0 secciones2/3/11, ARQUITECTURA_PILOTO y decisión del usuario **Restringir histórico**.

## Global Constraints

- Solo sintéticos, sin permisos/grants/migraciones a desarrollo, merge/push/despliegue nuevos, cierre/purga/restore ni inicioI/J.
- Urgencias+`view_reports` solo destino con membresía activa/institución habilitada. Administración y system_admin no obtienen clínica por administrar. Alias/paciente nunca enURL.
- Cerrados/cancelados dejan de estar disponibles por mera unidad/rolUrgencias en GET ordinario; notificada/en_traslado/llegado siguen operativos en ámbito. Llegados antiguos no desaparecen por el límite visual20.
- Crear/transicionar y replay confirmado conservan sus validaciones por ámbito, UUID/cuerpo/versiones; no usar autorización de informes para ejecutar escrituras ni bloquear la resoluciónA por terminar el episodio.
- Sin exportaciónPDF/Excel ni métricas clínicas/ETA/identificación de pacientes únicos inferidas.
- Consultas privadas/no-store, sin localStorage/IndexedDB/caché clínica; respuestas tardías descartadas al cambiar sesión/ámbito/permisos.

## Review Focus

- Cuenta combinada ambulancia/Urgencias/informes: histórico solo del destino autorizado, nunca terminales de otras unidades/destinos por unir scopes indebidamente.
- Llegados fuera de las primeras20 tarjetas sin informes: siguen visibles y se pueden cerrar; histórico terminal separado sin bypass por GETdetalle ni filtros manipulados.
- Cancelación/cierre/F con respuesta perdida y reautenticación: replay exacto confirma sin convertir UUID en directorio histórico ni bloquearA–G.
- Filtros temporales America/Santiago en cambioDST/fin de mes, páginas múltiples y escrituras concurrentes: cantidades y página corresponden al mismo conjunto/snapshot, sin inferir pacientes/traslados únicos.
- Administrador no clínico, eventos con texto libre técnico o actor de otra institución, permisos retirados durante fetch: auditoría solo allowlist/proyección mínima y ninguna respuesta tardía repone datos ajenos.

## Task1 — contrato servidor y frontera clínica

**Files:** crear `backend/reports/__init__.py`, `apps.py`, `filters.py`, `views.py`, `urls.py`, `tests.py`; modificar `backend/config/settings.py`, `config/urls.py`, `emergencies/views.py`, `accounts/management/commands/grant_pilot_permissions.py`; OpenAPI al cerrar contratos.
**Interfaces:** GET `/api/v1/reports/emergencies/?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD&status=...&ambulance_id=UUID&triage=C1..C5|unclassified&page=N&page_size=N` → `{count,next,previous,results,summary:{total,by_status,by_triage},timezone,date_basis}`; detalle `/reports/emergencies/{uuid}/` con representación actual del episodio. Sin filtros todas las fechas retenidas, máximo100/página. `date_basis=created_at`, timezoneAmerica/Santiago, límites de días inclusivos convertidos `[inicio,fin+1día)`. GET normal puede ofrecer terminales solo por destino+informes; lista/detalle informes nunca usan unión con ámbito de ambulancia. `--view-reports` local exige rolUrgencias previo; no autoalta de roles ni concesión web.

- [x] RED permisos/destino/terminales/roles combinados/revocación y filtros; endpoints ausentes y terminales antes visibles.
- [x] Ejecutado RED reports7; primer intento interrumpido por caída del PostgreSQLpreexistente y repetido tras recuperación sin borrar datos.
- [x] Scopes explícitos, validación estricta y opciones de unidades desde episodios autorizados, sin filtros de paciente.
- [x] Resumen completo/paginación estable, límites/DST/Sin clasificar y aislamientoF; tests de rango/IDsajenos.
- [x] Snapshot PostgreSQL RRreadonly comprobado con creación concurrente entre resumen/página.
- [x] Comando/no-store RED→GREEN; sin grants en desarrollo ni nueva migración.
- [x] Backend244/244 sin keepdb; pruebas anteriores adaptadas solo por frontera aprobada y continuidad. Replaycreate scopeescritura separado delGETterminal y F/transicionesA–G verificados.

## Task2 — auditoría administrativa sin clínica

**Files:** crear `backend/audit/views.py`, `tests_administrative_history.py`; modificar rutas institucionales y OpenAPI.
**Interfaces:** GET `/api/v1/institutions/audit/` → página25/máximo100 `{count,next,previous,results:[{id,actor_id,occurred_at,action,object_type,object_id,result,correlation_id}]}`. Fechas de `occurred_at` America/Santiago, filtros acción/objeto con valores allowlist y sin consultas por paciente. Requiere `institution_admin` y membresía propia activa; rechazar system_admin, sin ampliar API clínico.

- [x] RED auditoría3 por ruta ausente→GREEN; paginación/rango/revocación y testextra de paracción/objetoinválido/proceso técnico.
- [x] Allowlist exacta administrativa, proyección de8campos sin executor/clínica/usuarioactualajeno ni logs.
- [x] Auditoría y backendcompleto244/244 PASS; C/retención intactos, sin purga/cierre/restore reales.

## Task3 — UI, pruebas de integración y cierre

**Files:** crear `frontend/src/screens/local/ReportsPanel.tsx`, `AdministrativeAuditPanel.tsx`, helpers/hook de lectura por ámbito; modificar `LocalPortal.tsx`, `frontend/src/lib/backend.ts`, scripts de pruebas/mocks, `package.json` y workflow.
**Interfaces:** `canReports=urgencias&&view_reports`, `canAudit=institution_admin` sin acceso por system_admin; API siempre valida. Paneles cargan solo página solicitada, filtros aplicados explícitamente y paginación/resumen reflejan filtrosaplicados, no texto aún no enviado. Conservar estado volátil con tokenA; no mostrar respuesta de página/filtro anterior bajo rótulo nuevo.

- [x] BrowserRED3 por controles/frontera ausentes→GREEN, paginación/filtros/resumen servidor, adminsinclínica y26llegados visibles.
- [x] Respuestas tardías/filtros fuera deorden/logout/permisos y detalleajeno; reintentosA–G preservados por regresiones completas.
- [x] Paneles/detallehistórico readonly, sin cap20; acciónGmaster separada con doblepermiso para conservar funcionalidad aprobada.
- [x] Frontend38unit+8H+15G+12F+6E+30integridad+3correcciones y todasregresionesPASS; fixtures explícitos con informes solo donde corresponde.
- [x] Backend244/checks/Ruff89archivos/OpenAPI, frontend/tipos/build/Mermaid3, PSrestore doblesPASS. Captura390px inspeccionada, detectorUI1vez sin hallazgos.
- [x] Revisión única: importante de trazabilidad histórica RED→GREEN, menores documentados, PRUEBAS_H y estadoactualizados. Preparado commitlocal, sin publicar/desplegar/I/J.
