# Guía de desarrollo y contribución

Esta guía describe el estado actual del repositorio, cómo preparar frontend/backend y cómo revisar cambios. La SPA es un prototipo con **datos sintéticos**; no está autorizado para atención clínica real. La integración Channels/WebSocket con Daphne y Valkey (rama `feature/websocket-integration`) se integró en `main` el 11/11/2026; no está desplegada. El responsable reportó una prueba manual satisfactoria PC-celular. Consulta [ETAPA_1.md](ETAPA_1.md) para dependencias, preparación de Valkey, arranque de servicios y prueba LAN.

Para la versión local `feature/pilot-completion`, el [bloque B: arranque y pruebas manuales](PRUEBAS_B.md) detalla las terminales/puertos de esta copia y cómo probar retiro, reasignación, continuidad, baja de unidades y resultados inciertos. `npm run test:units` ejecuta sus regresiones browser con transporte sintético; está incluido en CI, pero B no se ha publicado ni tiene CI remoto acreditado.

**B sigue con revisión manual pendiente.** El [bloque C](PRUEBAS_C.md) agrega migración `audit/0007` y corrige retención desde cierre formal global. Aplicar la migración antes de usar sus comandos. No registrar cierre ficticio ni ejecutar `--apply` sobre desarrollo para probarlo: usar las suites con base desechable. Las pruebas del wrapper PowerShell usan dobles locales; no son restauración real ni acceso R2.

El [bloque D](PRUEBAS_D.md) agrega migración `emergencies/0005`, formularios de antecedentes/triaje y mediciones seriadas/rectificación antes de recepción. `npm run test:episode-updates` verifica el flujo con transporte sintético; no reemplaza revisión manual. La guía incluye arranque y checklist del responsable, todavía pendiente. La autoría del triaje solo cambia si cambia la clasificación; el historial conserva las mediciones rectificadas.

## Preparar el entorno

Requisitos para el frontend: Node.js **24.20.0** (`.nvmrc`) y npm **11.19.0** (`frontend/package.json`). Comprueba las versiones:

```text
node --version   # v24.20.0
npm --version    # 11.19.0
```

Si usas nvm, instala/activa Node 24.20.0 (`nvm install 24.20.0` y `nvm use 24.20.0` en nvm-windows; en nvm para Unix el comando de instalación es igual). Después fija npm:

```sh
npm install --global npm@11.19.0
```

Desde la raíz del repositorio, instala dependencias usando el lockfile y descarga Chromium para Playwright:

```sh
cd frontend
npm ci
npx playwright install chromium
```

En Linux/Ubuntu instala también las dependencias del sistema (puede requerir permisos de administrador): `npx playwright install --with-deps chromium`. CI usa esta variante. En Windows y macOS, `npx playwright install chromium` es suficiente para descargar el navegador.

No sustituyas `npm ci` por `npm install` para preparar una revisión: `ci` instala estrictamente lo fijado en `package-lock.json` y no lo actualiza.

## Ejecutar la SPA

Desde `frontend/`, inicia Vite solo en la interfaz local:

```sh
npm run dev -- --host 127.0.0.1
```

Abre `http://127.0.0.1:5173`. El modo predeterminado escucha en loopback. Para pruebas desde otro dispositivo usa el procedimiento restringido de [ETAPA_1.md](ETAPA_1.md#prueba-local-entre-dispositivos): enlaza Vite a la IP privada del PC y conserva Daphne, PostgreSQL y Valkey en loopback. Nunca expongas el servidor de desarrollo a Internet.

## Ejecutar el backend con WebSocket

El flujo WebSocket requiere PostgreSQL local, Valkey y Daphne/ASGI; el desarrollo sin alta de cuentas no requiere Mailpit. `VALKEY_URL` es obligatorio para Django y está definido en el `.env` local ignorado por Git. Usa `uv sync --directory backend --locked --all-groups` para instalar el runtime fijado en `backend/uv.lock`: incluye Channels 4.3.2, `channels_redis` 4.3.0 y Daphne 4.2.3. Valkey es un servicio aparte, no un paquete instalado por `uv`. No arranques este flujo con `manage.py runserver`; inicia:

```powershell
uv run --directory backend daphne -b 127.0.0.1 -p 8000 config.asgi:application
```

Vite proxifica `/api` a `http://127.0.0.1:8000` y `/ws` a `ws://127.0.0.1:8000`. Pasos completos, incluyendo clúster PostgreSQL, WSL/Valkey, cuentas sintéticas, acceso móvil y cierre seguro, están en [ETAPA_1.md](ETAPA_1.md#entorno-local-reproducible-powershell).

## Verificaciones

Desde `frontend/`, ejecuta antes de solicitar revisión:

```sh
npm audit
npm run lint
npm run test:unit
npm run test:local-websocket
npm run test:local-integrity
npm run check:diagrams
npm run build
npm run test:accounts
npm run test:system-admin
```

`npm run lint` ejecuta TypeScript; no hay ESLint configurado. `test:local-websocket` y las demás pruebas Playwright de SPA usan mocks sintéticos: no sustituyen la prueba manual real PC-celular ni la comprobación backend/Valkey. `check:diagrams` usa Chromium local. La prueba `test:sync` necesita el servidor de desarrollo y Chromium: mantén Vite corriendo en una terminal y ejecuta en otra:

`npm run test:accounts` ejecuta el flujo Playwright de cuentas, unidad ambulancia, vistas de episodios, bandeja/archivo de Urgencias y confirmación de llegada con el mock sintético. `npm run test:system-admin` valida el acceso exclusivo al panel global, alta institucional con cuenta inicial, edición, baja lógica y reactivación.

`npm run test:local-integrity` ejecuta regresiones de escrituras inciertas y memoria del portal:
reintento explícito con mismo UUID/cuerpo, rechazo/conflicto, reautenticación por cuenta/ámbito,
logout, recarga y respuesta tardía. Usa HTTP simulado y Chromium, no un backend real.
Configura `BASE_URL` al servidor Vite de la rama que se está probando; no uses por accidente
un servidor iniciado desde otro checkout. Las unitarias también cubren operaciones y memoria.

`npm run shots` genera las nueve capturas documentales actuales del portal `/local` (inicio
de sesión, formulario de ambulancia, previsualización de vitales, episodios de la unidad,
bandeja/archivo de Urgencias, detalle y llegada). Usa el mock sintético de Playwright y no
captura las rutas demo `/ambulancia` ni `/urgencias`; sobrescribe los archivos correspondientes
en `docs/screenshots/`.

```sh
cd frontend
BASE_URL=http://127.0.0.1:5173 npm run test:sync
```

En PowerShell:

```powershell
$env:BASE_URL = "http://127.0.0.1:5173"
npm run test:sync
Remove-Item Env:BASE_URL
```

CI usa Ubuntu y prepara Chromium con `npx playwright install --with-deps chromium`; el paso de sincronización inicia y detiene Vite automáticamente. `npm run shots` es opcional y sobrescribe imágenes de `docs/screenshots/`; no lo ejecutes como parte de una verificación rutinaria.

## Ramas, revisiones y commits

1. Mantén `main` como línea integrada y abre una rama breve por objetivo: `feat/AS-xxx-objetivo`, `fix/AS-xxx-defecto` o `docs/AS-xxx-objetivo`.
2. Haz commits pequeños y coherentes con Conventional Commits, por ejemplo `docs(development): documenta entorno AS-010`.
3. Abre un pull request a `main` con contexto, alcance/exclusiones, pruebas ejecutadas, resultados y riesgos. Añade capturas solo si aportan; nunca adjuntes datos personales o clínicos.
4. Espera a que pase **Frontend CI** y pide revisión de otra persona cuando sea posible. Resuelve observaciones antes de integrar. La estrategia recomendada es squash por tarea, conservando trazabilidad en el PR; la configuración del repositorio puede definir otro método.
5. No integres por el solo hecho de que el CI esté verde. Este resultado demuestra las verificaciones automatizadas configuradas, no cierre de etapa, validación clínica ni calidad de funcionalidades futuras.

## Versiones y releases

No etiquetes cada push. Crea una etiqueta `vMAJOR.MINOR.PATCH` solo para una entrega revisada e integrada, con notas que identifiquen alcance, commit y verificaciones. `v1.0.0` se reservará para el alcance aceptado para la defensa; **no** significa autorización clínica ni certificación. No se crea ni se publica una release como parte de AS-010.

## Checklist para cerrar la etapa 0

Usa esta lista en la revisión final; la tabla de estado y evidencia de `docs/ETAPA_0.md`, sección 11, es la fuente de verdad y debe actualizarse con resultados reales:

- [ ] Decisiones D-001–D-009 y límites sintéticos siguen vigentes y aprobados.
- [ ] Dependencias del frontend auditadas; verificaciones locales y CI registradas.
- [ ] Entorno reproducible probado desde checkout limpio; otra persona lo revisó cuando esté disponible.
- [ ] Runtime/dependencias locales fijados y auditados; PostgreSQL 18.6 local verificado. El slice inicial no autoriza exposición; completar controles adicionales antes de cualquier despliegue.
- [ ] Contratos técnicos, operación, seguridad, retención, correo, copias y restauración resueltos y verificados según el alcance.
- [ ] Criterios de aceptación, pruebas de integración, rendimiento y restauración tienen resultados observados y evidencia; no se sustituyen por metas planeadas.
- [ ] Rúbrica, calendario y disponibilidad del equipo confirmados; PRs pendientes resueltos según aprobación del responsable.
- [ ] La demostración y todos los ejemplos usan exclusivamente datos sintéticos y declaran que el prototipo no es para atención real.

Marcar esta lista no sustituye aprobación del responsable ni resuelve pendientes de diseño, implementación o validación. La etapa 0 permanece abierta mientras haya criterios obligatorios sin completar.
