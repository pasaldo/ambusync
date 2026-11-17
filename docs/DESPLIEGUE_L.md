# L — runbook sintético, despliegue todavía no ejecutado

**Estado17/11/2026:** preparación local verificada. No existe despliegue L
acreditado, entrega externa de correo ni aceptación L. La aprobación del plan y
de Docker no autoriza cuentas/recursos, secretos, migraciones remotas, correos,
backups/restores reales, push, dispatch ni M. Solo datos sintéticos, costo **$0**.

## Verificación Render de solo lectura —17/11/2026

Responsable autorizó comprobar Render sin crear recursos ni modificar pagos.
Acceso humano completado; agente inspeccionó el dashboard, no secretos/APIkeys.
En el workspace actual «My Workspace» se observó:

- Plan **Hobby**, **sin tarjeta**, sin cargos pendientes; factura anterior$0.
- Sin servicios creados. Uso incluido:0/750horasFree,0/5GBbandwidth,
  0/500minpipeline,0/25servicios.
- BuildPipelineStarter:500minincluidos y **límite mensual de gasto$0**.
- FormularioPG ofreceFree$0, pero el default es compute$6+storage$4.50=$10.50/mes.
- FormularioKeyValue ofreceFree$0/25MB/50conexiones/sinpersistencia, pero default$10/mes.
- No se seleccionó/confirmó ningún plan ni se pulsóCreate. Formularios abandonados;
  navegador dejado enBilling, reconfirmando Hobby/sintarjeta/sincargos/0servicios.
- WebServiceGitProvider muestra «No repositories found»: loginGitHub no equivale
  a autorizar acceso del GitHubApp al repo privado. Conexión pendiente y separada.
- Banner anuncia mantenimiento17/11a23:00GMT−3 (18/11a02:00UTC).

DocumentaciónFree consultada17/11: Web/PG/KeyValue soportados; PG1GB/30d y web
idle15min. Sin método de pago, excesos de bandwidth suspendenFree y excesos de
pipeline bloquean nuevos builds; no es garantía de disponibilidad. La fecha de
caducidadPG solo se registra al crear realmente la base, aún no creada.
No se instaló plugin/MCP ni se modificó OpenCode: la guíaRender muestra formato
distinto al nativoV2; esta comprobación se hizo por navegador autorizado.
No autoriza push, accesoGitHubApp, creación, secretos, migraciones o primerdeploy.

**Autorización posterior17/11:** responsable autorizó publicar los commits locales
en `origin/feature/pilot-completion` y conectar Render **únicamente** al repositorio
`pasaldo/ambusync`. Incluye el registro documental de la verificación/autorización;
no incluye otros archivos no relacionados ni otros repositorios. Publicación y
conexión en curso, aún sin acreditarlas. Sin crear servicios, desplegar, aplicar
migraciones remotas, añadir pagos o acceder/configurar secretos por inferencia.

## Puertas de costo y continuidad

Antes de cada operación remota, pedir autorización y comprobar condiciones reales
en las cuentas: no suponerlas por documentación histórica. Propuesta: un Web
Service Docker Free, PostgreSQL Free y Key Value Free, compatibles en región,
una instancia, autodeploy apagado. Ningún addon/upgrade/autoscaling/recurso pagado.
No hay `render.yaml` autoaplicable. Origen único HTTPS `onrender.com`, sin dominio
comprado ni CA LAN; listener HTTP accesible solo a través del proxy TLS confiable.

El diseño parte de suspensión web tras15min y PGFree1GB/30d: **reconfirmarlos**.
Registrar creación/caducidad real y cobertura de defensa14–16/12; no prometer
continuidad ni contar con gracia/recreaciones indefinidas. Si se exige pago o
no se acredita$0, detener: no añadir tarjeta ni reciclar trials/cuentas.
R2free no es un tope de cargo: sin control verificable no automatizar nuevas subidas.
Una copia local adicional no sustituye el requisito externo pendiente.

`deployment-checks.yml` es manual y no despliega. No hacer push/dispatch remoto
sin autorización y comprobación previa de minutos/cuota/costo$0.

## Artefacto, perfil y configuración

Ver [ops/deploy](../ops/deploy/README.md). Build desde commit limpio/aprobado con
SHA completo; conservar digest/commit. No publicar imagen por inferencia.
Node24.20.0/npm11.19.0/Python3.14.10/uv0.11.26 y bases por digest verificado.
Build no migra ni recibe secretos. Runtime UID10001 guarda SHA en archivo no
escribible por ese usuario; no confiar en un SHA sobrescribible mediante entorno.

Configurar solo por canal privado, nunca chat/Git/logs:

| Variable | Condición |
|---|---|
| `DJANGO_SECRET_KEY` | Única/fuerte, al menos50caracteres; distinta de desarrollo |
| `DJANGO_SETTINGS_MODULE` | `config.deployment_settings` |
| `FRONTEND_BASE_URL` | HTTPS exacto `onrender.com`, sin ruta/query/credenciales |
| `DATABASE_URL` | Base nueva aprobada, nunca `ambusync_dev` |
| `AMBUSYNC_DATABASE_NETWORK` | `internal` en Render; `external` desde equipo confiable |
| `AMBUSYNC_EXPECTED_DATABASE_HOST` | Host exacto aprobado |
| `AMBUSYNC_EXPECTED_DATABASE_NAME` | Nombre exacto aprobado |
| `VALKEY_URL` | Servicio privado aprobado, no expuesto al público |
| `AMBUSYNC_EXPECTED_VALKEY_HOST` | Host privado exacto |
| `AMBUSYNC_FRONTEND_ROOT` | `/app/frontend-dist`, predeterminado de imagen |
| `PORT` | Puerto proveedor1024–65535; default10000 |
| `BREVO_API_KEY` | Solo backend, nunca `VITE_*` |
| `BREVO_SENDER_EMAIL` | Remitente aprobado; no documentar dirección privada |
| `BREVO_ALLOWED_RECIPIENTS` | Allowlist explícita de destinatarios controlados, separados por coma |
| `BREVO_DAILY_LIMIT` | Default/máximo100intentos/díaUTC |
| `AMBUSYNC_MIGRATION_APPROVAL_SHA` | SHA específico autorizado para ese destino |

No configurar `AMBUSYNC_LOCAL_SMOKE=1` en remoto: admite solo origen loopback y
hosts de pruebas. No es bypass público. No se carga `.env` de desarrollo.
El perfil rechaza variables de entorno `PG*` no vacías y opciones de routing/
servicio libpq (`hostaddr`, `service`, etc.) antes de conectar. La URL solo admite
`sslmode` y `sslrootcert` explícitos, sin duplicados; timeout se fija en código.
Usar `sslrootcert` en la URL si hace falta CA pública, no `PGSSLROOTCERT`.
La misma guardia se ejecuta antes del arranque y al preparar la conexión del
worker de correo, sin alterar el perfil de desarrollo/SMTP.
PGinterno exige host privado exacto y `sslmode=require`: cifrado, **no**
autenticación de identidad del servidor autofirmado. PGexterno requiere host
público exacto y `verify-full`/CA confiable; nunca degradar si falla.

## Migración y aprovisionamiento sin shell Render

Autorizar imagen/SHA/base nueva/operación. No importar ni resetear desarrollo.
Arranque contrasta host efectivo del driver y `current_database()`, toma lock
asesor y hace `migrate --check`. Con pendientes solo migra bajo aprobaciónSHA
coincidente; vuelve a verificar antes de escuchar. Sin aprobación, aborta.
Nueva `accounts/0006` solo agrega contador operativo, sin destinatarios/tokens;
no aplicada a desarrollo. No hay migración durante build.

Si Free no tiene shell, aprovisionar desde el contenedor exacto en equipo confiable,
sin puertos publicados, entorno privado temporal y DBexterna `verify-full`,
solo con autorización específica. Antes de cualquier comando administrativo,
ejecutar `django.setup()` y `config.deployment_start.verify_database()` **en el
mismo proceso**; abortar si difiere. No omitirlo al sobrescribir entrypoint.

Usar `create_system_admin` interactivo/getpass; nunca contraseña en argv.
Cuenta exclusiva `system_admin`, no staff/superuser/membresía/acceso clínico.
Instituciones y primeras cuentas por flujos ya aprobados. Cada concesión mediante
`grant_pilot_permissions` requiere autorización; administrar no concede clínica.
D-013 conserva contacto previo y verificación humana registrada mediante
`register_recovery_contact`, `start_email_recovery`, `verify_email_recovery`;
sin cambio web de correo ni verificaciones fabricadas. Custodiar/eliminar el
archivo privado temporal conforme al acuerdo, sin subirlo como evidencia.

## Correo y cuotas

BrevoFree aprobado como candidato;300/día y remitente personalAmbuSync verificado
son reportes del usuario, con avisosDKIM/DMARC. No se inspeccionó cuenta ni probó
habilitación/entrega/autenticación de dominio. Una eventual sustitución del
remitente por Brevo no es garantía permanente.

Tras autorización, probar activación y recuperación a destinatario controlado.
Registrar resultado/fecha/estado, no dirección/enlace/token/messageId/headers/cuerpo.
Verificar llegada real, spam y remitente; aceptación API no equivale a entrega.
Solo201conmessageId válido confirma aceptación. HTTPS fijo/TLSverificado,
sin redirects, máximo2hijos/deadline5s, sin cola persistente/reintento automático.
Antes del intento se reserva cuota global persistente, independiente del alta.
Timeout/rechazo/rollback no reembolsa; alta fallida no conserva cuenta nueva.
DíaUTC solo avanza; margen100 no representa saldo globalBrevo y comparte capacidad
con otros usos. No resetear contador para sortear cuota.

Timeout puede dejar aceptación incierta: no reenviar automáticamente. Contrastar
cuenta/invitación antes de reenvío manual. Recuperación202genérico/worker volátil
no garantiza entrega. Activaciónfragmento24h, query legado compatible sin mezclas;
recuperaciónfragmento30min. No copiar enlaces en tickets/capturas.

## Smoke remoto y logs — pendientes

Autorizar antes: HTTPSRender real, cookiesSecure/CSRF, API401/404sin shell HTML,
SPA/recursos/PWA, login/ámbitos, WS entre dispositivos, reinicio/frío/reconexión.
`live` no consultaDB; `ready` compruebaPG sin renovar sesión ni dependerKeyValue.
PérdidaKeyValue degrada avisos; HTTP/PG siguen autoridad. Smoke local no acredita
red/proveedor remoto ni Android físico. PWALAN no migra sola al nuevo origen.
No instalarCA local para Render; offline sigue genérico, sin datos/colas.

Daphne sin accesslog; Django filtra petición/excepción, sin alterar auditoríaDB.
Proxy externo aún puede registrar query **legada** antes del backend: no prometer
borrado de logs ajenos. Fragmentos nuevos evitan enviar credenciales en la URLHTTP.

## Respaldo, rollback y contingencia

Ver [backups](../ops/backups/README.md): copia local adicional cifrada, origen
verify-full/host/base, servicio/passfile privado, dumpcustom y
`restic check --read-data` obligatorio. Repo fueraGit, clave bajo custodia separada.
Inicialización/copia real/horarios/forget/prune requieren autorización.
Restore real: destino loopback reservado/aislado y retenciónC con cierre real
independiente del snapshot. No restaurar sobre activo ni inventar cierre.
Dobles no acreditan backup/restore/RPO/RTO; R2 mantiene puerta costo$0.

Rollback no es simplemente cambiar imagen después de migrar. Confirmar compatibilidad
de esquema con commit anterior, conservar digest/esquema, preparar respaldo autorizado
y ensayar reversión en aislado. No revertir/borrar migraciones/datos por inferencia.
Si no es compatible, detener y acordar recuperación, no experimentar sobre la base.
Mantener entorno local existente como contingencia sintética sin alterar sus
servicios/CA/firewall. Distinguir demo local de despliegue público.

## Cierre

Costo$0 acreditado, configuración/migración/aprovisionamiento autorizados y
verificados, entrega real de correo, HTTPS/WSS/dispositivos, backup/restore y
rollback ensayados, requisito externo resuelto y aceptación explícita.
Ninguna suite local cierra L ni autoriza M/uso clínico.
