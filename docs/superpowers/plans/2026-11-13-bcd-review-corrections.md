# Correcciones de revisión B/C/D — antes de E

Base `2e49cfc`, feature/pilot-completion. Pedido del responsable del 13/11: corregir cuatro observaciones antes de iniciar E. La aceptación B/D con observaciones y C local se conserva; no ampliar alcance, publicar ni desplegar. Docs de aceptación ya modificadas por el responsable/agente se preservan.

## Contrato
- Aviso de cuenta ambulancia sin unidad, visible también en perfiles combinados; cuenta activa, creación deshabilitada sin asignación, backend conserva autoridad. Reasignación se refleja al revalidar sesión, sin recarga de página.
- Historial: ID de reemplazo claramente etiquetado y valor/unidad del reemplazo cuando está disponible. No confundir ID con valor ni declarar vigente un eslabón rectificado; no alterar datos ni enlaces originales.
- D-007: clasificados C1→C5, más antiguo primero dentro de cada categoría, ID para empate estable. «Sin clasificar» en sección separada pendiente de revisión, antes de clasificados para no representarlo como menor gravedad; no implica prioridad clínica automática. Ordenar la lista completa recuperada por HTTP y recalcular ante conciliación WS/polling. Mantener la selección/archivo existente de llegados antiguos cuando la bandeja supera20; no ocultar notificados/en traslado para imponer un límite nuevo.
- Texto Urgencias según estado real: WS conectado con conciliación HTTP60s; conectando/reconectando/desconectado con respaldo15s. Avisos disparan HTTP, no son datos clínicos ni lectura humana.
- Sin backend/migraciones nuevas previstos. Solo sintéticos; no tocar datos de desarrollo, servicios ajenos, restauraciones ni cierre del piloto. E no se inicia.

## Causas verificadas
- Badge de unidad solo se renderiza si ambulance existe; caso null sin mensaje.
- MeasurementHistory imprime rectified_by_id como número aislado.
- Bandeja ordena por estado y creación descendente; todavía no aplica D007.
- Descripción de Urgencias es texto estático «sin WebSocket» pese a integración existente.

## Review Focus
- No rebajar Sin clasificar a C5 ni ordenar solo la primera página. Reubicación tras WS y polling, sin recarga ni regresión de versiones.
- Cuenta sin unidad conserva sesión/otros permisos; no enviar creación con unidad ausente ni afectar borrador pendiente de otro ámbito.
- Cadena de rectificación y reemplazo ausente: ID/valor claramente distintos, originales inmutables.
- Mantener límite/archivo existentes y no presentar fallback como ausencia de integración o lectura humana.

### Task1 — pruebas y cuatro correcciones
- [x] RED browser aviso/asignación, grupos/triaje dinámico y descripción transporte; unitarias de orden/empates/rectificación.
- [x] Implementar cambios mínimos y GREEN; adaptar regresiones que exigían el antiguo orden por estado.

### Task2 — verificación y entrega
- [x] Frontend completo/tipos/build/Mermaid; backend completo161 sin keepdb y checks + PS restore si entorno disponible.
- [x] Revisión independiente del diff de correcciones; sin críticos/importantes; menor de temporizadores del test diferido.
- [x] Actualizar pendientes distinguiendo corregido/verificado automáticamente de revalidación manual aún pendiente. Guía breve de arranque y cuatro pruebas; commit local acotado. No iniciar E.
