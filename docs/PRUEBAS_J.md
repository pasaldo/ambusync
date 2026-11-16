# Bloque J — GPS y destino desde dirección

**J aprobado manualmente el16/11/2026 sobre `04c1a33`, por confirmación del responsable.** Incluye sus correcciones y sustituye los pendientes manuales históricos de esta guía y las guías relacionadas. Solo piloto sintético. No confundir pruebas simuladas con GPS físico o validación real de Geoapify.

El responsable reportó «pruebas manuales estan aprobadas» y autorizó push a `origin/feature/pilot-completion`; no aportó detalle individual de casos, dispositivos, navegadores, HTTPS ni métricas físicas. Los apartados siguientes conservan la historia de implementación/preparación y procedimientos, no pendientes de aceptación vigentes. Las repeticiones automáticas del16/11 no se consideran aprobadas: hubo interferencia sobre la base de pruebas y posterior interrupción/indisponibilidadPG; el último comando exacto falló por timeout antes de ejecutar casos. No hay nueva suite verde ni CI remota acreditadas. La aceptación no autoriza merge, despliegue, uso clínico ni inicioK–M.

> **Observaciones posteriores15/11:** ver [PRUEBAS_CORRECCIONES_J.md](PRUEBAS_CORRECCIONES_J.md) para diagnóstico de clave añadida después de iniciar Daphne, caché/mensajes de geocodificación, búsqueda de pacientes solo en su apartado y prueba de distancia con coordenadas sintéticas en DevTools. La ausencia concreta del botón en el navegador del responsable sigue pendiente de revalidación; el bloque GPS se ubica antes de hitos para facilitar encontrarlo.

> **Preparación posterior autorizada y realizada el15/11/2026, sobre73b84e4:** institutions0006/emergencies0011 ya aplicadas en ambusync_dev127.0.0.1:55432; únicamenteDaphnepropio reiniciado y rutasJcargadas/protegidas(GET401sinlogin). migrate--check/showmigrations[X]/checkPASS, csrf/SPA/Mailpit200. Sin búsquedas/cuota/posiciones/coordenadasasignadas alverificar. **La APIkey sigue sin configurar** (solo se verificó presencia booleana, no se leyó ni imprimió secreto). Sustituye el pendiente de migración/reinicio de la entrega anterior: no repetir migraciones ni duplicar procesos. El responsable debe configurar privadamente GEOAPIFY_API_KEY y avisar para recargar Daphne antes de probar Geoapify. Aceptación manual pendiente.

## 1. Preparación pendiente

Las migraciones nuevas **`institutions/0006` y `emergencies/0011` están generadas y probadas solo en testDB**, no aplicadas a `ambusync_dev`. No se modificaron direcciones/coordenadas existentes, ni se usó una APIkey real, se consultó Geoapify con direcciones, o se capturó GPS real.

Daphne de esta copia sigue siendo el proceso iniciado antes de implementar J; el frontend Vite puede mostrar controles nuevos, pero **no realizar aceptación real de J hasta preparar la base y cargar el backend actualizado**. Aplicar estas migraciones/reiniciar únicamente Daphne requiere autorización operativa específica, como en I. No crear otro servidor ni tocar PostgreSQL ajeno5432.

Después de esa autorización:

1. Verificar destino efectivo PostgreSQL`127.0.0.1:55432/ambusync_dev` y revisar el plan de migración (solo institutions0006/emergencies0011).
2. Aplicar migraciones, comprobar `migrate --check` y Django`check`.
3. El responsable abre **localmente** `backend/.env` y añade la variable privada `GEOAPIFY_API_KEY` con su clave. No pegarla en conversación/terminal, capturas, frontend, archivos versionados ni argumentos de comandos. `GEOCODING_DAILY_LIMIT=100` es el valor inicial.
4. Reiniciar únicamente Daphne propio conservando `FRONTEND_BASE_URL=http://127.0.0.1:5174`; PostgreSQL/Valkey/Mailpit/Vite pueden reutilizarse. No leer ni imprimir `.env` para comprobarlo.
5. Verificar rutas sin provocar una búsqueda externa. Solo una búsqueda explícita posterior consume la cuota.

El proveedor aprobado es **Geoapify gratuito**, con cuenta/APIkey en poder del responsable. No contratar plan, configurar tarjeta, ampliar cuota ni usar el proveedor para geolocalizar ambulancias. La cuota propia es global para AmbuSync,100salidas/díaUTC por defecto y máximo3000configurable; no mide el uso de esa clave desde otros proyectos.

Revisión de [términos](https://www.geoapify.com/terms-and-conditions/)15/11: además de permitir el plan gratuito, el proveedor se reserva suspensión o sobrecargos al exceder límites. Usar proyecto/clave dedicados y revisar consumo en su panel. El tope propio reduce riesgo, **no garantiza costo cero de la cuenta completa** ni controla aplicaciones ajenas; no introducir medios de pago ni aceptar ampliaciones de gasto.

Aplicación local: http://127.0.0.1:5174/ ; Mailpit: http://127.0.0.1:8025/ . El GPS físico móvil exige contexto seguro **HTTPS**; `http://127.0.0.1` sirve para probar en el mismo PC, no habilita GPS seguro en un celular accediendo por IP de LAN. No desplegar/contratar túneles o usar ubicaciones reales por inferencia.

## 2. J1 — institución nueva

1. Iniciar administración global exclusiva, abrir **Nueva institución** y completar campos normales, incluida dirección institucional completa en Chile.
2. Pulsar **Crear institución y enviar activación**. Se busca la dirección desde backend, sin enviar RUT/correo/usuario ni otros campos a Geoapify.
3. Si aparecen candidatos de edificio/establecimiento, comprobar dirección encontrada y coordenadas; elegir el candidato correcto. El porcentaje es una estimación del proveedor, no certifica entrada de Urgencias.
4. Pulsar nuevamente guardar para confirmar. No seleccionar por intuición un lugar distinto.
5. Si no existe una coincidencia precisa, no hay clave, falla el proveedor o hay límite, guardar como **ubicación pendiente**. La institución y su activación siguen las reglas existentes; no se inventan coordenadas. La distancia aparecerá no disponible.

La dirección original no se sustituye por la devuelta. Cambiarla descarta la selección anterior. Cerrar el formulario mientras llega una búsqueda no debe rellenar el siguiente formulario con el resultado viejo.

No hay consultas por pulsación, mapas/tiles externos ni selección silenciosa del primer resultado. Resultados de ciudad/calle general, país distinto y números inválidos no se ofrecen como destino.

## 3. J2 — instituciones existentes

1. Administración global → buscar institución → **Editar**.
2. Revisar su dirección registrada. Si es ficticia, vacía o insuficiente, no se promete encontrarla; corregir solo con autorización y datos del escenario de prueba.
3. Si está pendiente, al guardar se busca esa dirección. Confirmar el candidato o conservar pendiente, como en J1.
4. Con ubicación confirmada y dirección sin cambios no se repite la consulta al guardar otros datos.
5. Cambiar dirección invalida la ubicación anterior si no se confirma una nueva. Nunca seguir usando coordenadas de la dirección previa como si fueran actuales.

La regularización es **controlada, institución por institución**, no una migración que consulta Internet ni una modificación masiva oculta. GET/listas/arranque/refrescos de Urgencias no llaman a Geoapify. La caché reutiliza direcciones normalizadas iguales; fallos pueden reintentarse explícitamente después de10s con **Reintentar búsqueda de ubicación**. Las respuestas ready/not_found se conservan; revisar/corregir la dirección si no se encontró edificio.

Una salida como máximo por segundo para todos los usuarios, cuota persistente y fallos contados. Un proceso separado acota la consulta completa a5s más limpieza de proceso (no solo timeout de socket), cuerpo máximo128KiB, HTTPS fijo/sin redirecciones y errores sin URL/APIkey.

## 4. J3 — ambulancia y primera captura

1. En **Ambulancia**, completar una emergencia sintética.
2. Si se desea primera captura, marcar **Compartir una primera posición GPS al enviar (opcional)**.
3. Guardar. Solo tras confirmarse la creación se solicita al dispositivo una primera ubicación; denegar/fallar GPS no impide registrar el episodio.
4. Ocultar la aplicación durante el registro invalida ese consentimiento: al volver **no** se solicita ni envía GPS automáticamente.
5. Para seguimiento periódico, ir a **Episodios de la unidad → Compartir ubicación**, con traslado iniciado. La casilla de primera captura no deja activado un rastreo permanente.

La posición viene del dispositivo que usa la cuenta, no de un equipo instalado/certificado en la ambulancia. La aplicación no puede certificar que nadie haya simulado el GPS. No introducir movimientos de personas reales en este piloto.

## 5. J4 — seguimiento y presentación

1. En episodio de la unidad, pulsar **Compartir ubicación** y aceptar permiso del navegador si corresponde.
2. En traslado visible, el watcher se complementa con una solicitud fresca cada15s (`maximumAge:0`, timeout10s), incluso sin movimiento. No se envía más de una captura cada10s; señal/permisos/temporizadores pueden impedir una muestra fresca. GPS/WS/polling no renuevan inactividad humana. Revalidación en [PRUEBAS_RENOVACION_GPS_J.md](PRUEBAS_RENOVACION_GPS_J.md).
3. Urgencias del destino abre detalle y ve última posición autorizada, precisión disponible, captura/recepción diferenciadas, antigüedad y distancia.
4. La distancia usa Haversine: **línea recta aproximada**, no ruta vial, recorrido acumulado ni ETA. Si no hay origen/destino confirmado válidos: **Distancia no disponible**. `(0,0)` es válido.
5. Tras30s se advierte posición desactualizada. La antigüedad se ancla a hora servidor y reloj monotónico; cambiar reloj del receptor no rejuvenece una posición.
6. Reloj de captura fuera de `creación−30s..recepción+5s` queda señalado como inconsistente y no desplaza la última posición válida. Una muestra retrasada no reemplaza una captura más reciente.

Los avisos WS contienen únicamente IDs/tipo/secuenciaGPS, sin coordenadas/paciente y sin usar la versión clínica como contador GPS. HTTP/polling5s recuperan la posición incluso si falta el aviso. Posiciones no confirman llegada, lectura o preparación ni cambian triaje.

## 6. J5 — parada, incertidumbre y aislamiento

- **Pausar GPS**, ocultar pestaña/app, salir del panel o cerrar sesión limpian el watcher y descartan callbacks viejos. Volver/reautenticar no reactiva el seguimiento.
- Llegada/cancelación/cierre detienen nuevas capturas también en backend aunque no haya llegado WS. El último punto se conserva como histórico, no como rastreo activo.
- Cambio de destino F cancela original: no se copian sus posiciones al reemplazo ni se concede al receptor nuevo acceso al anterior. El reemplazo requiere activar su seguimiento.
- Si se pierde respuesta al enviar posición: **Posición sin confirmar**, GPS pausado, UUID/cuerpo guardados solo en memoria y **Reintentar posición** explícito. No se genera otro UUID para resolver ese intento ni se reenvía automáticamente. Recarga/cierre descartan memoria.
- Replay de muestra ya registrada no duplica y devuelve esa muestra exacta, pero revalida asignación/permisos. Otra cuenta/unidad/institución no obtiene datos por conocer UUID.
- HTTP401 en posición, incluido detalle readonly, debe devolver el portal al inicio de sesión sin esperar otra consulta.
- Urgencias consulta solo su destino; unidad solo episodios operativos propios. Administración global configura destinos, no lee posiciones clínicas.

Las posiciones y sus recibos se eliminan con el episodio conforme a C,90dtras cierre formal autorizado. No ejecutar cierre/purga real para probar J. Caché/destinos/cuota son configuración institucional, no trayectorias clínicas.

## 7. Evidencia técnica y reproducción

Desde backend:

```powershell
uv run python manage.py test --noinput
uv run python manage.py check
uv run python manage.py makemigrations --check --dry-run
uv run ruff check .
uv run ruff format --check .
uv run openapi-spec-validator openapi.json
```

Desde frontend con Vite5174:

```powershell
$env:BASE_URL='http://127.0.0.1:5174'
npm run test:gps
npm run test:unit
npm run test:reports
npm run test:patients-catalog
npm run test:destination-change
npm run test:milestones
npm run test:local-integrity
npm run test:episode-updates
npm run test:review-corrections
npm run test:units
npm run test:accounts
npm run test:system-admin
npm run test:recovery
npm run test:local-websocket
npm run test:sync
npm run lint
npm run build
npm run check:diagrams
```

- Backend completo **309/309**, PostgreSQL sin keepdb. Incluye cuota concurrente, doble posición, llegada/posición, cambioF/posición, emisores desordenados, aislamiento de receptor nuevo, retención y avisoWSmínimo.
- Frontend **43unitarias+11J (9GPS/2geocodificación)+7I+18H+15G+12F+6E+30integridad+3correcciones**, actualizacionesD/unidades/cuentas/system-admin/WS/sync/tipos/build/Mermaid3/3, todos exit0. Los escenariosGPS/geocodificador son **simulados**, sin APIkey/consulta externa/GPS real.
- Revisión independiente estática encontró tres importantes, reproducidos/corregidos RED→GREEN: consentimiento que sobrevivía ocultar durante creación; reloj receptor atrasado mostraba posición vieja como fresca; timeout por socket no acotaba respuesta lenta total. Añadida corrección del implementador de GETtardío y expiraciónreadonly, también RED→GREEN.
- Una regresión WS falló por exigir entrega antes de200ms con revalidaciónDB. Se sustituyó esa precondición temporal no acordada por esperar mensaje hasta2s, conservando comprobación de entrega y de todos los campos; no se prometen200ms. Suite completa posterior309/309PASS.
- Check/Ruff115/OpenAPI/makemigrations y PSrestore con dobles locales PASS. No restore real/RPO/RTO nuevo ni nuevaCIremota acreditados.
- CapturaChromium390px inspeccionada sin desborde y detectorUIuna vez sin hallazgos. No acredita navegador/tablet/celular del responsable.
- Menores históricosH (selección inicialauditadminsinrolclínico y aviso bundle>500kB) se conservan; no se declaran corregidos.

## 8. Aceptación manual pendiente

- [x] Preparación operativa específica autorizada y realizada: institutions0006/emergencies0011 y reinicioDaphnepropio, sin duplicar servicios.
- [ ] APIkey configurada privadamente por responsable, consulta institucional controlada y atribución.
- [ ] Nueva institución/candidato confirmado/pendiente y edición de existentes.
- [ ] Primera captura opcional y no reanudar tras ocultar durante creación.
- [ ] Seguimiento primer plano, precisión/frescura/distancia y rechazo de permisos.
- [ ] Parada/llegada/cambioF/replay incierto/expiración y aislamiento.
- [ ] Prueba móvilHTTPS autorizada, con navegador/dispositivo indicados solo si realmente se usaron.

Fuentes del proveedor: [plan gratuito](https://www.geoapify.com/pricing/) y [geocodificación](https://apidocs.geoapify.com/docs/geocoding/forward-geocoding/), consultadas14–15/11/2026. Condiciones/cuotas/cobertura pueden cambiar; no hay SLA gratuito ni garantía de coincidencia correcta. No autoriza uso clínico, despliegue/K–M o ampliación de gasto.
