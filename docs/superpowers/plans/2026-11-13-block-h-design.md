# Bloque H — histórico, resúmenes y consulta administrativa

**Aprobación posterior:** el responsable respondió «apruebo este funcionamiento con la misma dinamica de pruebas». Contrato completo y dinámica inline/TDD/revisión final autorizados; comenzar implementación localH. No autoriza grants en desarrollo ni nueva publicación/despliegue.

**Estado: diseño iniciado, no implementaciónH.** Retoma autorizada por el responsable después de aceptarG y publicar `f510d0a`; mantener rama `feature/pilot-completion`. El responsable eligió **Restringir histórico**: cerrados/cancelados requieren Urgencias+permiso adicional del destino. La frontera del archivo legado queda confirmada; contrato completo y plan técnico listos para revisión antes de implementar. No iniciarI/J, conceder permisos a desarrollo ni inferir push/merge/despliegue nuevos.

## Autoridad y arranque verificado

- ETAPA_0 sección2: listado paginado, filtros fecha/estado/unidad/triaje, detalle histórico y cantidades por estado/triaje; sin PDF/Excel ni analítica avanzada.
- ETAPA_0 sección3: informes clínicos solo Urgencias con permiso adicional, destino autorizado; administración institucional consulta auditoría administrativa propia sin clínica; system_admin no obtiene acceso clínico.
- G y correcciones aceptados según reporte del responsable sobre1799cac; aprobación/pausa publicadas enf510d0a.
- En la retoma, PostgreSQL55432 ya estaba activo y se reutilizó tras identificar proceso/rutaAmbuSync; se iniciaron Valkey loopback6379, Mailpit1025/8025 sinrelay, Daphne8000 y Vite5174 de esta copia. `/local` y MailpitHTTP200; `/auth/me`HTTP401 esperado sin sesión. Django check/migrate--checkPASS; emergencies0010 figura aplicada. No se ejecutó migrate ni se modificaron datos por el arranque.
- Solo datos sintéticos. Sin nuevo restore/RPO/RTO/CI remoto/uso clínico.

## Propuesta funcional

1. **Histórico e informes del destino:** permiso adicional explícito `view_reports` junto a `urgencias`, pertenencia activa a destino habilitado, sin acceso al maestro paciente ni a episodios de otro destino. No se heredan permisos del vínculoF ni de instituciones operadoras relacionadas.
2. **Consulta clínica en servidor:** paginación25/máximo100 y orden estable creación descendente/ID; filtros desde/hasta por fecha de creación del episodio en America/Santiago (límites inclusivos de día, convertidos a rango de instantes), estado, unidad y triaje, incluido Sin clasificar. Validación estricta de fechas/rangos/valores; IDs de unidad solo dentro de episodios autorizados, sin directorio de flota ajena. No alias/identificación en URL.
3. **Resúmenes autorizados:** total y cantidades por estado y triaje sobre TODO el conjunto filtrado, no solo página ni descarga clínica completa a navegador. Un original canceladoF y su reemplazo cuentan como dos episodios cuando ambos pertenecen al destino consultado; no presentarlos como dos pacientes únicos ni traslados únicos. No tasas/ETA/rendimiento clínico inferidos.
4. **Detalle histórico solo consulta:** snapshots/mediciones/correcciones/hitos locales del episodio; no editar históricos, autolectura al abrir ni expandir historia de otro receptor porF. Aplicar mismos permisos también a GETdirecto, no solo a botón del archivo.
5. **Auditoría administrativa institucional:** panel independiente para `institution_admin`, sin `view_reports` ni rol clínico por defecto. Páginas y filtros de fecha/acción/objeto sobre acciones administrativas propias permitidas explícitamente (cuentas, unidades/asignaciones/provisión), proyección mínima actorID/fecha/acción/objetoID/resultado/correlación. Nunca motivos/notas/pacientes/mediciones ni eventos clínicos; excluir cuerpos y campos técnicos libres como executor. No acceso a auditoría global/otras instituciones ni a logs de infraestructura.
6. **Aprovisionamiento adicional controlado:** extender comando local `grant_pilot_permissions` para `--view-reports`, exigiendo Urgencias previa e institución habilitada, con auditoría y sin delegación web/autoconcesión. Probar solo DBefímera; no concederlo a cuentas de desarrollo automáticamente.
7. **Integridad/memoria:** lecturas privadas/no-store, sin persistencia clínica web; descartar resultados/filtros/detalle ante cambio de cuenta/ámbito/permisos, impedir respuestas tardías y refrescos silenciosos de otra consulta. Mantener pendientesA/UUID/cuerpo/versiones, no nuevos envíos automáticos. Auditoría/retenciónC conservan plazos y no se ejecutan purgas/cierre/restore.
8. **UX:** separar bandeja operativa de histórico de consulta y auditoría administrativa. Controles familiares/móvil, paginación y resumen coherentes; no reutilizar la descarga de todas las páginas del archivo legado para simular filtrado servidor.

## Decisión confirmada — archivo legado y acceso a terminales

Actualmente `authorized_emergencies` permite episodios terminales a ambulancia de la unidad y Urgencias del destino, y la UI posee Archivo de Urgencias con filtros locales. Eso no equivale al contratoH de permiso adicional, filtros y paginación servidor.

**Opción elegida por el responsable para cumplir la matriz aprobada:** reservar consulta ordinaria de cerrados/cancelados (lista/detalle/histórico/resúmenes) a Urgencias+`view_reports` del destino. Ambulancia conserva seguimiento de su unidad mientras no terminal; Urgencias sin informes mantiene notificada/en_traslado/llegado, incluidos llegados antiguos pendientes de cierre actualmente desplazados al archivo visual. No confundir llegado con episodio cerrado ni quitar la operación de cierre. Replay de una escritura ya confirmada sigue autorizado dentro del ámbito original vigente, aunque el resultado sea terminal, exclusivamente para resolver ese intentoA; no convertirlo en una nueva ruta general de consulta histórica.

**Alternativa que requiere nueva decisión explícita:** conservar la consulta terminal del archivo actual por rol y exigir `view_reports` solo para el nuevo panel de informes. Mantiene compatibilidad visual pero cambia el significado aprobado de «histórico clínico requiere permiso adicional» y no debe presentarse como esa separación.

La alternativa de conservar archivo por rol no fue elegida. Plan técnico en `2026-11-13-block-h-history-reports.md`: ejecución inline con TDD, pruebas de aislamiento/revocación/versiones/replaysA–G, suite completa PostgreSQL y frontend, vista390px, revisión independiente final y PRUEBAS_H con arranque/permisos/casos/resultado esperado. No prometer cierreH antes de verificar y aceptar.
