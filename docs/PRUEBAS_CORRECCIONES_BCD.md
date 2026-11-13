# Cuatro correcciones de revisión B/C/D — 13/11/2026

Solicitud del responsable: resolver estas observaciones **antes de iniciar E**. Tras entregar `80040c7`, el responsable confirmó B/C/D aprobados y autorizó E: **revalidación manual aprobada según su reporte**, sin nuevos logs/dispositivos detallados. C mantiene alcance local, sin nuevo restore real/RPO/RTO. Solo datos sintéticos; no despliegue ni uso clínico.

## Arranque

Esta copia: `C:\Users\pablo\Documents\Default Project\ambusync-websocket-integration`, rama `feature/pilot-completion`. No hay nuevas migraciones ni cambios backend por estas cuatro correcciones. Si ya está corriendo, Vite incorpora los cambios; no dupliques ni reinicies servicios ajenos.

Con PostgreSQL aislado55432 y Valkey loopback6379 activos, backend:

```powershell
Set-Location 'C:\Users\pablo\Documents\Default Project\ambusync-websocket-integration\backend'
# Solo si faltan migraciones anteriores B/C/D; estas correcciones no agregan ninguna.
uv run python manage.py migrate --noinput
$env:FRONTEND_BASE_URL='http://127.0.0.1:5174'
uv run daphne -b 127.0.0.1 -p 8000 config.asgi:application
```

Frontend en otra terminal, si no está ya activo:

```powershell
Set-Location 'C:\Users\pablo\Documents\Default Project\ambusync-websocket-integration\frontend'
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

Abrir **http://127.0.0.1:5174/local**. Dependencias/servicios si el entorno no está preparado: [PRUEBAS_B.md](PRUEBAS_B.md) y [PRUEBAS_D.md](PRUEBAS_D.md). No ejecutar cierres, purgas o restauraciones para probar estas correcciones.

## 1. Cuenta de ambulancia sin unidad

1. Mantener al operador abierto en un navegador y administración en otro perfil.
2. Desde administración retirar su unidad de una cuenta sintética que pueda retirarse: sin episodios no terminales o con otro operador habilitado válido. La protección del último operador **no se eliminó**.
3. Esperar la revalidación de sesión (sondeo30s o validación por interacción), sin recargar la página.
4. Esperado: aviso **Sin unidad asignada**, cuenta todavía activa y explicación para solicitar asignación. **Guardar emergencia** deshabilitado; no se envía una creación sin unidad. Si además tiene permiso de Urgencias, ese módulo sigue disponible.
5. Asignar de nuevo una unidad habilitada y esperar revalidación. Desaparece el aviso, vuelve el distintivo de unidad y se habilita creación, sin reload. Cambiar de ámbito sigue descartando borradores anteriores según A.

## 2. Rectificación: valor e ID distintos

1. En un episodio sintético antes de recepción, agregar frecuencia65 y rectificar a75 con motivo.
2. Abrir historial de ambulancia y detalle de Urgencias.
3. Esperado:65 tachado y mensaje **Rectificada: reemplazo de75lpm (medición #ID)**, con espacios normales en la interfaz. El número tras `#` identifica la fila, no una frecuencia. La fila75 y su motivo siguen visibles; no se modifica ningún dato del historial por este cambio de texto.
4. Si hay cadenas65→75→76, cada original describe su reemplazo directo; no llama «vigente» a un eslabón ya rectificado. Si falta la fila sustituta en una respuesta incompleta, se muestra referencia etiquetada y «valor no disponible», sin inventarlo.

## 3. Orden D-007 y cambios sin recarga

1. Preparar episodios de prueba de una misma receptora con C1, dos C2 de fechas distintas, C5 y uno sin categoría.
2. Urgencias presenta **Sin clasificar · Pendientes de revisión** en sección separada, antes del grupo clasificado; ausencia no se representa como C5 ni como menor gravedad.
3. En **Clasificados por triaje**, esperar C1→C2→C5. Dentro de C2, el de creación más antigua primero. Estado de traslado no tiene precedencia sobre este orden; ID desempata si coinciden categoría/instante.
4. Desde ambulancia cambiar C1 a Sin clasificar y observar Urgencias: debe moverse de sección después del avisoWS y lecturaHTTP (o del respaldoHTTP), sin recargar. Repetir asignando C1 a uno que era C5: debe encabezar los clasificados.
5. La ordenación se aplica después de recuperar todas las páginas HTTP, no solo a la primera. No reclasifica automáticamente ni cambia estado/destino de episodios.

Se conserva la selección/archivo visual previa de llegados antiguos al superar20 y el archivo de cancelados/cerrados. No se agregó truncamiento de notificados/en traslado para imponer otro límite. Es orden de presentación, **no decisión automática de atención**.

## 4. Texto de actualización real

- Con WS conectado, Urgencias indica **Avisos por WebSocket; conciliación HTTP de respaldo cada60s**.
- Conectando/reconectando/desconectado indica **WebSocket no conectado; consulta HTTP de respaldo cada15s**. El distintivo superior sigue mostrando el estado detallado.
- No debe aparecer «Actualización periódica local; sin WebSocket».
- El test sintético simula caída/reconexión de WS manteniendo APIHTTP disponible. No apagar el backend para intentar probar solamente fallbackWS, porque se perdería también HTTP. Ningún aviso afirma lectura humana ni recepción clínica.

## Pruebas automatizadas

Desde frontend con Vite activo:

```powershell
$env:BASE_URL='http://127.0.0.1:5174'
npm run test:review-corrections
npm run test:unit
npm run test:episode-updates
npm run test:accounts
npm run test:local-websocket
npm run test:local-integrity
npm run lint
npm run build
```

`test:review-corrections` usa transporte sintético: aviso/asignación sin reload, bloqueo de creación sin unidad, respeto de otros permisos, orden de páginas completas, movimiento de grupos porWS/fallback y claridad del historial. No sustituye esta revalidación manual con backend real ni prueba Android/iPhone.

## Revalidación del responsable

- [ ] Aviso/creación deshabilitada sin unidad y reasignación sin reload.
- [ ] Rectificación con valor75lpm e ID claramente diferenciado, original conservado.
- [ ] Triaje/antigüedad/secciónSinclasificar; cambio desde otra sesión mueve la tarjeta sin reload.
- [ ] Texto correcto conectado y en respaldo, sin mensaje «sin WebSocket».

Registrar fecha, commit, resultado y fallos, sin datos reales ni secretos. E no se ha iniciado como parte de esta tarea.

### Evidencia automática y límite del ensayo

Frontend:27 unitarias,3 escenarios nuevos de revisión e integridad30/30, además de suites anteriores/tipos/build/Mermaid aprobados. Backend161/161 sin keepdb y wrapperrestore con dobles PASS, sin modificar backend ni restaurar desarrollo. Revisión independiente sin hallazgos críticos/importantes. Menor diferido: robustecer el test del temporizador de respaldo para distinguir intervalos activos/cancelados; no se detectó fallo funcional y no se afirma haber medido una cadencia operativa real.
