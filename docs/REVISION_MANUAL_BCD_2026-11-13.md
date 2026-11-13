# Revisión manual B/C/D — 13/11/2026

Fuente: marcas del responsable en PRUEBAS_B/C/D y reporte en la conversación del 13/11/2026. HEAD local al contrastar: `2e49cfc`; el reporte no especifica el commit exacto ejecutado, plataformas ni dispositivos. No sustituirlo por una aceptación clínica, CI remoto o autorización de publicación.

| Bloque | Estado de revisión comunicado | Observaciones abiertas al recibir el reporte |
|---|---|---|
| B | Aprobado con observaciones | Aviso explícito de cuenta de ambulancia sin unidad. |
| C | Alcance local aprobado | `PASS` con dobles locales; no evidencia nueva de restore externo real/RPO/RTO. |
| D | Aprobado con observaciones | Texto de rectificación ambiguo; reordenación D-007 pendiente. |
| Texto de Urgencias | Observación confirmada en código | Eliminar/actualizar «Actualización periódica local; sin WebSocket». |

## Resultados comunicados

- B: código de unidad repetido rechazado; retiro correcto; reasignación aplicada sin recargar. El responsable marcó todos los casos de su checklist.
- `ruff check`, `ruff format --check`, OpenAPI, `test:units`, `test:accounts`, `test:local-integrity`, `test:unit`, `lint` y `build`: comunicados OK. No se adjuntaron conteos ni registros completos nuevos.
- C: wrapper PowerShell `PASS` de guardias/destino/migración/retención/entorno con dobles locales. Su casilla de ensayo real fue marcada aprobada, pero es condicional y no se adjuntó snapshot/destino/fecha/conteos/duración; no declarar restore real efectuado a partir de esa marca.
- D: actualización de medición65→75 recibida por Urgencias; original y reemplazo visibles en ambulancia. Todos los casos de su checklist marcados aprobados, con las observaciones siguientes.

## Contraste técnico de observaciones

1. **Bloqueo del último operador:** esperado cuando la unidad tiene episodios no terminales y no hay otro operador habilitado válido. La función `ensure_departure_is_safe` no consulta si existe otro navegador abierto; una sesión abierta no causa por sí sola el bloqueo. Con solo episodios terminales o reemplazo habilitado, un rechazo necesitaría investigar sus datos concretos.
2. **Cuenta sin unidad:** `LocalPortal.tsx` solo muestra el distintivo cuando `user.ambulance` existe; falta el aviso explícito en el caso nulo. Pendiente, sin modificar lógica de continuidad/permisos.
3. **`Rectificada → 45`:** `MeasurementHistory` imprime `rectified_by_id`.45 identifica la fila sustituta, no su valor vital. No demuestra pérdida del valor75; el texto debe distinguir ID y valor para no inducir esa lectura.
4. **Orden por triaje:** `LocalPortal.tsx` todavía ordena por estado y fecha descendente. No aplica aún C1–C5/antigüedad y sección de sin clasificar D-007. Es pendiente funcional ya aprobado, no evidencia por sí sola de fallo del aviso WS.
5. **Texto WebSocket:** el encabezado de Urgencias contiene una afirmación estática obsoleta. La aplicación ya dispone de WS autenticado con HTTP/polling como respaldo; el texto necesita corrección.

## Mensaje en tests backend

Se repitió únicamente `emergencies.tests_websocket.EmergencyWebSocketTests.test_notification_transport_failure_does_not_change_api_write_success`: **1/1 OK**, mostrando `Emergency notification publication failed.`. El test usa deliberadamente un transporte que lanza `OSError` para verificar que un aviso fallido no revierte el dato persistido. Ese mensaje no implica fallo de esa prueba. Fuera de este test, o si una suite no termina en `OK`, debe investigarse; no ignorar indiscriminadamente avisos operativos.

## Alcance de esta actualización

Se registró la revisión reportada, se normalizaron casillas Markdown y se contrastaron causas en código. **No se implementaron todavía las cuatro correcciones pendientes**, no se repitieron todas las suites ni se modificaron servicios/datos de desarrollo. Sin commit/push/merge/despliegue en esta actualización.

## Actualización posterior — cuatro correcciones autorizadas, antes de E

Por solicitud posterior del responsable se implementaron las cuatro correcciones. Aviso sin unidad y bloqueo de creación, rectificación con valor/unidad e ID etiquetado, orden D-007 sobre todas las páginas recuperadas y sección Sin clasificar, descripción de WS/HTTP según conexión. No cambia backend/modelo ni añade migraciones; E no se inició.

Verificación automática posterior: frontend27/27 unitarias, nueva suite3/3, integridad30/30 y todas las regresiones/tipos/build/Mermaid aprobados; backend161/161 sin keepdb y wrapperrestore con dobles PASS. Revisión independiente sin hallazgos críticos/importantes. **Revalidación manual de estas correcciones aún pendiente** en [PRUEBAS_CORRECCIONES_BCD.md](PRUEBAS_CORRECCIONES_BCD.md); la aprobación manual original anterior no se borra ni equivale a probar la versión corregida.

Menor diferido de revisión: endurecer el test de temporizadores para que no pueda invocar un callback de intervalo ya cancelado. No se detectó un fallo funcional de respaldo; el test actual demuestra la reconciliación/presentación con transporte sintético, no una medición operativa de la cadencia real.
