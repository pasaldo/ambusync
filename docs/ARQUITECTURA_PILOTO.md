# Arquitectura y contratos mínimos del piloto

Fecha: 29/10/2026. Tarea: AS-006. Decisión: D-009.

**Diseño aprobado por el responsable del proyecto. Implementación parcial:** el primer slice backend local se registra en [ETAPA_1.md](ETAPA_1.md); el resto de la arquitectura no está implementado. No introduce uso clínico real ni sustituye validación profesional. Proveedores, versiones y pendientes operativos se especifican antes de habilitar las funciones correspondientes.

## 1. Arquitectura general

```text
Móvil de ambulancia / PC de urgencias
               │ HTTPS / WSS
             Nginx
     frontend estático y proxy
               │
    Django / DRF / Channels (ASGI)
         │                │
    PostgreSQL          Redis
    persistencia        eventos
         │
   Copias externas cifradas
```

- React/TypeScript: formularios, paneles, conexión y errores.
- DRF: operaciones y consultas de API; servicios de dominio compartidos concentran permisos, validaciones, transiciones y transacciones.
- Channels: WebSocket autenticado y autorizado usando las mismas reglas de acceso.
- PostgreSQL: fuente de verdad; Redis distribuye eventos, no conserva definitivamente emergencias.
- Nginx: TLS, frontend y proxy; Docker Compose: entorno reproducible y despliegue inicial.
- Un monolito modular, no microservicios. No se publican puertos de PostgreSQL/Redis.

Un evento WebSocket no sustituye persistencia ni acredita lectura humana. Las reglas no se distribuyen entre botones, endpoints y consumidores con implementaciones divergentes.

## 2. Estructura prevista

```text
frontend/
backend/
  config/
  apps/
    accounts/
    institutions/
    ambulances/
    patients/
    emergencies/
    tracking/
    reports/
    audit/
infra/
docs/
```

| Módulo | Responsabilidad |
|---|---|
| accounts | Usuario personal, permisos, sesiones, activación y recuperación |
| institutions | Operadores/receptores y configuración |
| ambulances | Unidades e historial de asignaciones |
| patients | Identidad sintética, edad con unidad, sexo y desactivación lógica |
| emergencies | Episodios, síntomas, mediciones, triaje, hitos y transiciones |
| tracking | Posiciones, frescura y distancia aproximada |
| reports | Histórico, filtros y resúmenes autorizados |
| audit | Acciones y resultados protegidos |

La estructura es un contrato de organización futuro, no directorios ya creados. Los contratos compartidos y las dependencias entre módulos se concretarán sin duplicar la autoridad de las reglas de dominio.

## 3. Modelo relacional mínimo

| Entidad | Información principal |
|---|---|
| Institución | Nombre, tipo, coordenadas y estado |
| Usuario | Cuenta personal, institución, correo verificado y estado |
| Grupos/permisos | Capacidades funcionales y delegación autorizada |
| Ambulancia | Institución, código y estado |
| Asignación de unidad | Persona, ambulancia, inicio y fin |
| Paciente | Institución operadora, identidad conocida/desconocida, edad con unidad, sexo y estado |
| Emergencia | Paciente, operador, unidad, destino, creador, motivo, notas, triaje, estado, versión y fechas |
| Hito del episodio | Lectura/preparación con autor y fecha; conservar primer lector/fecha según D-006 |
| Medición | Tipo, valor, unidad, fecha de medición, autor y operación |
| Síntoma de catálogo | Institución, descripción y estado |
| Síntoma del episodio | Asociación y descripción conservada al registrarse |
| Posición | Coordenadas, precisión, captura, recepción y operación |
| Auditoría | Actor, acción, objeto, resultado, fecha y correlación |
| Operación procesada | Identificador de reintento y resultado asociado |

### Restricciones

- Usuario personalizado desde las primeras migraciones, antes de introducir relaciones dependientes.
- UUID operacionales; código de ambulancia único por institución.
- Una asignación activa por operador, con historial; varias personas por ambulancia. Reasignar no borra autoría ni asignaciones anteriores.
- Fechas con zona horaria, UTC y presentación `America/Santiago`.
- FK protegidas: no eliminación en cascada de episodios por borrar paciente/unidad.
- Sin fila de medición para dato ausente; triaje pendiente como ausencia, no categoría ficticia.
- Vínculo de reemplazo entre episodios por cambio de destino; el vínculo no concede permisos de lectura.

### Contexto histórico del paciente

Conservar en cada episodio los datos del paciente pertinentes a ese traslado además del vínculo al paciente. Una corrección posterior del registro maestro no altera silenciosamente el contexto de episodios anteriores.

El receptor accede a la representación autorizada del episodio, no a todo el registro maestro o historial del paciente. Síntomas del episodio conservan su descripción aunque el catálogo cambie. El detalle de copia/proyección al cambiar destino debe preservar estos límites y no transmitir información interna del receptor anterior.

## 4. Transacciones y autoridad

Operaciones atómicas: creación/habilitación de emergencia; transición con auditoría; confirmación de hito; cancelación y reemplazo por cambio de destino; reasignación con protecciones de continuidad; desactivaciones permitidas.

Se completan todos los cambios necesarios o no se confirma ninguno. Verificar sesión, permisos y pertenencia en servidor, no aceptar institución/unidad arbitrarias del cliente. Publicar eventos después del commit; fallo del aviso no borra datos y debe recuperarse por API. No se promete entrega durable del evento por Redis: evaluar outbox si el requisito se amplía.

## 5. API versionada y acciones explícitas

Base: `/api/v1/`. Documentar contratos concretos en OpenAPI antes de integrar cada flujo; nombres finales, esquemas, paginación y códigos HTTP exactos se fijan con sus pruebas de contrato.

| Grupo | Operaciones mínimas |
|---|---|
| Autenticación | Login/logout, usuario actual, activación y recuperación |
| Usuarios | Crear/consultar, permisos y desactivación autorizada |
| Ambulancias/asignaciones | Registrar/consultar/desactivar unidades; asignar/retirar personal |
| Catálogos | Consultar síntomas; gestionar con permiso adicional |
| Emergencias | Crear/listar/consultar y actualizar antecedentes permitidos |
| Mediciones | Agregar y consultar historial; corrección trazable |
| Acciones | Iniciar traslado, lectura, preparación, recibir, cerrar y cancelar |
| Cambio de destino | Operación específica de cancelación y reemplazo |
| Seguimiento | Registrar/consultar posiciones autorizadas |
| Informes | Histórico y resúmenes filtrados/paginados |

No habilitar `PATCH` genérico para modificar libremente estado. Usar acciones con reglas y permisos específicos; ejemplos de rutas:

```text
POST /api/v1/emergencies/{id}/receive/
POST /api/v1/emergencies/{id}/cancel/
POST /api/v1/emergencies/{id}/change-destination/
```

Formato mínimo de error:

```json
{
  "code": "validation_error",
  "message": "Revisa los campos indicados.",
  "fields": {"age_value": ["La edad esta fuera del rango permitido."]},
  "correlation_id": "..."
}
```

Distinguir validación, falta de autenticación, operación no autorizada, recurso no disponible en el ámbito, conflicto de versión/estado e indisponibilidad temporal. No devolver trazas internas ni información ajena. Mantener la semántica «resultado sin confirmar» cuando la persistencia sea incierta.

## 6. Idempotencia y concurrencia

Cada escritura funcional lleva UUID `operacion_id`: creación, actualización, medición, posición, hitos y transiciones, incluido cambio de destino.

- Mismo identificador/contenido: recuperar resultado sin repetir efectos.
- Mismo identificador con contenido diferente: conflicto.
- Revalidar autorización al recuperar/reintentar; un UUID conocido no concede acceso ni permite recuperar respuestas privadas ajenas.
- Concretar ámbito de unicidad, huella de contenido, concurrencia de reintentos y conservación del registro de operaciones en el contrato técnico antes de implementar.

Las modificaciones del episodio incluyen versión conocida. Una escritura sobre versión obsoleta se rechaza y exige revisar estado vigente; no sobrescribir silenciosamente. Ejemplo: dos personas leen versión 4, la primera genera 5 y la segunda no puede escribir sobre 4.

GPS tiene identificador y orden temporal propios, sin incrementar versión clínica por cada captura. Sus eventos también son independientes. Precisar en contratos los desempates temporales y campos de versión de cada acción para evitar conflictos falsos o retrocesos.

## 7. Eventos mínimos y reconexión

Ejemplo de aviso, sin relato clínico:

```json
{
  "event_id": "...",
  "type": "emergency.updated",
  "emergency_id": "...",
  "version": 5
}
```

- Autorizar suscripciones por institución, destino y unidad; no enviar el arreglo completo de pacientes a todos.
- Identificadores para descartar duplicados; consultar representación vigente por API.
- Reconectar con espera progresiva; suscribirse, retener avisos temporalmente y consultar estado antes de aplicar versiones posteriores, sin retroceder información.
- Reconciliación periódica con sesión válida para recuperar eventos perdidos.
- Revocar acceso también en conexiones abiertas y retirar datos fuera del ámbito.
- Posiciones usan eventos propios, no versión clínica. Frecuencias exactas de reconexión/reconciliación quedan configuradas y verificadas con pruebas.

## 8. Corrección de mediciones

No editar ni borrar silenciosamente una medición histórica. Antes de recepción, una persona autorizada de la unidad registra corrección con motivo; nueva medición referencia la anterior, que queda marcada como rectificada y sigue consultable. El panel distingue valor vigente y rectificado.

Sin corrección ordinaria después de recepción/cierre; posteriores errores requieren futura rectificación formal fuera de esta versión. El backend verifica estado/permisos y registra auditoría; reglas de valor/unidad siguen D-007. La concurrencia de correcciones y las cadenas de rectificación deben concretarse en contratos/pruebas antes de habilitar la función.

## 9. Pendientes explícitos y condiciones de implementación

- Proveedores de correo/copias y retención de aplicación, auditoría, logs y registro de operaciones procesadas.
- Requisito comunicado para servicios externos/copias: jurisdicción Chile y costo recurrente $0. No hay opción de almacenamiento externo que cumpla ambos requisitos confirmada; no desplegar ni cambiar jurisdicción para usar una cuota gratuita incompatible.
- Verificación administrativa de identidad para pérdida de correo: acuerdo D-013, comprobar por contacto institucional previo registrado y dejar constancia del verificador, método, fecha y resultado; no preguntas secretas ni cambio a un correo no verificado. Implementación/pruebas pendientes. También falta definir revocación técnica de sesiones/suscripciones.
- Formulario no enviado al vencer sesión: conducta acordada en D-012 (solo memoria; revalidar misma cuenta/permisos; no autoenviar; descartar al cambiar cuenta). Implementación y pruebas pendientes. Resultado incierto de una escritura: consultar `operacion_id` antes de reintentar.
- Cambio de destino con traslado ya iniciado: comportamiento aprobado en D-014: operación atómica que cancela el episodio anterior, detiene su GPS, crea reemplazo con nuevo ID/contexto autorizado y seguimiento nuevo, y conserva historial/autores anteriores; el vínculo no concede acceso cruzado entre receptores. Esquemas exactos, estado terminal y datos proyectados deben concretarse en OpenAPI/pruebas antes de habilitarlo.
- Contratos OpenAPI y paginación de la primera rebanada están en `backend/openapi.json` y `docs/ETAPA_1.md`; errores/contratos de los flujos restantes, límites técnicos y versiones/eventos siguen pendientes.
- Frontend: Node 24 LTS/npm 11.19.0. El backend fija Python 3.14.10/Django 5.2.18/DRF 3.18.3 en `backend/uv.lock`; no es selección para producción.
- Channels/Valkey están fuera del runtime del primer slice: `channels_redis` publica pruebas hasta Python 3.13; el smoke test `group_add/send/receive/discard` pasó con Python 3.14.10/Channels 4.3.2/`channels_redis` 4.3.0/Valkey 9.0.3, sin ser garantía upstream completa. PostgreSQL 18.6 está instalado para el clúster local aislado. Autoalojar no elimina costos de hardware/hosting, energía, red, dominio ni operación; no contratar ni desplegar.

El diseño mínimo queda aprobado; estos detalles siguen pendientes y deben resolverse antes de implementar/habilitar las operaciones restantes. No empezar con permisos o persistencia provisionales que contradigan los acuerdos.

## 10. Evidencias futuras

Pruebas de contrato y PostgreSQL deben demostrar: aislamiento API/WSS; transiciones autorizadas; cambios atómicos y rollback; idempotencia sin respuesta privada ajena; conflictos de versión; GPS sin conflictos clínicos artificiales; reconexión sin regresión; historial de asignaciones/contexto paciente/síntomas preservado; correcciones de medición visibles y sin pérdida del original.

Esta especificación no constituye evidencia de pruebas ejecutadas, infraestructura creada o backend disponible.
