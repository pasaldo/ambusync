# Archivo H — tarjetas, modal, calendario y unidad

Solicitud posterior a `0c67dfd`. Refinamiento del archivo básico, con los permisos de coexistencia intactos: Urgencias de su destino activo puede consultar archivo; auditoría exige `institution_admin` e informes/resúmenes siguen exigiendo `view_reports`.

## Preparación

Esta copia en `feature/pilot-completion`, http://127.0.0.1:5174/local. Servicios locales/arranque: [PRUEBAS_H.md](PRUEBAS_H.md#1-arranque-de-esta-copia). Usar solo episodios sintéticos. Reiniciar únicamente Daphne de esta copia tras actualizar backend si estaba activo. No requiere nuevas migraciones, permisos ni dependencias.

## Aceptación manual pendiente

1. **Tarjetas:** abrir Archivo de Urgencias con Urgencias normal y con administración+Urgencias. Las tarjetas deben conservar el diseño de la bandeja: identificación, barra/color de triaje y estado, motivo, tira de signos vitales, unidad/destino y lectura/preparación. En archivo se muestra fecha del hito America/Santiago, no creación. Los signos rectificados conservan la proyección vigente. No aparece Marcar como llegado.
2. **Modal:** seleccionar una tarjeta. Debe abrir una ventana modal con identificación, motivo, notas, síntomas, mediciones y correcciones, hitos guardados, destino/unidad, triaje/estado, fechas/autores y motivos de llegada excepcional/cancelación. Sin botones de escritura del episodio ni confirmaciones implícitas por abrirlo. Conserva etiquetaF y aislamiento entre receptores; bajaPacienteG solo como acción separada con permiso propio. Éxito, rechazo y reintento incierto de la baja deben verse **dentro del modal**. Tras pérdida de respuesta, el reintento conserva el mismo cuerpo/UUID/versión y luego vuelve a consultar el detalle para reflejar el estado confirmado.
3. **Teclado/cierre:** comprobar foco dentro del modal, Tab/Shift+Tab, Escape y botón Cerrar. Al cerrar debe devolver el foco a la tarjeta; clic fuera cierra. El fondo no debe recibir clics ni desplazarse mientras está abierto. Si la lectura tarda y se cierra/reabre otro episodio, el resultado anterior no debe reemplazar el nuevo.
4. **Calendario:** Fecha del archivo debe ser un control de fecha con calendario del navegador/sistema, no tres campos numéricos independientes. Seleccionar día/mes/año y Aplicar filtros. Es una fecha única opcional; borrar la fecha quita el filtro al aplicar. Los datos siguen usando el hito en America/Santiago; el formato visual del calendario depende del navegador/región.
5. **Unidad:** elegir Unidad del archivo y combinarla con fecha/estado. Los resultados y total deben venir filtrados del servidor, incluso con más25episodios y al cambiar de página. Quitar unidad/fecha recupera todos los autorizados. Solo figuran unidades con episodios del destino, incluidas unidades históricas deshabilitadas; no se abre directorio ajeno. IDajeno devuelve404genérico y malformado400, sin ampliar alcance.
6. **Independencia:** Archivo y Auditoría siguen coexistiendo según rol; no aparece acceso a informes sin su permiso adicional. La bandeja sigue mostrando todos los llegados pendientes, sin cap20. Abrir/cerrar el modal no envía operaciones ni altera borradoresA–G.
7. **Móvil:** revisar tarjetas/filtros a390px y desplazamiento interno del modal con contenido largo. No debe haber desborde horizontal ni quedar inaccesible Cerrar. Registrar solo dispositivos/navegadores realmente probados.

## Verificación local

Pruebas backend de unidad/aislamiento y browser de tarjeta/calendario se ejecutaron RED antes de producción. La prueba de foco con Tab detectó salida del modal y pasó tras el ciclo explícito de foco. Prueba adicional de respuesta tardía tras cerrar/reabrir detalle.

**Verificación local completa; aceptación manual pendiente:** backend250/250 y frontend38unitarias+17H+15G+12F+6E+30integridad+3correcciones, actualizacionesD/unidades/cuentas/system-admin/WS/sync/tipos/build/Mermaid3/3, todos exit0. Estos casos sintéticos y capturas locales **no** sustituyen aceptación manual entre dispositivos, no acreditan rendimiento ni uso clínico. Sin push/merge/despliegue ni inicioI/J. Menores previosH (apertura inicial de auditoría y warningbundle>500kB) sin cambios.

### Evidencia backend y revisión

- Backend completo **250/250**, sin keepdb; seis pruebas de archivo incluyen filtro/unidades propias/ajenas, fechas y permisos. No cambios de modelos, migraciones ni grants.
- Checks/Ruff/formato91archivos/OpenAPI PASS; PSrestore PASS solo con dobles locales, no una restauración real ni nuevas métricas.
- Revisión independiente única identificó un importante: feedback de bajaPaciente oculto detrás del modal. Dos casos RED (rechazo409/pérdidarespuesta) antes de portar la **misma** fuente de avisos/reintentos al modal; además se reprodujo RED la actualización del detalle tras retry confirmado antes de recargarlo. Sin segunda revisión; verificación final del implementador.
- CapturasChromium390px de calendario/tarjetas y modal inspeccionadas sin desborde; detectorUI una vez sin hallazgos. No equivale a aceptación en navegador/dispositivo real del responsable.
- Daphne de esta copia reiniciado para cargar filtro de unidad; history/auth/audit401 esperado sin sesión y SPA200. No acredita una prueba autenticada real ni modifica datos/permisos.
