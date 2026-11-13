# Corrección H — archivo clínico y auditoría coexistentes

Base2dda7cd. El responsable aclara que el historial previo debe seguir disponible para Urgencias normal y administración+Urgencias; auditoría administrativa debe coexistir manteniendo su rol. Esta nueva instrucción sustituye la elección previa «Restringir histórico» en cuanto al archivo básico, sin conceder informes/resúmenes ni auditoría por defecto.

## Contrato
- Archivo de Urgencias independiente para `urgencias`, solo su destino habilitado/membresía activa. Administración sin Urgencias y ambulancia sin Urgencias no adquieren acceso clínico.
- `institution_admin` sigue siendo obligatorio para Auditoría administrativa propia, sin clínica. `urgencias`+`view_reports` sigue obligatorio para informes/resúmenes adicionales.
- Nueva lectura paginada `/api/v1/emergencies/history/`,25/máximo100, sin summary ni directorio de unidades, para cerrados/cancelados por defecto. Puede consultar llegados con filtro explícito; todos los llegados pendientes siguen visibles en operativo, no restaurar cap20.
- Filtros tradicionales día/mes/año/estado, validados en servidor y fecha del hito America/Santiago: cancelado→cancelled_at/created_at; cerrado→closed_at/arrived_at/created_at; llegado→arrived_at/created_at. Orden fecha de hito descendente/ID, snapshot de lectura por respuesta. No identificaciones enURL.
- GETdetalle existente permite terminales a Urgencias de su destino sin `view_reports`; no ampliar el alcance de ambulancia, institución relacionada ni vínculoF.
- Detalle readonly compartido con informes para conservar identificación, mediciones, hitos, motivos/autorías/cronología y acciónG de baja maestra solo con su permiso adicional. No duplicar ni debilitar validación de ID/respuestas tardías/ámbito.
- Sin modelos/migraciones/grants/datosdesarrollo, nuevas dependencias, push/merge/despliegue ni I/J.

## Ejecución inline TDD, revisión única final
1. REDbackend acceso básico/aislamiento/roles independientes/fechas/filtros/páginas/no-store y browser botonescoexistentes/archivo/details/filtros. Ejecutar antes de código.
2. Implementar scope/endpoint y archivoUI separado, compartir detalle ya probado. GREEN específicos; adaptar solo expectativas sustituidas explícitamente por el usuario, conservar negativos de informes/auditoría.
3. Backendcompleto sin keepdb, frontendcompleto A–H/tipos/build/Mermaid/PSdobles, vista390px/detectoruna vez; revisión independiente y fiximportantes RED→GREEN; documentar PRUEBAS_CORRECCION_H y estado actual. Commit local acotado, aceptaciónmanualpendiente.

ReviewFocus: Urgencias normal no hereda auditoría ni resúmenes; administrador sinurgencias no obtiene clínica; cuenta combinada no mezcla destinos/unidades; historialF/G/fechasdehito legadas conservado sin fabricar hitos; lecturas tardías/permisos/cambio de módulo no reemplazan datos ni rompen reintentosA.

## Cierre técnico
- [x] REDbackend4 y browsercoexistencia antes de producción, fechaUI tambiénRED→GREEN.
- [x] Endpoint/alcance y navegación independientes, detalle compartido; bajaG sin informes, negativos de informes/auditoría conservados.
- [x] Backend249/249 sin keepdb, frontend38unit+12H+15G+12F+6E+30integridad+3correcciones y regresiones completas PASS.
- [x] Checks/Ruff91archivos/OpenAPI/tipos/build/Mermaid3/PSrestore dobles PASS; captura390px y detectoruna vez[].
- [x] Revisión independiente única sin hallazgos accionables; docsactualizadas, sin nuevas concesiones/migraciones ni publicación/I/J.
- [ ] Aceptación manual del responsable según PRUEBAS_CORRECCION_H.
