# J — renovación periódica de ubicación

**Aceptación posterior —16/11/2026 sobre `04c1a33`:** el responsable confirmó aprobadas las pruebas manuales de J, incluida esta corrección. Sustituye el pendiente manual y las casillas históricas de esta guía, sin inventar ejecución individual, dispositivo, navegador, HTTPS o cadencia física. Persisten los límites técnicos de señal/primer plano. Push autorizado a `origin/feature/pilot-completion`, no merge/despliegue/uso clínico/K–M. Las repeticiones automáticas del16/11 fallaron por interferencia de pruebas e interrupción/indisponibilidadPG y no se cuentan como aprobadas; ver [PRUEBAS_J.md](PRUEBAS_J.md).

**Observación del responsable tras65f134b:** el flujo de ubicación funciona, pero la captura no se renueva al menos cada30s. No constituye aprobación manual integral de J.

## Causa y corrección

`watchPosition` notifica posiciones cuando el navegador decide entregarlas; no es un reloj periódico. El filtro de envíos10s y las consultas HTTP5s al servidor no pedían una captura nueva al dispositivo. Un origen estacionario podía quedarse con su única muestra y superar30s de antigüedad.

El capturador ahora conserva el watcher y añade una solicitud `getCurrentPosition` **cada15s**, con `maximumAge:0`, alta precisión y timeout10s. No se solapan solicitudes periódicas. Cada muestra utiliza la fecha entregada por el dispositivo, nunca una fecha fabricada con la hora del envío. Si el proveedor devuelve exactamente la captura anterior, no se crea una muestra artificialmente nueva.

La renovación tiene modo explícito y queda deshabilitada por defecto: solo se activa al compartir un episodio `en_traslado`. Una primera captura notificada cuyo POST o refresco tarde más de30s no inicia lecturas periódicas adicionales.

El límite de envíos sigue siendo **no más de uno cada10s**, con reloj monotónico para que cambiar el reloj del PC no congele la cadencia. Cada captura nueva tiene UUID nuevo; una escritura incierta conserva su UUID/cuerpo y detiene la adquisición periódica hasta resolución manual.

## Revalidación manual

1. Resolver cualquier envío pendiente antes de recargar: el borrador/intento está solo en memoria.
2. Abrir `/local` actualizado e iniciar sesión como ambulancia de la unidad autorizada.
3. Seleccionar un episodio **en traslado** y pulsar **Compartir ubicación** con la aplicación visible.
4. Mantener el dispositivo quieto. Con señal/permisos y adquisición funcionando, comprobar que **Captura** y **Recepción** avanzan con muestras nuevas, no solo que se refresque el texto de la página.
5. Observar el detalle en Urgencias del destino: HTTP/WS deben recuperar las muestras nuevas sin cambiar la versión clínica. No se requiere GPS en el navegador receptor.
6. **Pausar GPS**, ocultar pestaña/app, logout y llegada/cancelación deben detener también el temporizador. Volver no lo reactiva.
7. En `notificada` se conserva la única primera captura; no se habilita rastreo periódico antes de iniciar traslado. Un episodio terminado no admite nuevas posiciones.

Para prueba sintética en el mismo PC, seguir [Sensors/DevTools](PRUEBAS_CORRECCIONES_J.md#3-probar-gpsdistancia-con-el-mismo-pc). Un origen con coordenadas idénticas pero timestamp nuevo es una muestra fresca; si el proveedor devuelve timestamp viejo, debe seguir viéndose antiguo.

Si se usan dos navegadores/ventanas en el PC, mantener **la ventana y pestaña de ambulancia visibles**, por ejemplo lado a lado con Urgencias. Cambiar a otra pestaña u ocultar/minimizar la ambulancia pausa intencionalmente el GPS; no es seguimiento garantizado en segundo plano.

## Límites que no cambian

- Se **solicita** una muestra cada15s, pero no se garantiza una fijación GPS física cada30s sin señal, con adquisición lenta, sin permiso, con app oculta o pantalla bloqueada.
- Si una muestra supera30s, se conserva la advertencia. No se alarga el umbral ni se rejuvenece la fecha anterior para disimular la falta de señal.
- Un error de geolocalización pausa y exige reactivación explícita; no se auto-reintentan escrituras.
- No se envía el GPS a Geoapify ni se consumen créditos por estas renovaciones. No hay nuevas migraciones/dependencias ni reinicio backend por este cambio frontend.
- El agente prueba con navegador/sensor simulados, no captura ubicación real ni declara demostrada la cadencia del hardware del responsable.

## Pruebas

RED antes de fuentes: sin timer/lectura nueva (unitarias) y sin segundoPOST durante15s virtuales (navegador).

GREEN dirigido: renovación aun sin eventos del watcher, timestamp original preservado, no lecturas solapadas, callback tardío invalidado tras stop/restart, captura repetida no rejuvenecida y error/permisos sin timer filtrado. Navegador con reloj controlado verifica nuevo UUID/captura dentro30s y ausencia de renovaciones tras pausa/oculto/llegada o escritura incierta. Resultados finales en ETAPA_1/progreso de esta entrega.

Revisión independiente detectó renovación habilitada durante una primera captura notificada pendiente; reproducida/corregida RED→GREEN con respuesta retenida45svirtuales. La regresión sin reloj simulado detectó además un problema de enlace de `setInterval` al objetoWindow, confirmado enChromium y corregido con wrappers ligados al entorno global; por eso se mantienen pruebas con navegador nativo y reloj controlado, no solo mocks de temporizador.

Durante la primera regresión backend, PostgreSQLlocal55432 estaba detenido y se agotó el tiempo de conexión. Reapareció activo en una verificación posterior y se reutilizó sin que el agente reiniciara servicios ajenos ni cambiara credenciales. Esa ejecución fallida no se cuenta como aprobada; el resultado final debe provenir de la repetición completa.

**Resultados finales:** repeticiónbackend310/310sin keepdb; frontend47unitarias+16J(13GPS/3geocodificación)+15G+7I+18H+12F+6E+30integridad+3correcciones, actualizacionesD/unidades/cuentas/system-admin/WS/sync/tipos/build/Mermaid3/3PASS. Checks/Ruff115/OpenAPI/makemigrations yPSrestore doblesPASS. Sin nuevaCIremota/restore real/RPO/RTO o pruebaGPSfísico. Backend/servicios sin cambios por esta corrección; Daphne/SPA yPGlocal verificados activos al cierre.

Revisión independiente única: un importante corregidoRED→GREEN (notificada/POSTretenido45s); no segunda revisión. Excluye hardware, pantalla real y documentación final, que no se presentan como evidencia de aceptación. No nuevos menores; los anterioresH se conservan.

Aceptación manual pendiente:

- [ ] En traslado visible, captura/recepción avanzan sin movimiento.
- [ ] Urgencias recibe muestras nuevas y muestra antigüedad real.
- [ ] Pausa/oculto/terminal/errores detienen solicitudes; reanudación explícita.
- [ ] Confirmación con dispositivo físico/HTTPS si se realiza, sin inventar navegador o métricas.
