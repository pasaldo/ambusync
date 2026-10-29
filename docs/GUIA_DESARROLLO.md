# Guía de desarrollo y contribución

Esta guía describe el estado actual del repositorio, cómo preparar el frontend y cómo revisar cambios. La SPA es un prototipo con **datos sintéticos**; no está autorizado para atención clínica real. El backend y la infraestructura descritos en la arquitectura todavía no están implementados.

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

No sustituyas `npm ci` por `npm install` para preparar una revisión: `ci` instala estrictamente lo fijado en `package-lock.json` y no lo actualiza.

## Ejecutar la SPA

Desde `frontend/`, inicia Vite solo en la interfaz local:

```sh
npm run dev -- --host 127.0.0.1
```

Abre `http://127.0.0.1:5173`. El proyecto configura Vite para escuchar interfaces de red en su ejecución habitual; no expongas el servidor de desarrollo a una red pública. La aplicación sincroniza pestañas del mismo navegador, no dispositivos distintos.

## Verificaciones

Desde `frontend/`, ejecuta antes de solicitar revisión:

```sh
npm audit
npm run lint
npm run test:unit
npm run check:diagrams
npm run build
```

`npm run lint` ejecuta TypeScript; no hay ESLint configurado. `check:diagrams` usa Chromium local. La prueba `test:sync` necesita el servidor de desarrollo y Chromium: mantén Vite corriendo en una terminal y ejecuta en otra:

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
- [ ] Runtime, dependencias y auditoría del backend completados antes de implementarlo o exponer servicios.
- [ ] Contratos técnicos, operación, seguridad, retención, correo, copias y restauración resueltos y verificados según el alcance.
- [ ] Criterios de aceptación, pruebas de integración, rendimiento y restauración tienen resultados observados y evidencia; no se sustituyen por metas planeadas.
- [ ] Rúbrica, calendario y disponibilidad del equipo confirmados; PRs pendientes resueltos según aprobación del responsable.
- [ ] La demostración y todos los ejemplos usan exclusivamente datos sintéticos y declaran que el prototipo no es para atención real.

Marcar esta lista no sustituye aprobación del responsable ni resuelve pendientes de diseño, implementación o validación. La etapa 0 permanece abierta mientras haya criterios obligatorios sin completar.
