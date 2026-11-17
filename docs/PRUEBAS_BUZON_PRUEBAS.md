# Buzón de pruebas — evidencia local y aceptación pendiente

## Estado17/11/2026

Diseño y plan aprobados; implementación local inlineTDD. **No desplegado enRender**.
Mailpit real en la imagen, no correo real entregado. Solo datos sintéticos.
Captura privada bajo`/buzon-pruebas/`, credencialoperador independiente deDjango.
La persona que conoce esa credencial puede leer/usar los enlaces de todas las
cuentas sintéticas del buzón; no es un buzón personal por usuario.

Diseño: [test-mailbox-design](superpowers/plans/2026-11-17-test-mailbox-design.md).
Plan: [test-mailbox-implementation](superpowers/plans/2026-11-17-test-mailbox-implementation.md).

## Pruebas realizadas

| Evidencia | Resultado |
|---|---|
| Selector de modo/guardias/perfil/arranque con dobles |27PASS;modoBrevo predeterminado intacto; noDBdev |
| ProxyCaddy y Mailpit reales enredinternal |SMTPcaptura,UIPlaywright,listar/abrir/marcar/borrar PASS |
| Acceso privado |401sincredencial/inválida,inclusoAPI/estáticos/WS; sesiónsystem_admin no basta |
| FronteraAPI |send/release/proxy/linkcheck/HTMLcheck/chaos/metrics denegados; mutaciones/WSorigenajeno403 |
| Cuentas/reenvío |22PASS nuevos+gestiónexistente;3carreras:doblereenvío/activación/desactivación |
| UIcorrecciones |3PASS,503confields{}visible,ubicaciónunavailable noimpidePOSTconnullselection,incertidumbresinreintento |
| Frontend completo |18scriptsdepruebasPASS,incluyendo nuevo test:mailbox; tipos/buildPASS |
| Backend completo |386tests:385PASS/1skipWindows-symlink,112.114s enPGTESTcontenedor |
| ImagenBrevo existente |gatemigraciones/HTTPS-CSRF-sesión-WSS/reinicio/pérdidaKeyValue/symlinkLinuxPASS |
| ImagenMailpit final |activación→login,recuperaciónunuso/sinautologin,recrear→buzónvacío/cuentasintactas,reenvíoinicialPASS |
| Ciclodevida |stopSIGTERMexit0; muertehijoMailpit→unidadexit1, sin appparcial; todosno-root |
| Recursos |límiteDocker512MiB/0.1CPU;muestras161.8/199.1/164.3MiB,CPUinstantánea0.11/0.15/0.09% |
| Checks |Ruff/check/OpenAPI/pip-audit/npm-audit/Mermaid3/PSbackup-restoredoblesPASS |
| Modelo |makemigrations--check--dry-run:nochanges; warning historiaDB enport1sintético(no conexióndev) |
| Visual |capturas320/390/1280sintéticas;320/1280revisadas,sindesbordamiento;detector[] |

CPUinstantánea no midepicos ni simula toda la plataformaRender; no promesa de
rendimiento/disponibilidad con0.1CPU. Mailpit aplica limpieza periódica:100mensajes/
24h son configuración, no borrado exacto almilisegundo. Sin métricasAndroidfísicas.
NodeverificaCA/IPdelHTTPSsintético sinomitirTLS;Playwrightusa ignoreHTTPSErrors
únicamente para ese certificado temporal. No se instalóCA enOS.

### Incidencias técnicas conservadas

- Docker desapareció durante desarrollo; responsable autorizó reabrirlo. Sin
  reiniciar los antiguos serviciosAmbuSync. No atribuir causa delcierre.
- Primera suitebackend386:2rechazos por nombredbTEST delharness. Se corrigió
  harness a`test_ambusync_l_mailbox_PID`, no se relajaron guardias y se repitióverde.
- Imageninicial incorporaba filecapability deCaddyoficial aunqueCapEff0; impedía
  inspeccionar entornohijo. TestRED deausenciafilecap→eliminaciónxattrenbuild→GREEN.
- Primerosfixturesfrontend usaban etiquetaRUTexactaqueincluíaayuda;corregidolocator
  antes de observarRED delerror503oculto.
- Avisobundle>500kB previo persiste; no se abordó reorganizaciónfrontend.
- Comprobaciónfinal09:30:PGlocal55432PID46620 reapareció,creado07:56:04 bajo
  cmd27168 después de paradaautorizada07:43. No arrancado/usado por estosensayos;
  se preservó porsertrabajoajeno/desconocido. Otrospuertospreviosvacíos y0contenedores
  restantes conlabels de losensayospropios. No afirmar todosloslocalesapagados ahora.

## Reproducibilidad sin desarrollo ni proveedores

Desde raíz, DockerDesktopLinux activo previamente autorizado:

```powershell
.\ops\deploy\test-mailbox.ps1
.\ops\deploy\test-container.ps1
node .\ops\deploy\tests\run-backend-tests.mjs
node .\frontend\scripts\with-test-server.mjs --test --test-timeout=20000 scripts/test-mailbox-test.mjs
```

Si`docker` noestáenPATH, loswrappersPowerShell detectan la instalaciónuserlocal;
para comandosNode, añadir ese directorio aPATH solo para elproceso actual.
Tests usan nombres/labelspropios yretiran solo sus recursos. No `docker prune`,
no `.env`, noPG55432/Valkey6379previos. Fullfrontend:
`node frontend/scripts/with-test-server.mjs scripts/mailbox-regressions.mjs --all`.
Configurar`AMBUSYNC_TEST_ARTIFACTS` en scratchpropio paraPWA y`MAILBOX_SHOTS` si se
quieren capturas; no sobrescribir capturas históricas de otrosplanes.

## Uso previsto después de desplegar (aún no autorizado/realizado)

1. Operador abre`https://ambusync-pilot.onrender.com/buzon-pruebas/`.
2. Se autentica como`operador` con contraseñaprivadaindependiente; no credencialesDjango.
3. System_admin crea institución/primercuentaconcorreossintéticosválidos, por
   ejemplo`primera-urgencias@example.invalid`. No introducirdatosreales.
4. Elmensaje«capturadaenbuzón» acredita capturaSMTP, no entregaInternet.
5. EnMailpit abrir«Activa tu cuenta de AmbuSync» y usar elenlace confragmento
   enotra pestaña/perfil para no mezclar sesiónsystem_admin con cuentainstitucional.
6. Titular eligecontraseñapersonal15–128caracteres;activación24h/unuso/noautologin.
7. Iniciar sesióncomocuentainstitucional; no atribuirgrantsadicionales a este paso.
8. Recuperacióncaptura un mensaje equivalente para cuentas elegibles existentes;
   enlace30min/unuso,noautologin y revocaciónsesiones siguen vigentes.

### Si el buzón se vacía tras reinicio

CuentasPG no se eliminan ni activan solas. Si primeradministradorinstitucional
siguependiente:en`/sistema`→Buscarinstituciones→Reenviarprimeraactivación→confirmar.
Debe haberpasado60sdesdelaemisiónanterior;si noaparece,esperaryBuscar.
Solo primeradminauditado,membresíaexacta,instituciónhabilitada,cuentasincontraseña/
inactiva/activaciónnoconsumida(inclusocaducada).No permiteelegir otrocorreo/usuario.
Un503 preserva invitaciónanterior y muestra error;ante respuesta incierta,Buscar
antes deotrointento.Noreenvíoautomático ni duplicación de cuenta.
El resto de altas institucionales conserva su mecanismoexistente de reenvío.

### Diferencias y límites respecto a correo real

Sin remitente/allowlist/APIkeyBrevo en el camino de captura. Modo explícito, sin
fallback aBrevo. Sinrelay/forwarding/webhook/versioncheck.ManejoSMTP/UI interno.
No habilitarherramientaslinkcheck/release/screenshots/sendAPI ni exponer1025/8025.
El buzón no tiene garantía depersistencia,entregaInternet,disponibilidad o$0
ilimitado; mantienelímites ycaducidadRenderFree.

## Pendientes

Una revisiónindependientefinal yeventualesfixesTDD;autorizaciónpush yconfigprivada/
deploySHAexacto;BasicAuthrealcreadaporoperador;smokeremotosinauthyaceptaciónmanual.
Geoapify siguependiente. No se enviócorreoexterno ni se modificóRender durante
implementación. No cerrarL/M ni afirmar entregarealBrevo.
