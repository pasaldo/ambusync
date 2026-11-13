# H — tarjetas, modal, calendario y filtro de unidad

Base0c67dfd, solicitud explícita del responsable. Refinamiento del Archivo de Urgencias, no rediseño global ni cambio de permisos.

## Contrato
- Reutilizar la tarjeta de episodios de Urgencias (paciente, triaje/estado, motivo, signos, unidad/destino e hitos) también en archivo, sin botones operativos.
- Al seleccionarla, abrir modal accesible con los datos del detalle histórico existente; conservar mediciones/correcciones/hitos/cronología/motivosF y bajaPacienteG separada con permiso propio. Sin escrituras históricas ni hitos implícitos.
- Calendario nativo de fecha única, opcional y borrable, sustituye campos numéricos día/mes/año en UI. Se traduce a los filtros existentes y conserva fecha del hito America/Santiago y backend estricto. No inventar rango temporal no solicitado.
- Filtro por unidad ambulancia en servidor; opciones derivadas solo de episodios del destino autorizado, incluidas unidades históricas deshabilitadas, nunca directorio de flota/operadora ajeno. Todas las páginas mantienen filtros. Sin resúmenes nuevos; los informes y auditoría mantienen permisos y navegación.
- Dialog con foco contenido, Escape/cerrar/backdrop, retorno al disparador, scroll interno/móvil y cierre seguro frente a respuestas tardías.
- Sin modelos/migraciones/grants/datos reales/dependencias, push/merge/despliegue ni I/J.

## TDD inline y revisión final única
1. REDbackend filtro unidad/aislamiento/opciones y paginación. REDbrowser tarjeta coincidente, modal/datos/foco/escape/late-response, calendario/unidad y móvil.
2. Extraer tarjeta compartida sin cambiar la operativa, añadir shellmodal solo archivo y filtros; GREEN y regresiones A–H.
3. Backend completo/checks/OpenAPI, frontend completo/tipos/build/Mermaid/PSdobles, captura móvil/detectoruna vez; revisión independiente, importantesRED→GREEN, guía manual y commitlocal.

ReviewFocus: opciones/unidad ajena no enumeran flota; cambiar filtros/página no pierde unidad ni revive detalle viejo; focus/escape y móvil no bloquean logout/lectura; extraer tarjeta no altera signos rectificados ni rótuloF; audit/reportes/bajaG/privacidad intactos.

## Cierre técnico local
- [x] REDbackendunidad y browsertarjeta/calendario; focoTab y feedbackbajaGreproducidosRED→GREEN.
- [x] Tarjeta compartida/modal/calendario/unidad y permisos conservados; retry exacto y recarga trasconfirmación.
- [x] Backend250/250, frontend38unit+17H+15G+12F+6E+30integridad+3correcciones y regresionescompletasPASS.
- [x] Checks/Ruff91/OpenAPI/tipos/build/Mermaid3/PSdoblesPASS; captura390/detectoruna vez[].
- [x] Revisión independiente única, importantefeedbackG corregido con tests; guía/estadoactualizados.
- [ ] Aceptación manual responsable.
