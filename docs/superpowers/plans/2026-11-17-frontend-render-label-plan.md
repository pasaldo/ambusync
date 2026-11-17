# Cambio de etiquetas de backend local a Render y remoción de simulador demo

## Autoridad y alcance

Usuario solicita cambiar mensajes de "backend local" a "backend en Render" y remover la opción "Abrir simulador demo" de los paneles de urgencias y ambulancia. No implica cambios de backend, sin consultas a Geoapify, sin despliegue todavía.

Base: e077b7811ce35cd52c88089a29cae2252ab4a82b (Render Live).

## Archivos afectados

- `frontend/src/screens/local/LocalPortal.tsx`: mensajes de error, éxito, etiqueta de estado y botón de simulador demo
- `frontend/src/screens/local/AdminAccountsPanel.tsx`: mensaje de error de conexión
- `frontend/src/screens/LoginScreen.tsx`: mensaje de error de conexión y pie de página de demostración

## Cambios realizados

1. Mensaje error conexión: "backend local" → "backend en Render" (LocalPortal.tsx, AdminAccountsPanel.tsx, LoginScreen.tsx, backend.ts)
2. Mensaje éxito episodio: "backend local" → "backend de Render" (LocalPortal.tsx)
3. Etiqueta estado: "Backend local" → "Backend en Render" (LocalPortal.tsx)
4. Remover botón "Abrir simulador demo" (LocalPortal.tsx)
5. Actualizar pie de página "Entorno de demostración local" → "Entorno de demostración en Render" (LocalPortal.tsx)
6. Actualizar LoginScreen pie de página "Acceso local de demostración" → "Acceso en Render" (LoginScreen.tsx)

## Verificación

- `npm run lint` (tsc --noEmit): PASS
- Tests de buzón frontend: 7/7 PASS
- No hay más referencias a "simulador demo" o "backend local" en frontend/src
- Cambios locales sin commit/push/deploy

## Restricciones

- Sin cambios de backend
- Sin nuevas consultas a Geoapify
- Sin despliegue todavía (requiere autorización separada)
