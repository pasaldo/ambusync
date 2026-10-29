# Etapa 0 — alcance, reglas y base de ingeniería

Fecha: 29 de octubre de 2026. Tarea documental: AS-001.

**Estado: definición en revisión. No equivale a etapa terminada ni a funcionalidades implementadas.**

Referencia: [diagnóstico del prototipo](ANALISIS_INICIAL.md) e Informe 2 aportado por el equipo. Esta etapa organiza decisiones, criterios de aceptación y preparación técnica antes de desarrollar el backend. No reemplaza la validación clínica, académica o legal.

## 1. Decisiones confirmadas por el responsable del proyecto

| ID | Decisión confirmada | Consecuencia |
|---|---|---|
| D-001 | Entregar un piloto desplegado con datos sintéticos | Funciona entre dispositivos con HTTPS, persistencia y controles; no se usa para atención real |
| D-002 | Cuentas personales para personal de ambulancia | Cada acción identifica a una persona autenticada y a su unidad asignada; no se comparten contraseñas de ambulancia |
| D-003 | Permisos administrativos y de urgencias combinables explícitamente | Una cuenta puede tener ambos; administrar usuarios no concede por sí solo acceso clínico |
| D-004 | Alcance y exclusiones de la sección 2 aprobados el 29/10/2026 | Línea base del piloto para defensa; cambios posteriores requieren evaluación y aprobación explícita |

D-002 modifica el diseño de cuentas por unidad del Informe 2. D-003 exige adaptar el campo de rol único del diccionario: proponer conjuntos de permisos/grupos, sin un booleano que conceda acceso total. Mantener trazabilidad de estas diferencias al actualizar el informe.

La sección 2 tiene **alcance aprobado por el responsable del proyecto**. Los demás apartados mantienen su condición de propuesta salvo decisiones expresamente confirmadas. La aprobación de alcance no equivale a aprobación clínica, a permisos detallados acordados ni a funcionalidades implementadas.

## 2. Objetivo y límites del entregable

**Estado: aprobado por el responsable del proyecto el 29/10/2026 (D-004).**

### Objetivo aprobado

Demostrar un traslado completo entre un móvil y un computador distintos: administración de unidad/cuentas, autenticación, registro, envío persistido, consulta del destino, actualización, lectura, preparación, llegada, cierre y consulta histórica. Mostrar también una desconexión y recuperación sin duplicados ni entrega ficticia.

### Incluido

- Aplicación web React reutilizada y adaptada a móvil y escritorio.
- Backend Django/DRF, PostgreSQL, Channels/Redis y auditoría.
- Instituciones, cuentas personales, unidades, pacientes sintéticos y emergencias.
- Síntomas, mediciones seriadas, validaciones y estados autorizados.
- GPS en primer plano, frescura y distancia geodésica aproximada.
- Informes históricos filtrados/paginados y desactivación lógica autorizada.
- Despliegue HTTPS/WSS, pruebas, monitoreo, copias y restauración ensayada.
- Manuales, evidencias y versión identificada para defensa.

### Límites funcionales aprobados

| Área | Alcance comprometido y límite |
|---|---|
| Acceso y administración | Cuentas personales, inicio/cierre de sesión, permisos combinables explícitos, gestión/desactivación de usuarios y ambulancias y asignación de personal. Instituciones y primer administrador se provisionan técnicamente; sin registro público de hospitales |
| Paciente y emergencia | Identidad conocida o desconocida, edad/sexo cuando se conozcan, motivo, síntomas, vitales opcionales individualmente y triaje profesional sin clasificación automática. Destino habilitado; ID, autor, unidad y fecha del servidor. Un paciente por episodio, con posibilidad de varios episodios de una misma persona |
| Comunicación | Dispositivos distintos, notificaciones, actualización de antecedentes y nuevas mediciones, operaciones pendientes visibles, reintentos sin duplicación, detección de conflictos y reconciliación al reconectar |
| Panel receptor | Episodios del destino autorizado, orden por triaje/antigüedad con regla exacta pendiente, detalle, lectura, preparación, llegada y cierre. No inferir llegada por ETA, GPS o apertura del detalle |
| Ubicación | Permiso explícito, última posición, precisión disponible, fecha/frescura, advertencia de antigüedad y parada al terminar traslado. Primer plano; sin garantía con pantalla bloqueada. Distancia geodésica aproximada, no ruta ni ETA vial; falta de GPS no bloquea registro |
| Histórico e informes | Listado paginado, filtros por fecha/estado/unidad/triaje según permisos, detalle histórico y cantidades por estado/triaje. Sin PDF/Excel ni analítica avanzada inicialmente |
| Desactivación | Individual, autorizada y lógica sobre pacientes sintéticos, conservando episodios y auditoría. Condiciones detalladas pendientes; no borrado físico del historial |
| Trazabilidad | Actor y fechas de creación, actualización, lectura, recepción, cancelación y cierre; historial de mediciones; permisos en API/WebSocket, credenciales protegidas y logs técnicos sin contenido sensible |
| Despliegue y entrega | HTTPS/WSS, contenedores, configuración/secretos separados, persistencia, monitoreo básico, copia externa y restauración demostrada, pruebas, manuales y versión etiquetada. Proveedor/dominio/presupuesto requieren acuerdo previo a contratación |

**Conectividad:** no hay modo offline persistente. Se puede mantener formulario pendiente en memoria mientras la página siga abierta, sin garantizar conservación al cerrar o recargar. No mostrar éxito si no existe confirmación del servidor.

**Cambio de destino:** no se edita directamente el hospital después del envío. La vía acordada para un cambio antes de recepción es cancelar con motivo y crear otro episodio vinculado, conservando historial. Los permisos, validaciones, notificación al destino anterior y manejo de fallos de esta operación se concretarán en AS-002/AS-003; no habilitarla sin ese diseño. No implica permitir cancelar episodios ya recibidos o cerrados.

**Catálogo de síntomas:** selección y ampliación controlada por personal autorizado. El texto ingresado no debe modificar automáticamente el catálogo. El permiso concreto se resolverá en AS-002.

### Fuera de esta versión

Uso asistencial real, diagnósticos/triaje automáticos, prescripción, gestión de tratamientos, facturación, ficha hospitalaria completa, integración contractual HIS/FHIR, aplicaciones nativas, seguimiento GPS garantizado en segundo plano, ETA vial real, modo offline clínico persistente cifrado, Kubernetes, microservicios y alta disponibilidad distribuida.

También quedan excluidos inicialmente exportaciones PDF/Excel, analítica predictiva, despacho automático/optimización de flota, administración hospitalaria de camas/recursos y operación/soporte 24/7. Registrar preparación para recepción no equivale a administrar disponibilidad de camas.

Una exigencia posterior de la rúbrica o del equipo no amplía automáticamente este alcance: debe registrarse su impacto y aprobarse antes de comprometerla.

### Escenario de aceptación

Un destino receptor para la demostración principal; una segunda institución sintética para pruebas de aislamiento. Incluir casos propios y ajenos y, en integración, un episodio autorizado entre operador y receptor distintos. Base de carga: 20 clientes concurrentes. Equipos, navegadores y versiones exactas se registran al ejecutar pruebas.

### Demostración mínima acordada

1. Administrador registra ambulancia y asigna una cuenta personal.
2. Operador inicia sesión desde móvil, registra y envía una emergencia.
3. Urgencias la consulta desde otro computador y confirma lectura/preparación.
4. Operador agrega una medición que queda disponible para el receptor.
5. Una desconexión se advierte y la recuperación no duplica operaciones.
6. Urgencias confirma llegada física y cierre.
7. El episodio sigue consultable tras reiniciar la aplicación.
8. Un usuario ajeno al ámbito autorizado no puede acceder al episodio.
9. Se aportan evidencias de pruebas, despliegue y restauración.

Esta es una condición de aceptación futura, no un resultado alcanzado. Los 20 clientes son objetivo de prueba, no capacidad garantizada sin medición.

## 3. Personas, instituciones y unidades

- La institución puede ser operadora, receptora o ambas.
- Una ambulancia pertenece a una institución y su código es único dentro de ella.
- Cada persona tiene cuenta propia, institución y permisos explícitos.
- Para operar como ambulancia necesita una unidad activa asignada de su institución.
- Propuesta inicial: una unidad activa por operador en un momento dado; varias personas pueden estar asignadas a la misma unidad. Registrar autor y unidad en cada operación y auditar reasignaciones.
- Propuesta de alcance: el operador consulta/actualiza episodios activos de su unidad actual, aunque otro integrante los haya creado. No obtiene acceso a otras unidades ni a todo el historial institucional.
- El receptor consulta únicamente episodios dirigidos a su institución. Una transferencia comparte el episodio, no todo el historial del paciente.
- La desactivación de una cuenta o retiro de permisos debe impedir nuevas operaciones y terminar/revalidar suscripciones activas. No basta con ocultar controles en React.

### Matriz de permisos propuesta

| Operación | Ambulancia | Urgencias | Administración institucional |
|---|---|---|---|
| Crear/gestionar cuentas y unidades | No | No | Sí, solo institución propia y permisos delegables |
| Crear emergencia | Sí, para unidad asignada | No | No |
| Ver/actualizar antecedentes y mediciones del traslado | Unidad asignada y episodio activo | Consultar episodio del destino; no sobrescribir datos del emisor | No por defecto |
| Registrar posición/inicio de traslado | Unidad asignada y episodio activo | Consultar posición autorizada | No por defecto |
| Confirmar lectura/preparación | No | Sí, destino correspondiente | No por defecto |
| Registrar llegada/cierre | No | Sí, destino correspondiente | No por defecto |
| Cancelar antes de llegada | Propuesta: unidad asignada, con motivo | Pendiente de decisión | No por defecto |
| Consultar informes clínicos | No por defecto | Propuesta: permiso adicional de informes, limitado al destino | No por defecto |
| Desactivar paciente de prueba | No | Propuesta: permiso adicional, ámbito autorizado, sin episodio activo | No por defecto |
| Acceder a auditoría | No por defecto | Según permiso y alcance de objeto | Propuesta: auditoría administrativa sin contenido clínico |

Una cuenta con administración + urgencias acumula solo los permisos expresamente otorgados y dentro de su ámbito. Prohibir autoescalamiento de privilegios. El primer administrador se provisiona mediante procedimiento controlado; no hay registro público ni contraseñas predeterminadas versionadas. Las cuentas técnicas de infraestructura se separan de las cuentas funcionales.

## 4. Ciclo de vida y significado de las confirmaciones

### Propuesta de estados del episodio

| Estado/transición | Regla y responsable |
|---|---|
| Borrador | Solo memoria de la sesión; todavía no es un episodio confirmado por servidor |
| `creada` | Registro validado y persistido con fecha/ID del servidor |
| `creada → notificada` | Propuesta: episodio habilitado para consulta del receptor; evento emitido tras commit cuando sea posible. No acredita lectura ni llegada |
| `notificada → en_traslado` | Persona de la unidad asignada confirma inicio |
| `en_traslado → recibida` | Urgencias del destino confirma llegada física, autor y fecha |
| `recibida → cerrada` | Urgencias cierra el episodio; no puede cerrar antes de llegada |
| Activa → `cancelada` | Antes de recibida, motivo obligatorio y autor autorizado |
| `cerrada` / `cancelada` | Terminales; sin reapertura, eliminación física ni edición ordinaria del historial |

Lectura y preparación son hitos separados, con actor/fecha. Primera lectura no se sobrescribe; cada acuse puede registrarse en auditoría. Una repetición con el mismo identificador de operación devuelve el resultado anterior; una segunda transición distinta que ya no procede se rechaza sin repetir sus efectos.

### Estado del envío, separado del episodio

| Indicador visible | Significado |
|---|---|
| Pendiente | No hay confirmación autoritativa; puede existir una operación cuyo resultado se perdió |
| Guardado en servidor | Persistencia confirmada; no equivale a leído por urgencias |
| Fallido | Rechazo conocido y explicado; un timeout por sí solo no demuestra rechazo |
| Leído por urgencias | Acuse explícito del usuario receptor |
| Recibido | Llegada física confirmada, nunca inferida del ETA o de abrir una tarjeta |

Si se pierde la respuesta después de guardar, reintentar con el mismo `operacion_id` y reconciliar por API. Si se pierde un evento WebSocket, el registro persistido debe seguir siendo recuperable. El fallo del aviso no borra la transacción.

**Pendientes operacionales:** llegada sin inicio de traslado registrado y cancelación por el receptor. Para cambio de destino, el alcance aprobado excluye edición directa tras envío y prevé cancelación con motivo más nuevo episodio vinculado antes de recepción; faltan reglas y permisos de ejecución. Cada episodio contiene un paciente; no se modela una emergencia con varios pacientes en esta versión. No implementar excepciones silenciosas.

## 5. Datos y validación de formularios

Validación doble: React ayuda al usuario; Django decide y protege. Rechazar errores con campo y explicación; no corregir silenciosamente una medición clínica.

| Dato | Regla propuesta |
|---|---|
| Identidad | Nombre/alias opcional si se desconoce; mostrar «Paciente no identificado» sin convertirlo en nombre real |
| Nombre/alias | Hasta 160 caracteres, espacios normalizados; admitir Unicode, tildes, guiones y apóstrofes; no una expresión de «solo letras» rígida |
| Edad | Entero de 0–130 años o desconocida (`null`); falta acordar meses/días para lactantes. Nunca usar cero para desconocido |
| Sexo | F/M/X según diccionario; no informado separado como `null`, sin preselección automática. Confirmar significado de X y etiquetas |
| Motivo | Obligatorio al enviar; propuesta 3–2.000 caracteres tras recortar extremos; admitir números y puntuación clínica |
| Síntomas | Selección múltiple y alta controlada en catálogo; propuesta de descripción 1–120 caracteres, sin duplicados normalizados. Definir quién puede ampliar catálogo |
| Notas adicionales | Campo separado de síntomas si se conserva; propuesta máximo 2.000 caracteres y acceso igual al episodio |
| Signos vitales | Opcionales individualmente; ausente no genera medición ni se reemplaza por cero. Conservar valor, unidad, fecha y autor por medición |
| SpO2 | Propuesta del Informe 2: 0–100 % |
| Glasgow | Propuesta del Informe 2: entero de 3–15 |
| Otros signos | Rechazar no numéricos/no finitos y unidades incorrectas. Rangos clínicos requieren validación profesional; no inventar límites que excluyan valores críticos plausibles |
| Triaje | 1–5, registrado por profesional autorizado; sin algoritmo ni valor automático por defecto. Confirmar si se admite envío «sin clasificar» |
| Unidad | Activa y asignada; no código libre elegido para suplantar otra unidad |
| Destino | Institución receptora activa; no nombre libre sin FK |
| Fecha/hora | Creación/transiciones con hora servidor UTC; presentación `America/Santiago`. Separar hora de medición/captura y hora de recepción |
| Coordenadas | Latitud −90 a 90, longitud −180 a 180, precisión no negativa si se informa; pareja completa |

El registro no debe bloquearse por falta de GPS. No mostrar ubicación antigua como vigente. Distancia Haversine aproximada, no ruta vial ni promesa de llegada. Si faltan coordenadas válidas del destino, indicar distancia no disponible.

## 6. Integridad, conservación y contingencia

- PostgreSQL como fuente de verdad; FK protegidas, transacciones e índices por ámbito institucional/estado/fecha.
- Paciente, unidad y creador deben pertenecer al operador correcto; receptor autorizado sobre destino.
- UUID de operación para creación, mediciones, posiciones y cambios; concretar deduplicación de actualizaciones, no solo UUID del episodio.
- Versión por episodio para rechazar edición obsoleta; nunca ganar un conflicto sobrescribiendo todo el registro silenciosamente.
- Propuesta inicial: mediciones históricas no se reemplazan; una corrección registra vínculo/motivo/autor manteniendo el original.
- Desactivación lógica de pacientes de prueba sin destruir historial, sujeta a permisos y ausencia de episodios activos. No habilitar eliminación masiva del tablero productivo.
- No persistir antecedentes clínicos en `localStorage`, `sessionStorage`, IndexedDB ni caché de service worker en este piloto. Mantener pendiente en memoria; advertir pérdida al recargar/cerrar.
- Sin conexión: aviso visible, no confirmar entrega, reintentar de manera controlada. El canal alternativo institucional debe definirse antes de un piloto operacional; para defensa se documenta una contingencia simulada, no un servicio asistencial existente.
- Auditoría: actor, institución/unidad pertinente, acción, objeto, fecha, resultado y correlación. Logs técnicos sin contraseñas, tokens ni relatos clínicos. Revisar minimización y retención separadamente.

## 7. Base tecnológica y seguridad propuesta

- React/TypeScript existente; monolito modular Django + DRF + PostgreSQL.
- Channels + Redis para eventos; ASGI, Nginx y Docker Compose para despliegue inicial.
- Módulos: cuentas, instituciones, unidades, pacientes, emergencias, seguimiento, informes y auditoría. API y WebSocket comparten reglas de autorización.
- Autenticación inicial por sesiones Django, mismo origen web, cookies HttpOnly/Secure, CSRF y validación de origen WebSocket. Definir caducidad por inactividad/absoluta y reautenticación para acciones sensibles antes de implementar.
- Contraseñas con hash del framework, validadores y limitación de intentos; errores que no enumeren usuarios. Definir procedimiento de recuperación y cambio de contraseña, sin enviar contraseñas por correo ni almacenarlas en texto plano.
- Entornos separados: desarrollo, staging y entrega; secretos independientes fuera de Git. PostgreSQL/Redis en red privada, sin puertos públicos.
- Modelar usuario personal y grupos/permisos antes de las primeras migraciones. Asignación de unidad mutable con historial de auditoría; no confundir permisos funcionales con `is_superuser`.
- Fijar versiones mantenidas de Python/Django/Node y dependencias al ejecutar AS-007. Registrar compatibilidad y licencias, no copiar automáticamente las versiones antiguas del prototipo.
- Escalar primero con consultas paginadas, índices y medición. Separar procesos/API/WebSocket o aumentar recursos cuando haya evidencia. No se justifica Kubernetes para la carga base del piloto.

## 8. Calidad, automatización y metas

### Verificaciones por cambio

Frontend: tipos, pruebas unitarias, compilación y pruebas de flujo según impacto. Backend, cuando exista: validadores, permisos por objeto, transiciones, idempotencia y pruebas de integración con PostgreSQL. No sustituir PostgreSQL de aceptación por SQLite.

CI se ejecuta en cada pull request y en `main`: instalación desde lockfile, verificaciones, pruebas y build; escaneo de dependencias/secretos. No desplegar producción automáticamente en cada push de una rama. Corregir el falso éxito del validador Mermaid y aislar pruebas Playwright de datos/servicios externos cuando sea posible.

### Metas heredadas del Informe 2, no resultados alcanzados

- ≥90 % de 100 envíos visibles en panel en <3 s con 20 clientes y conectividad normal.
- GPS ≤10 s durante 30 min en primer plano; registrar interrupciones/permisos y frescura >30 s.
- ≥95 % de disponibilidad en siete días continuos incluyendo mantenimiento; no es un SLA clínico.
- 100 % de integridad en 100 operaciones; cero accesos cruzados exitosos en al menos 30 intentos.
- ≥90 % de lecturas en ≤60 s y ≥90 % de 20 tareas completadas sin ayuda.
- ≥95 % de 100 consultas en ≤2 s; RTO ≤4 h y RPO ≤1 h demostrados con copia horaria externa.

Los instrumentos, ventana y evidencia se definen antes de medir. Registrar resultado real, incluso si falla; no fabricar porcentajes. Latencia exige correlación y reloj monotónico/acuse instrumental, no restar relojes independientes sin control.

## 9. Backlog de la etapa 0

Estos identificadores son locales al proyecto, no números de GitHub Issues. No se han creado incidencias remotas por incluirlos aquí.

| ID | Prioridad/dependencia | Entrega y aceptación | Estado |
|---|---|---|---|
| AS-001 | P0 | Línea base de alcance y decisiones; D-001–004 registradas; revisión de apartados restantes | Alcance aprobado; definición restante en revisión |
| AS-002 | P0, AS-001 | Matriz de permisos aprobada, combinación de roles, delegación y asignación de unidad definidas | Propuesta |
| AS-003 | P0, AS-001/002 | Estados, hitos, reintentos y excepciones con ejemplos de permitido/denegado | Propuesta |
| AS-004 | P0, AS-001/003 | Campos, obligatoriedad y límites aprobados; discrepancias clínicas identificadas | Propuesta |
| AS-005 | P0, AS-002 | Sesiones, recuperación, auditoría, amenazas y datos sintéticos definidos | Propuesta |
| AS-006 | P1, AS-002/003/004/005 | Diseño modular/modelo y contratos mínimos de API/eventos documentados, sin backend aún | Propuesta |
| AS-007 | P0, independiente del cierre de reglas clínicas | Runtime y dependencias soportadas; auditoría revisada; actualizaciones verificadas sin `fix --force` indiscriminado | Pendiente técnico |
| AS-008 | P1, AS-007 | Pruebas frontend repetibles y corrección del validador Mermaid; scripts fallan ante error real | Pendiente técnico |
| AS-009 | P1, AS-008 | CI en pull request y main; verificar una ejecución correcta y un fallo controlado | Pendiente técnico |
| AS-010 | P1, AS-006/009 | Entorno reproducible, estrategia de ramas/releases y checklist de aceptación de etapa | Propuesta |

P0 = bloquea diseño seguro o elimina riesgo alto; P1 = prepara desarrollo reproducible. No significa que todas las tareas tengan que ejecutarse secuencialmente: AS-007 puede avanzar mientras se revisan reglas.

Cada tarea deberá contener objetivo, RF/RNF afectados, dependencias, criterios de aceptación observables, pruebas/evidencias y exclusiones. No estimar fechas definitivas sin disponibilidad del equipo y rúbrica/fecha de defensa confirmadas.

## 10. Estrategia de ramas, commits y publicación

### Reglas

1. `main` conserva la línea verificada. Ramas breves por objetivo: `docs/AS-001-etapa-0`, `feat/AS-xxx-objetivo`, `fix/AS-xxx-defecto`.
2. Commits coherentes por intención con Conventional Commits; no por cantidad de archivos o tiempo transcurrido.
3. Funcionalidad, migración y pruebas pueden formar el mismo commit si son inseparables. Evitar integrar un commit que deja `main` inutilizable.
4. Pull request explica problema, solución, requisitos, pruebas, riesgos/migraciones y documentación. Revisión de otro integrante cuando sea posible.
5. Push frecuente es respaldo, no release. No crear commits vacíos ni mensajes «avance», «varios» o «final definitivo».
6. No versionar secretos, adjuntos personales, bases, `node_modules`, `dist` ni datos identificables. No reescribir el historial compartido para esconder errores.
7. Unificar commits de experimentación si no aportan a la revisión; preservar commits útiles y autorías. Acordar estrategia de merge; propuesta: squash por PR de tarea, historial detallado retenido en la revisión.
8. Etiquetar entregas verificadas, no cada push. `v1.0.0` identifica el alcance aceptado para defensa, no aptitud clínica certificada.

### Secuencia prevista de commits de preparación

```text
docs(scope): define etapa 0 y decisiones iniciales [AS-001]
docs(auth): especifica permisos y asignacion de unidades [AS-002]
docs(emergencies): define estados hitos y excepciones [AS-003]
docs(validation): acuerda reglas de captura y datos ausentes [AS-004]
docs(security): define sesiones auditoria y contingencia [AS-005]
docs(architecture): define modulos y contratos del piloto [AS-006]
build(frontend): actualiza dependencias con vulnerabilidades [AS-007]
test(frontend): hace repetibles las verificaciones del prototipo [AS-008]
ci(frontend): valida tipos pruebas y compilacion [AS-009]
docs(development): documenta entorno y cierre de etapa 0 [AS-010]
```

Es una guía, no una obligación de exactamente diez commits: si una actualización exige migración incompatible, dividir por cambios comprobables; si dos ajustes documentales son inseparables, integrarlos juntos. No duplicar toda esta especificación en archivos diferentes: los siguientes commits pueden refinar secciones y enlazar detalles especializados.

Este primer cambio documental se publica en rama de revisión; no integra automáticamente propuestas pendientes en `main` ni afirma que AS-002–010 estén completadas.

## 11. Condiciones para cerrar la etapa 0

- [x] Objetivo de piloto desplegado confirmado (D-001).
- [x] Cuentas personales confirmadas (D-002).
- [x] Permisos combinables confirmados (D-003).
- [x] Alcance funcional/exclusiones y escenario de aceptación aprobados (D-004, 29/10/2026).
- [ ] Matriz de permisos, delegación y unidad asignada aprobadas.
- [ ] Estados, excepciones, lectura y entrega técnica diferenciados y aprobados.
- [ ] Campos, límites, triaje pendiente y tratamiento de lactantes resueltos o explícitamente excluidos con aprobación.
- [ ] Políticas de sesión, contraseñas y recuperación definidas.
- [ ] Modelo/contratos mínimos y dependencias de tareas revisados.
- [ ] Dependencias vulnerables tratadas o riesgo residual justificado antes de exponer servicios.
- [ ] Pruebas repetibles y CI operativos con evidencia.
- [ ] Entorno e instrucciones verificadas por otro integrante cuando sea posible.
- [ ] Rúbrica de Nota 3, fecha de defensa y disponibilidad del equipo confirmadas.

**Próxima revisión:** personas/unidades/permisos (sección 3, AS-002) y después ciclo de vida (sección 4, AS-003). El alcance ya está aprobado; no iniciar módulos clínicos con reglas pendientes que obliguen a rehacer el modelo.
