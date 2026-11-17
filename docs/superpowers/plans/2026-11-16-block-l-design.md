# Bloque L — diseño aprobado: costo $0 y sin dominio propio

**Estado16/11/2026:** autorizado iniciar el diseño después de K aprobado/publicado.
El responsable exige costo estrictamente$0 y confirma que no tiene dominio propio.
Posteriormente aprobó BrevoFree como candidato para activación y recuperación
y reportó que ya existe una cuenta. No se inspeccionó esa cuenta.
Este borrador no autoriza implementación, alta de servicios, envío de correo,
despliegue, uso de secretos, cargos ni publicación de nuevos commits.
**Actualización17/11/2026:** criterio de respaldos aprobado: copia cifrada local
adicional; conservar Restic/R2 sin nuevas subidas automáticas hasta verificar
consumo y controles de costo; si no se asegura$0, automatización pendiente y
requisito externo deL no cerrado. Posteriormente el responsable confirmó
«si autorizo el diseño completo». Diseño integral aprobado para preparar el plan
local; no autoriza ejecutar ese plan ni operaciones remotas por inferencia.

Fuentes internas: `docs/ETAPA_0.md`, `docs/ETAPA_1.md`,
`docs/superpowers/plans/2026-11-12-pilot-completion.md`.

## 1. Decisiones confirmadas y propuestas

Confirmado: piloto exclusivamente sintético, presupuesto$0, sin dominio comprado.
Propuesto: un origen `https://<nombre-disponible>.onrender.com`, servicio web
RenderFree, PostgreSQLFree y KeyValueFree en la misma región. Nombre/región
concretos y cuentas disponibles pendientes de comprobar antes del alta.
La URL del proveedor no concede controlar elDNS de `onrender.com` para correo.

No se separan frontend yAPI en dominios distintos: evita cambiar el contrato
de sesión/CSRF deA–K. TLS público administrado porRender; no reutilizar ni subir
laCA/claves privadas del ensayoLAN K. No hace falta instalar unaCA en Android
para el futuro origen público con certificado válido.

## 2. Aplicación bajo un mismo origen

Propuesta: imagenDocker multietapa con Node24 para compilar React y runtime
Python3.14/Daphne. Versiones/lockfiles fijados, sin dependencias de herramientas
localesWindows. Escuchar en `0.0.0.0:$PORT` dentro del servicio, no exponerPG/Valkey.
No usar Vitedev/preview ni Djangorunserver como servidor público.

Servir únicamente artefactos frontend explícitos y rutasSPA conocidas, nunca
un directorio arbitrario del contenedor. `/api/`, `/ws/`, errores y rutas
desconocidas no deben convertirse en `index.html`. Probar rutas con sesión,
redirecciones, MIME,404, worker, manifest eiconos. APIHTTP/DaphneWS conservan
autorizaciónbackend; servir el shell no concede acceso a información protegida.

Configuración remota separada: DEBUGfalse, host/origenCSRF exactos,
cookiesSecure/HttpOnly/SameSite, esquemaHTTPS solo desde el proxy confiable.
Secretos por entorno y fueraGit/logs/frontend; no copiar `.env` de desarrollo.
No modificar las reglas de actualización pasiva, caché o GPS deK/J.

## 3. Datos y arranque administrativo

Base nueva y cuentas de demostración, sin exportar automáticamente desarrollo,
sesiones, tokens o instituciones. Aprovisionamiento y migraciones remotos requieren
autorización específica, destino verificado y prohibición de imprimir secretos.

RenderFree no ofrece shell ni one-offjobs. Propuesta: migración inicial controlada
en el arranque con fallo cerrado antes de escuchar; posteriores cambios solo
compatibles con la versión anterior y con respaldo previo. No crear/resetear
cuentas en cada arranque. El aprovisionamiento inicial mediante comandos
existentes se realizará desde elPC autorizado, con conexión remotaTLS y acceso
restringido, no mediante una rutaHTTP pública ni secretos en elbuild.
Los detalles de bloqueo y guardias de destino se cerrarán en el plan técnico.

PostgreSQL sigue siendo autoridad y almacén de sesiones/idempotencia/cuotas.
KeyValue solo lleva avisos efímeros: reiniciarlo no pierde episodios; recuperar
estado desdeAPI, nunca simular entregaWS ni reenviar escrituras automáticamente.
Comprobar compatibilidad del servicioRedis-compatible con Channels antes de
aceptarL; no se considera verificada por la elección del proveedor.

## 4. Correo sin dominio propio — configuración reportada, envío pendiente

**Candidato aprobado por el responsable: BrevoFree mediante APIHTTPS.**
El responsable reporta cuenta existente; falta verificar en ella el plan,
cuota, remitente validado y habilitación real del correo transaccional.
La aprobación del candidato no autoriza acceder a la cuenta ni enviar correos.
**Actualización17/11/2026:** el responsable confirma que su plan cubre300correos
por día y que es suficiente para esta fase. Se registra como cuota reportada,
sin inspección de cuenta ni pruebas de entrega. Remitente y habilitación
transaccional siguen pendientes. Considerar consumo de otros usos de la misma
cuenta y la ventana de renovación del proveedor; no asumir300envíos exclusivos
deAmbuSync ni que un contador local garantice por sí solo el saldo deBrevo.
**Confirmación posterior17/11/2026:** el responsable ve su correo personal como
remitente, con nombreAmbuSync y estado **Verificado**, más advertenciasDKIM/DMARC.
Esto sustituye el pendiente de confirmar existencia/verificación del remitente;
no equivale a autenticar el dominio del proveedor de correo, inspección del agente,
habilitación transaccional demostrada ni entrega verificada. No se registró la
dirección personal ni se pidió/creó claveAPI/SMTP. El diseño continúa con
BrevoHTTPS; prueba controlada y autorizada de aceptación/entrega será una puerta
de validación previa a activar el correo remoto.
Usar una dirección que controle el responsable, verificada por él, sin pedir
claves por chat ni suplantar un dominio institucional.

La documentación oficial deBrevo describe sustitución de remitentes gratuitos
por direcciones del proveedor también en correo transaccional
(`…@….t-sender-sib.com`). Es una medida temporal del proveedor, no una garantía
de entrega ni de permanencia. El destinatario verá un remitente diferente.
El hecho de tener planFree no demuestra que una cuenta concreta tenga envíos
habilitados ni cuál sea su cuota: verificar ambas cosas antes de implementar
el contrato definitivo y de realizar cualquier envío autorizado.

Resend con `resend.dev` no se propone para múltiples participantes: sin dominio
verificado solo permite enviar pruebas al correo de su propia cuenta. No
presentarlo como correo general disponible para activar otras cuentas.

AdaptadorbackendHTTPS con endpoint fijo, TLS validado, timeout acotado, errores
sin secretos y comprobación de aceptación del proveedor; no cargar listas de
pacientes/contactos ni usar campañas, SMS, WhatsApp o complementos.
Solo correos de activación/recuperación aprobados, sin clínica, con enlacesHTTPS
al origen público. Mantener contratos actuales de alta/reenvío/recuperación:
aceptación del proveedor no equivale a entrega en bandeja. No mostrar tokens en
pantalla/logs, autoconfirmar cuentas ni eliminar la verificación por correo.

Durante el piloto: límite local persistente de envíos por debajo de la cuota
gratuita confirmada y destinatarios de prueba autorizados, sin reenvío automático.
Si el proveedor rechaza el escenario sin dominio, no comprar uno ni cambiar a
un plan pagado; pausar esta parte y acordar alternativa. No darL por cerrado
con activación/recuperación remotas sin verificar.

## 5. Presupuesto y límites reales

- Sin añadir tarjetas, créditos de pago, addons, ampliaciones automáticas,
  discos persistentes, workers/cron pagados ni servicios de mantenimiento.
- Si una cuenta exige método de pago, pago para habilitar envíos o plan de pago,
  detener el alta y revisar alternativa; no aceptar pruebas gratuitas convertibles.
- Aceptar suspensión cuando se agote cuota: no garantizar funcionamiento continuo.
  No configurar tráfico artificial para eludir suspensión por inactividad.
- RenderFree puede suspender tras15min sin tráfico; arranque frío alrededor de
  unmin según proveedor, no compromiso medido. Abrir y comprobar antes de la demo.
- Un solo servicio web minimiza las750horas gratuitas compartidas porworkspace;
  revisar otros servicios, builds y transferencia existentes.
- PostgreSQLFree:1GB, una base activa gratis porworkspace y caducidad30días.
  Registrar fecha/hora exactas delpanel y planificar contra defensa14–16/12.
  Crear16/11 podría caducar16/12, sin margen; no afirmar continuidad garantizada.
  Valorar crear cerca del18/11 si calendario/condiciones lo permiten.
- La gracia tras caducar no mantiene accesible la base gratis. No depender de
  recuperar una base vencida sin pagar ni prometer recreación gratuita indefinida.
- KeyValueFree es volátil. Ficheros locales delservicio son efímeros.

## 6. Respaldo, restauración y reversión

Conservar Restic/R2 existente como objetivo de respaldo, pero su cuota gratuita
no es un tope de facturación demostrado. Antes de automatizar subidas, comprobar
consumo total de cuenta/operaciones/espacio y controles que impidan cargos.
Sin ese control verificable, el presupuesto$0 bloquea nueva automatización
externa: el responsable aprobó17/11 la copia cifrada local como protección
adicional y dejar pendiente la automatizaciónR2, sin cerrar ese requisito deL.
No se elimina ni sustituye definitivamente el acuerdo de respaldo externo.
La aprobación del criterio no autoriza ejecutar respaldos/restauraciones remotos.

Propuesta sin servidor adicional: exportación controlada desdePC y repositorio
cifrado bajo custodia del responsable, adaptando guardias de origen/destino.
Programación local solo si elPC permanece encendido; tareas perdidas no cuentan
como backups. No exponerPG a todos los orígenes para respaldar.
Restauración de ensayo siempre en destino aislado aprobado; nunca sobre
desarrollo/baseactiva ni borrado automático de la única baseFree.
Registrar snapshot, antigüedad, integridad y tiempos observados, sin inventarRPO/RTO.

Congelar commit desplegado y despliegues automáticos deshabilitados al iniciar.
Reversión delcódigo solo contra esquema compatible; no confundir rollback de
Render con restauración de datos. Mantener alternativa de demostración local.

## 7. Salud, errores y aceptación

Proponer liveness sin datos/secretos y readiness con consultaDB acotada.
FalloDB no reporta listo; falloKeyValue se distingue de pérdida de persistencia
y conserva la degradaciónHTTP aprobada cuando sea posible.
Sin endpoint público que muestre configuración, conexiones, usuarios o tokens.
No conservar logs con cuerpos clínicos, enlaces de activación/recuperación oGPS.

L exige verificar en su entorno real: TLS/hosts/CSRF, sesión/login/logout/expiración,
autorizaciónHTTP/WSS, arranque frío/reinicio/reconexión sin escrituras duplicadas,
persistenciaDB, pérdidaKeyValue y respaldo/restauración/reversión aprobados.
Correoreal solo después de autorizar proveedor, remitente y destinatarios.
PWA yGPS en primer plano se revalidan en elorigen público, sin prometer GPSde fondo.
L no sustituye el cierre documental/regresión finalM ni autoriza uso clínico.

## 8. Siguientes decisiones

1. BrevoFree aprobado; cuenta existente, cuota300/día y remitenteAmbuSync
   verificado por reporte. Validar habilitación/aceptación/entrega mediante prueba
   controlada posterior autorizada, sin solicitar secretos por chat.
2. Criterio de respaldos aprobado: copia cifrada local adicional y puerta de
   costo antes de automatizarR2. Queda pendiente comprobar los controles reales.
3. Aprobar el diseño completo y después revisar el plan de implementación local.
4. Verificar cuentas/cuotas/fechasDB/nombre disponible antes del alta; ningún
   servicio puede exigir pago para continuar bajo este diseño.
5. Separar autorización de implementación local de alta/despliegue/migraciones/
   aprovisionamiento/envíoreal/backup/restore remotos; no inferir permisos.

## 9. Entregables y puertas de aceptación del diseño consolidado

| Entregable propuesto | Comprobación necesaria antes de declararlo verificado |
| --- | --- |
| Build reproducible y un origen público | Imagen compila con lockfiles; rutasSPA/API/WS/estáticos correctamente separadas; commit identificado |
| Configuración segura | DEBUGfalse, hosts/origenes exactos, TLS/cookies/CSRF; secretos fuera de imagen, frontend, logs yGit |
| Datos remotos separados | Destino confirmado, esquema compatible, migración falla antes de servir si no concluye; sin importar desarrollo |
| Continuidad deHTTP/WS | PostgreSQL persiste; KeyValue no es autoridad; reinicio/reconexión conserva permisos y no duplica escrituras |
| CorreoBrevoHTTPS | Casos controlados de alta, activación, recuperación, cuota, rechazo y timeout; envíoaceptado no implica entregado |
| Copia cifrada local | Snapshot íntegro, contraseña bajo custodia separada, restauración aislada autorizada y tiempos medidos |
| AutomatizaciónR2 | Solo tras comprobar costo$0; en otro caso pendiente explícito, nunca falsa aprobación deL |
| Salud y reversión | Sondas acotadas sin secretos; distinguir fallosDB/canal; rollback de commit compatible sin revertir datos a ciegas |
| Demostraciónweb/PWA | Android yPC en origen público; arranque frío y validación funcional; alternativa local disponible |

Secuencia propuesta: primero código/configuración y pruebas locales sintéticas,
después aprovisionamiento remoto autorizado, comprobación de costo/destino, primer
despliegue controlado y pruebas reales autorizadas. Aprobar un paso no concede
automáticamente autorización para el siguiente. Sin merge ni nuevo push por
inferencia; no se crean servicios por disponer de un archivo de configuración.

La URL es una propuesta, no una dirección reservada. Cuotas, fechas de vencimiento
y remitente son verificaciones de cuenta/operación, no detalles que se puedan dar
por resueltos con pruebas mock. La aceptación finalL quedará pendiente mientras
falten pruebas remotas o el requisito de respaldo externo.

## Fuentes oficiales consultadas16/11/2026

- https://render.com/docs/free
- https://render.com/docs/websocket
- https://www.brevo.com/pricing/
- https://www.brevo.com/pricing.md
- https://help.brevo.com/hc/en-us/articles/14925263522578-Comply-with-Gmail-Yahoo-and-Microsoft-s-requirements-for-email-senders
- https://resend.com/docs/knowledge-base/403-error-resend-dev-domain

Documentación consultada, no contratos ni cuotas verificadas de las cuentas del
responsable. Ningún alta, correo, backup remoto, cambio productivo o prueba real
de proveedores fue ejecutado al preparar este diseño.
