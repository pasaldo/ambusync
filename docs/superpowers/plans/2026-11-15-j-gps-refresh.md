# J — renovación periódica GPS de primer plano

**Autoridad:** observación del responsable después de65f134b: GPS no actualiza almenos cada30s. Código solo watchPosition+throttleeventos10s, sin solicitud periódica; DBagregada confirma muestrasen_traslado (sin leer coordenadas). Mantener alcanceJ, no ampliar seguimiento a notificada/oculto/terminal.

1. TDDcontroller: schedulerinyectable, conservar watcher y solicitar `getCurrentPosition` con`maximumAge:0`cada15s/timeout10s, una solicituden vuelo, callbacksgeneration; stoplimpiawatch/timer, errornoautorresume. Mismo timestamprepetido no se envía como muestra nueva; capturatimestamporiginal siempre.
2. TDDbrowser con relojPlaywright: watcheremiteuna vez, avance15s provoca nuevalectura y segundoPOSTconUUIDnuevo/capturadistinta aun mismascoordenadas; pausa/oculto/terminal/error/uncertain/logout detienen consultas y escrituras. No nuevos endpoints/GPSsimuladopermanente.
3. Throttle de envíos usa relojmonotónico10s (primera muestra inmediata); no congelar por cambios de reloj local. Estado activo anuncia solicitud15s, sin garantía de señal niGPSbloqueado. NOTIFIEDconservaprimeraúnica.
4. Fullregresionesbackend/frontend/checks/revisiónindependienteúnica/documentación, commitlocal sinpush/despliegue/K–M; no migraciones/reinicioBackend/Geoapify/datosdev/GPSrealagent.
