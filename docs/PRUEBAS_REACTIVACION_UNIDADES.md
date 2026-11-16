# Reactivación de unidades — web y PWA

**16/11/2026:** comportamiento, plan y ejecución directa aprobados por el
responsable. Implementación verificada localmente; aceptación manual pendiente.
Solo datos sintéticos. No autoriza uso clínico, push ni despliegue público.

## Comportamiento

En **Administración → Unidades de ambulancia**, las unidades desactivadas
administrables muestran **Reactivar unidad**. Se pide confirmación explicando
que no se restauran asignaciones anteriores. Tras confirmar se actualizan
estado y selectores de creación/asignación; el historial e identidad se conservan.
La unidad vuelve a ser asignable, pero sus antiguos operadores continúan sin ella.
Una nueva asignación siempre es una decisión explícita.

Permisos idénticos a la baja, comprobados en backend: institución combinada
propia o ámbito administrable de operadoras habilitadas según las reglas
existentes. El directorio legado compartido no concede reactivación general.
No modifica instituciones deshabilitadas, cuentas, permisos ni sesiones.

POST `/api/v1/institutions/management/ambulances/<id>/reactivate/` con `{}`,
sesión y CSRF.204 al habilitar o si ya estaba habilitada; repetir sin cambio no
duplica auditoría. Evento `ambulance.reactivated`, visible como **Unidad reactivada**
en auditoría de la institución correspondiente, con su filtro y referencia de unidad.
Se conserva la política de auditoría previa para operadoras vinculadas: no abre
auditoría de otra institución al administrador de la receptora.

Si se pierde la respuesta, no hay éxito supuesto ni reenvío automático:
**Actualizar administración** recupera el estado antes de permitir otra decisión.
Una respuesta tardía tras logout/cambio de ámbito no restaura el panel anterior.

## Preparación operativa realizada — 16/11/2026

- No hay migraciones ni dependencias nuevas.
- El responsable autorizó expresamente «reinicia los daphne». Se verificó la
  identidad de los procesos de esta copia y se reiniciaron únicamente8000/8001.
  Listeners anteriores44968/20800 → nuevos19660/44072, ambos127.0.0.1.
- 8000 conserva configuración local y `FRONTEND_BASE_URL=http://127.0.0.1:5174`;
  8001 conserva `lan_settings` externo, host/origen exactos y cookiesSecure.
- GET anónimo a la nueva ruta con UUID sintético devuelve401 por8000 y por
  HTTPS8443 (antes404): ruta nueva cargada/protegida, sin ejecutar reactivación.
  `me`401, SPA5174/HTTPS200 y cookieCSRFHTTPS Secure verificados; TLS validado.
- Build frontend actual servido por previewHTTPS. PostgreSQL, Valkey, Mailpit,
  Vite5174, preview4174 yHTTPS8443 conservan exactamente sus PID anteriores.
- No se reactivaron unidades ni cambiaron asignaciones de desarrollo para probar.
- No se inició sesión, migró, modificó `.env` ni repitió la suite completa por
  este reinicio; aceptación manual web/Android continúa pendiente.
- Antes de cerrar la PWA, resolver envíos inciertos y guardar/descartar borradores.
  Cerrar todos los clientes del sitio y reabrir con conexión; no borrar datos.

## Casos manuales

1. Con administración autorizada, localizar una unidad sintética desactivada.
   Sin permisos de gestión no debe aparecer la acción.
2. Pulsar Reactivar y cancelar la confirmación: no cambia el estado.
3. Confirmar: muestra Habilitada, conserva código/identidad e historial y no
   devuelve operadores anteriores a la unidad.
4. En Historial de cuentas, verificar que la unidad se ofrece al asignar, pero
   no queda seleccionada para cuentas sin unidad. Comprobar también Crear cuentas.
5. Revisar **Unidad reactivada** en la auditoría autorizada correspondiente.
   Repetir una petición sin cambio no añade un segundo evento.
6. Probar en navegador y Android instalado; comprobar controles legibles y
   sin desbordamiento. La función y sus permisos son los mismos en ambos.
7. Si ocurre error de red, actualizar y revisar antes de decidir de nuevo;
   no inferir que una respuesta perdida significa que la acción no ocurrió.

No ejecutar bajas/reactivaciones de instituciones ajenas o peticiones manipuladas
con datos reales; sus guardias están cubiertas en bases y transporte sintéticos.

## Evidencia técnica

- Baseline backend37/37; nueve pruebas nuevas RED por endpoint/capacidad/evento
  ausentes, luego instituciones+auditoría87/87.
- Suite backend completa319/319,138.851s, TEST exclusiva por proceso; no comparte
  `test_ambusync_dev`. Incluye carrera de dos administradores con un solo evento.
- Ruff115/check/formato, Django check y comprobación de migraciones sin cambios.
  Contrato OpenAPI actualizado y validado.
- Frontend: nueve escenarios de reactivación, suite previa de unidades y cuentas,
  veinte casos de archivo/auditoría, treinta de integridad y54unitarias, exit0.
  Tipos/buildPASS; aviso previo de bundle>500kB conservado.
- Capturas sintéticas390/1280 revisadas: habilitada/desactivada/sin permiso.
  Detector UI sin hallazgos. No acredita prueba física Android.

Primer intento combinado frontend agotó120s por sincronización de fixtures:
selector con etiqueta implícita y espera de evento de respuesta después de salir
del ámbito. Pruebas corregidas para localizar la fila y esperar entrega de la ruta,
sin modificar producción para adaptarla a los fixtures; nueve escenariosGREEN.

La revisión final es una auto-revisión del autor, conforme a la ejecución sin
subagentes solicitada; no equivale a una revisión independiente ni a aceptación manual.
No se detectaron hallazgos críticos/importantes ni menores nuevos para diferir.
Se preservan los menoresH/K anteriores y el aviso del tamaño del bundle.

## Ajustes del plan

- Auditoría probada en `tests_administrative_history.py`, ubicación vigente
  (riesgo si fuese incorrecto: omitir descubrimiento de pruebas).
- Se conservó el helper de listado, que ya pedía `include_disabled=true`
  (riesgo: ocultar unidades si cambiara ese contrato).
- Se actualizó también OpenAPI para no dejar el contrato desfasado
  (riesgo: divergencia entre documentación y API).
- Los nueve casos frontend se separaron en `unit-reactivation-test.mjs`, incluido
  en `test:units` (riesgo: perder cobertura si se omite el script).
- Revisión por el autor sin subagentes (limitación: menor independencia).
