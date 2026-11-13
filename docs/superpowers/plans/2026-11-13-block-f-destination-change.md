# Bloque F — cambio de destino atómico

> Ejecución inline con executing-plans/TDD y una revisión independiente final; base ac14ce1.

**Goal:** cancelar original y crear reemplazo vinculado sin duplicados ni acceso cruzado.
**Architecture:** Django/PostgreSQL autoridad; operación transaccional sobre mecanismo A, avisos WS mínimos tras commit; SPA solo memoria.
**Tech Stack:** stack fijado del repositorio, sin dependencias nuevas.
**Spec:** ETAPA_0 D006/D014, ARQUITECTURA_PILOTO, ETAPA_1 y propuesta de F aprobada por el responsable en conversación.

## Global Constraints y contrato
- Sintéticos, no uso clínico; sin push/merge/despliegue, datos reales, purga/restore ni migración a desarrollo. E aprobado; G/J no iniciados.
- POST `/api/v1/emergencies/{id}/change-destination/`, JSON exacto `{operation_id,expected_version,destination_id,reason}`. Solo ambulancia habilitada de la unidad, antes de llegada, nuevo destino receptor/combined habilitado distinto. Versión vigente obligatoria. 200 `{original: Emergency,replacement: Emergency}`; errores400/403/404/409 estándar.
- Original cancelado, motivo/autor/hora servidor, versión+1; nuevo ID/created_by/created_at/version1, misma unidad/operadora/paciente. `replaces` one-to-one PROTECT en reemplazo, no autoenlace. Exponer solo `replaces_id`/`replaced_by_id`, no representación/nombre de destino ajeno. ID de vínculo no concede consulta.
- Proyectar allowlist de paciente/motivo/notas/síntomas/triaje y procedencia del triaje. Actualmente todos estos campos son del emisor, no existen notas internas receptoras. Nunca copiar lectura/preparación/llegada/cancelación/cierre. Notificada sigue notificada; en_traslado sigue en_traslado, conserva declaración original autor/hora, no inventa salida nueva. GPS no existe aún: J debe usar nuevo ID y detener escritura sobre cancelado, no copiar posiciones.
- Mediciones heredadas: copiar hojas no rectificadas de cada cadena (incluidas muestras independientes, no solo última por tipo), nuevos IDs locales sin FK a medición ajena, valores/unidades/autor/hora medida/hora registro originales intactos; `inherited_at` indica incorporación al reemplazo, no nueva captura. UUID original no se atribuye a escritura nueva; operation_id null para heredadas. Futuras capturas/rectificaciones usan D, resumen sigue seleccionando última muestra no rectificada. Cambios sucesivos conservan procedencia original y marcan incorporación de cada reemplazo.
- ProcessedOperation permanece vinculado al original; replay devuelve par actual aun si reemplazo avanzó/cambió otra vez/destino se deshabilitó, con ámbito actual de unidad comprobado antes. Nuevo UUID sobre original cancelado409. UUID reusado cuerpo/acción/episodio distinto409. Invalidar éxito de respuesta incompleta/alienígena; cuerpo del retry inmutable. F requiere original cancelado, versión incrementada, vínculo recíproco, IDs distintos, destino solicitado y misma unidad/paciente de contexto (no revalidar estados iniciales del reemplazo en replay).
- Auditoría correlacionada de cambio/cancelación y creación del reemplazo, sin duplicar payload clínico; aviso destination_changed sobre original a receptor viejo/unidad y created sobre nuevo a receptor nuevo/unidad, tras commit. Rollback elimina todo y no emite avisos.
- C retiene episodios e importaciones con su aplicación; purga autorizada desliga reemplazos solo dentro de su transacción antes de borrar. Sin borrado ordinario ni mutación de originales.

## Review Focus
- Reemplazos encadenados/replay luego de llegada y retiro de asignación: no duplicar ni conceder ámbito.
- Carreras llegada/actualización/segundo cambio/retiro o baja destino: resultado serializado, sin cancelación parcial.
- Medición rectificada y nueva muestra independiente: copiar hojas, conservar autores/horas y no presentar herencia como captura nueva.
- Respuesta corrupta/de otro episodio, CSRF pendiente, expiración o cambio de cuenta: no confirmar ni reenviar automáticamente.
- Receptor viejo/nuevo por GET/lista/WS y vínculo: cada uno recibe solo su episodio; importaciones no incluyen notas/hitos internos ni rutas de acceso ajenas.

## Task 1 — backend
- [x] Escribir tests RED de atomicidad, proyección, permisos/aislamiento, replay, validación, rollback, retención y carreras PostgreSQL. Endpoint ausente404 observado.
- [x] Implementar `destination_change.py`, campos/migración0007, serializers/urls, hook de representación base para par F, WS y retenciónC. GREEN suite específica; completa199/199 sin keepdb.

## Task 2 — SPA
- [x] Browser RED formulario explícito por controles ausentes; escenarios de incertidumbre/reautenticación/versión y respuesta ajena.
- [x] Componente `DestinationChange.tsx`, validador respuesta F, operación A/par, herencia y vínculos solo informativos. Borrador en memoria con ámbito/versión, sin almacenamiento ni autoenvío.
- [x] Unitarias31/31, browserF10/10, build/script/CI y regresiones anteriores PASS.

## Task 3 — verificación/entrega
- [x] OpenAPI/guía PRUEBAS_F con migración/arranque/casos; F manual pendiente.
- [x] Backend199/199 sin keepdb, checks/OpenAPI, frontend completo/tipos/build/Mermaid, PSrestore dobles y vista390px PASS.
- [x] Revisión independiente, dos importantes RED→GREEN; sin nuevos menoresF. Decisiones/propuesta/evidencia registradas; cambios preparados para commit local acotado, sin iniciar G.
