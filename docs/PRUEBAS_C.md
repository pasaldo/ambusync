# Bloque C — retención y restauración aislada

**B sigue con revisión manual pendiente**, versión `33909a7`: completar [PRUEBAS_B.md](PRUEBAS_B.md), sección 3. Avanzar a C no equivale a aceptar B.

Este bloque corrige la política de retención; no cierra formalmente el piloto, no programa tareas y no autoriza una purga/restauración real. Solo datos sintéticos. No se probaron servicios externos ni RPO/RTO de C.

## 1. Arranque de esta copia

Usa las terminales/puertos de [PRUEBAS_B.md](PRUEBAS_B.md#1-iniciar-esta-copia-no-la-carpeta-de-main). PostgreSQL aislado `55432`, Valkey loopback `6379`, Daphne `8000`, Vite **5174**. No reiniciar procesos ya activos ni tocar PostgreSQL ajeno `5432`.

C agrega la migración **audit/0007**: crea el registro de cierre formal y agrega su fecha al registro de ejecuciones de retención. Antes de arrancar Django con esta versión, desde el backend de esta copia:

```powershell
Set-Location 'C:\Users\pablo\Documents\Default Project\ambusync-websocket-integration\backend'
uv sync --locked --all-groups
uv run python manage.py migrate --noinput
uv run python manage.py check
$env:FRONTEND_BASE_URL='http://127.0.0.1:5174'
uv run daphne -b 127.0.0.1 -p 8000 config.asgi:application
```

En otra terminal, si Vite no está ya iniciado:

```powershell
Set-Location 'C:\Users\pablo\Documents\Default Project\ambusync-websocket-integration\frontend'
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

**No registrar un cierre ficticio para probar en la base de desarrollo.** Esa fecha es global para todo el piloto. La migración no registra cierre ni ejecuta purgas. Mailpit solo hace falta si probarás altas de B.

## 2. Política que debes comprobar

| Situación | Resultado esperado |
|---|---|
| Sin cierre formal registrado | Conservar episodios, mediciones, operaciones y auditoría, aunque sean muy antiguos. |
| En el instante exacto de cierre + 90 días | Conservar aplicación; el límite es estricto. |
| Después de cierre + 90 días | Purgar episodios sintéticos y sus mediciones/operaciones, independientemente del estado/antigüedad particular. No borrar cuentas, unidades ni instituciones. |
| Hasta el aniversario de 12 meses calendario | Conservar auditoría funcional incluso si el episodio ya no existe. |
| Después del aniversario | Purgar auditoría funcional, incluidos eventos de cuentas/unidades y revocaciones de sesión, sin depender del episodio. Un cierre 29/02 tiene aniversario 28/02 del año siguiente. |
| Logs técnicos | Solo borrar al superar 30 días desde creación; incluye logs técnicos de retención. Los registros mínimos de ejecución se conservan aparte. |
| Repetir una purga | No debe fallar ni volver a contar filas ya borradas. |
| Fallo a mitad de aplicación | Revertir borrados y registrar tipo mínimo del error, sin texto clínico ni secretos. |

Los modelos de pacientes/posiciones de bloques futuros todavía no existen; deberán integrarse a esta política cuando se implementen. Esta regla no es normativa legal ni permite usar datos reales.

## 3. Pruebas seguras y repetibles (sin tocar datos de desarrollo)

Con PostgreSQL/Valkey locales activos, desde **backend**:

```powershell
uv run python manage.py test emergencies.tests_retention_policy emergencies.tests_retention emergencies.tests_restore_safety --noinput
```

Django crea y elimina su base de pruebas. No ejecutar otra suite backend simultáneamente sobre ella. Las pruebas registran cierres y ejecutan purgas/restauraciones JSON **solo en esa base desechable**.

Comprueba que no haya fallos y revisa estos escenarios en la salida/código:

1. `test_no_formal_closure_never_purges_application_or_audit`: conserva episodio y operación antiguos.
2. `test_exact_application_boundary_is_preserved_then_all_states_expire`: conserva en el límite, purga después los cinco estados y sus dependencias; conserva auditoría.
3. `test_audit_expires_independently_after_episode_is_gone`: auditoría sigue hasta sus 12 meses aunque ya se purgó aplicación.
4. `test_twelve_months_is_calendar_anniversary_including_leap_day`: comprueba el aniversario bisiesto.
5. `test_failure_rolls_back_data_and_records_minimal_error`: los borrados se revierten ante fallo.
6. `test_default_is_validation_without_writing`: JSON sin `--apply` no importa nada.
7. `test_dry_run_validates_entire_package_and_fields`: rechaza formato/campos inválidos sin escrituras.
8. `test_isolated_restore_reapplies_expired_retention_before_success`: lo restaurado y vencido vuelve a purgarse antes del resultado exitoso.
9. `test_retention_failure_rolls_back_restored_package`: fallo de retención revierte también la importación.
10. `test_guard_rejects_active_or_remote_database_even_when_enabled`: la habilitación de ensayo no basta para apuntar a una base activa/remota.

Desde **la raíz**, prueba el wrapper de PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ops/backups/tests/restore-postgres.tests.ps1
```

Debe terminar con `PASS`. Usa dobles de ejecutables en un proceso aparte: no contacta Restic/R2, no restaura PostgreSQL ni requiere credenciales reales. Comprueba rechazo de destino activo/remoto, equivalencia de localhost/127.0.0.1, comparación de configuración efectiva original (incluido `.env`), URL de Django igual al destino restaurado, reconciliación del cierre real, migración/reaplicación/verificación y recuperación del entorno incluso tras fallo. **No acredita un ensayo completo de backup/restauración.**

## 4. Inspección local no destructiva

Después de aplicar la migración, puedes consultar el estado desde backend:

```powershell
uv run python manage.py shell -c "from audit.models import PilotClosure; print(list(PilotClosure.objects.values('closed_at', 'recorded_at', 'executor')))"
uv run python manage.py apply_retention
```

Esperado mientras el piloto no se haya cerrado: lista de cierre vacía, `mode: dry-run`, `pilot_closed_at: null` y conteos de episodios/mediciones/operaciones/auditoría en cero. Puede haber logs técnicos vencidos en la simulación. La simulación **sí registra metadatos mínimos**; no borra datos.

Para verificar B sin interferencia, realiza su guía manual normalmente después de migrar y registra cualquier regresión. No uses `--apply` en esta base para comprobar C.

## 5. Cierre formal y restauración real: operación pendiente de autorización

El comando `record_pilot_closure --closed-at <ISO-con-zona> --executor <identificador-responsable>` solo debe usarse cuando el responsable haya cerrado realmente el piloto. Registra fecha/ejecutor/hora; repetir misma fecha no modifica el registro, otra fecha se rechaza. No acepta fechas futuras ni sin zona. No inicia una purga por sí mismo. No hay acción HTTP ni interfaz para cerrar el piloto.

Para un ensayo real, preparar previamente una base **separada, desechable y sin Daphne/Vite conectados**, nombre `ambusync_restore` o `ambusync_restore_*`. Mantener los secretos solo en variables locales/Credential Manager y autorizar el ensayo específico. El wrapper requiere `-ConfirmIsolated` y exactamente una opción adicional: `-ConfirmPilotOpen` si el responsable confirma que sigue abierto, o `-PilotClosedAt <fecha-real-con-zona> -ClosureExecutor <responsable>` si ya cerró. No admite `-SkipRetention`. Ver [ops/backups/README.md](../ops/backups/README.md).

La restauración completa sigue usando dump PostgreSQL y Restic. El comando JSON es únicamente un paquete de episodios de prueba; no restaura cuentas, auditoría, mediciones ni todo el sistema y nunca reemplaza un backup completo.

**Snapshots anteriores a C o anteriores al cierre real:** pueden no contener el cierre global. Migrar crea el esquema pero no inventa esa fecha. Por eso el wrapper exige la decisión externa anterior: para un piloto cerrado registra/contrasta la fecha real antes de purgar; para uno abierto rechaza que la copia contenga un cierre contradictorio. No basta que una copia sin fecha devuelva cero candidatos. El responsable debe contrastar su registro real y repetir el flujo esencial. El wrapper no habilita servicios; un resultado técnico exitoso no autoriza exposición ni da por cumplida esa comprobación humana.

## 6. Registro de aceptación pendiente

- [ ] Responsable ejecutó pruebas automáticas de C en su entorno y anotó resultado.
- [ ] Comprobó simulación local sin cierre ficticio y sin aplicación de purgas.
- [ ] Completó los casos manuales pendientes de B en PRUEBAS_B.md.
- [ ] Si se autoriza ensayo real: anotó snapshot, destino aislado, fecha real de cierre contrastada, migraciones, conteos, reejecución, resultado y duración. No incluir URLs con contraseña ni datos clínicos.

No marcar un ensayo externo/restauración real como realizado basándose en los dobles locales.
