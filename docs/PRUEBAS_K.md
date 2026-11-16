# K — PWA instalable y actualización segura

**Estado:** comportamiento y plan aprobados por el responsable el16/11/2026.
Implementación verificada localmente; aceptación manual K pendiente.
Solo piloto sintético, sin despliegue ni uso clínico.

## Qué cambia

- Manifest e iconos locales de AmbuSync, apertura en `/` y modo standalone.
  Abrir la aplicación conserva el control de sesión/roles del backend.
- Se permite ampliar con zoom. El acceso «Instalar AmbuSync» ofrece instrucciones
  y, cuando el navegador lo admite, un botón de instalación por acción del usuario.
- La aplicación **requiere conexión**. El service worker no guarda respuestas ni
  recursos en Cache Storage/IndexedDB, no encola escrituras ni hace background sync.
  La caché HTTP de archivos estáticos públicos no es almacenamiento clínico.
- Una navegación sin red devuelve una pantalla genérica HTTP503/no-store, sin
  datos de cuenta, episodio, recuperación ni shell de la aplicación.
- Los avisos de conectividad no confirman disponibilidad del servidor ni éxito
  de escrituras. Los envíos inciertos conservan el reintento explícito existente.

## Dónde probar

**Preparación LAN posterior autorizada16/11:** Android por
**https://192.168.100.8:8443/**, conCA temporal instalada manualmente y firewall
restringido. Ver [PRUEBAS_HTTPS_LOCAL_K.md](PRUEBAS_HTTPS_LOCAL_K.md).
Esta preparación no declara probada la instalación en elcelular ni apruebaK.

El worker se registra **solo en build**, en contexto seguro. Vite dev5174 sirve
para desarrollo y regresiones, no acredita instalación ni actualización K.

Desde `frontend/`:

```powershell
npm run build
npm run preview -- --host 127.0.0.1 --port 4174 --strictPort
```

Usar `http://127.0.0.1:4174/` en el mismo PC. Las rutas API/WS usan el proxy de
Vite hacia Daphne local8000, que debe estar disponible junto conPG yValkey.
No publicar estos puertos en LAN ni cambiar secretos para probar K.
La instalación real en celular requiere origen HTTPS, pendiente del bloqueL
y de su autorización: localhost del PC no acredita GPS/instalación móvil.
No introducir túneles, certificados de confianza ni servicios externos por inferencia.

## Instalación manual

1. Abrir el build con conexión y una cuenta sintética autorizada.
2. Expandir «Instalar AmbuSync». En Chrome/Android puede aparecer el botón
   «Instalar aplicación» o la opción nativa del menú del navegador.
3. En iPhone/iPad usar Safari → Compartir → Añadir a pantalla de inicio cuando
   esté disponible; no se promete el diálogo programático de Chrome enSafari.
4. Cancelar la instalación no debe cerrar sesión ni impedir continuar en laweb.
5. Abrir desde el icono debe respetar sesión y ámbito: instalar no concede permisos.
6. Probar móvil/tablet, zoom, teclado, validación y botones sin desborde horizontal.
7. La instalación **no** habilita GPS con pantalla bloqueada ni reanudación automática.

## Actualización sin perder trabajo

El archivo del worker incorpora una huella del build. El navegador comprueba
actualizaciones al registrar y al volver a enfocar la ventana. Si hay versión
en espera, aparece «Nueva versión disponible».

1. Mantener dos ventanas/pestañas abiertas; una puede estar oculta.
2. Preparar un nuevo build mientras ambas usan el anterior.
3. Volver a enfocar la aplicación y comprobar el aviso, sin recarga automática.
4. Antes de cerrar, resolver envíos sin confirmar y guardar o descartar cambios
   pendientes. No hay guardado persistente de borradores.
5. Cerrar una ventana no debe forzar la otra. **Cerrar todas** las ventanas y
   pestañas del origen, incluida la PWA instalada; después volver a abrir.
6. El ciclo nativo del navegador activa la versión en espera al no quedar clientes
   anteriores. No se envía `skipWaiting`, no hay `clients.claim` ni reload por
   `controllerchange`.

Cerrar/recargar sigue descartando memoria: no existe rescate offline de datos
ni garantía si el usuario cierra con trabajo pendiente. Una pestaña dejada abierta
puede diferir la activación indefinidamente. Mantener assets públicos de versiones
anteriores durante despliegues es un requisito a preparar enL; K no lo acredita.

## Regresión reproducible

```powershell
npm run test:unit
npm run test:pwa
```

`test:pwa` construye y sirve el build en servidores loopback efímeros propios,
con API sintética y worker realChromium. No reemplaza la instalación nativa en
dispositivo ni prueba la infraestructura externa. Incluye manifest/iconos,
actualizaciones con varias ventanas/borrador/envío pendiente, reintento exacto,
logout/offline503/almacenamiento vacío, instalación cancelada/no soportada,
registro fallido y tamaños390/768px.

### Aceptación del responsable

- [ ] Instalación/apertura y sesión en plataforma disponible.
- [ ] Actualización diferida en varias ventanas, sin recargas de trabajo.
- [ ] Conexión perdida/reintento manual sin éxito ficticio ni datos offline.
- [ ] Formularios/zoom/errores legibles en móvil/tablet.
- [ ] Registrar plataformas y limitaciones efectivamente observadas, sin inferir HTTPS o dispositivos.

### Evidencia automática local —16/11/2026

- Frontend54unitarias y18K(7contratos/controlador+11navegador sobre build) aprobados.
- Regresiones16J/18H/15G/12F/7I/6E/30integridad/3correcciones y
  actualizacionesD/unidades/cuentas/system-admin/WS/sync/tipos/build/Mermaid3/3 aprobados.
- Backend310/310 en128.587s, conValkey accesible desde Windows yPG55432 disponible.
  Se usó el mismo runner completoDjango con nombre de baseTESTexclusivo porPID
  configurado solo en memoria, creada/destruida por el runner. No es una nueva
  ejecución verde del comando predeterminado que comparte `test_ambusync_dev`.
  Los fallos por interferencia/interrupciónPG anteriores del16/11 no se borran.
- Django check/makemigrations/Ruff115/OpenAPI y restauración con doblesPASS.
  Sin restauración/purga real, nuevas migraciones, dependencias, reinicios de
  servicios duranteK, consultasGeoapify ni capturaGPSreal.
- Revisión visual de capturas sintéticas390/768 de ambulancia/sistema sin
  desborde; no certifica teclado/instalación de dispositivos físicos.
- La regresión detectó una carrera `installed` antes de `registration.waiting`:
  prueba de controladorRED→GREEN, sin forzar activación. Se añadió exclusión
  API/WS de navegación directa tambiénRED→GREEN.
- Una prueba adicional de estabilidad detectó una espera asíncrona que daba por
  preparada la primera instalación demasiado pronto, dejando el cliente sin
  controlar. Se corrigió solo el fixture: esperar `serviceWorker.ready` y estado
  `activated` con predicado síncrono y exigir cliente controlado antes de actualizar.
  Tres repeticiones consecutivas18/18 aprobadas; sin cambiar el ciclo de vida real
  ni forzar activación para satisfacer el test.
- Aviso previo de bundle>500kB conservado. Detector visual solo señaló el fondo
  grid heredado deindex.css, no introducido/rediseñado porK.
- Revisión independiente única: sin críticos/importantes. Menor diferido:
  ampliar cobertura móvil de foco, viewport reducido por teclado y validación
  dentro del formulario institucional. Las comprobaciones actuales no los certifican.
- Preview local4174 preparado: `/`, manifest, worker yCSRF200; `/auth/me/`401
  esperado sin sesión. No se hizo login ni se capturó GPS real para esta comprobación.
  Sin nuevaCIremota, push o despliegue.
