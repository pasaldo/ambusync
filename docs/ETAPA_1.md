# Etapa 1 — backend local mínimo

Fecha de inicio: 29/10/2026. Estado actualizado: 13/11/2026. **Desarrollo local retomado por aprobación del responsable; sin despliegue ni uso clínico.** Las secciones de pausa/evaluación siguientes conservan su contexto histórico; para el estado vigente prevalece este apartado.

## Revisión del responsable — 13/11/2026

**H completo aprobado por reporte del responsable sobre `5b2387f`:** «da por aprobado todo el paso H, realiza el push de los commits locales a la rama del repositorio». Incluye H y sus correcciones: archivo/auditoría coexistentes, tarjetas/modal/calendario/filtro unidad y legibilidad administrativa. Sustituye las menciones siguientes de aceptación manualH pendiente. No se aportaron navegadores/dispositivos ni registro de casos individuales; no inventarlos. Autorizado push a `origin/feature/pilot-completion`, no merge/despliegue/uso clínico ni inicioI/J. Verificaciones técnicas previas siguen siendo locales, sin nuevaCIremota ni restore real. Menoresprevios documentados sin cambios.

**Legibilidad posterior de auditoríaH verificada localmente:** doce acciones y filtros en español; primera lectura distingue cuenta/unidad afectada, responsable, fecha y resultado. Códigos/IDs/correlación se conservan desplegables. Referencias actuales verificadas por institución exacta, con aviso de que no son snapshots históricos; sin usernames ajenos ni executor. No cambia roles/alcance/retención ni escrituras de eventos. Backend254/254, frontend38unit+18H+15G+12F+6E+30integridad+3correcciones y regresiones/checks/tipos/build/Mermaid/PSdoblesPASS. Revisiónindependiente sin hallazgosaccionables; manual pendiente en [PRUEBAS_AUDITORIA_LEGIBLE_H.md](PRUEBAS_AUDITORIA_LEGIBLE_H.md), sin modelos/migraciones/grants/dependencias/publicación/I/J.

**Refinamiento posterior del archivoH verificado localmente:** tarjetas compartidas con operativo y detalle en modal accesible, calendario de fecha única opcional y filtroservidor por unidad desde episodios del destino. No cambia permisos ni añade acceso a flota ajena/resúmenes. BajaPacienteG conserva feedback/reintento exacto dentro del modal y refresca el detalle. Backend250/250; frontend38unit+17H+15G+12F+6E+30integridad+3correcciones y regresiones/checks/tipos/build/Mermaid/PSdobles PASS. Importante de revisiónfeedbackbajaG corregidoRED→GREEN; aceptación manual pendiente en [PRUEBAS_PRESENTACION_ARCHIVO_H.md](PRUEBAS_PRESENTACION_ARCHIVO_H.md). Sin migraciones/grants/dependencias, publicación ni I/J.

**Corrección de coexistencia H verificada localmente:** backend249/249; frontend38unit+12H+15G+12F+6E+30integridad+3correcciones y todas regresiones/checks/tipos/build/Mermaid/PSrestore dobles PASS. Revisión independiente sin hallazgos accionables; aceptación manual pendiente. Sin grants/migraciones/dependencias, publicación ni I/J.

**Corrección posterior H, contrato vigente:** Archivo de Urgencias básico para Urgencias normal y administración+Urgencias del destino activo, sin permiso de informes; auditoría administrativa sigue solo para `institution_admin`, informes/resúmenes siguen con `urgencias`+`view_reports`. `/api/v1/emergencies/history/` paginado25/100, filtros día/mes/año/estado sobre fecha del hito America/Santiago, sin summary ni directorio de unidades. Detalle compartido readonly, bajaPacienteG separada con Urgencias+`deactivate_patients` sin exigir informes. Operativo conserva todos los llegados pendientes. Corrección local en verificación; aceptación manual pendiente en [PRUEBAS_CORRECCION_H.md](PRUEBAS_CORRECCION_H.md), sin modelos/migraciones/grants/dependencias, publicación ni inicioI/J. Esta aclaración sustituye restricciones de archivo básico en los párrafosH anteriores.

**H aprobado funcionalmente e implementado/verificado localmente:** `reports` con Urgencias+`view_reports` del destino, filtros fecha de creación America/Santiago/estado/unidad/triaje, páginas25/máximo100 y cantidades de todos los resultados filtrados en snapshotRRreadonly por respuesta. Bandeja operativa excluye terminales incluso para lectores de informes, no desplaza llegados pendientes por superar20; detalle terminal exige permiso del destino, no mera asignación de unidad. ReplaysA–G siguen disponibles para resolver intentos confirmados dentro del ámbito. Auditoría administrativa propia para institution_admin sin clínica/executor, allowlistexacta. No modelos/migraciones/dependenciasH ni grants a desarrollo.

Backend244/244 PostgreSQL sin keepdb; frontend38unit+8H+15G+12F+6E+30integridad+3correcciones y todas las regresiones/tipos/build/Mermaid3/3 PASS; Django/migraciones/Ruff/OpenAPI/PSrestore doblesPASS. Importante de revisión de trazabilidad histórica corregidoRED→GREEN, sin nuevaCI remota; menores de pantalla inicialauditadminsinrolesclínicos (botónfunciona) y warningbundle>500kB documentados. Manual pendiente en [PRUEBAS_H.md](PRUEBAS_H.md). Servicios reactivados/reutilizados en loopback y Daphnepropio reiniciado para cargarH; no publicación/despliegue ni inicioI/J.

**Retoma posterior a pausa y push `f510d0a`:** responsable autoriza servicios locales e inicioH, siguiendo metodologíaA–G. PostgreSQL55432 ya activo identificado/reutilizado; Valkey6379/Mailpit1025+8025/Daphne8000/Vite5174 iniciadossolo loopback. HTTP/local200 y Mailpit200, authme401 esperado; Django check/migrate--checkPASS y0010aplicada, sin ejecutar migrate/grants. DiseñoH histórico/resúmenes/auditoría, sin implementación aún. Usuario eligió **Restringir histórico** de terminales a Urgencias+permiso adicional del destino, manteniendo llegadospendientes y resoluciónA. Contrato/plan en `docs/superpowers/plans/2026-11-13-block-h-{design,history-reports}.md`, revisión previa pendiente; no empezarI/J ni inferir nueva publicación/despliegue.

**Confirmación posteriorG (13/11/2026):** responsable reportó identificación funcionando tras resolver0010 pendiente y aprobó todos los demás casosG, sobre entrega `1799cac`. Sustituye los pendientes manualesG siguientes; sin metadatos de navegador/dispositivo ni comprobante del comando de migración. Guías PRUEBAS_G/PRUEBAS_CORRECCIONES_G registran aceptación por reporte. Solicitó parar procesos locales y commit/push de lo existente; no merge/despliegue ni inicioH/J. Pausa de desarrollo, no cierre formal del piloto ni nuevo restore/RPO/RTO.

**Revisión posterior G, autorizada por aclaración explícita:** menú de pacientes con búsqueda alias/ID solo unidad y corrección de identificación de UN episodio antes de llegada, con motivo/autor/fecha/identificación anterior. No propaga maestro a episodios. `PatientContextCorrection`/migración0010 solo runner; F no hereda historia de receptor previo, replayF valida cadena local; WS notifica mínimo para refrescar API. Backend228/228 y frontend38unit+15G más regresiones PASS, revisión independiente sin hallazgos accionables. Aceptación manual pendiente: [PRUEBAS_CORRECCIONES_G.md](PRUEBAS_CORRECCIONES_G.md). Sin migrar desarrollo, grants, despliegue ni inicioH/J.

**G implementado/verificado localmente tras aprobación funcional:** maestros de pacientes por operadora, reutilización/listado solo unidad, snapshot inalterado de episodios anteriores y catálogo institucional con permisos adicionales `manage_symptoms`/`deactivate_patients` por comando local controlado (sin grants a desarrollo). F copia vínculo/snapshot del episodio, no maestro nuevo; desactivación autorizada desde Urgencias sin consultar maestro e impedida por no terminales. NamespaceactorUUID compartido entre tres objetivos con FK protegidas, C purga maestros/recibos a90d global y conserva auditoría12meses; catálogo es configuración con recibos mientras exista.

Migraciones `institutions/0004–0005`, `emergencies/0008–0009` solo runner; legados por raízF sin inferir identidades ni autores históricos. Backend217/217 sin keepdb, checks/Ruff/formato/OpenAPI PASS; frontend35unit+10G+12F+6E+30integridad+3correcciones y todas regresiones/tipos/build/Mermaid3/3 PASS, PSrestore doblesPASS. Dos importantes de revisión corregidos con regresiones RED→GREEN, controles de Unicode/contexto/selección y caché privada/no-store de nuevos recursos reforzados; vista390px sin desborde. **G aceptación manual pendiente**, guía [PRUEBAS_G.md](PRUEBAS_G.md). No nueva evidencia restore real/RPO/RTO/CI remoto/dispositivos ni migración/datos/despliegue desarrollo. Sustituye estado diseñoG siguiente; H/J no iniciados.

**Diseño G:** el responsable eligió **Solo su unidad** para búsqueda/reutilización de pacientes existentes. No autoriza un directorio de toda la operadora ni consulta de episodios ajenos. Propuesta funcional de maestro/snapshot/catálogo/permisos en [diseño G](superpowers/plans/2026-11-13-block-g-design.md), pendiente de revisión antes de implementar. No hay código ni migracionesG todavía.

**Actualización posterior a `c701c58`: F aprobado manualmente con observaciónF1; G autorizado.** El responsable reportó todas las pruebas aprobadas, pero pidió distinguir cambio de destino de cancelación simple. Se agregó **Cancelado por cambio de destino** al original en ambulancia y tarjeta/archivo/detalle de Urgencias únicamente si hay vínculo `replaced_by_id` y estado cancelada. No expone nombre del hospital nuevo ni cambia estado/backend. RED browser del rótulo→GREEN, unitarias32/32 y suiteF12/12. **Revalidación manual de la corrección pendiente**, distinta de aprobaciónF. G en diseño de alcance de búsqueda de pacientes, sin códigoG aún; sin nuevas migraciones ni datos de desarrollo, sin publicación/despliegue.

**Cierre técnico local F (13/11):** backend199/199 sin keepdb, incluidas18 pruebasF/7 carreras; frontend31 unitarias+10F+6E+30 integridad+3 correcciones y todas las regresiones/tipos/build/Mermaid3/3 PASS. Django/migraciones/Ruff/formato/OpenAPI y PSrestore con dobles PASS. Revisión independiente: dos importantes (deadlock de destinos cruzados y paciente ajeno en respuesta) reproducidos y corregidos; no nuevos menoresF. Bloqueos compatibles con FK de autoría y solo unidad en transiciones evitan ciclos; creación conserva su validación previa. Sin migración/datos de desarrollo, restore real ni nuevo RPO/RTO. **F implementado/verificado localmente, aceptación manual pendiente** en PRUEBAS_F; G/J no iniciados. Sustituye el estado «en verificación» del párrafo siguiente, sin publicación/despliegue.

**Actualización F:** después de aprobar E, el responsable autorizó F y aprobó la proyección de antecedentes/mediciones con procedencia original, sin heredar hitos ni acceso cruzado entre receptores. Se implementa localmente cambio atómico: original cancelado/version+1 y reemplazo ID nuevo/version1, pares de IDs solo informativos, estado/declaración de traslado conservados, copia allowlist de datos del emisor y hojas de mediciones a filas locales con `inherited_at`. Endpoint `change-destination/` devuelve `{original,replacement}`; retry usa UUID/cuerpo inmutables y valida ambos episodios. No crea GPS (J pendiente). Nueva migración `emergencies/0007`, aplicada solo a base de pruebas durante implementación. **F en verificación, aceptación manual pendiente**; guía [PRUEBAS_F.md](PRUEBAS_F.md). Reemplaza las menciones históricas F no iniciado, no autoriza G, publicación ni despliegue.

**Actualización posterior a `aeed92b`: E aprobado manualmente según reporte del responsable del 13/11.** Confirmó que después de llegada no se permite registrar lectura/preparación (E4, esperado) y que todo lo demás está probado y aprobado. Reemplaza los pendientes E siguientes, sin nuevos detalles de commit ejecutado/navegadores/dispositivos. Se repitió `test:local-websocket` con BASE_URL5174: exit0; el script es silencioso al aprobar, usa transporte sintético y no acredita una nueva prueba real entre dispositivos. Guía/registro: [PRUEBAS_E.md](PRUEBAS_E.md). F no iniciado; sin publicación ni despliegue.

El responsable marcó los checklists de B/C/D y comunicó su ejecución: **B y D aprobados con observaciones; C aprobado en su alcance local**. Esto reemplaza las menciones de revisión manual pendiente del registro histórico del 12/11 siguiente, no acredita correcciones de observaciones ni despliegue. Detalles y límites en [REVISION_MANUAL_BCD_2026-11-13.md](REVISION_MANUAL_BCD_2026-11-13.md).

Pendientes confirmados: aviso de cuenta sin unidad, texto de rectificación que confunde ID con valor, orden D-007 aún ausente y texto obsoleto «sin WebSocket» en Urgencias. El bloqueo del último operador con episodios no terminales es esperado y no depende de otro navegador abierto. El `PASS` de C usa dobles; no se adjuntó evidencia nueva de restore real/RPO/RTO. Solo se repitió la prueba backend de fallo de transporte (1/1 OK, con aviso intencional); los demás resultados nuevos proceden del reporte del responsable. No se modificó código funcional ni se publicaron cambios en esta verificación.

## Correcciones posteriores a la revisión — 13/11/2026

Por solicitud del responsable se corrigieron las cuatro observaciones anteriores antes de iniciar E: aviso **Sin unidad asignada** y creación deshabilitada hasta revalidar asignación; rectificación con valor/unidad del reemplazo e ID explícito; bandeja D-007 clasificadosC1→C5/antigüedad/ID y Sin clasificar en sección separada; texto de WS conectado con conciliaciónHTTP60s o no conectado con respaldo15s. Se aplica sobre todas las páginas recuperadas y se recalcula al conciliar la API. La política previa de selección/archivo de llegados antiguos no cambió. No cambia estado/triaje automáticamente ni decide atención.

Verificación posterior: unitarias frontend27/27, nueva suite de correcciones3/3, integridad30/30 y todas las regresiones/tipos/build/Mermaid3/3; backend161/161 sin keepdb y PSrestore dobles PASS. Sin cambios backend/modelo/migraciones/datos de desarrollo. Revisión independiente sin hallazgos críticos/importantes; menor diferido sobre robustez del test de temporizadores cancelados, sin fallo funcional detectado ni medición de cadencia operativa acreditada. **Revalidación manual de correcciones pendiente**, distinta de la aprobación original. Arranque/casos: [PRUEBAS_CORRECCIONES_BCD.md](PRUEBAS_CORRECCIONES_BCD.md). E no se inició; sin push/merge/despliegue.

## Confirmación posterior y bloque E — 13/11/2026

El responsable confirmó B/C/D aprobados tras entregar `80040c7` y autorizó E. Queda aprobada la revalidación manual de las cuatro correcciones; sustituye el pendiente del apartado anterior, sin nuevos logs/dispositivos detallados. C sigue en alcance local, sin nueva evidencia de restore real/RPO/RTO.

E incorpora lectura explícita y preparación del destino, con primer autor/hora servidor conservados, versión e idempotencia. GET/detalle/WS/polling nunca confirman lectura. Preparación requiere lectura; nuevas acciones solo notificada/en_traslado. Llegada no exige ni inventa hitos. No-op con UUID nuevo/versión vigente reserva operación sin repetir versión/auditoría/aviso; replay confirmado conserva ámbito incluso tras llegada. La ambulancia consulta sin registrar por ese rol. Nuevos campos nullable y migración `emergencies/0006`, aplicada solo en base de pruebas durante esta implementación, sin inventar historia legada. **E en verificación local; aceptación manual pendiente**. Arranque/casos en [PRUEBAS_E.md](PRUEBAS_E.md). F no iniciado; sin publicación ni despliegue.

Verificación final E: backend180/180 sin keepdb; Django/migraciones/Ruff/formato/OpenAPI PASS. Frontend28 unitarias,6 escenarios E,30 integridad,3 correcciones y todas las regresiones anteriores/tipos/build/Mermaid3/3 PASS. Restore PowerShell con dobles PASS sin restauración real. Vista390px revisada sin desborde. Revisión independiente sin defectos funcionales/de seguridad demostrables; dos menores de cobertura diferidos en PRUEBAS_E. **Implementación local verificada; E manual pendiente**, no CI remoto ni despliegue.

## Retoma y plan de entrega — 12/11/2026 (registro histórico)

- Base integrada: `main` en `4091db9`. CI remoto [43010182166](https://github.com/pasaldo/ambusync/actions/runs/43010182166), del 11/11/2026: backend (88 tests), frontend y secretos en verde. Esto reemplaza las menciones históricas de CI pendiente para esa base; no acredita código nuevo aún no publicado.
- Aprobado el plan `docs/superpowers/plans/2026-11-12-pilot-completion.md`: bloques A–M; decisiones del proyecto prevalecen sobre el informe académico. No autoriza producción clínica, merge/push ni creación de recursos externos.
- Aprobados PWA instalable con conexión, preparación Render, orden D-007 (implementación pendiente), evaluación de correo API HTTPS y respaldo externo Restic/R2. No se seleccionó ni usó proveedor de correo.
- Trabajo local del bloque A en `feature/pilot-completion`: identidad de escritura conservada (UUID/cuerpo/fecha/versión), reintentos manuales y estado «Resultado sin confirmar». Un rechazo confirmado permite corregir; 409 en transiciones consulta estado vigente. El aviso no significa lectura humana.
- El borrador y las operaciones inciertas viven solo en memoria sobre las rutas. Al expirar sesión se ocultan y solo se recuperan tras comprobar la misma cuenta, grupos, membresías y unidad. Logout o cambio de ámbito los descartan; recarga/cierre pueden perderlos. No hay cola offline durable ni reenvío automático.
- Las nuevas pruebas `test:local-integrity` usan transporte HTTP sintético y Chromium; no sustituyen validación contra Django/PostgreSQL ni aceptación Android/iPhone. Evidencia de ejecución y revisión se registra al cerrar el bloque.
- Verificación local del bloque A el 12/11/2026: 19/19 unitarias y 30/30 escenarios de integridad en Chromium; tipos y compilación, `test:sync`, `test:accounts`, `test:system-admin`, `test:local-websocket` y Mermaid (3/3) pasaron. Tras un reinicio del harness se conservaron los resultados completos de unitarias/integridad y se repitieron cuentas, administración global, WebSocket, Mermaid y build cuyos registros habían quedado incompletos. Servidor de prueba de esta rama: `127.0.0.1:5174`, solo loopback.
- Revisión independiente del bloque A detectó y se corrigieron respuestas de otro episodio, bloqueo al cambiar de ámbito, destinos tardíos y errores JSON ilegibles. Regresiones adicionales verifican que esperar CSRF no permite enviar un cuerpo de otra cuenta y que un rechazo posterior no demuestra que una escritura incierta previa nunca se guardó. No se modificó backend en este bloque ni se repitió su suite; los 88 tests remotos corresponden exclusivamente a la base `4091db9`.
- Entrega: 18/11/2026; defensa: 14–16/12. Responsable disponible unos 6 días/48 h, excepto domingo 15. El presupuesto de tiempo no demuestra que quepa todo el alcance. Sin métricas nuevas de carga/disponibilidad, GPS ni despliegue acreditadas.
- Bloque B implementado localmente: retiro explícito y reasignación con expectativa de unidad, baja lógica de unidades, continuidad del último operador habilitado y auditoría de inicios/fines de asignación. Las unidades desactivadas no se ofrecen al asignar/crear cuentas; la selección respeta la operadora de la cuenta. `notificada`, `en_traslado` y `llegado` bloquean la baja de unidad; cerradas/canceladas no bloquean por sí solas la salida del último operador. La cuenta puede conservarse sin unidad y asignarse nuevamente.
- **B: revisión manual del responsable pendiente**, sobre commit `33909a7`. Seguir [PRUEBAS_B.md](PRUEBAS_B.md), sección 3; el avance a C fue autorizado sin dar B por aceptado manualmente.
- Verificación backend B el 12/11/2026: suite completa PostgreSQL **116/116**, sin `--keepdb`; incluye carreras de retiros, creación vs retiro/baja, transición vs retiro y reenvío vs baja. La revisión independiente detectó tres riesgos de bloqueo/revalidación; corregidos con regresiones RED→GREEN. Se alineó también el orden de activación con revocación. No se modificaron esquemas de base de datos. Guía de arranque y aceptación manual: [PRUEBAS_B.md](PRUEBAS_B.md); pruebas browser sintéticas no acreditan aceptación real entre dispositivos de este bloque.
- Verificación frontend B: `test:units`, unitarias 19/19, integridad 30/30, sincronización, cuentas, administración global y WebSocket; tipos/build y Mermaid 3/3 aprobados. Vista móvil sintética revisada a 390 px sin desborde horizontal. No se regeneraron las capturas versionadas de README.
- Bloque C implementado/verificado localmente: retención v2 desde **cierre formal global** registrado mediante `record_pilot_closure`, no desde cada episodio. Hasta superar cierre + 90 días conserva toda aplicación; auditoría funcional (también revocaciones de sesión) hasta superar 12 meses calendario, independiente de la aplicación; operaciones viven con su episodio; logs técnicos 30 días móviles. Simulación predeterminada y purga transaccional/reejecutable con registro mínimo de fallo. Se corrige una discrepancia de v1 respecto de D-010; las evidencias históricas no certificaban este cálculo global.
- C agrega **migración audit/0007**; aplicada por el runner exclusivamente en su base de pruebas, no a desarrollo durante esta ejecución. No se registró cierre formal ni se purgó/restauró la base de desarrollo. El wrapper de restauración compara primero la configuración activa efectiva de Django/.env, usa después el destino aislado para migración y retención, exige confirmación independiente de piloto abierto o fecha real de cierre y verifica purgas antes de finalizar. El JSON es solo un paquete de episodios de ensayo, no un backup completo.
- Verificación final C: backend **138/138** PostgreSQL sin `--keepdb`; conjunto retención/restauración **29/29**; wrapper PowerShell PASS con dobles locales sin red/restore real; Ruff/formato/Django/migraciones/OpenAPI aprobados. Regresión frontend: unitarias 19/19, integridad 30/30, unidades/cuentas/sync/system-admin/WebSocket, tipos/build y Mermaid 3/3 aprobados. Revisión independiente: tres hallazgos importantes corregidos mediante RED→GREEN. No hay CI remoto acreditado para C ni nuevo ensayo Restic/R2, RPO/RTO o aceptación manual del responsable. Arranque y guía: [PRUEBAS_C.md](PRUEBAS_C.md). B conserva revisión manual pendiente en [PRUEBAS_B.md](PRUEBAS_B.md).
- Bloque D implementado localmente: actualización versionada de motivo/síntomas/notas/triaje, mediciones seriadas y rectificación enlazada con motivo obligatorio, sin sobrescribir originales. Solo integrantes habilitados de la unidad antes de recepción; llegado/cerrada/cancelada rechazan nuevas escrituras. Replay exacto confirmado sigue permitido con ámbito vigente. Triaje registra autor/fecha servidor al alta o cambio real; guardar notas sin cambiar categoría conserva procedencia y no inventa metadatos legados. Historial distingue hojas vigentes y rectificadas; el resumen usa la última captura no rectificada.
- D agrega **migración emergencies/0005**, aplicada solo por el runner de pruebas durante esta implementación, no a desarrollo. La retención C elimina cadenas completas dentro de su purga transaccional autorizada; fuera de ella no se desligan originales. Nuevos avisos WS mínimos disparan conciliación HTTP. La SPA conserva borradores de D por ámbito solo en memoria; un refresh no rebasa silenciosamente versiones; cada formulario preserva cambios no enviados del otro. Idempotencia/respuesta incierta usan el mecanismo A.
- Verificación D el 12/11/2026: suite backend completa PostgreSQL **161/161** sin `--keepdb`, incluidas carreras de rectificación simultánea y llegada vs medición; unitarias frontend **24/24**, integridad **30/30**, `test:episode-updates` y todas las suites previas/tipos/build/Mermaid3/3 aprobados. Wrapper restore con dobles locales PASS, sin restore real. Revisión independiente detectó un hallazgo importante de autoría de triaje sin cambio; dos regresiones RED→GREEN y suite final verificadas. Vista390px revisada, no aceptación real Android/iPhone. **D manual pendiente**; guía [PRUEBAS_D.md](PRUEBAS_D.md). B sigue manual pendiente; orden D-007 de bandeja, identidad/contexto paciente/catálogoG y bloques posteriores no se declaran completados. Sin CI remoto, despliegue ni uso clínico.

## Pausa del proyecto — 10/11/2026

- No continuar desarrollo, iniciar servicios ni publicar nuevos cambios sin una nueva solicitud. Último commit funcional: `55cac2b` (`feat: configure institution operator visibility`), publicado en `origin/main`; árbol de trabajo limpio al pausar.
- Verificaciones de este estado: backend `manage.py test` (72, 1 omitida), Ruff, `makemigrations --check`, OpenAPI validator; frontend lint/build y Playwright `test:accounts` + `test:system-admin`.
- Datos locales (no están representados por el commit): **Clinica Indisa** está como `combined`; **Hospital Central Demo** tiene como única operadora autorizada a **Hospital Operador Demoo**. Hospital Operador Demoo sigue como `operator`; Hospital Central Demo sigue como `receiver`. Las demás instituciones no se alteraron. No se encontró una cuenta activa de Central Demo con ambos grupos `institution_admin` y `urgencias`, por lo que la relación se verificó en backend, no con una sesión de esa cuenta.
- Servicios al pausar: Vite cerrado; no hay listeners del proyecto en `5173/5174`, Django `8000`, PostgreSQL aislado `55432`, Valkey `6379` ni Mailpit `1025/8025`. El PostgreSQL preexistente en `5432` continúa activo y no se modificó; no es el clúster de AmbuSync.
- Para retomar, consultar primero las instrucciones de [entorno local reproducible](#entorno-local-reproducible-powershell), comprobar que no existan cambios o servicios de terceros, iniciar solo los servicios necesarios y repetir verificaciones antes de publicar.

### Evaluación WebSocket aislada — 11/11/2026

- Por solicitud expresa se creó `feature/websocket-integration` desde `05148ef`; esto no modifica la pausa ni autoriza merge, push, despliegue o uso clínico. Los cambios y pruebas de esta sección son locales, no publicados.
- Backend: Channels 4.3.2, `channels_redis` 4.3.0 y Daphne 4.2.3 se habilitaron para ASGI; `VALKEY_URL` es obligatorio. Se implementaron sesiones Django, autorización de audiencias por institución/unidad, revalidación antes de entregar y avisos post-commit minimalistas para creación, inicio de traslado, llegada, cancelación y cierre.
- Valkey está instalado en Ubuntu 26.04/WSL, habilitado con systemd, aislado a loopback y accesible desde Windows. En la prueba se instaló el paquete Ubuntu `9.0.3-0ubuntu2`; `INFO server` reportó `valkey_version=9.0.4`. `backend/.env` local ignorado por Git incluye `VALKEY_URL`. Se fijó `socket_timeout=15s`, superior al timeout de lectura bloqueante de Channels (5s); una prueba real reprodujo el fallo anterior y verificó el fix contra Valkey. Suite backend local: 88 pruebas; Django check, migraciones, Ruff, `pip-audit` y OpenAPI pasaron. CI remoto no se ejecutó.
- Frontend: `/local` refresca el estado desde la API ante eventos/reconexión, con polling de respaldo de 15 s y conciliación de 60 s conectado. `test:local-websocket`, `test:accounts`, `test:system-admin` y `test:sync` pasaron con mocks sintéticos; las pruebas de navegador automatizadas no sustituyen la prueba real PC-celular reportada satisfactoria por el responsable. CI remoto no se ejecutó.
- La prueba PC-celular se ejecutó desde Vite en la IP LAN del PC; solo Vite se expuso a la Wi-Fi privada. Daphne y Valkey siguieron en loopback y el celular accedió a ellos únicamente por los proxies `/api` y `/ws` de Vite.

### Aceptación local entre dos dispositivos — 11/11/2026

- El responsable del proyecto reportó que completó satisfactoriamente la comprobación funcional entre PC y celular: autenticación, creación de episodio sintético, actualización entre dispositivos, transiciones y recuperación/conectividad. El envío desde celular quedó verificado después de corregir la generación de UUID para orígenes HTTP de LAN donde `crypto.randomUUID()` no está disponible; se usa `crypto.getRandomValues()` para construir un UUID v4.
- La evidencia anterior es una validación manual local reportada por el responsable, no una ejecución automatizada reproducible ni un resultado de CI remoto. No se guardaron capturas ni datos clínicos. Repetir la verificación en un checkout nuevo antes de integrar o publicar.
- Resultado operativo: PostgreSQL/HTTP sigue siendo autoridad; Valkey distribuye avisos efímeros. La pérdida/desconexión de WebSocket se recupera consultando la API; no hay cola durable ni garantía de entrega humana. Valkey permanece en loopback, nunca accesible directamente desde el teléfono.
- No se autoriza con este resultado merge, push, despliegue, datos reales ni uso clínico. La pausa del proyecto se mantiene.

## Propósito y límites

Construir el flujo vertical local del piloto usando **Hospital Operador Demo**, **Hospital Central Demo**, la unidad sintética **Demo-01** y datos de prueba. Esto no cierra la etapa 0 ni autoriza uso clínico. La aplicación no está desplegada. Se ensayó aparte el respaldo cifrado de datos sintéticos hacia Cloudflare R2; esto no convierte R2 en hosting ni autoriza datos reales.

## Cuatro condiciones de entrada

| Punto | Acuerdo/estado | Criterio de salida |
|---|---|---|
| 1. Runtime | Rama publicada: sin esta integración. Rama aislada: Channels 4.3.2, `channels_redis` 4.3.0 y Daphne 4.2.3 en runtime; Valkey requerido por `VALKEY_URL`. | Suite local (88 backend) y smoke/regresión real contra Valkey pasaron; `pip-audit` sin vulnerabilidades conocidas. CI remoto no se ejecutó. PostgreSQL 18.6 está en el clúster aislado del piloto. La compatibilidad upstream completa de Python 3.14 sigue pendiente de revisión. |
| 2. Contratos | Contrato HTTP del primer slice en `backend/openapi.json`, validación y permisos en DRF; D-005 a D-014 siguen siendo la autoridad funcional. | La PR #5 está integrada en `main`. La suite llegó a 59 pruebas backend (1 omitida) en la última ejecución local registrada; incluye autenticación, emergencias, aislamiento, auditoría e idempotencia/concurrencia. Los contratos de operaciones futuras continúan pendientes. |
| 3. Alcance | Implementados localmente sesión, permisos, auditoría, emergencias, vistas de ambulancia y Urgencias, administración institucional y WebSocket para cinco eventos de emergencia. La prueba funcional PC-celular fue reportada satisfactoria por el responsable. | No es despliegue ni release. GPS, cambio de destino, recuperación de cuenta, informes y otros flujos aprobados siguen pendientes. El socket no es durable; la API sigue siendo autoridad. CI remoto sigue pendiente. |
| 4. Entorno | Python 3.14.10 instalado. PostgreSQL 18.6 responde en clúster separado `127.0.0.1:55432`; base/rol `ambusync_dev`, secretos aleatorios en `backend/.env` ignorado por Git. Docker no está instalado. | Versión actualizada y migraciones/pruebas comprobadas. Reproducir arranque con las rutas documentadas; no usar el servicio preexistente en `5432`. |
| 5. Administración global | D-015: rol `system_admin` exclusivo, sin membresía institucional ni permisos clínicos; comando local para aprovisionarlo. El panel crea instituciones Operadora y Receptora (`combined`) y la primera cuenta Urgencias con administración institucional. | Lista instituciones, edita datos, conserva bajas lógicas y permite reactivar. Desactivación bloquea login y revoca sesiones; se impide si la institución está vinculada como origen/destino a episodios no terminales. La institución combinada queda como operadora de sí misma y su administración ve/crea solo sus propias unidades. |

El primer slice y las ampliaciones administrativas descritas sí están implementados localmente; la etapa 1 continúa abierta. Las pruebas frontend y backend se ejecutan localmente y también están configuradas en CI; un resultado local no sustituye la verificación de cada ejecución remota. No se desplegó servicio de aplicación. La base local contiene cuentas y datos sintéticos; no borrar sus datos automáticamente.

La administración global está separada de `/local`: el inicio de sesión lleva `system_admin` exclusivamente a `/sistema`. El alta institucional crea tipo Operadora y Receptora (`combined`), valida RUT empresa chileno (76.000.000–79.999.999, dígito módulo 11), nombre, dirección, teléfono opcional y correo único. La institución queda automáticamente como su propia operadora; su administración Urgencias crea y ve unidades únicamente dentro de ella, no las de otros hospitales. En la misma transacción se crea la cuenta pendiente de Urgencias, grupos `urgencias` + `institution_admin`, membresía y activación de 24 horas por correo local. Un fallo de entrega revierte toda la creación. `system_admin` se crea con `create_system_admin <usuario> <correo>`; no se utiliza Django `is_staff`/`is_superuser` ni hay registro web.

## Stack bajo evaluación local

- Python 3.14.10 y Django 5.2.18; Channels 4.3.2, `channels_redis` 4.3.0 y Daphne 4.2.3 están fijados en la rama de evaluación; revisar compatibilidad upstream de Python 3.14 antes de cualquier despliegue.
- PostgreSQL sigue siendo fuente de verdad. La rama requiere `VALKEY_URL` para el channel layer; no dispone de fallback en memoria para runtime.
- PostgreSQL 18.6 en el clúster aislado del proyecto para desarrollo y aceptación local. No sustituir las pruebas de integración por SQLite.
- El paquete Valkey `9.0.3-0ubuntu2` está instalado en Ubuntu 26.04/WSL de este equipo; el runtime informó `valkey_version=9.0.4`. El smoke test `group_add`, `group_send`, `receive` y `group_discard`, más la regresión de lectura ociosa superior a 5 s, pasó desde Channels por el endpoint Windows `127.0.0.1:6379`. Esto no prueba carga ni compatibilidad completa.
- Versiones fijadas: Python 3.14.10 (`.python-version`), Django 5.2.18, DRF 3.18.3, psycopg 3.3.6, `dj-database-url` 2.3.0 y `python-dotenv` 1.2.4; la rama de evaluación añade Channels 4.3.2, `channels_redis` 4.3.0 y Daphne 4.2.3. `pip-audit` reportó cero vulnerabilidades conocidas. Revisar licencias transitivas antes de distribución.
- Fuentes: [Python 3.14.10](https://www.python.org/downloads/release/python-31410/), [compatibilidad de Django 5.2](https://docs.djangoproject.com/en/5.2/releases/5.2/), [requisitos de DRF](https://www.django-rest-framework.org/), [cambios de Channels](https://github.com/django/channels/blob/main/CHANGELOG.txt), [matriz de `channels_redis`](https://pypi.org/project/channels-redis/), [migración/compatibilidad de Valkey](https://valkey.io/topics/migration/) y [versionado PostgreSQL](https://www.postgresql.org/support/versioning/).

## Contrato mínimo del primer flujo

### Sesión y autenticación

- Mismo origen; sesiones Django en cookie `HttpOnly`, `Secure` en HTTPS, `SameSite=Lax`; mutaciones con CSRF. No guardar tokens de sesión en almacenamiento web.
- Endpoints: `GET /api/v1/auth/csrf/` emite cookie/token CSRF; `POST /api/v1/auth/login/`, `POST /api/v1/auth/logout/` y `GET /api/v1/auth/me/`. Respuesta genérica de login ante credenciales inválidas/cuenta no disponible; no enumerar cuentas.
- Cuentas y relaciones se crean solo mediante fixtures/comando local explícito; sin registro público, claves predeterminadas compartidas ni envío de correo.
- Django valida contraseñas con longitud mínima de 15 caracteres. Sesión: 30 minutos desde la última interacción explícita mediante `X-AmbuSync-User-Interaction: 1`, máximo absoluto de 12 horas y versión de revocación verificada en cada solicitud autenticada. Telemetría/polling debe omitir el encabezado y no renueva inactividad. Cambiar versión (comando `revoke_sessions <usuario>`) revoca todas las sesiones en su siguiente solicitud.
- El login central autentica y envía a `/local`, que muestra el módulo permitido por los grupos de la cuenta. Las rutas del simulador también requieren una sesión, pero sus casos de ejemplo no se conectan al backend. `/local` renueva inactividad ante interacción humana y omite ese encabezado en polling. Avisa en los dos minutos previos al vencimiento. Borradores permanecen solo en memoria, se conservan al reautenticar la misma cuenta, se descartan si cambia la cuenta y nunca se envían automáticamente.
- Login limita por cuenta y origen: cinco fallos en una ventana de 15 minutos activan espera progresiva de 30 s, 1, 2, 5 y 15 minutos; se reinicia tras 15 minutos sin fallos. Se almacena un HMAC de cuenta/origen, no el nombre ni IP en claro. Se usa `REMOTE_ADDR`; si se añade proxy debe configurarse confianza explícita antes de usarlo.

### Emergencias

- `POST /api/v1/emergencies/`: crea un episodio en estado `notificada` o `en_traslado` según acción explícita aprobada en D-006. La identidad del operador y su unidad activa se resuelven en servidor; no aceptar del cliente un actor, institución operadora o unidad arbitrarios.
- `POST /api/v1/emergencies/{id}/arrival/`: Urgencias del destino confirma llegada física y el servidor cambia el estado a `llegado`, registra fecha, usuario y auditoría. Si el episodio sigue `notificada`, exige motivo de excepción por no existir inicio de traslado registrado. Operadores y cuentas de otros destinos no pueden ejecutar la acción; una repetición no duplica auditoría ni altera la fecha.
- `POST /api/v1/emergencies/{id}/transfer-start/`: solo la ambulancia asignada inicia el traslado desde `notificada`.
- `POST /api/v1/emergencies/{id}/cancel/`: solo la ambulancia asignada cancela desde `notificada` o `en_traslado`, con motivo obligatorio.
- `POST /api/v1/emergencies/{id}/close/`: solo Urgencias del destino cierra desde `llegado`.
- Todas las transiciones requieren `operation_id` y `expected_version`; se validan bajo bloqueo transaccional, con autorización del ámbito, auditoría y reintentos idempotentes. Los estados `cancelada` y `cerrada` son terminales en este alcance.
- El cuerpo incluye UUID `operacion_id`, campos permitidos por D-007, destino habilitado y versión esperada cuando aplique. La validación clínica sigue pendiente antes de cualquier uso asistencial.
- Repetir UUID y contenido devuelve el resultado previamente autorizado sin crear otro episodio; reutilizarlo con contenido distinto produce conflicto. Revalidar permisos al recuperar el resultado.
- `GET /api/v1/emergencies/` y `GET /api/v1/emergencies/{uuid}/`: lista/detalle solo dentro del ámbito asignado al usuario. Ambulancia accede a sus episodios autorizados; urgencias al episodio dirigido a su institución. Un receptor no ve episodios de otra institución. Aplicar D-005/D-006.
- En la interfaz local, Urgencias ordena la bandeja por `en_traslado`, `llegado` y `notificada`. Las canceladas y cerradas van al archivo; cuando hay más de 20 en bandeja, las llegadas más antiguas se archivan hasta dejar 20. El archivo permite filtrar por día, mes, año y estado; la SPA recorre todas las páginas autorizadas de la API.
- La lista usa páginas de 25 por defecto, `page_size` configurable hasta 100, orden estable por creación descendente e ID.
- Errores JSON siguen el formato y categorías de `ARQUITECTURA_PILOTO.md`: validación, no autenticado, no autorizado/no disponible en ámbito, conflicto de estado/versión/idempotencia e indisponibilidad temporal; sin trazas ni contenido ajeno.
- La creación y su `AuditEvent` se confirman en una misma transacción. El evento contiene actor, institución/unidad, acción, objeto, resultado, fecha y correlación; no duplica relato ni payload clínico. No se expone un endpoint de auditoría.
- La creación se confirma en PostgreSQL antes de responder éxito. Tras el commit se programa un aviso no durable para los cinco eventos documentados; el fallo del aviso no cambia el resultado HTTP. `/local` consulta de nuevo la API ante eventos, reconexión y conciliación periódica; no afirmar entrega humana ni garantía de entrega.
- `GET /api/v1/institutions/destinations/` ofrece instituciones receptoras habilitadas a cuentas con rol de ambulancia. La ruta SPA `/local` usa sesión/CSRF para seleccionar destino y crear emergencias; no modifica el simulador ni persiste datos del backend en `localStorage`.
- `GET /api/v1/auth/me/` incluye la unidad ambulancia activa (`id`, `code`, `institution_name`) cuando la cuenta tiene una asignación vigente; la SPA la muestra junto a la sesión local y no permite elegir una unidad arbitraria.
- Síntomas y mediciones vitales aprobadas en D-007 se conservan en la API: por ejemplo, «Disnea», frecuencia cardíaca (lpm) y SpO₂ (%). Las mediciones son independientes y opcionales, con unidad, instante de medición y autor. La SPA no inventa valores ausentes. El catálogo UI aún es una lista de ejemplo, no un catálogo institucional dinámico.
- El formulario de ambulancia muestra una previsualización de la tira de signos vitales antes de guardar. En Urgencias, las tarjetas muestran triage, mediciones y colores de lectura rápida; la llegada puede confirmarse desde la tarjeta sin abrir el detalle. Los rangos y colores son una ayuda visual del piloto sintético, no una validación clínica.

### Criterios verificables

1. Migraciones y tests corren contra PostgreSQL 18.
2. Inicio de sesión, CSRF, consulta de usuario actual, cierre, inactividad, límite absoluto de 12 h y revocación de sesión se verifican; sesión expirada no conserva autorización.
3. Operador autorizado crea una emergencia con campos como `motivo`, `síntomas` y `SpO₂`; urgencias de la institución destino puede leerla.
4. Usuario de otra unidad/institución no crea ni consulta fuera de su ámbito; las pruebas incluyen solicitudes manipuladas.
5. Reintento idempotente no duplica; mismo UUID con contenido distinto y versión/estado obsoletos se rechazan.
6. Fixtures/pruebas no contienen personas, instituciones ni credenciales reales; logs no revelan secretos ni payloads clínicos.
7. CI frontend/backend configurado. CI provisiona PostgreSQL y Valkey; esta rama incluye `test:local-websocket` en el workflow frontend, pero no se ejecutó CI remoto. Las pruebas Playwright automatizadas usan mocks sintéticos; la prueba funcional PC-celular fue reportada por el responsable como satisfactoria.
8. `system_admin` está separado de los roles operativos; no tiene membresía institucional. Los datos de instituciones sintéticas heredadas se completan mediante `seed_synthetic`; las migraciones no inventan información. La documentación y capturas incluyen el nuevo panel.

## Exclusiones de este primer alcance

Siguen fuera de este slice: GPS, cambio de destino D-014, corrección de mediciones, informes, recuperación administrativa D-013, correo externo, almacenamiento offline persistente, HTTPS público, Docker/despliegue y atención real. La prueba funcional manual PC-celular y el smoke/regresión local con Valkey pasaron, según evidencia local y reporte del responsable, pero CI remoto y repetición desde checkout limpio siguen pendientes. Retención D-010/D-011 cuenta con comando, logs y pruebas locales de límites/restauración sintética. El respaldo PostgreSQL → Restic → Cloudflare R2, `restic check` y restauración aislada fueron ensayados manualmente con datos sintéticos. Esto no equivale a un entorno de aplicación desplegado ni acredita por sí solo RPO/RTO, restauración semanal continua o gasto futuro de R2. La gestión de unidades y reasignaciones sí está implementada en el panel local, pero requiere pruebas de aceptación más amplias y no es gestión operativa de una flota real.

## Entorno local reproducible (PowerShell)

El clúster aislado actualizado vive fuera del repositorio en `$env:LOCALAPPDATA\AmbuSync\postgres-dev-18.6`; está ligado únicamente a `127.0.0.1:55432`. Los binarios portables EDB están en `$env:LOCALAPPDATA\AmbuSync\postgresql-18.6-binaries\pgsql\bin`. La actualización se hizo con `pg_upgrade` en modo copia, no `--link`; el antiguo clúster 18.4 permanece detenido y conservado en `$env:LOCALAPPDATA\AmbuSync\postgres-dev`. El servicio preexistente no se detuvo ni modificó.

`DATABASE_URL`, `DJANGO_SECRET_KEY` y `POSTGRES_ADMIN_PASSWORD` son secretos locales aleatorios en `backend/.env`, con ACL local; `.env` está ignorado por Git. No copiarlo ni compartir secretos.

### Valkey local en WSL

La integración WebSocket necesita el servidor Valkey, además del cliente Python `channels_redis`. En esta máquina Valkey 9.0.3 está instalado en Ubuntu 26.04 (WSL) como paquete `valkey-server`; `valkey-server.service` queda habilitado por systemd y escucha solo en `127.0.0.1:6379` y `[::1]:6379`. La configuración local ignorada `backend/.env` incluye `VALKEY_URL=redis://127.0.0.1:6379/0`. Django configura `socket_timeout=15s`, mayor que los 5s de espera bloqueante del channel layer, para evitar que `redis-py` cierre las conexiones de consumidores inactivos. No exponer el puerto 6379 en la LAN.

En una instalación WSL Ubuntu equivalente, instalar la versión probada y comprobar servicio/conexión:

```powershell
wsl -d Ubuntu -- sudo apt-get update
wsl -d Ubuntu -- sudo apt-get install -y valkey-server=9.0.3-0ubuntu2 valkey-tools=9.0.3-0ubuntu2
wsl -d Ubuntu -- sudo systemctl enable --now valkey-server
wsl -d Ubuntu -- valkey-server --version
wsl -d Ubuntu -- valkey-cli -h 127.0.0.1 -p 6379 ping
Test-NetConnection 127.0.0.1 -Port 6379
```

Se espera versión 9.0.3, `PONG` y `TcpTestSucceeded: True`. En esta máquina WSL puede detener la distro al cerrar el último comando; para mantenerla activa mientras se prueba desde Windows, deja abierta una terminal PowerShell con:

```powershell
wsl -d Ubuntu -- bash -lc "sudo systemctl start valkey-server && exec sleep infinity"
```

Al terminar la prueba, `Ctrl+C` en esa terminal libera el proceso de espera. Windows accede a WSL por loopback; el celular nunca debe conectarse a Valkey. El backend usa la URL anterior desde su `.env` local.

```powershell
$pgBin = "$env:LOCALAPPDATA\AmbuSync\postgresql-18.6-binaries\pgsql\bin"
$dataDir = "$env:LOCALAPPDATA\AmbuSync\postgres-dev-18.6"
& "$pgBin\pg_ctl.exe" -D $dataDir -o "-h 127.0.0.1 -p 55432" -l "$dataDir\server.log" start
& "$pgBin\pg_isready.exe" -h 127.0.0.1 -p 55432
```

Las dependencias están fijadas en `backend/uv.lock` y `frontend/package-lock.json`. Las dependencias backend de runtime incluyen Channels 4.3.2, `channels_redis` 4.3.0 y Daphne 4.2.3; se instalan con `uv sync --locked`. `channels_redis` es el cliente Python, no reemplaza el proceso servidor Valkey. El frontend no añade una biblioteca WebSocket: utiliza la API WebSocket nativa del navegador. No editar lockfiles manualmente ni instalar paquetes globales para completar el runtime.

### Arranque local para un solo PC

Con Valkey activo según el apartado anterior, en `backend/.env` deben existir los valores locales de base de datos/secreto y `VALKEY_URL=redis://127.0.0.1:6379/0`. No incluyas `.env` en Git ni copies sus secretos. Instala dependencias y prepara la base/cuentas:

```powershell
uv sync --directory backend --locked --all-groups
$pgBin = "$env:LOCALAPPDATA\AmbuSync\postgresql-18.6-binaries\pgsql\bin"
$dataDir = "$env:LOCALAPPDATA\AmbuSync\postgres-dev-18.6"
& "$pgBin\pg_ctl.exe" -D $dataDir -o "-h 127.0.0.1 -p 55432" -l "$dataDir\server.log" start
& "$pgBin\pg_isready.exe" -h 127.0.0.1 -p 55432
uv run --directory backend python manage.py migrate
uv run --directory backend python manage.py seed_synthetic
```

Mantén Valkey/WSL en ejecución como se explica en [Valkey local en WSL](#valkey-local-en-wsl). En terminales separadas, inicia Daphne y Vite (y Mailpit solo para operaciones de alta/activación):

```powershell
uv run --directory backend daphne -b 127.0.0.1 -p 8000 config.asgi:application
```

```powershell
Set-Location frontend
npm ci
npm run dev -- --host 127.0.0.1
```

Abre `http://127.0.0.1:5173/`, inicia sesión con la cuenta sintética aprovisionada y usa `/local`. `manage.py runserver` no se usa en este procedimiento; Daphne sirve la aplicación ASGI requerida por `/ws/emergencies/`. La API `/api` y el WebSocket `/ws` son proxificados por Vite hacia Daphne en loopback.

### Prueba local entre dispositivos

Este procedimiento es solo para una red local confiable y datos sintéticos. No publiques el frontend en Internet ni abras PostgreSQL (`55432`), Valkey (`6379`) o Daphne (`8000`) a la red. Mantén Daphne en `127.0.0.1`; solo Vite debe escuchar en la IP privada del PC. Usa una IP estable durante la prueba y limita cualquier permiso de firewall a perfil Privado/segmento local; elimina la regla temporal al terminar.

1. Obtén la IPv4 privada del PC con `ipconfig`; en el ejemplo sustituye `192.168.100.8` por la dirección actual.
2. En la terminal de Daphne, permite ese host a Django para `ALLOWED_HOSTS` y el validador de origen. No cambies `backend/.env` de forma que pierdas las otras entradas:

   ```powershell
   $lanIp = "192.168.100.8"
   $env:DJANGO_ALLOWED_HOSTS = "127.0.0.1,localhost,$lanIp"
   uv run --directory backend daphne -b 127.0.0.1 -p 8000 config.asgi:application
   ```

3. Inicia Vite enlazado a esa dirección concreta, no a `0.0.0.0`:

   ```powershell
   Set-Location frontend
   $lanIp = "192.168.100.8"
   npm run dev -- --host $lanIp
   ```

4. Si el firewall bloquea la conexión, permite temporalmente solo TCP `5173` en el perfil Privado y desde la subred local. No abras los puertos de PostgreSQL, Valkey o Daphne.
5. Desde el PC y el celular, abre `http://<IP-LAN-DEL-PC>:5173/`, inicia sesión y valida `/local`. El celular debe estar en la misma Wi-Fi. En HTTP por IP, el origen no es un contexto seguro: `crypto.randomUUID()` puede faltar; `createOperationId()` usa `crypto.getRandomValues()` como alternativa. Las cookies de sesión se comparten dentro del mismo origen porque API/WebSocket pasan por el proxy Vite.
6. Si la sesión WebSocket se desconecta, la interfaz conserva consultas API con polling de respaldo; refresca la lista antes de repetir una creación cuyo resultado sea incierto. No reenvíes una operación a ciegas.

Al acabar, detén Vite/Daphne con `Ctrl+C`, cierra la espera WSL iniciada para mantener Valkey activo y detén únicamente el clúster local aislado de PostgreSQL. No apagues ni alteres servicios preexistentes.

### Administración institucional local

La administración se provisiona solo por procedimiento técnico sobre una cuenta personal activa que ya pertenezca a un establecimiento receptor/de Urgencias; no existe registro público ni creación de administradores desde la interfaz. Las cuentas pertenecientes a una institución operadora (por ejemplo, `demo_ambulancia`) no se pueden provisionar como administradores de cuentas. Comando controlado:

```powershell
uv run --directory backend python manage.py provision_institution_admin <usuario-existente> "<nombre exacto del establecimiento>"
```

Para probar únicamente con las cuentas sintéticas existentes, se puede provisionar `demo_urgencias` en `Hospital Central Demo`; esto combina sus permisos de urgencias y administración en el entorno local. No usar datos ni correos de personas reales.

Solo la cuenta con administración institucional y perfil de Urgencias puede crear cuentas desde la SPA. Puede crear cuentas de Urgencias para su institución y cuentas de ambulancia para una institución operadora habilitada. **Al crear una cuenta de ambulancia es obligatorio asignarle una unidad habilitada de esa institución operadora.** Posteriormente, su administración creadora puede cambiar la unidad desde el historial de cuentas; no se admite crearla sin unidad para asignarla después. El panel local permite consultar cuentas de Urgencias del establecimiento y cuentas de ambulancia creadas por esa administración; además, la API permite administrar cuentas de la propia institución. Una relación explícita `operator_institutions` limita el directorio y las unidades visibles a las operadoras autorizadas. Si una receptora legada aún no tiene una lista explícita, conserva temporalmente el directorio compartido por compatibilidad. Las instituciones `combined` usan automáticamente solo su propia institución como operadora. Hospital Central Demo tiene configurado únicamente Hospital Operador Demoo. Las cuentas de administración de ambulancias no pueden crear usuarios. Las altas quedan inactivas hasta completar activación por enlace de un solo uso de 24 horas, entregado por SMTP local; no hay correo externo. Reenviar activación rota el token. Desactivar una cuenta revoca sus sesiones y asignaciones con protecciones de continuidad; las acciones relevantes se auditan.

El desarrollo usa SMTP local de Mailpit en `127.0.0.1:1025` (configurable con `EMAIL_HOST` y `EMAIL_PORT`; UI local habitual `127.0.0.1:8025`). La configuración predeterminada no envía a servicios externos; iniciar Mailpit antes de crear cuentas. Si no se puede entregar el correo, la creación/rotación falla y revierte sus cambios. La gestión local de unidades y reasignaciones está implementada; recuperación de cuenta, cambio de permisos desde la interfaz y entrega externa continúan pendientes.

### Administración global de instituciones (D-015)

- La cuenta global se aprovisiona solo desde backend local; contraseña oculta, mínimo 15 caracteres. Puede haber varias cuentas. El grupo `system_admin` debe ser el único grupo del usuario y no puede tener membresías, `is_staff` ni `is_superuser`:

  ```powershell
  uv run --directory backend python manage.py create_system_admin <usuario> <correo>
  ```

- El login la dirige a `/sistema`. La API global vive bajo `/api/v1/system/institutions/`; sus endpoints exigen sesión, CSRF en mutaciones y rol global exclusivo. El listado incluye activas/inactivas y permite filtrar por estado/buscar por nombre o RUT.
- El alta crea una institución Operadora y Receptora (`combined`) y su primera cuenta de Urgencias con `institution_admin`. La institución es automáticamente su propia operadora: solo se listan, crean y asignan sus unidades en el panel; las instituciones combinadas no acceden a unidades de otras instituciones. El correo institucional de contacto y el de activación son campos independientes, pueden coincidir y el correo institucional debe ser único. La cuenta queda pendiente hasta que defina contraseña desde su enlace de activación local de 24 horas. Institución, cuenta, grupos, membresía, activación y auditoría se crean en transacción; si falla SMTP, se revierte todo.
- RUT se presenta como `NN.NNN.NNN-D`, base entre 76.000.000 y 79.999.999 y dígito verificador módulo 11; la interfaz admite escribir la base de 8 dígitos y completa el verificador calculado tanto al crear como al editar, o avisa si el verificador ingresado no coincide. La API exige el formato completo, normaliza y evita duplicados. Nombre admite letras Unicode, números, espacios y guion (160); dirección 255; teléfono opcional 15 caracteres (`0-9`, `+`, espacios, paréntesis y guion); correo de formato válido, dominio libre y único.
- La edición modifica nombre, RUT, dirección, teléfono o correo por campo; tipo y estado no se cambian en edición. La desactivación conserva institución, membresías, cuentas, unidades e historial, revoca sesiones y bloquea el login de miembros mientras la institución esté deshabilitada. Se rechaza si hay episodios no terminales en que figure como institución operadora o destino. Reactivar vuelve a permitir el login de cuentas que sigan activas; las sesiones anteriores no reviven.
- Cada alta, edición, baja y reactivación registra evento de auditoría. El rol global no lista ni opera emergencias, no administra cuentas institucionales ya existentes fuera de la cuenta inicial y no adquiere permisos clínicos.
- La migración agrega metadata opcional para no fabricar datos. En el entorno sintético, `seed_synthetic` completa los registros institucionales heredados con RUT/dirección/teléfono/correo de prueba de manera idempotente; correos usan `example.test`. No aplicar datos sintéticos a instituciones reales.

### Retención y respaldo sintético

- D-010/D-011: el backend contiene el comando de retención con simulación, aplicación, límites y registros técnicos/auditoría; los límites y la reaplicación tras una restauración sintética se probaron localmente.
- `ops/backups/backup-postgres.ps1`, `restore-postgres.ps1` y `prune-postgres.ps1` automatizan dump PostgreSQL, Restic y política de 24 snapshots horarios/14 diarios. Los secretos se cargan desde Credential Manager con scripts externos a Git.
- Se verificó manualmente una copia sintética en Cloudflare R2, `restic check`, restauración aislada del dump y `pg_restore --list`. También se probó manualmente el wrapper de backup y `prune -DryRun`.
- Una prueba manual exitosa no acredita ejecución periódica sostenida, monitorización/alertas, RPO ≤1 h o RTO ≤4 h. Registrar duración y restauraciones repetidas para demostrar esas metas; revisar cuotas/costes de R2. R2 es solo respaldo, no servidor de aplicación. No incluir secretos, repositorios Restic ni dumps en Git.

`seed_synthetic` solicita contraseñas por entrada oculta (mínimo 15 caracteres); no las imprime ni sobrescribe si las cuentas demo ya existen. Para revocar todas las sesiones de una cuenta local, registrando motivo/ejecutor/hora: `uv run --directory backend python manage.py revoke_sessions demo_ambulancia --reason "motivo operativo"`. El clúster de desarrollo se detiene con `& "$pgBin\pg_ctl.exe" -D $dataDir -m fast stop`. Las pruebas crean una base desechable; el rol local tiene `CREATEDB` solo para ese propósito. El smoke test de Valkey es opcional y se ejecuta cuando `VALKEY_URL` apunta a un servicio local; CI levanta servicios efímeros para sus pruebas.

Se detectó además un servicio Windows preexistente `postgresql-x64-18` en puerto 5432 (binarios 18.4), con escucha en `0.0.0.0` y `::`; no se modificó ni se usa para AmbuSync. Revisar su firewall/configuración por separado. El clúster aislado AmbuSync ya está en 18.6 y escucha solo en `127.0.0.1:55432`; esto no es autorización para abrirlo a la red.
