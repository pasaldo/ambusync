# K — prueba Android por HTTPS en la red local

**Preparación autorizada el16/11/2026.** El responsable confirmó Android y
autorizó certificado local y apertura restringida de8443. No es despliegue público,
aceptación manual deK ni inicio del hosting deL.

**Actualización posterior16/11:** el responsable reportó instalaciónAndroid
correcta y aprobó explícitamente K sobre `cfb155b`, autorizando push a
`origin/feature/pilot-completion`. Sustituye el pendiente manualK histórico,
no acredita pruebas físicas del agente ni despliegue público. La CA temporal,
su caducidad y las reglas/procesos locales mantienen sus límites; no se retiran
ni detienen automáticamente por la aprobación.

## Acceso

**https://192.168.100.8:8443/**

El PC debe permanecer encendido y el celular conectado a la misma red local.
La IP corresponde a Ethernet delPC, perfil privado, subred192.168.100.0/24.
Una red de invitados con aislamiento de clientes puede impedir el acceso incluso
con el servidor funcionando. Si cambia laIP, este certificado no sirve para la nueva.

## Instalar únicamente el certificado público en Android

1. Copiar al celular, por ejemplo medianteUSB, **solo**:

   `C:\Users\pablo\Documents\AmbuSync-Android\ambusync-k-root-ca.crt`

2. En Ajustes deAndroid buscar **Instalar certificado** o **Certificado de CA**.
   Según fabricante: Seguridad y privacidad → Más ajustes de seguridad →
   Cifrado y credenciales → Instalar certificado → Certificado deCA.
   Seleccionar el archivo copiado; Android puede pedir elPIN del dispositivo.
3. Confirmar exclusivamente la CA **AmbuSync K LAN Test CA 2026-11-16**.
   Su huellaSHA256 es:

   `B5:27:01:B9:1D:37:33:A1:03:AD:C6:99:22:AD:56:45:08:A1:59:8F:DA:F9:15:D4:45:22:4B:76:D0:2D:CE:F9`

4. Cerrar y volver a abrirChrome. Navegar a la direcciónHTTPS indicada.
   No continuar mediante excepciones de certificado, flags de contexto inseguro
   ni desactivación de comprobacionesTLS. Si persiste una advertencia, registrar
   el error exacto y revisar instalación deCA, fecha/hora y dirección.
5. Iniciar sesión con una cuenta sintética autorizada. En el menúChrome o en
   «Instalar AmbuSync», buscar **Instalar aplicación** / **Añadir a pantalla de
   inicio**, según versión. Abrir desde el icono y realizar [PRUEBAS_K](PRUEBAS_K.md).

Instalar unaCA concede confianza a los certificados que pueda firmar. Se usa
solo para esta prueba temporal; no instalar otrasCA ni transferir claves privadas.
Si el dispositivo es administrado y prohíbe certificados de usuario, no eludir
esa política: informar la restricción.

El certificado del servidor vence el **23/11/2026,17:36UTC**. Al terminar la
prueba, retirar estaCA de los certificados de usuario deAndroid y solicitar
el cierre del servidor/reglas locales. La caducidad no elimina automáticamente
la entrada de confianza instalada en el celular.

## Límites de red y procesos

- Solo frontendHTTPS escucha en `192.168.100.8:8443`.
- Backend de esta prueba en `127.0.0.1:8001`, separado delDaphne existente8000;
  configuración temporal fuera deGit: DEBUGfalse, host exacto, origenCSRFHTTPS
  exacto, cookiesSecure y cabecera de esquema escrita por el proxy local.
- Vite5174, preview4174, PostgreSQL55432 yValkey6379 permanecen enloopback.
- Regla de permiso `AmbuSync-K-HTTPS-LAN-8443`: TCP8443, IP exacta, Ethernet,
  perfilPrivate, solo192.168.100.0/24 y ejecutableNode local.
- Se detectaron reglas previas amplias deNode, que **no se modificaron**.
  Para que no amplíen8443, se añadieron dos bloqueos específicos:
  `AmbuSync-K-HTTPS-LAN-8443-Block-Outside` (fuera de la subred) y
  `AmbuSync-K-HTTPS-LAN-8443-Block-Other-Profiles` (Public/Domain).
  Las tres reglas afectan solo el puerto/IP/ejecutable de esta prueba.
- No hay túneles, redirección de router ni exposición dePG/Valkey/Daphne.
  Usar únicamente datos sintéticos.

Certificados, claves y configuración temporal están en
`%LOCALAPPDATA%\AmbuSync\local-https-k-20261116`, fuera delrepositorio.
La carpeta privada permite acceso al usuario propietario ySYSTEM.
El servidor solo usa la clave delservidor, no la clave firmante deCA.
No adjuntar archivos `.key` a conversaciones, capturas oGit.

## Verificación realizada desde el PC

- CadenaTLS eIP comprobadas usandoCA explícita, **sin** desactivar validación.
- Root, manifest, worker eicono200; lectura privada de sesión401 sinlogin.
- CookieCSRF conSecure; POST deJSONmalformado con origen/token válidos400;
  origen ajeno403 y POST sinCSRF403. No se inició sesión ni modificaron cuentas.
- UpgradeWSS anónimo403 esperado: no acredita sesiónWSS autenticada.
- Reglas de firewall/filtros y listeners comprobados; no equivale a conexión
  observada desdeAndroid ni a instalaciónPWA/GPSfísico aprobados.

No se modificaron código clínico, modelos, migraciones, `.env`, permisos de
cuentas ni datos de desarrollo. No se repitió toda la suite deK por esta
preparación operativa; se conserva su evidencia previa. Sin push/merge/despliegue público.

## Retirada posterior (no ejecutada)

Cerrar únicamente los procesos de esta prueba (HTTPS8443 yDaphne8001).
En PowerShell elevado, quitar solo las tres reglas identificadas:

```powershell
Remove-NetFirewallRule -Name 'AmbuSync-K-HTTPS-LAN-8443'
Remove-NetFirewallRule -Name 'AmbuSync-K-HTTPS-LAN-8443-Block-Outside'
Remove-NetFirewallRule -Name 'AmbuSync-K-HTTPS-LAN-8443-Block-Other-Profiles'
```

No eliminar reglas preexistentes deNode ni detener servicios ajenos.
