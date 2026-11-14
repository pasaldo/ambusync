# Bloque I — implementación de recuperación segura

> Ejecución inline con executing-plans, TDD y revisión independiente única final; dinámica A–H conservada. El responsable aprobó el funcionamiento completo tras elegir soporte técnico para D-013.

**Goal:** recuperación de contraseña/correo con autorización verificable y revocación sin delegar contraseñas o sustitución de correo al panel institucional.
**Architecture:** tres modelos de seguridad (contacto previo inmutable, caso técnico y autorización de recuperación hasheada). Backend es autoridad; enlaces secretos en fragmento SPA/memoria, nunca almacenamiento web. Avisos de revocación WS efímeros complementan validación DB.
**Tech Stack:** Django/DRF/PostgreSQL/Channels y React existentes, sin dependencias nuevas.
**Spec:** `2026-11-14-block-i-design.md`.

## Global Constraints
- Solo sintéticos, Mailpit local; sin proveedores/remitentes externos, grants/contactos/migraciones en desarrollo ni push/merge/despliegue/J–M.
- Enlace un uso/30min, mínimo15/máximo128contraseña, sin autologin. No reactivar cuentas ni conceder grupos/ámbitos.
- Público202genérico para solicitud elegible/no existente/no disponible; límites por identificador/origen con clavesHMAC separadas de login y mismo comportamiento para inexistentes.
- PasswordRecovery debe ligar token digest a fingerprint(cuenta/correo/password/sessionversion/ámbito), propósito y caso técnico si existe. Reemitir invalida anteriores; consumo y revocación atómicos, orden usuario→caso/contacto→token.
- D-013 exige contacto previo vigente al abrir caso, verificador/método/fecha/resultado, confirmación de correo nuevo. Sin contacto previo no hay bypass; sin cambios web de correo.
- Contactos son configuración de seguridad (no clínica ni membresía); casos/autorizaciones de recuperación son registros de seguridad sujetos al plazo auditoríaC. Tokens expirados son inutilizables aunque quede su metadata hasta purga autorizada.

## Review Focus
- Solicitud conocida/desconocida, fallo SMTP y cuenta inactiva: mismo resultado público, sin token/contactos en logs/URLsHTTP; entrega desacoplada para no depender de SMTP en respuesta pública.
- Carreras de consumir/reemitir y cambio de correo/contraseña/ámbito: solo una confirmación válida, sin cambio parcial.
- Contacto sustituido tras abrir caso, verificación rechazada/autoatribuida o nuevo correo ya ocupado: no recuperar ni cambiar cuenta equivocada.
- Sesión/WS antiguos y frontend de otra cuenta: no eventos/datos ni autologin/autoenvío, conservar resoluciónA legítima.
- AuditoríaH y retenciónC: solo proyección administrativa mínima nueva; eliminar registros de seguridad solo con sus plazos, no contactosconfig como clínica.

### Task 1 — recuperación normal y revocación backend
**Files:** accounts/{recovery_models,recovery,recovery_delivery,recovery_views}.py, accounts/models.py/migrations0005/urls.py, accounts/security.py, accounts/session_events.py, emergencies/consumers.py, tests_recovery.py.
**Interfaces:** `request_recovery(email, origin)->None`, `complete_recovery(id,token,password,confirmation)->None`; `publish_session_revocation(user_id)` on_commit; público POST `/auth/recovery/request/` y `/auth/recovery/complete/`.
- [x] RED API202/fueraámbito/CSRF/throttle, mailfragment/configuredorigin/tokenhasheado/unuso30min/passwordrules/reemisión/revocaciónsin autologin; dobleconfirmación y reemisión concurrente comprobadas.
- [x] Modelos/migración solo generada/testDB, userlock/fingerprint y workeracotado de lookup/mail, no cola durable.
- [x] GREEN específicos y fullbackend; sin migrar desarrollo.

### Task 2 — D-013 técnico y solicitud administrativa
**Files:** accounts/recovery_support.py, management/commands/{register_recovery_contact,start_email_recovery,verify_email_recovery}.py, recovery_views.py, institutions/urls.py, audit/views.py/presentation contract, retentioncommand/tests.
**Interfaces:** contacto porID/cuenta/canal/procedencia, caso porcontacto previo/currentfingerprint/proposed_email; `verify_case(case_id,verifier,method,result)` sin devolver token; enlace usa complete_recovery deTask1.
- [x] RED soporte/endpoints antes de código, luego pruebas contacto/rechazo/método/scope/colisión/unuso/rollbackSMTP y salidaCLI sin secretos.
- [x] Comandos interactivos y endpoint administrativo en ámbitoB, cuerpo{}estricto, sin rootmixedroles ni autodelegación web.
- [x] RED auditoría/retenciónC→GREEN, contactosconfig conservados y fullbackend.

### Task 3 — frontend y WS
**Files:** screens/{RecoveryScreen,LoginScreen}.tsx, App.tsx, lib/backend.ts/emergencySocket.ts, local/AdminAccountsPanel.tsx/LocalPortal.tsx, scripts/recovery-test.mjs.
**Interfaces:** `/recuperar-cuenta` solicitud; `/restablecer-cuenta#id=...&token=...` consume fragmento una vez/luego limpia, estricto frente a enlaces malformados; POSTnormal/confirmación. Eventos4401avisan expiración sin reenvío.
- [x] RED controles/rutas y revocacióncliente; pruebas fragmento/passwordclear/errors/noautologin/late-response/móvil/admin. Cambioenlaceenmisma pestaña RED→GREEN adicional.
- [x] Estiloexistente, CSRF/memoriaA y secreto volátil, sin webstorage ni links enrespuestaAPI.
- [x] Frontend39unit+7I+18H+15G+12F+6E+30integridad+3correcciones y regresiones/tipos/build/MermaidPASS.

### Task 4 — cierre
- [x] Backend completo sin keepdb/checks/Ruff104/OpenAPI, frontendcompleto y PSrestore dobles; captura390/detectoruna vez[].
- [x] Revisión única sin hallazgos accionables; comprobación adicional del implementador sobre cambio de enlace RED→GREEN y suite. MenoresHprevios sin cambios.
- [x] GuíaPRUEBAS_I con preparación autorizada pendiente, comandos/casos/resultados esperados; entrega en commitlocal acotado sin push.
- [ ] Autorización de preparar base de desarrollo y aceptación manual del responsable.
