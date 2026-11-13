# Corrección H — archivo de Urgencias y auditoría coexistentes

**Aclaración del responsable posterior a `2dda7cd`:** el archivo previo debe conservarse para cuentas Urgencias normales y administración + Urgencias. Auditoría administrativa es un módulo adicional, nunca su reemplazo. Esto sustituye la restricción previa de informes para el **archivo básico**, no para los resúmenes adicionales.

## Arranque y permisos

Usar esta copia/rama `feature/pilot-completion`, SPA http://127.0.0.1:5174/local y backend8000; PostgreSQL AmbuSync55432, Valkey6379 y Mailpit1025/8025. Arranque completo en [PRUEBAS_H.md](PRUEBAS_H.md#1-arranque-de-esta-copia). No usar rutas demo para acreditar la corrección. No agrega modelos, migraciones, dependencias ni grants. Reiniciar solo Daphne de esta copia para cargar cambios si estaba iniciado antes.

| Cuenta | Archivo básico | Informes/resúmenes | Auditoría administrativa |
|---|---|---|---|
| Urgencias | Sí, su destino activo | Solo con `view_reports` | No |
| Administración + Urgencias | Sí, su destino activo | Solo con `view_reports` | Sí |
| Administración sin Urgencias | No | No | Sí, institución propia |
| Ambulancia sin Urgencias | No | No | Solo si tiene el rol administrativo |

Administración significa `institution_admin`, no administración global. `system_admin` no obtiene clínica ni auditoría institucional por ese rol. Todas las lecturas revalidan sesión, membresía activa e institución habilitada; combinar roles no une destinos con episodios terminales de una unidad.

## Casos de aceptación manual — pendientes

1. **Urgencias sin permisos extra:** abrir **Archivo de Urgencias**. Debe mostrar **Archivo de episodios**, sin Por estado/Por triaje ni Auditoría administrativa. Cerrar/cancelar un caso sintético y comprobar que sale del operativo y puede consultarse en archivo.
2. **Administración + Urgencias:** deben coexistir Archivo de Urgencias, Administración y Auditoría administrativa. Pasar de auditoría al archivo conserva la separación. Sin `view_reports` no aparece Histórico e informes.
3. **Administrador no clínico:** puede abrir Auditoría administrativa, pero no archivo, informes ni detalle clínico directo. Menor previo: puede necesitar pulsar Auditoría al entrar en lugar de abrir automáticamente.
4. **Informes adicionales:** con Urgencias + `view_reports`, Archivo e Histórico e informes son opciones separadas. El archivo no llama `/reports/` ni recibe `summary`/directorio de unidades. Informes conservan sus filtros y resúmenes; auditoría sigue exigiendo `institution_admin`.
5. **Fechas del archivo:** filtros Día/Mes/Año/Estado se aplican en servidor con **Aplicar filtros**. Cerrados/cancelados por defecto; Llegado requiere filtro explícito y sigue operativo sin límite20. Fecha del hito en America/Santiago: cancelación→cancelled_at/created_at; cierre→closed_at/arrived_at/created_at; llegado→arrived_at/created_at. No confundir con fechas de creación de informes. Día/mes/año admiten filtrado independiente; fechas imposibles y parámetros inválidos/repetidos se rechazan.
6. **Paginación:** más25episodios, Página siguiente/anterior mantiene filtros y orden de hito descendente/ID. No descarga automáticamente todas las páginas. No promete snapshot congelado entre peticiones.
7. **Detalle y G/F:** conserva identificación, mediciones, correcciones, hitos, llegada/motivo/cierre/autorías y rótuloF; sin editar episodio ni crear hitos por abrirlo. Baja lógicaG es acción separada con `urgencias` + `deactivate_patients`, **sin exigir informes**; conserva rechazo si existen no terminales. No abre el maestro/directorio al receptor.
8. **Aislamiento:** probar ID de otro destino, unidad propia enviada a destino ajeno y cuenta sin Urgencias: no deben obtener historial terminal. No ampliar alcance por vínculosF, permiso administrativo ni parámetros manipulados.
9. **Concurrencia/sesión:** aplicar filtros, cambiar módulo/cuenta/permisos o cerrar sesión con lectura pendiente. No debe reaparecer información de la consulta anterior. ReintentosA–G conservan cuerpo/UUID/versión; consultar archivo no reenvía escrituras.
10. **Móvil:** verificar390px, etiquetas/campos/listado legibles y sin desborde. Registrar navegador y dispositivo realmente usados, no inventarlos por haber ejecutado Playwright.

## Verificación automática

Backend: `uv run python manage.py test emergencies.tests_history --noinput`, luego suite completa; frontend con BASE_URL5174: `npm run test:reports`, `npm run test:patients-catalog` y regresión A–H completa. Las cuatro pruebas backend nuevas y los casos browser de coexistencia se ejecutaron **RED antes del código**. El rótulo temporal del archivo también se reprodujo RED antes de mostrar event_date.

**Verificación local completa; aceptación manual pendiente.** Frontend **38unitarias +12H +15G +12F +6E +30integridad +3correcciones**, y actualizacionesD/unidades/cuentas/system-admin/WS/sync/tipos/build/Mermaid3/3, todos exit0. G prueba ahora la baja desde archivo **sin** `view_reports`. No sustituye aceptación manual real. Sin push/merge/despliegue, datos clínicos reales, nuevas concesiones de permisos ni inicioI/J.

### Evidencia backend y revisión

- Backend completo **249/249**, PostgreSQL sin `--keepdb`, incluidas5nuevaspruebas de archivo. Ruff/check/formato91archivos/makemigrations/OpenAPI PASS; sin migraciones pendientes nuevas. PSrestore PASS **solo con dobles locales**, no restore real ni nuevas métricasRPO/RTO.
- Revisión independiente estática de la corrección: sin hallazgos accionables; no certifica ejecución, rendimiento ni comportamiento entre dispositivos. No se solicitó otra revisión.
- Captura del archivo filtrado/página2 a390px inspeccionada sin desborde, detectorUI una vez sin hallazgos. No se regeneraron imágenes versionadas ni se usaron datos reales.
- Daphne de esta copia reiniciado para cargarhistory; history/audit/auth responden401 esperado sin sesión y SPA200. PostgreSQL55432 acepta conexiones. Esto no sustituye probar una sesión autenticada real.
- Menores previosH, sin cambios: administrador sin rol clínico puede requerir pulsar Auditoría al iniciar; warningbuild de bundleprincipal superior500kB. No hay nuevos menores señalados por la revisión de esta corrección.
