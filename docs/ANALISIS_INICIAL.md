# AmbuSync — diagnóstico inicial y base de evolución

Fecha de revisión: 28 de octubre de 2026. Código base: `71e9537f2aad1fa83bf8ed80217d942d8b2d8155`.

## 1. Dictamen ejecutivo

AmbuSync apoya la coordinación prehospitalaria: permite anticipar al receptor los antecedentes de un paciente antes de su llegada. No sustituye el juicio clínico, no diagnostica ni debe asignar triaje automáticamente.

El repositorio contiene una demostración frontend funcional, no una plataforma distribuida lista para producción. Se pueden reutilizar sus interfaces y componentes; faltan la autoridad del servidor, persistencia centralizada, identidad, permisos, seguimiento real y operación verificable. Compilar un paquete denominado «de producción» no demuestra preparación clínica u operacional.

La primera meta razonable es un piloto académico integrado con datos sintéticos. La producción clínica requiere después validación del prestador, seguridad y continuidad probadas, responsabilidades de tratamiento y soporte acordados. No se realizó un despliegue productivo en esta etapa.

## 2. Fuentes y alcance de la revisión

Se revisaron el texto y las imágenes incrustadas de los dos documentos adjuntos, las notas de cambios, el código fuente, configuración, scripts y los tres commits del repositorio original. Los adjuntos originales permanecen fuera del repositorio; no se publicaron documentos personales ni sus copias extraídas.

| Fuente | Papel en el análisis |
|---|---|
| `Manejo de pacientes y gestion de triaje - AmbuSync.docx` | Problema, 18 RF, historias de usuario, restricciones y visión de producto |
| `Nota 2/Manejo_de_pacientes_y_gestion_de_triaje_AmbuSync_Informe_2.docx` | Especificación más concreta del piloto, modelo, procesos, pruebas, KPI y operación |
| `Documentos del proyecto/Detalles a cambiar del prototipo actual.txt` | Solicitudes iniciales a reconciliar con los informes |
| `README.md`, `CLAUDE.md`, `frontend/` | Evidencia de implementación, distinta del diseño propuesto |

SHA-256 de los adjuntos, respectivamente:

```text
794cf9a442b20de970165149ee3874f99fa899ebaa21630ea7aaed0a326a1506
47d15729a2f59e30b57940ea3c40fc46d967d03c3bf85fa3b1a6c2bbbcd1248f
35c52d583580be42b801e0e226b24c9fed42be884b9fbdcb6631cc6bc8afc95b
```

Las referencias bibliográficas, cifras de impacto, afirmaciones legales y certificaciones mencionadas en los informes no se consideran verificadas por haber sido leídas. Requieren contrastación con fuentes oficiales y revisión profesional cuando corresponda. Tampoco se dispuso de entrevistas, convenios institucionales o resultados de aceptación clínica.

## 3. Funcionamiento del negocio

### Actores y límites

- **Ambulancia:** captura antecedentes y mediciones, selecciona destino, registra triaje profesional y comunica cambios del traslado asignado.
- **Urgencias:** consulta episodios destinados a su establecimiento, confirma lectura, prepara recursos, registra llegada y cierre.
- **Administrador institucional:** gestiona cuentas y unidades de su institución. Administrar cuentas no debe conceder automáticamente acceso a toda la información clínica.
- **Paciente:** beneficiario indirecto; no hay portal de pacientes implementado.
- **Institución operadora y receptora:** pueden ser distintas. Compartir un episodio dirigido a un destino no autoriza compartir todo el historial del paciente.

### Tres procesos principales

1. **Registro y aviso:** captura → validación → autorización → transacción persistida → aviso → confirmación técnica. Si no hay confirmación, mostrar pendiente/fallido; no afirmar que urgencias recibió o leyó.
2. **Seguimiento:** actualizar mediciones y posición durante el traslado, verificar permisos y versión, guardar antes de publicar, mostrar frescura y gestionar reconexión sin duplicar operaciones.
3. **Recepción y cierre:** lectura → preparación → llegada física → cierre. Son hitos diferentes; el reloj ETA no acredita llegada.

El Informe 2 propone `creada → notificada → en_traslado → recibida → cerrada`, con cancelación antes de recepción y estados terminales sin reapertura ordinaria. Lectura y preparación se conservan como hitos auditados, no como reemplazo del estado de traslado.

## 4. Arquitectura realmente implementada

```text
React Router
  /                    selector visual de rol
  /ambulancia          formulario guiado de cinco pasos
  /urgencias           tablero, detalle y acciones
           ↓
    Zustand: useCases
           ↓
    localStorage + BroadcastChannel
           ↓
    otras pestañas del mismo origen y contexto de navegador
```

No hay API, Django, PostgreSQL/MySQL/SQLite en uso, Redis, WebSocket de servidor, autenticación, migraciones, contenedores o pipeline CI/CD en el árbol revisado.

Versiones resueltas en `frontend/package-lock.json`: React 18.3.1, TypeScript 5.9.3, Vite 5.4.21, Zustand 4.5.7, React Router DOM 6.30.4, Tailwind 3.4.19 y Playwright 1.61.0. El entorno de revisión usó Windows, Node 24.20.0 y npm 11.19.0. No se actualizaron dependencias.

### Mapa de responsabilidades del código

| Archivo o directorio | Responsabilidad y observación |
|---|---|
| `frontend/src/App.tsx` | Rutas abiertas; el selector no autentica |
| `screens/ambulance/AmbulanceApp.tsx` | Coordina borrador, pasos y simulación de envío con temporizador de 1.600 ms |
| `screens/ambulance/draft.ts` | Borrador en memoria; unidad/destino predeterminados de demostración |
| `screens/ambulance/steps/` | Paciente, vitales, triaje manual, destino/ETA y resumen |
| `screens/ambulance/steps/meta.ts` | Validación mínima: motivo de más de dos caracteres, FC/SpO2 presentes, triaje elegido y destino/ETA |
| `store/useCases.ts` | Crear caso, cambiar estado, eliminar, sembrar demo y vaciar; no verifica permisos ni transiciones |
| `store/sync.ts` | Guarda arreglo completo en `ambusync:cases:v1`; difunde estado completo y atiende solicitudes entre pestañas |
| `screens/er/ErApp.tsx` | Siembra demo al entrar vacío, separa entrantes/recibidos y permite vaciar tablero |
| `screens/er/sorting.ts` | Orden por triaje y, en empate, ETA más próximo |
| `screens/er/CaseDetail.tsx` | Acciones aceptar, preparar box y marcar recibido |
| `components/EtaCountdown.tsx` | Cuenta regresiva local; al vencer muestra «ARRIBANDO», sin GPS |
| `data/vitals.ts`, `components/VitalsStrip.tsx` | Resaltado por umbrales estáticos, no validación clínica demostrada |
| `components/PhoneFrame.tsx` | Marco móvil en escritorio; hora y señal simuladas, no telemetría real |
| `scripts/sync-test.mjs` | Prueba de creación y aparición entre pestañas del mismo contexto |

### Modelo actual y consecuencias

`CaseRecord` embebe `Patient` y `Vitals`; contiene triaje, estado, unidad y hospital como texto, `createdAt`, minutos de ETA y `etaTarget`. Los vitales ausentes se representan con `null`. No hay identidad institucional ni relaciones referenciales, historial de mediciones, autor, auditoría o versiones.

Los estados actuales son `capturando`, `transmitido`, `aceptado`, `preparando` y `recibido`. `addCase` crea directamente `transmitido`. `updateStatus` acepta el estado suministrado sin máquina de estados en servidor. `createdAt` y `takenAt` dependen del reloj cliente; este último se fija al transmitir, no necesariamente al medir.

Cada publicación reemplaza el arreglo completo. Ediciones simultáneas pueden sobrescribirse; no existen control de concurrencia, acuse de recepción remoto ni idempotencia. La lectura desde almacenamiento solo comprueba que el JSON sea un arreglo, no su estructura completa. Los fallos de escritura local se silencian. Estos mecanismos son adecuados para demo, no para garantizar integridad clínica.

## 5. Cobertura de requisitos

«Parcial» significa disponible en demo, no aceptación del requisito distribuido.

| RF | Estado observado | Brecha hacia el piloto |
|---|---|---|
| 01 Autenticación | Ausente | Sesión real, cierre/caducidad y bloqueo de acceso no autenticado |
| 02 Usuario maestro | Ausente | Rol administrativo institucional y permisos delimitados |
| 03 Unidades paramédicas | Ausente | Alta y desactivación de cuentas/unidades, credenciales independientes |
| 04 Ambulancias | Ausente | CRUD autorizado, código único por institución, asignaciones |
| 05 Paciente | Parcial | Registro persistido y paciente desconocido sin datos inventados |
| 06 Signos vitales | Parcial | Mediciones seriadas con fecha/autor/unidad; permitir ausencia de medición |
| 07 Síntomas | Parcial | Ocho chips y texto libre ya existen; falta catálogo/gestión y persistencia central |
| 08 Motivo | Parcial | Texto libre sin límites máximos ni validación de servidor |
| 09 Validación | Parcial | Edad 999 admitida; reglas completas de dominio y errores por campo |
| 10 Emergencia | Parcial | FK válidas de paciente, unidad, operador y destino; transacción |
| 11 Fecha/hora | Parcial | Ya hay fecha cliente; falta fecha autoritativa UTC y trazabilidad de hitos |
| 12 Transmisión | Demo local | Comunicación real entre dispositivos, confirmación tras persistencia |
| 13 Tablero | Parcial | Filtrado por destino autorizado y estado reconciliado con servidor |
| 14 Actualización | Parcial | Solo cambio de estado; faltan edición clínica, historial y conflictos |
| 15 Geolocalización | Ausente | Permisos GPS, captura, precisión, frescura y parada al terminar traslado |
| 16 Distancia | Ausente | Haversine con coordenadas válidas; no confundir distancia con ETA vial |
| 17 Eliminación individual | Parcial interno | Existe `removeCase`, pero no acción individual en UI ni desactivación auditada |
| 18 Informes | Ausente | Sección «recibidos» local no equivale a informes históricos filtrados/paginados |

RNF-01/02/03 (latencia/GPS/disponibilidad) no están demostrados. RNF-04 (acceso) y RNF-08 (aislamiento) carecen de implementación. RNF-05 exige continuar con datos sintéticos; no introducir pacientes reales. RNF-06 requiere evaluación de usabilidad, no solo inspección visual. RNF-07 se interpreta como integridad siguiendo la matriz del Informe 2; compatibilidad se mantiene como criterio adicional.

## 6. Reconciliación de documentos y decisiones pendientes

1. **Nombre:** código e informes usan AmbuSync; «AmbySync» en la solicitud se trata como variante de escritura, sin cambiar la marca.
2. **Base de datos:** las notas antiguas mencionan MySQL/SQLite; el Informe 2 selecciona PostgreSQL. Se recomienda seguir este último, sujeto a confirmación del alcance antes de implementar.
3. **Complejidad:** el informe inicial proyecta Kubernetes, Keycloak, Kafka, PostGIS, FHIR nativo y aplicaciones móviles. El Informe 2 los acota o difiere: monolito modular Django, DRF, Channels, Redis, PostgreSQL, React y Docker Compose. No convertir aspiraciones comerciales en obligaciones del piloto sin acuerdo.
4. **Síntomas/fechas:** no están totalmente ausentes como sugieren algunas notas; ya existen en el frontend, pero sin persistencia central ni garantías de servidor.
5. **Eliminar:** preferir desactivación lógica auditada sin destruir episodios/historial; impedirla si compromete episodios activos. La supresión clínica real exige política institucional y revisión normativa.
6. **Nombre/motivo «solo letras»:** no imponer esa regla sin validación del prestador. Nombres pueden incluir tildes, espacios, guiones y apóstrofes; motivos clínicos pueden necesitar números y puntuación. Deben acordarse límites y caracteres, preservando contenido clínico válido.
7. **Edad y desconocidos:** Informe 2 propone 0–130, con desconocido como `null`. Resolver cómo representar lactantes menores de un año y no usar cero como desconocido. El borrador actual preselecciona sexo F: evitar asumirlo para un paciente no identificado.
8. **Vitales/triaje:** la UI actual exige FC y SpO2 y aplica límites estrechos; el piloto permite ausencia y SpO2 0–100. No bloquear datos críticos plausibles ni asignar valores por defecto. El triaje siempre se registra/confirma por profesional.
9. **ETA:** es manual/simulado y no utiliza ubicación. El piloto especifica distancia geodésica aproximada, no cálculo de ruta ni tiempo de llegada real.
10. **Roles/cuentas:** «maestro» debe ser un permiso administrativo, no una cuenta compartida universal. El piloto contempla cuentas por unidad; para producción debe resolverse también trazabilidad de la persona operadora.
11. **Normativa:** no trasladar afirmaciones del marco teórico a declaraciones de cumplimiento. Por ejemplo, RLS de PostgreSQL no impide por sí solo el acceso de un superusuario o un rol `BYPASSRLS`. La clasificación regulatoria y bases legales requieren revisión especializada.
12. **Cronograma/costos:** el Informe 2 plantea 405 horas del equipo y 20 clientes, no miles de ambulancias. Sus montos y recursos son estimaciones; no autorizan contratar servicios ni garantizan capacidad. Fechas, rúbrica de Nota 3 y alcance final deben confirmarse.

Los diagramas del Informe 2 representan adecuadamente los tres procesos, roles, capas y red privada a nivel conceptual. Para ejecución conviene completar rutas explícitas de error/rechazo y contingencia, conservar fuentes editables y evitar presentar estas imágenes como modelos formalmente validados por herramientas BPMN/UML. El diccionario, no solo el dibujo ER simplificado, debe gobernar las FK y restricciones.

## 7. Arquitectura objetivo recomendada

```text
Móvil y PC: React
        ↓ HTTPS / WSS :443
Nginx: TLS, frontend estático y proxy
        ↓ red privada
Django / DRF / Channels (ASGI)
  cuentas · instituciones · unidades · pacientes
  emergencias · seguimiento · informes · auditoría
        ↓                         ↓
PostgreSQL                    Redis (eventos)
        ↓
Copias externas cifradas y restauración verificada
```

- PostgreSQL es la fuente de verdad. Redis/WebSocket avisan; no prueban recepción ni reemplazan persistencia.
- Toda operación valida sesión, rol, institución, unidad y destino en servidor. Incluir API, consultas históricas y suscripciones WebSocket.
- Adoptar inicialmente sesiones Django con cookies HttpOnly/Secure, CSRF y validación de origen WSS, preferentemente mismo origen web. Fijar versiones soportadas al iniciar implementación, no copiar versiones antiguas sin revisión.
- Modelo propuesto: Institucion, Usuario, Ambulancia, Paciente, Emergencia, SignoVital, Sintoma, EmergenciaSintoma, Posicion y Auditoria. UUID operacionales, unicidad por institución, FK protegidas y marcas UTC presentadas en `America/Santiago`.
- Usar transacciones y publicar tras commit. Definir semántica de `notificada`: publicación técnica no acredita renderizado ni lectura. Si falla el evento, reconciliar mediante API; evaluar outbox si se exige entrega durable.
- Versionado optimista para detectar edición obsoleta. `operacion_id` para reintentos: además de creación y mediciones, concretar cómo se deduplicarán las actualizaciones/transiciones, no cubiertas completamente por un único UUID de creación.
- Al reconectar: suscribirse, retener eventos temporalmente, consultar instantánea y aplicar solo versiones posteriores; reconciliación periódica ante eventos perdidos.
- Retirar almacenamiento persistente de antecedentes clínicos del navegador para el piloto. Mantener formulario/pendientes en memoria con advertencia explícita sobre pérdida al cerrar/recargar. Offline cifrado completo es otra fase, no una garantía actual.
- Capturar GPS cada 8 segundos en primer plano como diseño inicial; medir el intervalo real. Advertir antigüedad superior a 30 segundos. Distancia Haversine aproximada, sin coordenadas válidas indicar no disponible.
- No exponer PostgreSQL/Redis a Internet. Separar entornos y secretos; logs sin relatos clínicos ni credenciales. Monitorear operación esencial, no solo proceso encendido.

## 8. Verificación ejecutada

Todos los datos de prueba fueron sintéticos. Se mantuvo intacto el código funcional y el lockfile original.

| Verificación | Resultado observado |
|---|---|
| `npm ci --ignore-scripts` | Instalación satisfactoria desde lockfile |
| `npm run build` | TypeScript y build Vite satisfactorios |
| `npm run lint` | Satisfactorio; el comando es `tsc --noEmit`, no ESLint ni análisis completo |
| `npm run test:sync` | Satisfactorio tras instalar Chromium de Playwright: 4 → 5 tarjetas y caso visible sin recarga |
| Acceso directo `/ambulancia` sin credenciales | Permitido: confirma ausencia de login |
| Edad 999 y motivo sintético | Permite avanzar: brecha de validación confirmada |
| Continuar sin FC/SpO2 | Bloqueado: confirma incompatibilidad actual con registro sin mediciones |
| Aceptar → preparar → recibido | Flujo UI satisfactorio con datos demo |
| Recarga tras recepción | Estado conservado en `localStorage` |
| Segundo contexto de navegador | No comparte el episodio del primer contexto; no hay persistencia central |
| Errores JavaScript en la comprobación adicional | Ninguno observado; no equivale a cobertura exhaustiva |
| `npm audit --json` | 10 dependencias reportadas: 5 altas, 5 moderadas; cero críticas en esta ejecución |
| `npm run check:diagrams` | Devuelve éxito pero detecta **0 diagramas**; no constituye validación de los 3 bloques existentes |
| Búsqueda básica de patrones de secretos en los tres commits | Sin coincidencias; no sustituye un escáner especializado |

La detección de Mermaid usa saltos `\n` literales en su expresión regular y no normaliza CRLF, lo que puede explicar el falso éxito en Windows. Debe fallar si no encuentra los diagramas esperados. No se corrigió en esta etapa de diagnóstico.

La auditoría incluye Vite/esbuild, React Router/DOM, PostCSS y dependencias transitivas de herramientas. El conteo es de paquetes reportados, no de explotaciones demostradas ni diez fallos necesariamente alcanzables en el paquete estático. Se debe evaluar exposición, actualizar con pruebas y repetir auditoría; no aplicar `npm audit fix --force` indiscriminadamente. El servidor de revisión se vinculó a `127.0.0.1`, no a la red pública; la configuración original `host: true` merece revisión.

No se ejecutaron pruebas P01–P16 del sistema futuro, carga de 20 clientes, GPS móvil, seguridad multinstitucional, accesibilidad completa, disponibilidad durante siete días, restauración de DB o validación legal/clínica. No hay resultados de KPI/SLA productivos.

## 9. Hoja de ruta y condiciones para avanzar

| Orden | Entrega | Evidencia mínima de salida |
|---|---|---|
| 0. Línea base | Alcance confirmado, reglas clínicas/formularios, dependencias soportadas, revisión y CI | Build/typecheck/pruebas repetibles, escaneo, backlog RF/RNF y decisiones registradas |
| 1. Identidad y datos | Django/DRF, PostgreSQL, modelo, usuarios, instituciones y ambulancias | Login/logout; permisos por objeto e institución; migraciones y pruebas P01/P02/P08 |
| 2. Flujo vertical real | Paciente, emergencia, mediciones, síntomas, tablero conectado | Móvil y PC distintos ven registro persistido; fechas servidor, lectura y cambios; P03/P04/P05/P12 |
| 3. Resiliencia | Idempotencia, versiones, fallos/reconexión y reconciliación | Reintentos sin duplicación; conflictos visibles; evento perdido recuperable; P10/P14/P16 |
| 4. Seguimiento e histórico | GPS, distancia aproximada, desactivación e informes paginados | Datos ausentes explícitos, permisos y filtros, auditoría; P06/P07 |
| 5. Staging y aceptación | HTTPS, contenedores, secretos, monitoreo, respaldos y manuales | Humo/rollback y restauración aislada; regresión crítica aprobada, P09/P11/P13/P15 y KPI medidos |
| 6. Producción institucional | Evaluación clínica, legal, seguridad, continuidad y soporte | Autorizaciones del prestador, política de conservación, SLA real y acta de aceptación |

Metas documentales del piloto, **pendientes de medición**: ≥90 % de 100 envíos en <3 s con 20 clientes; GPS ≤10 s durante 30 min en condiciones controladas; disponibilidad ≥95 % durante siete días; 100 % de integridad en 100 operaciones; cero accesos cruzados exitosos en al menos 30 intentos; ≥90 % de lecturas en ≤60 s y ≥90 % de 20 tareas sin ayuda. Consulta ≤2 s en ≥95 % de 100 consultas; RTO ≤4 h y RPO ≤1 h sujetos a copia horaria externa y restauración real.

95 % durante siete días admite 504 minutos de indisponibilidad: es un umbral académico, no un SLA clínico suficiente. No prometer servicio continuo ni mejoras de desenlaces clínicos a partir de una demo.

## 10. Entrega y control del repositorio

- Directorio de trabajo: `D:\Escritorio\Inacap\Año 4\Semestre 8\Proyecto de titulo\Nota 3` (el repositorio está directamente aquí, sin subcarpeta adicional).
- Repositorio propio: <https://github.com/pasaldo/ambusync>, privado e independiente, no fork; cuenta `pasaldo` con permiso `ADMIN` verificado.
- `origin`: `https://github.com/pasaldo/ambusync.git`; destino normal de publicación de `main`.
- `upstream`: `https://github.com/brypro/ambusync.git`; referencia al origen, sin modificarlo.
- Se conservan los tres commits originales y su autoría. Se añade este diagnóstico sin reemplazar el prototipo.
- No se encontró archivo LICENSE. El control administrativo del nuevo repositorio no transfiere derechos de autor ni concede por sí solo permiso de explotación comercial; aclarar titularidad/licencia con los autores antes de distribuir o comercializar.
- No se publican `node_modules`, `dist`, secretos ni los DOCX originales. Los documentos fuente permanecen en sus ubicaciones originales.

Para ejecutar la demo desde `Nota 3/frontend`:

```powershell
npm ci
npm run dev -- --host 127.0.0.1
```

Abrir `http://localhost:5173`. Para repetir sincronización, con el servidor activo: `npx playwright install chromium` y `npm run test:sync`. Esta demo debe seguir usando exclusivamente datos sintéticos.
