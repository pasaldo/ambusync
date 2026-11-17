# L — evidencia local; aceptación remota pendiente

Estado17/11/2026: seis tareas implementadas/verificadas localmente; revisión
independiente realizada y hallazgo importante corregido mediante RED→GREEN.
**L no está aceptado ni desplegado.**
Sin correo externo, backups/restores reales o migraciones de desarrollo.

**Revisión independiente:** un hallazgo importante, sin críticos ni menores:
overrides libpq podían cambiar destino conservando el hostname declarado.
Cinco regresiones RED (18fallos de subcasos) reproducidas sin conexión; guardia
de variablesPG/opciones antes de conectar implementada, suite focal46tests
45PASS/1omisiónWindows. Fullregresión posterior:362tests,361PASS/1omisiónWindows
en152.623s; las17suitesfrontend, tipos/build/Mermaid/auditorías, smoke realDocker
y doblesbackup/restore repetidosPASS. Sin segunda revisión independiente.
En el primer RED, un diagnóstico de mock mostró una credencial PostgreSQL local;
fixture ahora usa credenciales totalmente ficticias y el log de trabajo se
sobrescribió al repetir RED. No hubo conexión remota, pero la salida ya emitida
no se puede retirar: se recomienda rotación coordinada, no ejecutada sin permiso.

| Alcance | Evidencia observada |
|---|---|
| Baseline |319/319backend,107.029s, DBexclusiva |
| PerfilHTTP/SPA/salud |15tests:14PASS/1symlinkWindows omitido |
| Brevo/cuota + accounts/institutions |135/135PASS,40.880s |
| Activación/recuperación + config |156tests:155PASS/1symlinkWindows omitido,64.059s |
| Navegador activación |9/9PASS, fragmento/query/mezcla/duplicados/stale/ack |
| Arranque protegido |9/9PASS,3.583s, incluida migración real en TESTexclusiva |
| Fullbackend tras tarea4 |357tests:356PASS/1symlinkWindows omitido,140.305s |
| Imagen real |Build/capas/señuelos/no-root/sin buildtools:PASS |
| Smoke real sintético |HTTPS/CSRF/sesión/WSS/reinicio/pérdidaKeyValue:PASS |
| SymlinkLinux |Guardia de salida de dist:PASS dentro de imagenLinux |
| Backupdeployment y restore |PASS con dobles; sin red/Restic/pgdump reales |
| Fullbackend integración |357tests:356PASS/1symlinkWindows omitido,131.565s |
| Todas las suitesfrontend |17scripts `test:*` PASS en Vitepropio63981;54unit+9activación+9reactivación+4correcciones+6hitos+12destino+15G+20informes+7recuperación+16GPS/geocoding+18PWA+30integridad, más scripts sin contadores |
| Tipos/build/Mermaid |PASS; aviso previo de bundle>500kB conservado |
| Auditorías |pip-audit sin vulnerabilidades conocidas; npm-audit0vulnerabilidades |
| Django/Ruff/OpenAPI |check/makemigrationscheck/Ruff128/formato/OpenAPI PASS |
| Final tras corrección libpq |362tests:361PASS/1omisiónWindows,152.623s; Ruff129/check/makemigrations/OpenAPI/pip-audit PASS |
| Frontend final tras corrección |17scripts `test:*`,lint/build/Mermaid/npm-audit PASS en Vitepropio59773; auditoría0vulnerabilidades |
| Docker y wrappers finales |Smokeimagen real tras guardialibpq PASS; backup/restore con dobles PASS |

Se conserva la omisiónWindows aunque la guardia se ejercitó en Linux.
Primer smoke falló por callback `lookup(all:true)` de Node24; corregido el cliente
de prueba. Segundo fallo502tras reinicio se diagnosticó como reasignación de
puerto Docker; runner consulta upstream nuevo y conserva origenTLS estable.
No se modificó producto para enmascarar errores del fixture.

Certificados smoke efímeros/loopback, sin instalar confianzaWindows/Android.
Cuenta/base sintéticas solo en contenedores propios. Sin reiniciar servicios
existentes ni migrar `ambusync_dev`. DockerDesktop instalado por autorización
posterior, motorLinux verificado; agente no aceptó licencia automáticamente.

## Repetición local

```powershell
# Desde backend: TEST exclusiva por PID, no shared test_ambusync_dev
uv run python scripts/test_isolated.py --noinput
# Desde raíz: solo recursos sintéticos propios
powershell -NoProfile -File ops/deploy/test-container.ps1
powershell -NoProfile -File ops/backups/tests/backup-deployment.tests.ps1
powershell -NoProfile -File ops/backups/tests/restore-postgres.tests.ps1
```

Frontend: cada `test:*` de package.json, tipos/build/Mermaid/auditoría, con Vite
propio aislado. `test:pwa` usa servidor propio del build; `AMBUSYNC_TEST_ARTIFACTS`
redirige capturas a scratchL para no sobrescribir históricasK. No regenerar
`shots` por rutina. TransporteSPA sintético no equivale a aceptaciónAndroid/Render.
OpenAPI no cambia: sondas infra fueraAPIv1; validar contrato existente.

## Puertas remotas todavía abiertas

Consultar [runbook](DESPLIEGUE_L.md): verificarFree/costo$0/expiry/coberturadefensa,
autorizar recursos/configuración/migración/aprovisionamiento, correo controlado y
entrega/remitente reales, deployHTTPS/WSS/Android/reinicio/frío, copia local real,
restoreaislado y rollback. Resolver controlR2$0 antes de nuevas subidas.
Externo pendiente bloquea cierreL. Aceptación explícita requerida; M separado.
No publicar claves/direcciones privadas/cuerpos/enlaces/dumps/sesiones/tokens.

## Decisiones de revisión y límites de evidencia

- SymlinkWindows omitido por permisos; guardia ejercitada en Linux. La omisión
  no se presenta como pruebaWindows aprobada.
- CapturasPWA redirigidas a scratchL mediante variable opcional de test; no cambia
  producto y preserva default/capturasK.
- Recursos/proxy/cuotas/expiryRender no inspeccionados: autorización remota pendiente;
  pueden aparecer incompatibilidades de proveedor.
- Habilitación/entrega/remitenteBrevo no probados: correo real pendiente; entrega
  todavía puede fallar.
- Backup/restore/RPO/RTO/costoR2 no acreditados: solo dobles autorizados; requisito
  externo/recuperación real siguen abiertos.
- Android/PWA/GPS en origen público no probados físicamente: pueden quedar fallos
  propios del dispositivo.
- Reviewer no repitió fullsuites/smoke: evidencia ejecutada por autor, no nueva
  ejecución independiente.
- SHA presupone build aprobado y operador de confianza; no es firma/atestación
  contra quien controla la imagen o root, que podría falsificarlo.
- A–K anterior fuera del diffL no re-auditado independientemente; se conservan
  aceptación previa y regresiones actuales, sin descartar bugs históricos.

No se solicita una segunda revisión: la única revisión autorizada se completa
con una pasada de corrección RED→GREEN y suites posteriores, no con atribuir al
reviewer una aprobación del código que no volvió a inspeccionar.
