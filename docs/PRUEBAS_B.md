# Bloque B — arranque y aceptación manual

**Estado: implementado y verificado automáticamente en `33909a7`; revisión/aceptación manual del responsable PENDIENTE.** Avanzar con C no cierra esa revisión. Completar los casos de la sección 3 y registrar resultados antes de integrar/desplegar la entrega.

Versión local en `feature/pilot-completion`, sobre bloque A `9754edf`. Solo datos sintéticos. No desplegado, no autorizado para atención clínica. Estas instrucciones no implican que se haya realizado aceptación manual real PC–móvil de B.

## 1. Iniciar esta copia, no la carpeta de main

Abre PowerShell en:

```powershell
Set-Location 'C:\Users\pablo\Documents\Default Project\ambusync-websocket-integration'
git branch --show-current
```

Debe indicar `feature/pilot-completion`. No cambiar de rama con cambios pendientes. Usa terminales separadas para procesos persistentes; **no reinicies servicios que ya estén escuchando**. Comprueba los puertos:

```powershell
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalPort -in @(55432,6379,8000,5174,1025,8025) } |
  Select-Object LocalAddress,LocalPort,OwningProcess
```

### PostgreSQL aislado (terminal 1, si 55432 no está activo)

```powershell
& "$env:LOCALAPPDATA\AmbuSync\postgresql-18.6-binaries\pgsql\bin\postgres.exe" -D "$env:LOCALAPPDATA\AmbuSync\postgres-dev-18.6" -h 127.0.0.1 -p 55432
```

Espera `database system is ready to accept connections`. Este clúster ya existe; **no ejecutar initdb ni borrar archivos de bloqueo**. No tocar el PostgreSQL ajeno de `5432`. Mantén abierta la terminal. Si necesita recuperación, espera; no inicies otro proceso sobre el mismo directorio.

### Valkey (terminal 2, si 6379 no está activo)

```powershell
wsl -d Ubuntu -- bash -lc 'systemctl is-active --quiet valkey-server || systemctl start valkey-server; exec sleep infinity'
```

Debe permanecer solo en loopback. Consulta [ETAPA_1.md](ETAPA_1.md#entorno-local-reproducible-powershell) si la distribución o el servicio no están preparados.

### Correo local, necesario para altas/invitaciones (terminal 3)

Inicia tu binario **Mailpit** instalado localmente, sin relay externo:

```powershell
# Sustituye la ruta por la ubicación real de tu ejecutable instalado.
& 'C:\ruta\a\mailpit.exe' --listen 127.0.0.1:8025 --smtp 127.0.0.1:1025
```

Abre `http://127.0.0.1:8025`. No se ha instalado Mailpit como parte de B. Si no lo tienes, prepara la herramienta local antes de probar altas. Retiros/reasignaciones/bajas no requieren correo. No configurar proveedor real: sigue pendiente su aprobación. Sin SMTP, el alta debe fallar sin dejar una cuenta nueva.

### Backend ASGI (terminal 4)

Desde **backend de esta copia**, con el `.env` local existente (no imprimir secretos):

```powershell
Set-Location 'C:\Users\pablo\Documents\Default Project\ambusync-websocket-integration\backend'
uv sync --locked --all-groups
uv run python manage.py check
uv run python manage.py migrate --noinput
$env:FRONTEND_BASE_URL='http://127.0.0.1:5174'
uv run daphne -b 127.0.0.1 -p 8000 config.asgi:application
```

El `.env` debe apuntar al clúster aislado en `55432` y a Valkey local. B no agrega migraciones. No usar `runserver` para validar WebSocket. El enlace de activación debe abrir el frontend **5174**, no otra copia.

### Frontend (terminal 5, si esta copia no está ya en 5174)

```powershell
Set-Location 'C:\Users\pablo\Documents\Default Project\ambusync-websocket-integration\frontend'
node --version
npm --version
npm ci
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

Versiones fijadas: Node `24.20.0`, npm `11.19.0`. Abre **http://127.0.0.1:5174/local**. Si `strictPort` falla, identifica el proceso; no lo cierres sin comprobar que te pertenece. Los tests browser pueden pasar con mocks aunque Django no esté iniciado: para aceptación manual usa el navegador normal, sin mock.

## 2. Preparar datos y sesiones

- No usar información real, ni siquiera en alias, correo o motivos.
- Usa una cuenta de **Urgencias + administración institucional**, dos unidades habilitadas `SYN-B-A` y `SYN-B-B` de la **misma operadora** y dos cuentas de ambulancia activadas `synthetic_b_1`, `synthetic_b_2`. Conserva sus contraseñas solo localmente.
- Si no existen datos demo, desde backend ejecuta `uv run python manage.py seed_synthetic`. Solicita contraseñas ocultas y no reemplaza las existentes. Para conceder administración a un miembro existente: `uv run python manage.py provision_institution_admin demo_urgencias "Hospital Central Demo"` (usa el nombre exacto de su membresía real). No usar superusuario ni `is_staff`.
- En **Administración → Unidades de ambulancia**, selecciona la operadora y crea las dos unidades. En **Crear cuentas**, crea los operadores de esa operadora y unidad A; abre los enlaces capturados por Mailpit para definir sus contraseñas. Hasta entonces son invitaciones, no operadores habilitados.
- Trabaja con administración en navegador normal, operador 1 en una ventana privada y operador 2 en otro perfil/navegador. Las pestañas privadas del mismo navegador comparten cookies: no sirven para dos identidades independientes.
- Para continuidad, crea desde operador 1 un episodio sintético con destino a la receptora administradora. Los estados que bloquean son **notificada, en_traslado y llegado**; llegado todavía no equivale a cerrado.

## 3. Qué probar, cómo y qué esperar

Antes de cada caso confirma usuario, institución y unidad. En **Historial de cuentas** puedes pulsar **Actualizar** para leer el estado vigente.

| Caso | Acciones | Resultado esperado |
|---|---|---|
| Alta y operadora elegida | Crear `SYN-B-A`/`SYN-B-B`, eligiendo explícitamente la operadora. Intentar repetir código en esa operadora. | Unidades vinculadas a la selección; duplicado rechazado. No se crea en la primera operadora por defecto si elegiste otra. |
| Reasignación sin episodios abiertos | En historial, cambiar operador 1 de A a B usando su selector. Actualizar su sesión/lista. | Mensaje de unidad asignada; solo una asignación vigente. No accede a episodios de A por su antigua asignación. El historial conserva autor y unidad originales. |
| Retiro sin desactivar cuenta | Pulsar **Retirar unidad**, cancelar la confirmación; repetir y aceptar. | Cancelar no cambia nada. Aceptar deja **Sin unidad asignada**, conserva cuenta/grupo/membresía y no permite crear emergencias desde esa cuenta sin unidad. |
| Reasignar tras retiro | En la misma fila sin unidad, seleccionar B. | Asignación aceptada; no requiere recrear cuenta ni activación. |
| Último operador | Dejar solo operador 1 habilitado en A y crear un episodio no terminal allí. Intentar retirar, mover a B y desactivar su cuenta. | Las tres acciones se rechazan y conserva asignación/acceso. Repetir con episodio llegado: sigue protegido. |
| Invitación no es reemplazo | Con el episodio abierto y solo operador 1 habilitado, invitar a otro operador en A sin activarlo; intentar retirar operador 1. | Rechazo: cuenta pendiente no satisface continuidad. |
| Reemplazo válido | Activar operador 2 y asignarlo a A; retirar o mover operador 1. | Permitido. Operador 2 sigue consultando/actualizando el episodio de A; autor del episodio no cambia. |
| Baja con episodio abierto | Con ambos operadores en A y un episodio no terminal, intentar **Unidades → Desactivar unidad**. | Rechazo incluso con dos operadores; no se termina ninguna asignación. |
| Terminales | Cerrar o cancelar episodios usando las acciones permitidas del flujo; retirar último operador o desactivar cuenta. | Permitido cuando todos los episodios son cerrados/cancelados. No se borran episodios. Para cierre debe completarse antes la llegada. |
| Baja lógica | En una unidad sin episodios no terminales, confirmar **Desactivar unidad**. | Aparece **Desactivada**, desaparece el botón y se terminan sus asignaciones; no aparece en selectores de altas/asignaciones. Las cuentas no se desactivan. |
| Ámbito | Ver selector del operador y unidades visibles para otra operadora/receptora. Entrar como operador sin administración de Urgencias. | Selector solo ofrece unidades habilitadas de la misma operadora del usuario. Directorio legado visible no autoriza baja ajena. Perfil no administrativo no gestiona estas acciones. |
| Edición obsoleta | Dos sesiones administrativas leen operador 1 en A. Primera lo mueve a B; segunda, sin actualizar, intenta retirar A. | Segunda recibe conflicto, no retira B silenciosamente. Debe **Actualizar administración**, revisar y decidir de nuevo. |
| Respuesta perdida | En DevTools, bloquear la petición de asignación o interrumpir transporte durante la acción. También se puede reproducir exactamente con `test:units`. | No anuncia éxito no confirmado ni reenvía automáticamente; exige actualizar/revisar antes de repetir. Desconectar antes de enviar no demuestra que el servidor haya recibido. |
| Sesión mientras espera | Con transporte ralentizado, iniciar asignación y cerrar sesión antes de resolver CSRF; reproducible con `test:units`. | No se envía el cuerpo antiguo después del logout ni se muestra éxito de un panel desmontado. Una petición ya enviada puede completar: volver a leer estado, no asumir reversión. |

### Auditoría e integridad (solo lectura)

Desde backend, `uv run python manage.py shell`, consulta sin modificar:

```python
from audit.models import AuditEvent
from institutions.models import Ambulance, AmbulanceAssignment
list(AuditEvent.objects.filter(action__startswith="ambulance.").order_by("-occurred_at").values("action", "actor_id", "ambulance_id", "object_id", "correlation_id")[:20])
list(Ambulance.objects.filter(code__startswith="SYN-B-").values("code", "enabled"))
list(AmbulanceAssignment.objects.filter(ambulance__code__startswith="SYN-B-").values("user_id", "ambulance__code", "active", "unassigned_at"))
```

Esperado: creación/baja e inicio/fin de asignaciones auditados con actor/unidad; reasignación correlaciona fin e inicio. Una asignación terminada conserva fila y fecha de retiro. Repetir destino ya vigente no agrega historia. No hay endpoint de reactivación de unidad en B.

## 4. Pruebas automatizadas

Con PostgreSQL/Valkey activos, desde backend:

```powershell
uv run python manage.py test --noinput
uv run ruff check .
uv run ruff format --check .
uv run openapi-spec-validator openapi.json
```

Desde frontend, con Vite de esta copia activo:

```powershell
$env:BASE_URL='http://127.0.0.1:5174'
npx playwright install chromium
npm run test:units
npm run test:accounts
npm run test:local-integrity
npm run test:unit
npm run lint
npm run build
```

`test:units` usa transporte sintético: retiro rechazado/aceptado, reasignación tras retiro, filtros, baja, respuesta perdida y logout durante CSRF. Backend prueba PostgreSQL real con hilos/conexiones separados para carreras; los tests crean/eliminan **su base de pruebas**, no purgan la base de desarrollo. No ejecutar suites backend simultáneamente sobre la misma base de pruebas. Ninguno sustituye aceptación real entre dispositivos.

## 5. Registro de revisión manual — PENDIENTE

Mantener pendiente hasta que el responsable ejecute los casos de la sección 3. Registrar fecha, versión/commit probado, resultado y fallos; no incluir contraseñas ni datos reales.

- [ ] Alta/operadora correcta y código duplicado.
- [ ] Reasignación, retiro confirmado/cancelado y asignación tras retiro.
- [ ] Último operador protegido; invitación pendiente no es reemplazo; segundo operador activo sí.
- [ ] Llegado sigue bloqueando; cerrada/cancelada no bloquean por sí solas.
- [ ] Baja lógica sin pérdida de historial ni selectores con unidades inactivas/ajenas.
- [ ] Edición obsoleta, respuesta perdida y cierre de sesión sin envío antiguo.
- [ ] Auditoría con actor/unidad y recuperación de ámbito HTTP.

Si pruebas sobre C, aplica primero su nueva migración siguiendo [PRUEBAS_C.md](PRUEBAS_C.md). Las pruebas de B siguen siendo válidas; no registrar un cierre ficticio ni ejecutar purgas sobre sus datos.
