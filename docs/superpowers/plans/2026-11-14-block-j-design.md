# Bloque J — GPS de primer plano y destino por dirección

**Estado:** alcance completo aprobado expresamente por el responsable el15/11/2026 («si apruebo este alcance para J»), después de I aprobado/publicado hasta `23c9456`. Implementación local con TDD/revisión final; migracionesinstitutions0006/emergencies0011 solo testDB, aceptación manual pendiente en PRUEBAS_J. Geoapify gratuito aprobado, cuenta creada y clave en poder del responsable, **no recibida ni configurada por el agente**. Sin consultas externas de direcciones/GPS real/datosdev modificados.

## 1. Alcance y autoridad

- ETAPA_0 D-004/006/007/009/010/014 y plan maestro aprobado: primera captura al enviar si hay permiso, seguimiento en traslado, precisión/frescura, distancia Haversine y parada al llegar/cancelar/cerrar/cambiar destino.
- Se conserva PostgreSQL/HTTP como autoridad y WS como aviso mínimo. GPS no cambia triaje, ETA declarado, llegada ni versión clínica.
- Solo piloto sintético. Las pruebas automatizadas simulan geolocalización y Geoapify; nunca capturan ubicación real del desarrollador ni gastan créditos. Prueba de dispositivo físico y consulta externa controlada se distinguen de pruebas sintéticas.
- No inicio K–M, despliegue, push/merge, proveedor de correo externo ni uso clínico. Modelos/migraciones nuevos solo testDB durante implementación; preparar desarrollo y completar instituciones existentes requerirá una operación posterior explícita.

## 2. Dirección de la institución → destino

### Institución nueva o dirección modificada

1. Administración global exclusiva ingresa dirección completa, idealmente calle/número/comuna/ciudad. No se agregan permisos a administración institucional.
2. Al solicitar guardar, backend busca candidatos mediante Geoapify; no hay consultas por pulsación ni autocompletado continuo.
3. Mostrar dirección encontrada, latitud/longitud y advertencias de precisión. El responsable confirma el candidato antes de usarlo como destino; no seleccionar silenciosamente el primer resultado ni tomar un centro de ciudad por entrada de Urgencias.
4. Si la coincidencia es ambigua, no existe, falta clave, hay límite o falla el proveedor: permitir conservar/crear institución con ubicación pendiente, sin coordenadas inventadas. Registro/traslado siguen disponibles, distancia no disponible.
5. Cambiar dirección invalida coordenadas anteriores para esa dirección. Respuesta tardía no puede asociar un candidato a otra dirección/institución; vincular selección a la consulta/dirección original y validar en servidor.
6. Guardar únicamente datos necesarios: coordenadas, dirección consultada y encontrada, proveedor/atribución, fecha de resolución y confirmación. No guardar respuesta íntegra arbitraria del proveedor.

### Instituciones existentes

- Conservar dirección actual; no sustituirla automáticamente por la dirección devuelta.
- Operación controlada con vista previa/listado de pendientes: consultar direcciones una sola vez, reutilizar resultados guardados y confirmar coincidencias desde administración global.
- No consulta de proveedor en migración, GET de lista, arranque de servidor ni refresco de bandeja.
- Dirección vacía/ficticia/no resoluble queda pendiente y se informa; no asignar una posición de otra institución.

## 3. Geoapify y costo

- Backend únicamente: `GEOAPIFY_API_KEY`, sin prefijo VITE, repositorio, captura, respuesta API o log de excepciones/URLs que contengan clave.
- Endpoint HTTPS fijo `https://api.geoapify.com/v1/geocode/search`, filtro Chile explícito, idioma español, pocos candidatos. No aceptar URL/host arbitrarios ni seguir redirecciones hacia otro host.
- Solo enviar dirección institucional: no pacientes, usuarios, correo, RUT, GPS de ambulancias, IDs de episodio ni otros datos de la aplicación.
- Timeout/respuesta acotados; validar coordenadas finitas/rangos y contenido de candidatos. No reproducir cuerpos externos como HTML.
- Caché persistente por dirección normalizada/filtro/proveedor; cuota compartida persistente y tope local conservador configurable, inicialmente100consultas/día, más límite de frecuencia. Reservar cuota antes de la salida, contar fallos, sin reintentos automáticos ni upgrade. El tope no controla consumo de la misma clave fuera de AmbuSync.
- Atribución visible Geoapify y fuentes aplicables, enlaces permitidos. No mapas/tiles/rutas externas en J.
- Plan gratuito consultado:3000créditos/día, hasta5solicitudes/s, sin tarjeta, geocodificación simple1crédito. Son condiciones actuales del proveedor, no garantía perpetua ni SLA. La aplicación limita su propio uso y no compra planes.
- Fuentes: https://www.geoapify.com/pricing/ y https://apidocs.geoapify.com/docs/geocoding/forward-geocoding/ (consulta14/11/2026). Revisar condiciones de conservación/atribución antes del adaptador final.

## 4. GPS del dispositivo de ambulancia

- Control explícito para habilitar ubicación y explicación previa: compartir con el destino autorizado del episodio. Permiso del navegador, cancelable; denegación/error no bloquea envío/traslado.
- Primera captura al enviar si existe consentimiento/permisos; captura periódica solo en `en_traslado`. No rastrear sin episodio, sesión válida o unidad autorizada.
- Primer plano visible únicamente. Pausar y limpiar seguimiento al ocultar pestaña, suspender sesión/logout, cambiar cuenta/unidad/episodio; al volver no reenviar muestras viejas ni prometer conservación en segundo plano. Mostrar estado pausado y reanudación explícita.
- No garantizar captura con pantalla bloqueada. Móviles reales requieren contexto seguro HTTPS, que pertenece a preparación/aceptación posterior; loopback permite simulación local pero no sustituye aceptación física.
- Detener captura y rechazar nuevas posiciones en servidor tras llegada/cancelación/cierre, incluso si la pestaña todavía no recibió el aviso. Cambio F cancela origen y reemplazo inicia seguimiento propio, sin copiar posiciones ni autorizar al receptor nuevo a consultar el original.
- Varias personas pueden operar una unidad: las muestras conservan actor/dispositivo lógico en memoria y orden de servidor; no se presenta una muestra como consenso o GPS certificado de la ambulancia.

## 5. Escritura, lectura y temporalidad

- Modelo de posiciones por episodio: UUID propio, operación idempotente, latitud/longitud, precisión opcional no negativa, captura de dispositivo y recepción de servidor, actor y secuencia del episodio independiente de versión clínica.
- Rangos latitud−90..90/longitud−180..180, ambas presentes, finitas; `(0,0)` válido. No corregir silenciosamente relojes.
- Orden y desempates deben impedir que muestra retrasada o reintento haga retroceder la última ubicación; tiempos futuros/inconsistentes se señalan y no convierten una muestra en vigente.
- Cada envío conserva UUID/cuerpo hasta resolver incertidumbre; nunca repetir automáticamente una mutación. Captura periódica no equivale a reintento automático: si hay una escritura incierta, suspender envíos y ofrecer resolución explícita.
- Autorización backend en cada escritura/replay: cuenta activa, unidad asignada/habilitada y episodio admisible. Lectura solo dentro del ámbito operativo/archivo ya aprobado, sin directorio GPS global ni acceso por UUID conocido.
- Eventos GPS separados de los clínicos, sin coordenadas ni identificación clínica en WS. HTTP obtiene última posición autorizada; polling/GPS/WS no renuevan inactividad humana.
- Retención C incluye posiciones y sus recibos con el episodio hasta90dtras cierre formal. No extender permisos/reportes ni copiar coordenadas a auditoría administrativa.

## 6. Presentación de distancia

- Mostrar última posición, precisión cuando exista, fecha/captura y recepción diferenciadas, antigüedad dinámica y advertencia al superar30segundos.
- Mostrar estado detenido/pausado/sin permiso/sin señal; una posición histórica nunca se presenta como seguimiento activo.
- Haversine entre posición autorizada y destino confirmado, cálculo sin proveedor externo. Rótulo «Distancia aproximada en línea recta»; no es ruta, kilómetros por calles ni ETA.
- Sin origen/destino válido o confirmado: «Distancia no disponible». Reloj inconsistente/frescura desconocida señalados, no precisión/frescura ficticia.
- No añadir mapa externo para confirmar GPS ni enviar origen al geocodificador.

## 7. Secuencia de entrega propuesta

1. J1: geocodificación institucional y configuración segura, cuota/caché y confirmación, tests RED→GREEN.
2. J2: contrato API/posiciones, aislamiento, idempotencia, concurrencia con llegada/cambioF y retenciónC, tests PostgreSQL.
3. J3: captura en primer plano, controles y presentación distancia/frescura, navegador sintético y regresionesA–I.
4. Revisión independiente final del bloque y correcciones TDD; guíaPRUEBAS_J, commitlocal sin push; preparación/aceptación manual separadas.

**Aprobación funcional completa15/11:** incluye confirmación humana de ubicación encontrada/pendientes, tope local100/día y suspensión/reanudaciónGPS explícita. Plan `2026-11-15-block-j-implementation.md`; guía PRUEBAS_J. Aprobación no acredita consultas externas, GPS físico ni aceptación manual, y no autoriza migrar desarrollo por inferencia.
