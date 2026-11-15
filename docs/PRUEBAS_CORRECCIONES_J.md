# J — observaciones y correcciones de aceptación

**Base:** J73b84e4/preparacióne8287bf. Observaciones del responsable15/11/2026: dirección copiada de Google Maps sin ubicación, búsqueda duplicada de pacientes, distancia no probada en PC y control de compartir ubicación no encontrado. No se declaran aprobadas estas correcciones por su reporte.

## 1. Diagnóstico y cambio aplicado

- En desarrollo había tres consultas con estado `not_configured`, cuota usada0 y ninguna posición o institución ubicada. No eran respuestas negativas de Geoapify: **no se había consultado al proveedor**.
- Se comprobó presencia de clave privada en configuración nueva (solo booleano, sin imprimir valor), archivo `.env` guardado01:15 y Daphne iniciado00:56: el proceso antiguo no la había cargado.
- Se permite que una consulta **explícita** posterior vuelva a resolver un resultado anterior `not_configured` cuando la clave ya está cargada. No se borran datos/caché ni se disparan búsquedas por iniciar el servidor.
- Los mensajes distinguen clave ausente, dirección sin edificio preciso, cuota agotada, frecuencia limitada, búsqueda pendiente y servicio no disponible. Se conserva explicación también después de guardar; no se presenta todo como una dirección incorrecta.
- En nueva emergencia se retira el campo **Buscar paciente de la unidad por alias o ID**. Se conserva el selector **Paciente de la unidad** para reutilizar un registro; la búsqueda por alias/ID permanece en **Pacientes y catálogo**. No se amplía a pacientes de otras unidades.
- En **Episodios de la unidad**, el bloque **Ubicación y distancia** se coloca **antes** de lectura/preparación para hacer encontrable el control. El código servido y las pruebas sí muestran **Compartir ubicación**; la ausencia concreta en la pantalla del responsable no se ha reproducido ni se atribuye a una causa inventada.

Copiar una dirección textual de Google Maps no garantiza que exista un edificio equivalente en Geoapify/OpenStreetMap. Escribir calle, número y comuna; no pegar una URL/shortlink como si fuera una dirección. Si la búsqueda realmente no encuentra edificio, queda pendiente y no se inventa un destino.

## 2. Revalidar dirección

1. Recargar la aplicación desde **http://127.0.0.1:5174/local** (administración global irá a `/sistema`); si se ve la interfaz anterior, usar `Ctrl+F5`.
2. Administración global → **Editar** institución existente con ubicación pendiente.
3. Revisar su dirección y pulsar **Guardar cambios**. Con clave cargada, se consulta explícitamente aunque una búsqueda anterior quedó sin configurar.
4. Si aparece candidato, revisar dirección/coordenadas, seleccionarlo y guardar. Sin seleccionar candidato no se confirma destino.
5. Si aparece un estado de proveedor/cuota o sin coincidencia, leer el mensaje específico. Reintentos posteriores son manuales, respetan caché/cuota y no generan un bucle.

El agente no consulta direcciones reales para ensayar ni confirma candidatos por el responsable; la prueba con Geoapify real sigue siendo una acción controlada del usuario y consume su cuota.

## 3. Probar GPS/distancia con el mismo PC

**Otro navegador en el mismo PC no equivale a otra ubicación física.** Además, un PC puede carecer de GPS, usar ubicación por red con baja precisión o no dar permiso. Urgencias no necesita capturar el GPS de su navegador: recibe por servidor la posición del dispositivo de ambulancia; el destino es la coordenada institucional confirmada.

Para una prueba sintética reproducible, sin capturar ubicación real:

1. Confirmar antes una ubicación institucional desde administración global.
2. En Chrome/Edge del operador de ambulancia, iniciar sesión en `/local` y abrir **Episodios de la unidad**, en un episodio propio `notificada`/`en_traslado`.
3. Abrir herramientas de desarrollador (`F12`) → menú de herramientas → **More tools / Más herramientas → Sensors / Sensores**.
4. En **Location / Ubicación**, elegir una ubicación personalizada y escribir coordenadas **sintéticas de prueba**. No cambiar flags de seguridad ni habilitar rastreo externo.
5. Para comprobar una distancia conocida, usar como origen la misma longitud del destino y una latitud distinta en0,01grados (dentro de−90..90). La separación sobre ese meridiano es aproximadamente **1,1km** en línea recta. Ejemplo exclusivamente matemático: destino(−33,45;−70,66), origen(−33,46;−70,66). No sustituir por este ejemplo la ubicación real registrada de una institución.
6. Pulsar **Compartir ubicación**, con permiso del navegador. En `notificada` solo se permite primera captura; para seguimiento periódico, iniciar traslado y activarlo explícitamente.
7. En el otro navegador de Urgencias, abrir el episodio del destino: debe ver el punto enviado por el operador y distancia calculada, sin pedir su propia ubicación.
8. **Pausar GPS**, ocultar app, logout o llegada/cancelación deben detenerlo. No dejar activado por defecto al volver.
9. Al terminar, retirar la ubicación simulada en DevTools. No interpretar la prueba como validación de GPS físico.

En PC, `http://127.0.0.1` puede ser contexto seguro local. En tablet/celular accediendo por IP de LAN, el navegador suele exigir **HTTPS**, permiso de ubicación y aplicación visible. HTTPS/despliegue no se habilitan ni certifican por esta corrección.

## 4. Si el botón no aparece

- Revisar que sea `/local`, no el simulador `/ambulancia`.
- Cuenta con grupo ambulancia y unidad activa asignada; abrir **Episodios de la unidad**, no el formulario **Ambulancia** ni el archivo receptor.
- Debe existir un episodio de su unidad. El botón está dentro de su bloque **Ubicación y distancia**, antes de los hitos. En estado terminal se deshabilita el seguimiento.
- Si tras `Ctrl+F5` continúa sin aparecer, aportar **URL exacta y captura** sin claves/datos personales; no basta con que las pruebas sintéticas lo muestren para afirmar qué está viendo el responsable.

## 5. Verificación y límites

Pruebas RED observadas antes de cambiar fuentes:

- Caché sin clave seguía `not_configured` después de configurarla.
- Campo duplicado seguía presente en creación.
- Acción GPS aparecía después de hitos.
- Mensaje de ausencia de clave no se mostraba: se usaba el genérico de dirección no precisa.

Pruebas dirigidas posteriores: backendgeocodificación8/8; frontendJ12/12 yG15/15. Suite completa/regresiones y revisión independiente se registran en ETAPA_1/entrega. Sin nuevas migraciones, dependencias, cambios de permisos/cuentas o persistencia de GPS simulado en navegador.

**Cierre técnico:** backendcompleto310/310sin keepdb; frontend43unit+12J+15G+7I+18H+12F+6E+30integridad+3correcciones y actualizacionesD/unidades/cuentas/system-admin/WS/sync/tipos/build/Mermaid3/3PASS. Checks/Ruff115/OpenAPI/makemigrations yPSrestore doblesPASS. Revisiónindependiente sin hallazgosaccionables, noejecutótests/servicios ni acreditó pantalla delresponsable.

**Carga operativa realizada:** únicamenteDaphnepropio reiniciado de listener37756 a34080; proceso nuevo confirma claveconfiguradaTrue mediante booleano sin imprimirsecreto. HTTPcsrf200 y demásserviciospreservados. Trasverificar seguían3not_configured históricos/cuota0: el reinicio no reconsultó ni asignó coordenadas. Ahora corresponde alresponsable reintentar su dirección explícitamente. No se necesita regenerar la clave ni reenviarla por chat.

CapturaChromium390pxinspeccionada sin desborde y detectorUIuna vez sin hallazgos. No son captura de su sesión/navegador real ni evidencia de GPSfísico/Geoapifyreal. MenoresHprevios de selección inicialauditadminsinrolclínico y bundle>500kB siguen documentados.

Aceptación manual pendiente:

- [ ] Consulta de dirección con clave cargada y confirmación de candidato.
- [ ] Mensajes específicos, sin confundir configuración/cuota con dirección inválida.
- [ ] Sin búsqueda duplicada en nueva emergencia, reutilización y catálogo conservados.
- [ ] Compartir ubicación visible en portal correcto y prueba sintética del PC.
- [ ] Distancia/pausa/estados entre operador y receptor autorizados.
