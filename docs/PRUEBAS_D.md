# Bloque D — arranque y revisión manual de actualizaciones

**Estado al 13/11/2026: revisión manual del responsable APROBADA CON OBSERVACIONES.** Las observaciones de ID/valor, orden D-007 y texto WebSocket fueron corregidas posteriormente y verificadas automáticamente; su revalidación manual está pendiente en [PRUEBAS_CORRECCIONES_BCD.md](PRUEBAS_CORRECCIONES_BCD.md). B también fue aprobado con observaciones; C no tiene nuevo ensayo operativo de restauración real acreditado. Registro: [REVISION_MANUAL_BCD_2026-11-13.md](REVISION_MANUAL_BCD_2026-11-13.md). Solo datos sintéticos, sin atención clínica.

## 1. Iniciar esta copia

Carpeta: `C:\Users\pablo\Documents\Default Project\ambusync-websocket-integration`, rama `feature/pilot-completion`. Mantener PostgreSQL aislado en `55432` y Valkey en loopback `6379`; no reiniciar servicios existentes ni tocar PostgreSQL ajeno `5432`. Comandos de esos servicios y Mailpit: [PRUEBAS_B.md](PRUEBAS_B.md#1-iniciar-esta-copia-no-la-carpeta-de-main).

D agrega **migración emergencies/0005**: autor/fecha de triaje y operación/vínculo/motivo de rectificación en mediciones. También debe estar aplicada `audit/0007` de C. Migrar no registra cierre del piloto ni purga datos. No se inventan autores/fechas de triaje ni UUID de operación para datos legados.

En PowerShell, terminal backend:

```powershell
Set-Location 'C:\Users\pablo\Documents\Default Project\ambusync-websocket-integration\backend'
uv sync --locked --all-groups
uv run python manage.py migrate --noinput
uv run python manage.py check
$env:FRONTEND_BASE_URL='http://127.0.0.1:5174'
uv run daphne -b 127.0.0.1 -p 8000 config.asgi:application
```

En otra terminal, si el Vite de esta copia no está ya iniciado:

```powershell
Set-Location 'C:\Users\pablo\Documents\Default Project\ambusync-websocket-integration\frontend'
npm ci
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

Node24.20.0/npm11.19.0. Abrir **http://127.0.0.1:5174/local**. No usar las rutas demo para aceptar integración backend. No ejecutar `record_pilot_closure`, purgas o restauraciones para probar D.

## 2. Preparación

1. Utilizar una cuenta de ambulancia activada y asignada a unidad A habilitada, una segunda cuenta activada de la misma unidad y una cuenta de Urgencias del destino.
2. Abrir identidades distintas en perfiles/navegadores separados: pestañas privadas del mismo navegador comparten cookies.
3. Crear un episodio **sintético**, con alias de prueba o identidad desconocida y motivo identificable, destino a esa Urgencias. Dejarlo notificado/en traslado, **sin confirmar llegada todavía**.
4. Si necesitas altas/unidades, seguir preparación de B y tener Mailpit local. No enviar correos reales.

## 3. Qué probar, cómo hacerlo y resultado esperado

### D1. Antecedentes y triaje

- Ambulancia → **Episodios de la unidad** → **Actualizar antecedentes y mediciones**.
- Cambiar motivo, notas y síntomas del episodio; seleccionar C2 explícitamente y pulsar **Guardar antecedentes**.
- Esperado: mensaje «Antecedentes actualizados», nuevos valores tras actualizar y en Urgencias; versión aumenta una vez. El panel de ambulancia muestra autor/fecha de triaje. No cambia creador, unidad ni destino.
- Seleccionar **Sin clasificar** y guardar. Debe quedar ausencia de clasificación, no C5 ni diagnóstico inferido. Campos vacíos permitidos de notas/síntomas se pueden limpiar; motivo no puede quedar vacío.
- Registrar C2 con operador A; después operador B guarda **solo notas**, sin cambiar C2. Deben conservarse autor/fecha de clasificación de A. Un triaje legado sin metadatos tampoco debe atribuirse a B por guardar notas. Solo un cambio real de categoría (incluida su retirada) actualiza esos metadatos y su evento de auditoría.
- Intentar enviar motivo de menos de tres caracteres: no debe guardarse. Los demás datos del formulario se conservan para corregir.

**Límite de D:** la identidad/contexto del paciente y el catálogo institucional se completan en G. Esta pantalla usa las opciones de síntomas existentes; no crea catálogo. El orden D-007 se incorporó en las correcciones posteriores: C1→C5/antigüedad y Sin clasificar separado; su guía de revalidación está enlazada arriba.

### D2. Mediciones seriadas

- En el mismo panel, elegir **Frecuencia cardíaca**, escribir70 y una **Hora de medición** de prueba, pulsar **Agregar medición**.
- Repetir con90 y hora posterior.
- Esperado: dos filas en historial, ambas conservadas, con hora medida distinta de la hora registrada en servidor y autor. No cambia silenciosamente70 por90.
- Una medición ausente no crea fila ni cero. Cero explícito es válido para los tipos que lo admiten; Glasgow acepta3–15, SpO₂0–100 y temperatura hasta un decimal. No son rangos clínicos certificados.
- Escribir unas notas sin guardar y luego agregar otra medición: **las notas sin enviar deben permanecer en su formulario**, sin haberse guardado como efecto lateral de agregar una muestra.

### D3. Rectificación trazable

- En historial, pulsar **Rectificar** en la fila70. Nuevo valor75; motivo «Error sintético de digitación». Confirmar **Registrar rectificación**.
- Esperado: fila70 permanece tachada y marcada **Rectificada: reemplazo de75lpm (medición #ID)** (con espacios en la interfaz), nueva fila75 enlazada al original, con motivo y nuevo autor/hora de registro. El ID no es el valor vital. No hay botón para volver a corregir directamente la fila70.
- Rectificar ahora75 a76: debe formar cadena70→75→76, manteniendo las tres filas.
- **Vigente en su cadena no significa última muestra:** si la muestra independiente90 tiene hora posterior, el resumen puede seguir mostrando90. Nunca debe elegir el original70 rectificado. Si rectificas la muestra más reciente90, su reemplazo es el candidato del resumen según la hora medida.
- Probar temperatura36.5 y una rectificación36.6: un decimal debe admitirse. No aceptar motivo vacío ni unidades de otro tipo mediante API manipulada.
- Probar fecha futura respecto del reloj del servidor: se conserva la captura, y el historial advierte la inconsistencia si supera un minuto; no inventa una hora «corregida». Revisar zona horaria del equipo.

### D4. Consulta de Urgencias y límite de recepción

- En Urgencias, actualizar y abrir detalle. Debe ver historial completo con originales rectificados, enlaces, motivos y autores; no botones de rectificación ni formularios de antecedentes por ese permiso.
- Confirmar llegada desde Urgencias y refrescar ambulancia. El panel pasa a consulta: **no nuevas actualizaciones, mediciones ni rectificaciones** después de llegada, cancelación o cierre.
- La API también lo rechaza: no basta ocultar controles. Un reintento exacto de una operación ya confirmada antes de llegada puede devolver su resultado actual sin duplicarla; no equivale a autorizar una edición nueva después de recepción.

### D5. Otra persona de la misma unidad y ámbito ajeno

- La segunda cuenta activa de A puede actualizar ese episodio aunque no sea su creadora; cada operación conserva su autor real y no reemplaza creador original.
- Una cuenta de unidad B no debe consultar/modificar el episodio de A por su rol de ambulancia. Urgencias de otro destino y administración global tampoco obtienen acceso clínico por estas rutas.
- Si B retira/reasigna una cuenta, actualizar la sesión antes de seguir. No deben conservarse formularios o permisos de su unidad anterior.

### D6. Edición concurrente y versión observada

- Dos operadores de A abren el mismo episodio. Uno escribe notas sin guardar. El otro guarda una actualización.
- En el primero, pulsar **Actualizar**. Debe conservar su borrador y mostrar **El episodio cambió mientras editabas**, con formulario/servidor en versiones diferentes; no envía ni rebasa automáticamente.
- Revisar el estado y pulsar **Cargar versión actual** si se decide reemplazar el formulario. El aviso explica que reemplaza sus campos; volver a introducir lo necesario antes de guardar.
- Si otra edición gana entre cargar y enviar, backend409; no sobrescribe el cambio confirmado.
- Dos rectificaciones sobre la misma hoja/versión o llegada frente a una edición concurrente tienen un solo ganador. La suite PostgreSQL prueba ambas carreras con conexiones separadas.

### D7. Respuesta perdida, reautenticación y otro ámbito

- La suite `test:episode-updates` reproduce respuesta perdida **después** del guardado. Debe mostrar «Resultado sin confirmar», congelar nuevas acciones del episodio y permitir **Reintentar operación** con UUID/cuerpo/hora/versión idénticos. No duplica filas ni auditoría.
- Para una comprobación manual de conectividad puedes usar DevTools, pero cortar antes de enviar no prueba que el servidor haya guardado. Actualizar la lista no convierte por sí solo una respuesta incierta en confirmación.
- Si expira sesión durante un intento, volver a autenticar la **misma cuenta/grupos/institución/unidad**: se conserva el intento en memoria y solo reenvía al pulsar retry. No hay envío automático.
- Logout explícito, otra identidad/unidad/institución/permisos descartan borradores e intentos anteriores; recargar/cerrar también puede perderlos. No hay persistencia clínica en navegador ni cola offline.

## 4. Pruebas automatizadas

Desde backend, con PostgreSQL/Valkey activos:

```powershell
uv run python manage.py test emergencies.tests_updates --noinput
uv run python manage.py test --noinput
uv run ruff check .
uv run ruff format --check .
uv run openapi-spec-validator openapi.json
```

Las suites crean/eliminan su base desechable; no purgan desarrollo. La regresión C comprueba que la retención puede eliminar cadenas vencidas y sus dependencias dentro de su transacción; fuera de ella las correcciones no alteran originales. No ejecutar suites backend simultáneas sobre la misma base de pruebas.

Desde frontend con Vite de esta copia activo:

```powershell
$env:BASE_URL='http://127.0.0.1:5174'
npx playwright install chromium
npm run test:episode-updates
npm run test:unit
npm run test:local-integrity
npm run test:units
npm run lint
npm run build
```

El nuevo test browser usa transporte sintético; no sustituye aceptación real PC–móvil/backend. Incluye edición/series/rectificación, preservación del original y formulario vecino, respuesta perdida/retry exacto, versión anterior, misma reautenticación, rechazo de respuesta ajena y ancho390px sin desborde.

## 5. Checklist del responsable — aprobado con observaciones, 13/11/2026

- [x] Migraciones aplicadas en esta copia; servicios correctos, sin cerrar/purgar piloto.
- [x] D1 antecedentes/triaje y validación.
- [x] D2 series y conservación de borrador vecino.
- [x] D3 rectificación/cadena/original/resumen correcto, con observación de claridad visual registrada.
- [x] D4 receptor solo consulta; llegada detiene edición.
- [x] D5 ámbitos y autores.
- [x] D6 versiones y concurrencia.
- [x] D7 incertidumbre/reautenticación/descarte por ámbito.
- [x] Revisión manual de B completada por separado, con observaciones registradas.

Reporte original:65→75 visible en Urgencias y nueva fila en ambulancia, pero `Rectificada → 45` confundía ID y valor; el triaje no reordenaba y había texto «sin WebSocket». Las tres observaciones se corrigieron posteriormente, con pruebas de valor/ID, orden entre páginas y reagrupación por avisosWS/consultaHTTP. No dar por realizada su revalidación manual: completar la guía de correcciones.

Anotar fecha, commit, usuarios/unidades **sintéticos**, resultado esperado/observado y fallos. No añadir contraseñas, datos personales ni relatos clínicos reales a evidencias.
