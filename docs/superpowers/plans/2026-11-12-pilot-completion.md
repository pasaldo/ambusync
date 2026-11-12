# AmbuSync — plan maestro de entrega y bloque A

> Ejecución inline por bloques con `executing-plans`, TDD y revisión independiente al cerrar el bloque. No merge, push, despliegue ni contratación implícitos.

**Goal:** completar el piloto sintético aprobado y su entrega académica, sin presentar funciones previstas como verificadas.

**Architecture:** React y Django/DRF bajo mismo origen; PostgreSQL/HTTP es autoridad, Channels/Valkey distribuye avisos efímeros. PWA instalable con conexión, sin persistencia clínica en navegador. Render es destino propuesto, sujeto a autorización operativa.

**Tech Stack:** Node 24.20.0/npm 11.19.0, React/TypeScript/Vite; versiones backend fijadas por `backend/uv.lock`.

**Spec:** `docs/ETAPA_0.md` (D-001–D-015), `docs/ARQUITECTURA_PILOTO.md`, `docs/ETAPA_1.md` y decisiones del responsable del 12/11/2026 en esta conversación. Los acuerdos actuales prevalecen sobre el informe Word.

## Global Constraints

- Fecha de entrega: 18/11/2026; defensa 14–16/12. Disponibilidad del responsable: unas 48 horas, excepto domingo 15. No es estimación de esfuerzo suficiente.
- Solo datos sintéticos, sin uso clínico ni datos personales reales.
- Sesiones Django, CSRF y autorización backend; no tokens en almacenamiento web.
- Borradores y operaciones pendientes solo en memoria, sin autoenvío ni promesa de conservación tras recarga/cierre.
- Toda escritura incierta conserva ID y cuerpo exacto para reintento explícito; cambiar de cuenta/ámbito no permite reutilizarlos.
- Bandeja: D-007 confirmado (triaje/antigüedad, sin clasificar separado).
- Autorizada evaluación de correo por API HTTPS; proveedor/remitente/uso externo necesitan aprobación antes de usarlo.
- Restic/R2 confirmado como respaldo externo; no ejecutar restauraciones/purgas sin autorización específica.
- No ampliar alcance para coincidir con tecnologías históricas del informe.

## Review Focus

- Respuesta exitosa perdida o malformada: nunca informar rechazo ni generar UUID nuevo por reintento.
- Misma cuenta en otra unidad/institución o con permisos retirados: no recuperar borrador/operación del ámbito previo.
- Navegación al login y callbacks HTTP tardíos: no reponer información de otra sesión ni enviar automáticamente.
- Conflicto o rechazo confirmado: conservar datos corregibles, pero no bloquear indefinidamente ni repetir escrituras a ciegas.
- Actualización de versión por polling mientras existe transición incierta: reintentar cuerpo original, no reconstruirlo.

## Roadmap aprobado (contratos específicos antes de cada bloque)

| Bloque | Salida y aceptación | Dependencia |
|---|---|---|
| A | Reintentos seguros, estado incierto y borrador tras reautenticación | Base actual |
| B | Asignaciones/retiros/baja de unidades con continuidad y auditoría | A |
| C | Retención desde cierre formal, auditoría independiente y restauración aislada | Base; ensayos destructivos autorizados |
| D | Antecedentes/triaje, mediciones seriadas y rectificación sin perder original | A/B |
| E | Lectura explícita y preparación posterior; primer autor/fecha preservados | A |
| F | Cambio de destino atómico, reemplazo vinculado sin acceso cruzado | D/E |
| G | Paciente sintético y contexto por episodio; catálogo institucional con permisos | A/B |
| H | Histórico/resúmenes/consulta administrativa autorizados en servidor | G |
| I | Recuperación 30 min, revocación y verificación D-013 | B; decisión de correo |
| J | GPS primer plano, precisión/frescura, Haversine, parada por estado | F |
| K | PWA instalable, móvil y actualización segura sin caché protegida | A; aceptación HTTPS |
| L | Render HTTPS/WSS, despliegue reproducible, salud, respaldo y reversión | Preparación temprana; aprobación de servicios |
| M | Regresión, evidencias, manuales, versión e informe concordantes | Bloques aceptados |

No eliminar requisitos sin aprobación. Controles de avance 14 y 16; objetivo de congelar funcionalidades 17; 18 reservado para estabilización/entrega. Siete días de disponibilidad no se declaran acreditados en seis días. PostgreSQL Free expira antes de defensa: recreación/restauración posterior o pago autorizado.

## File structure del bloque A

- `frontend/src/lib/pendingOperation.ts`: un único intento lógico, UUID/cuerpo inmutables y estado de resolución; sin transporte ni almacenamiento persistente.
- `frontend/src/screens/local/portalMemory.tsx`: memoria React sobre las rutas, vinculada a cuenta y ámbito autorizado; borrador/creación/transiciones, descartables.
- `frontend/src/screens/local/emergencyDraft.ts`: estructura y construcción del cuerpo del borrador para no duplicar el formulario.
- `frontend/src/lib/backend.ts`: envío de transiciones con UUID/cuerpo explícitos y tratamiento de respuesta de escritura incierta.
- `frontend/src/App.tsx`, `LoginScreen.tsx`, `screens/system/SystemAdminPortal.tsx`, `screens/local/LocalPortal.tsx`: vinculación/revocación de memoria y UI explícita de resolución.
- `frontend/scripts/pending-operation.test.mjs`, `portal-memory.test.mjs`, `local-integrity-test.mjs`: pruebas unitarias y de navegador sintéticas; nuevas pruebas en CI.

### Task 1: A1 — creación con respuesta perdida

**Interfaces:** `PendingOperation` conserva `path`, `body` serializado y `operation_id`; obtener nuevamente el intento devuelve el mismo cuerpo hasta resolución. UI bloquea edición mientras el resultado sea incierto y ofrece reintento explícito. No se cambia el cuerpo silenciosamente.

- [ ] Prueba de navegador captura dos POST reales de la SPA y exige idénticos UUID, fecha de medición y cuerpo tras abortar la primera respuesta.
- [ ] Ejecutar antes del cambio: debe fallar porque cada submit actual genera UUID/fecha nuevos.
- [ ] Implementar retención del intento y estado «Resultado sin confirmar»; solo confirmar con respuesta válida.
- [ ] Pruebas: nueva creación después de éxito usa otro ID; 400 permite corregir; doble clic no manda dos solicitudes concurrentes; 5xx/JSON inválido no declaran éxito.
- [ ] Ejecutar unitarias, `npm run lint`, build y prueba de navegador; registrar resultado y commit acotado.

### Task 2: A2 — transiciones con respuesta perdida

**Interfaces:** `backend.ts` consume cuerpo explícito `{operation_id,expected_version,...extra}`; la UI mantiene intentos por episodio, sin regenerarlos tras polling. No acepta otra acción para el episodio mientras exista intento incierto.

- [ ] Pruebas RED: inicio/llegada/cancelación/cierre reenvían el mismo UUID, razón y versión aunque la API de lista avance.
- [ ] Implementar intento estable y controles explícitos de reintento; nunca repetir automáticamente una mutación.
- [ ] Probar conflicto 409 con actualización de representación y datos visibles; permiso denegado no tratado como simple desconexión.
- [ ] Regresión unitaria, tipos, build y navegador; commit y evidencia.

### Task 3: A3 — borrador después de vencer sesión

**Interfaces:** memoria sobre `Routes`; vínculo por ID de cuenta, grupos y IDs de institución/unidad. Cambiar vínculo descarta memoria; misma cuenta/ámbito la recupera solo tras `me` autorizado. Logout explícito descarta, expiración suspende.

- [ ] Prueba RED: completar motivo, simular 401, autenticar misma cuenta y ver texto anterior sin POST automático.
- [ ] Implementar proveedor de memoria y extracción mínima del borrador; retirar datos protegidos al expirar.
- [ ] Probar cambio de cuenta, cambio de unidad, retirada de permisos, logout y recarga: no exponer borrador anterior.
- [ ] Probar respuesta HTTP tardía después de logout/cambio de cuenta: no recuperar datos ni estado de la sesión anterior.
- [ ] Verificar navegadores sintéticos, unitarias, tipos y build; commit y evidencia.

### Task 4: A4 — integración y revisión

- [ ] Ejecutar todas las unitarias frontend, tipos/build, Mermaid y suites Playwright existentes y nueva sobre servidor loopback de esta rama.
- [ ] Si cambia backend, ejecutar suite PostgreSQL sin `--keepdb`; no sustituir por SQLite ni afirmar prueba no ejecutada.
- [ ] Añadir nueva suite al workflow. Documentar estados verificados y límites en ETAPA_1; no presentar como aceptados los bloques B–M.
- [ ] Revisión independiente del diff completo A y corrección TDD de hallazgos importantes; no auto-merge/push.
- [ ] Entregar commit/rama, comandos/resultados y pendientes para continuar B–M.
