# Bloque I — recuperación segura de cuenta

> **Aceptación vigente —14/11/2026:** el responsable informó «las pruebas de I se encuentran aprobadas», sobre implementación `7237333` y preparación local `6b4618e`, y autorizó publicar los commits locales en `origin/feature/pilot-completion`. Esta aprobación sustituye los pendientes manuales de este documento. No se aportaron detalles por caso, navegador o dispositivo: no se certifican ejecuciones individuales adicionales. La evidencia automatizada indicada abajo sigue siendo la verificación local previa, no una nueva ejecución ni CI remota. Sin merge, despliegue, uso clínico, correo externo ni inicio J–M.

**Funcionamiento aprobado; implementación local verificada, aceptación manual pendiente.** BaseH aprobada/publicada958f7fe. Solo cuentas/correos/contactos ficticios y Mailpit local, sin atención clínica ni envío externo.

> **Preparación ya realizada con autorización expresa el14/11/2026, sobre7237333:** accounts0005 aplicada en ambusync_dev127.0.0.1:55432 y únicamenteDaphnepropio reiniciado. migrate--check/showmigrations[X]/checkPASS, rutasPOSTrecuperación cargadas(GET405sin ejecutar), SPA5174yMailpit8025HTTP200. No hace falta repetir el arranque ni duplicar procesos en esta copia. No se registraron contactos, casos, autorizaciones ni se cambiaron cuentas/permisos. Puedes empezar por I1; I4 requiere preparar de forma controlada un contacto ficticio previo. La aceptación manual sigue pendiente.

## 1. Antes de probar en la aplicación

I incorpora `accounts/0005_identityrecoverycase_passwordrecovery_and_more.py`, con contactos previos, casos técnicos y autorizaciones hasheadas. **Durante implementación se aplica solo en testDB, no en desarrollo.** No se crean contactos/permisos ni se cambian contraseñas/correos de cuentas de desarrollo por ejecutar tests.

Para habilitar pruebas manuales se requiere autorización específica para preparar esa base. Después, el responsable puede aplicar y reiniciar **solo Daphne de esta copia**:

```powershell
Set-Location 'C:\Users\pablo\Documents\Default Project\ambusync-websocket-integration\backend'
uv run python manage.py migrate
uv run python manage.py migrate --check
$env:FRONTEND_BASE_URL='http://127.0.0.1:5174'
uv run daphne -b 127.0.0.1 -p 8000 config.asgi:application
```

No duplicar servidores ni tocar el PostgreSQL ajeno5432. La copia usa PostgreSQL55432, Valkey6379, Mailpit1025/8025 y Vite5174. Arranque de servicios y frontend: [PRUEBAS_H.md](PRUEBAS_H.md#1-arranque-de-esta-copia). No iniciar cierre/purga/restore para ensayarI.

Aplicación: **http://127.0.0.1:5174/local**. Correos de prueba: **http://127.0.0.1:8025**. Si Daphne sigue con H o falta la migración, los nuevos flujos no están listos para aceptación real; no interpretar404/error de preparación como recuperación confirmada.

## 2. Pruebas manuales principales, paso a paso

### I1 — olvidé mi contraseña

1. Elegir una cuenta ficticia **activa**, con contraseña propia y correo de prueba registrado. Una invitación sin activar o una cuenta deshabilitada no se reactiva recuperando.
2. Abrir login y pulsar **Olvidé mi contraseña**. Escribir su correo y **Solicitar recuperación**.
3. Esperado: mensaje genérico. No se muestra si existe la cuenta, su usuario, un enlace ni una contraseña.
4. Abrir Mailpit8025 y el correo de recuperación. Abrir su enlace completo, de un uso/30min. El secreto se retira de la barra al cargar; no copiarlo a capturas, consola ni informes.
5. Escribir una contraseña nueva de15–128caracteres, repetirla y confirmar.
6. Esperado: **Contraseña restablecida**, sin entrar automáticamente. Ir al login e iniciar con usuario y contraseña nueva. La anterior ya no sirve.

El envío se procesa fuera de la respuesta pública en un worker acotado en memoria. **202 significa petición recibida, no correo entregado.** Si Mailpit está detenido, hay saturación o se cierra el proceso, puede no llegar: revisar servicios y reintentar manualmente. No hay cola durable ni reenvío automático.

### I2 — enlace inválido y sesiones anteriores

1. Antes de recuperar, iniciar la misma cuenta en dos perfiles/contextos independientes. Recuperar desde otro contexto.
2. Tras confirmar, las sesiones anteriores deben dejar de consultar/operar; el WebSocket viejo recibe cierre de revocación cuando el transporte está disponible, y HTTP/entregaWS revalidan en DB aunque falle el aviso.
3. Abrir otra vez el enlace utilizado: debe rechazarse sin cambiar de nuevo la contraseña.
4. Un enlace vencido se rechaza. No hace falta esperar30min solo para repetir el test automatizado; si no se comprueba manualmente, indicarlo.
5. Si se abre un enlace distinto en la misma pestaña, deben descartarse el secreto y la contraseña en borrador anteriores. No confirmar para otra cuenta por confundir enlaces.
6. Si se pierde la respuesta al confirmar, no asumir que falló: probar login con la contraseña recién definida o solicitar un enlace nuevo. La pantalla no reenvía ni declara éxito sin respuesta válida.

### I3 — solicitud desde administración

1. Con administración+Urgencias, abrir **Administración → Historial de cuentas**.
2. En una cuenta activa gestionable, pulsar **Solicitar recuperación** y confirmar el aviso.
3. Esperado: instrucciones al **correo ya registrado**, si la cuenta es elegible. El administrador no ve el enlace/contraseña ni puede proponer un correo nuevo.
4. En auditoría aparecen **Recuperación de cuenta solicitada** y, al completarse para una cuenta del destino autorizado, **Contraseña restablecida**. No aparecen tokens, contactos de recuperación, pruebas de identidad ni relatos clínicos.
5. Urgencias sin administración, administración global y cuentas ajenas no adquieren esta gestión institucional.

### I4 — perdió acceso al correo: soporte técnico

Esta vía **no está en la web**. No usar un contacto inventado después de perder el correo. Si no existe contacto institucional previo verificable, el caso se bloquea y escala a infraestructura; no se sustituye por preguntas secretas ni contraseña compartida.

Para una demostración sintética, preparar primero un contacto conocido ficticio **antes de simular la pérdida**, con autorización del responsable. Desde backend, soporte registra la referencia previa:

```powershell
uv run python manage.py register_recovery_contact '<usuario_sintetico>' --channel phone --provenance 'Referencia institucional sintética previa' --confirmed-prior-contact
```

El comando solicita el contacto sin incluirlo en los argumentos/historial. Guardar el **ID de contacto** devuelto, no un enlace. `institutional_email` es alternativa para un correo institucional independiente del correo perdido. El registro declara una comprobación previa del responsable; la aplicación no certifica que una llamada externa ocurrió.

Después de simular la pérdida, abrir caso con el contacto previo:

```powershell
uv run python manage.py start_email_recovery '<usuario_sintetico>' --contact '<ID_CONTACTO>'
```

Solicita de forma interactiva el correo nuevo ficticio. Esperado: devuelve **ID de caso**, pero el correo registrado y la contraseña siguen intactos. Mientras el caso más reciente esté pendiente/aprobado, la petición pública al correo anterior responde genéricamente **sin entregar otro enlace**. Así no reemplaza la confirmación técnica.

Tras comprobar por el contacto previo, registrar otro verificador responsable, método coincidente y resultado:

```powershell
uv run python manage.py verify_email_recovery '<ID_CASO>' --verifier '<referencia_verificador_distinto>' --method phone --result approved
```

Esperado: Mailpit recibe confirmación en el correo **nuevo**. Soporte no introduce contraseña ni obtiene un token por consola. Solo al abrir ese enlace y establecer contraseña propia se aplican, juntos, correo nuevo, contraseña y revocación.

Para rechazar una verificación **pendiente**:

```powershell
uv run python manage.py verify_email_recovery '<ID_CASO>' --verifier '<referencia_verificador_distinto>' --method phone --result rejected
```

Esperado: ningún enlace de confirmación nuevo y ningún cambio de cuenta. Caso/contacto sustituidos, verificación ya usada, cambio de ámbito, correo nuevo ocupado, caducidad o fallo de entrega no deben aplicar cambios parciales. No se editan contactos ni evidencias desde el panel.

Si un caso aprobado vence sin confirmarse, soporte debe abrir y verificar un caso nuevo con contacto previo vigente; no crear un bypass ni reusar el token. Casos anteriores no se verifican como si fueran los actuales.

## 3. Controles de uso

- Solicitudes públicas: cinco por identificador y20por origen en15min, tanto para existentes como inexistentes. Confirmaciones tienen límite separado. No bloquea el login por compartir contador; esperar antes de repetir pruebas de la misma cuenta.
- No se conceden grupos, cambia unidad/institución ni activa una cuenta recuperando. Recuperación no sustituye invitación24h.
- Tokens solo como digest en DB; fragmentoSPA/estado en memoria, sin almacenamiento web ni tokens en URLHTTP generada. Las contraseñas se limpian al responder.
- Configuración de contacto se conserva como configuración de seguridad. Casos y autorizaciones de recuperación siguen el plazo de auditoríaC,12meses desde cierre global; expirar en30min significa que el enlace no funciona, no que se haya eliminado ya su metadata.
- Correo, contraseña, roles, revocación o ámbito que cambien mientras se usa un enlace pueden invalidarlo; solicitar uno nuevo, no forzar reintentos.
- Un202 público no certifica existencia, entregaSMTP ni verificación de identidad.

## 4. Verificación técnica local

Backend PostgreSQL, desde backend:

```powershell
uv run python manage.py test accounts.tests_recovery accounts.tests_recovery_support accounts.tests_recovery_integrity --noinput
uv run python manage.py test --noinput
uv run python manage.py check
uv run python manage.py makemigrations --check --dry-run
uv run ruff check .
uv run ruff format --check .
uv run openapi-spec-validator openapi.json
```

Frontend, desde frontend con Vite activo:

```powershell
$env:BASE_URL='http://127.0.0.1:5174'
npm run test:recovery
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
npm run test:local-websocket
npm run test:sync
npm run lint
npm run build
npm run check:diagrams
```

Las pruebas usan transporte sintético o testDB; no acreditan una llamada de verificación real, SMTPexterno, dispositivos del responsable, nuevaCIremota ni restore real. PSrestore usa dobles locales.

### Resultados y límites

- Backend completo **289/289**, PostgreSQL sin keepdb: recuperación/CSRF/igualdad pública/unuso/caducidad/reemisión, límites, contraseñas, email/ámbito/contacto alterados, colisióncorreo sin cambios parciales, SMTPfallido, dobleconfirmación y reemisión concurrentes, comandos sin imprimir secretos, auditoría/retención y WSocioso revocado.
- Frontend **39unitarias +7I +18H +15G +12F +6E +30integridad +3correcciones**, actualizacionesD/unidades/cuentas/system-admin/WS/sync/tipos/build/Mermaid3/3, todos exit0. Nueva suiteI incluida en workflow, sin afirmar nueva ejecuciónCIremota.
- Checks/Ruff/formato104archivos/makemigrations/OpenAPI y PSrestore doblesPASS. No nuevas dependencias.
- Revisión independiente única estática: sin hallazgos accionables; excluye ejecuciónSMTP/WSreal, verificaciónhumanaexterna y documentos finales. Caso adicional del implementador: enlace distinto en misma pestaña mantenía secreto anterior; testRED→GREEN con reinicio de formulario por navegación, descarte de contraseña y guardas de respuestas tardías. Sin segunda revisión.
- CapturaChromium390px inspeccionada sin desborde y detectorUIuna vez sin hallazgos. No sustituye prueba real del responsable.
- Decisiones conservadas:202no confirma entrega (worker enmemoria); caso técnico abierto bloquea el correo anterior y requiere resolución de soporte; evidencia local no certifica identidadhumanaexterna. Menores previosH de pantalla inicialauditadminsinrolclínico y warningbundleprincipal>500kB no se corrigieron enI.
- No se migró desarrollo, reinició Daphne para cargarI ni registró contacto/grant/cambió cuenta de desarrollo. Aprobar funcionamiento no autoriza por inferencia estas preparaciones operativas.

## 5. Aceptación

- [x] Preparación de base autorizada expresamente y realizada localmente por el agente: accounts0005 y Daphne actualizado, sin datos de recuperación creados.
- [ ] I1 recuperación normal, sin autologin y con contraseña nueva.
- [ ] I2 enlace no reutilizable y sesiones anteriores revocadas.
- [ ] I3 administración solo inicia envío al correo registrado, auditoría mínima.
- [ ] I4 procedimiento técnico con contacto previo real para el escenario sintético, sin cambios anticipados/bypass.
- [ ] Móvil legible, navegador/dispositivo registrados solo si realmente se probaron.

Reportar aprobado/observación/no probado por apartado. Aprobación del funcionamiento no es aceptación manual de implementación ni autorización de push/merge/despliegue o inicioJ–M.
