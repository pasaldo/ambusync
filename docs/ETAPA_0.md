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
| D-005 | Personas, unidades y permisos de la sección 3 aprobados el 29/10/2026 | Cuentas personales, colaboración por unidad, permisos adicionales separados y protecciones ante desactivación/reasignación |
| D-006 | Ciclo de vida, hitos y excepciones de la sección 4 aprobados el 29/10/2026 | Sin estado `creada` separado; lectura explícita, inicio/cierre manuales, llegada excepcional y cambio de destino atómico |

D-002 modifica el diseño de cuentas por unidad del Informe 2. D-003 exige adaptar el campo de rol único del diccionario: proponer conjuntos de permisos/grupos, sin un booleano que conceda acceso total. Mantener trazabilidad de estas diferencias al actualizar el informe.

D-006 simplifica el modelo del Informe 2: crear y habilitar el episodio para el receptor son una sola operación transaccional; `creada_en` permanece como fecha, no como estado. El diagnóstico inicial describe la especificación anterior como antecedente histórico; para la implementación rigen los acuerdos aprobados de este documento.

Las secciones 2, 3 y 4 tienen **alcance, permisos y ciclo de vida aprobados por el responsable del proyecto**. Los demás apartados mantienen su condición de propuesta salvo decisiones expresamente confirmadas. Estas aprobaciones no equivalen a validación clínica ni a funcionalidades implementadas.

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

**Cambio de destino:** no se edita directamente el hospital después del envío. La vía acordada para un cambio antes de recepción es cancelar con motivo y crear otro episodio vinculado en una sola transacción, conservando historial y aislamiento entre receptores. Los permisos y reglas aprobados se detallan en las secciones 3 y 4. No implica permitir cancelar episodios ya recibidos o cerrados.

**Catálogo de síntomas:** selección y ampliación controlada por personal autorizado mediante el permiso adicional definido en la sección 3. El texto ingresado no debe modificar automáticamente el catálogo.

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

**Estado: aprobado por el responsable del proyecto el 29/10/2026 (D-005, AS-002). No implementado todavía.**

### Organización y ámbito de acceso

- La institución puede ser operadora, receptora o ambas.
- Una ambulancia pertenece a una institución y su código es único dentro de ella.
- Cada persona tiene credenciales propias, una institución de pertenencia, permisos explícitos y estado activo/desactivado. No se comparten contraseñas de unidad.
- Para operar como ambulancia necesita una unidad activa asignada de su institución.
- Una unidad activa por operador en un momento dado; varias personas pueden estar asignadas a la misma unidad. Registrar autor y unidad en cada operación y auditar reasignaciones.
- El operador consulta/actualiza episodios activos de su unidad actual, aunque otro integrante los haya creado. Puede consultar las confirmaciones de lectura/preparación, pero no efectuarlas por urgencias. No obtiene acceso a otras unidades ni a todo el historial institucional.
- El receptor consulta únicamente episodios dirigidos a su institución. Una transferencia comparte el episodio, no todo el historial del paciente.
- La desactivación de una cuenta o retiro de permisos debe impedir nuevas operaciones y terminar/revalidar suscripciones activas. No basta con ocultar controles en React.

### Matriz de permisos aprobada

| Operación | Ambulancia | Urgencias | Administración institucional |
|---|---|---|---|
| Crear/gestionar cuentas y unidades | No | No | Sí, solo institución propia y permisos delegables |
| Crear emergencia | Sí, para unidad asignada | No | No |
| Ver/actualizar antecedentes y mediciones del traslado | Unidad asignada y episodio activo | Consultar episodio del destino; no sobrescribir datos del emisor | No por defecto |
| Registrar posición/inicio de traslado | Unidad asignada y episodio activo | Consultar posición autorizada | No por defecto |
| Confirmar lectura/preparación | No | Sí, destino correspondiente | No por defecto |
| Registrar llegada/cierre | No | Sí, destino correspondiente | No por defecto |
| Cancelar antes de recepción | Unidad asignada, con motivo obligatorio | No | No por defecto |
| Consultar histórico e informes clínicos | No por defecto | Con permiso adicional de informes, limitado al destino | No por defecto |
| Desactivar paciente de prueba | No | Con permiso adicional, ámbito autorizado y sin episodio activo | No por defecto |
| Acceder a auditoría administrativa | No por defecto | No por defecto | Sí, institución propia, sin contenido clínico |
| Gestionar catálogo de síntomas | Solo con permiso adicional y dentro de su institución | Solo con permiso adicional y dentro de su institución | Solo con permiso adicional y dentro de su institución |

«No por defecto» significa que se necesita otro permiso explícito; administrar usuarios no concede acceso clínico. Ningún permiso concede acceso fuera del ámbito autorizado.

### Responsabilidades y permisos adicionales

- **Administración institucional:** gestiona y desactiva cuentas/ambulancias propias, asigna y retira personal, restablece acceso por procedimiento controlado y consulta auditoría administrativa. No administra otras instituciones, no modifica episodios ni confirma llegadas/cierres sin el permiso funcional correspondiente.
- **Ambulancia:** crea episodios para su unidad asignada, actualiza antecedentes y agrega mediciones durante el traslado, registra posición/inicio y cancela antes de recepción con motivo. No suplanta unidades, no cambia directamente destino tras envío y no edita episodios cerrados/cancelados.
- **Urgencias:** consulta antecedentes, mediciones y posición de episodios del destino; registra lectura, preparación, llegada y cierre. No sobrescribe mediciones del emisor ni cancela unilateralmente. Ante errores solicita corrección al operador; el procedimiento de contingencia se documentará en AS-003/AS-005.
- **Informes:** permiso adicional al de urgencias para consultar histórico, filtros y resúmenes del destino autorizado.
- **Desactivación de pacientes de prueba:** permiso adicional al de urgencias; solo pacientes sintéticos dentro del ámbito autorizado, sin episodios activos y conservando episodios/auditoría. No habilita borrado físico.
- **Gestión de síntomas:** permiso adicional explícito para agregar/desactivar elementos del catálogo institucional, con una base inicial común. No modifica catálogos ajenos ni altera síntomas ya registrados en episodios.

Una cuenta con administración + urgencias puede utilizar ambas funciones dentro de su ámbito; cada acción conserva autoría. El «maestro» es una cuenta personal con permisos administrativos, no una cuenta compartida ni un superusuario técnico. Se prohíbe autoescalamiento: solo se conceden permisos cuya delegación esté autorizada, nunca privilegios superiores a esa autorización. El primer administrador se provisiona mediante procedimiento controlado; no hay registro público ni contraseñas predeterminadas versionadas. Las cuentas técnicas de infraestructura se separan de las cuentas funcionales.

### Reasignación y desactivación

1. Solo administración institucional reasigna personal entre sus unidades; toda reasignación se audita.
2. Al cambiar de unidad, la persona pierde acceso a la anterior y obtiene únicamente el acceso correspondiente a la nueva; su autoría histórica no cambia.
3. Antes de retirar al último operador habilitado de una unidad con episodios activos, se exige un reemplazo habilitado o resolver esos episodios. Aplicar esta protección también a una desactivación ordinaria que retire al último operador.
4. Desactivar una cuenta bloquea nuevas operaciones y revoca su acceso, incluso con sesión abierta; no elimina sus registros previos. El procedimiento de contención ante compromiso y la forma técnica de revocación se detallarán en AS-005.
5. No se puede desactivar una ambulancia con episodios activos.
6. No se puede desactivar al último administrador habilitado sin disponer de otro.
7. Las conexiones WebSocket deben dejar de entregar información al revocar permisos o cambiar el ámbito de acceso.

### Criterios de aceptación de permisos

Estas pruebas se implementarán y ejecutarán en las etapas de backend/integración; su definición no constituye un resultado aprobado:

- Un operador de la unidad A no consulta ni modifica episodios de B, incluso con ID conocido.
- Urgencias no obtiene episodios de otro hospital mediante API, informes o suscripciones.
- Un administrador sin permisos clínicos no obtiene antecedentes de pacientes.
- Un usuario no se concede privilegios ni administra instituciones ajenas.
- Una cuenta desactivada deja de operar con sesiones/suscripciones previamente abiertas.
- Las cuentas combinadas ejecutan solo acciones explícitamente concedidas y dentro de su ámbito.
- Una persona puede continuar un episodio de su unidad creado por otro integrante y queda identificada como autora de sus propias acciones.
- Reasignar personal revoca acceso a la unidad anterior; no altera la autoría previa.
- Se rechazan desactivaciones de ambulancias con episodios activos y del último administrador; se protege la continuidad al retirar al último operador de una unidad activa.
- Sin permiso adicional se rechaza consulta de informes, desactivación de pacientes y gestión del catálogo; con permiso se mantienen las restricciones institucionales e históricas.

## 4. Ciclo de vida y significado de las confirmaciones

**Estado: aprobado por el responsable del proyecto el 29/10/2026 (D-006, AS-003). No implementado todavía.**

### Estados del episodio

```text
Borrador → Notificada → En traslado → Recibida → Cerrada
                │            │
                └── Cancelada ┘
```

El diagrama muestra el flujo habitual; las rutas excepcionales aprobadas se detallan debajo.

| Estado | Significado y reglas |
|---|---|
| Borrador | Formulario en memoria, corregible/descartable, no visible para urgencias. Sin botón independiente para guardar borradores en servidor. Puede perderse al cerrar/recargar |
| `notificada` | «Enviar a urgencias» valida, persiste y habilita el episodio para el destino en una sola transacción, asignando ID, autor, unidad y fecha del servidor. No acredita que alguien lo haya visto o leído |
| `en_traslado` | Persona de la unidad asignada confirma inicio manualmente o declara traslado ya iniciado al enviar. Continúan antecedentes/mediciones y seguimiento GPS con permiso |
| `recibida` | Urgencias confirma llegada física con autor y fecha. Se detiene GPS, la ambulancia deja de modificar y el episodio pasa de entrantes a recibidos pendientes de cierre |
| `cerrada` | Urgencias cierra manualmente tras recepción, con autor y fecha. Histórico autorizado; sin edición ordinaria, reapertura ni borrado del historial |
| `cancelada` | Unidad asignada cancela antes de recepción con motivo, autor y fecha. Se detiene GPS, se comunica el cambio al receptor y deja de ser entrante activo; historial conservado |

No existe `creada` como estado separado; se conserva `creada_en`. Después del commit se intenta avisar por WebSocket. Si el aviso falla, el episodio sigue consultable por API; no se borra ni se declara leído. Mensaje recomendado al emisor: «Guardado en servidor · pendiente de lectura».

Capturar una primera posición al enviar si hay permiso; comenzar seguimiento periódico al iniciar traslado, incluido el caso declarado como ya iniciado. La falta de GPS no bloquea registro ni traslado. No se infiere llegada a partir de ubicación, vencimiento del ETA o apertura de detalle.

### Lectura y preparación como hitos

| Hito | Regla aprobada |
|---|---|
| Lectura confirmada | Urgencias pulsa «Confirmar lectura»; abrir el detalle no confirma automáticamente. Conservar primer lector y primera fecha |
| Preparación registrada | Urgencias pulsa «Registrar preparación» después de lectura. No equivale a box disponible ni inicio de atención |

Pueden ocurrir antes o durante el traslado, sin reemplazar su estado. No se exigen lectura/preparación para confirmar una llegada real ni se inventan hitos retrospectivos. Cada acción se audita. Los reintentos de una misma operación no duplican efectos.

### Transiciones y responsables

| Transición | Responsable y condición |
|---|---|
| Borrador → `notificada` | Ambulancia; datos válidos, unidad asignada y destino habilitado |
| Borrador → `en_traslado` | Ambulancia al enviar con «Traslado ya iniciado»; mismas validaciones y persistencia atómica |
| `notificada → en_traslado` | Ambulancia de la unidad asignada; versión vigente |
| `en_traslado → recibida` | Urgencias del destino; confirma llegada física |
| `notificada → recibida` | Urgencias del destino; llegada física, motivo de excepción y auditoría de inicio no registrado |
| `recibida → cerrada` | Urgencias del destino; recepción previamente registrada y cierre manual |
| `notificada` / `en_traslado → cancelada` | Ambulancia de la unidad asignada; antes de recepción, motivo obligatorio |
| `cerrada` / `cancelada → otro estado` | Rechazado en operación ordinaria |

Administración y cuentas técnicas no sustituyen los permisos funcionales. Cada transición comprueba autorización, versión y estado en servidor. Un reintento con el mismo identificador de operación devuelve su resultado anterior sin duplicar efectos; una nueva operación incompatible con el estado actual se rechaza.

### Excepciones y concurrencia

**Llegada sin inicio registrado:** permitir `notificada → recibida`, exigir motivo y conservar evidencia de la excepción. No crear una hora de salida ficticia. La falta de lectura/preparación tampoco impide confirmar llegada.

**Traslado ya iniciado al enviar:** opción explícita «Traslado ya iniciado». Crear directamente `en_traslado`, registrando cuándo el servidor recibió la declaración. No presentar ese instante como hora real de salida si se desconoce; creación y declaración son datos distintos.

**Cambio de hospital tras envío:** acción «Cambiar destino» de la unidad autorizada, antes de recepción:

1. Solicitar nuevo destino y motivo.
2. Validar destino habilitado, permisos, versión y estado vigente.
3. Cancelar el anterior y crear el reemplazo vinculado **en una sola transacción**.
4. Conservar paciente y copiar únicamente antecedentes pertinentes; no copiar lectura/preparación como si el nuevo receptor las hubiera confirmado.
5. Conservar el anterior cancelado para el receptor original y habilitar el reemplazo para el nuevo receptor; emitir avisos tras commit y reconciliar por API si se pierden.
6. Si falla la transacción, no cancelar el original ni crear un reemplazo parcial. Reintentos no crean reemplazos duplicados.

El vínculo no concede al nuevo receptor acceso al episodio anterior ni a información interna del otro establecimiento. La especificación técnica de copia/proyección de antecedentes y tratamiento del seguimiento del reemplazo se detallará en AS-006, respetando estos límites.

**Recepción y cancelación simultáneas:** serializar la decisión mediante transacción y comprobación de versión/estado. Si recepción confirma primero, rechazar cancelación; si cancelación confirma primero, rechazar recepción del episodio cancelado y mostrar conflicto. Nunca guardar ambos resultados como compatibles. Aplicar la misma protección a cambio de destino frente a recepción.

**Corrección tras cierre:** fuera de edición ordinaria de esta versión. Sin botón de reapertura ni modificación silenciosa. Una futura rectificación deberá preservar original, motivo, autor y fecha; no se considera implementada por este acuerdo.

### Estado del envío, separado del episodio

| Indicador visible | Significado |
|---|---|
| Pendiente de envío | Formulario sin confirmación del servidor |
| Enviando | Solicitud en curso |
| Resultado sin confirmar | Respuesta perdida; el servidor podría haber guardado la operación |
| Guardado en servidor | Persistencia confirmada; no equivale a leído por urgencias |
| Rechazado | Error concreto informado por el servidor, por ejemplo validación o permisos; un timeout no demuestra rechazo |
| Leído por urgencias | Acuse explícito del usuario receptor |

Si se pierde la respuesta después de guardar, reintentar con el mismo `operacion_id` y reconciliar por API. Si se pierde un evento WebSocket, el registro persistido debe seguir siendo recuperable. El fallo del aviso no borra la transacción.

### Criterios de aceptación del ciclo de vida

Pruebas futuras, todavía no ejecutadas sobre el backend:

- No se puede cerrar sin recepción, cancelar tras recepción ni reabrir estados terminales.
- Abrir detalle no confirma lectura; preparación requiere lectura y no cambia estado del traslado.
- GPS y ETA no confirman llegada; recepción detiene seguimiento y edición por ambulancia.
- Llegada sin inicio registrado exige motivo y no inventa fecha de salida.
- «Traslado ya iniciado» crea el episodio en el estado correcto, con fechas diferenciadas.
- Cancelación conserva historial y se refleja en el receptor, incluso tras reconexión.
- Reintentos no duplican episodios, hitos, cancelaciones ni reemplazos.
- Cambio de destino confirma cancelación/reemplazo juntos o no modifica ninguno; ningún receptor accede al historial privado del otro por el vínculo.
- Versiones obsoletas y recepción/cancelación simultáneas producen un resultado único y conflicto visible para la operación incompatible.

## 5. Datos y validación de formularios

Validación doble: React ayuda al usuario; Django decide y protege. Rechazar errores con campo y explicación; no corregir silenciosamente una medición clínica.

| Dato | Regla propuesta |
|---|---|
| Identidad | Nombre/alias opcional si se desconoce; mostrar «Paciente no identificado» sin convertirlo en nombre real |
| Nombre/alias | Hasta 160 caracteres, espacios normalizados; admitir Unicode, tildes, guiones y apóstrofes; no una expresión de «solo letras» rígida |
| Edad | Entero de 0–130 años o desconocida (`null`); falta acordar meses/días para lactantes. Nunca usar cero para desconocido |
| Sexo | F/M/X según diccionario; no informado separado como `null`, sin preselección automática. Confirmar significado de X y etiquetas |
| Motivo | Obligatorio al enviar; propuesta 3–2.000 caracteres tras recortar extremos; admitir números y puntuación clínica |
| Síntomas | Selección múltiple; alta/desactivación mediante permiso adicional de gestión de catálogo institucional aprobado en sección 3. Propuesta pendiente de límites: descripción 1–120 caracteres, sin duplicados normalizados |
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
| AS-001 | P0 | Línea base de alcance y decisiones; D-001–006 registradas; revisión de apartados restantes | Alcance, permisos y ciclo de vida aprobados; definición restante en revisión |
| AS-002 | P0, AS-001 | Matriz de permisos aprobada, combinación de roles, delegación y asignación de unidad definidas | Definición aprobada (D-005); implementación/pruebas futuras |
| AS-003 | P0, AS-001/002 | Estados, hitos, reintentos y excepciones con ejemplos de permitido/denegado | Definición aprobada (D-006); implementación/pruebas futuras |
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

Los acuerdos documentales se publican en la rama de revisión; no integran automáticamente propuestas pendientes en `main`. AS-002 y AS-003 tienen definición aprobada, no implementación; AS-004–010 mantienen sus pendientes.

## 11. Condiciones para cerrar la etapa 0

- [x] Objetivo de piloto desplegado confirmado (D-001).
- [x] Cuentas personales confirmadas (D-002).
- [x] Permisos combinables confirmados (D-003).
- [x] Alcance funcional/exclusiones y escenario de aceptación aprobados (D-004, 29/10/2026).
- [x] Matriz de permisos, delegación y unidad asignada aprobadas (D-005, 29/10/2026).
- [x] Estados, excepciones, lectura y entrega técnica diferenciados y aprobados (D-006, 29/10/2026).
- [ ] Campos, límites, triaje pendiente y tratamiento de lactantes resueltos o explícitamente excluidos con aprobación.
- [ ] Políticas de sesión, contraseñas y recuperación definidas.
- [ ] Modelo/contratos mínimos y dependencias de tareas revisados.
- [ ] Dependencias vulnerables tratadas o riesgo residual justificado antes de exponer servicios.
- [ ] Pruebas repetibles y CI operativos con evidencia.
- [ ] Entorno e instrucciones verificadas por otro integrante cuando sea posible.
- [ ] Rúbrica de Nota 3, fecha de defensa y disponibilidad del equipo confirmadas.

**Próxima revisión:** datos y validación de formularios (sección 5, AS-004): obligatoriedad, límites, datos desconocidos, lactantes y triaje pendiente. Alcance, permisos y ciclo de vida ya están aprobados; no iniciar módulos clínicos con reglas pendientes que obliguen a rehacer el modelo.
