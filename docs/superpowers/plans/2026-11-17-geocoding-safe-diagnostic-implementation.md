# Safe Geocoding Diagnostic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Aprobado17/11: inline, sin subagentes. Preparación local; no publicación/deploy.

**Goal:** Identificar categorías de fallo sin secretos, tráfico adicional ni cambio de timeout.

**Architecture:** Sobre de error cerrado del worker, excepción tipada en padre
y diagnóstico efímero en respuesta autorizada. Sin logs nuevos ni persistencia.

**Tech Stack:** Python3.14, urllib/subprocess, Django/DRF; dependencias actuales.

**Spec:** [Diseño](2026-11-17-geocoding-safe-diagnostic-design.md).

## Global Constraints

- Preparación local, sinpush/deploy/configuración/proveedorreal.
- Deadline total5s, límite128KiB, HTTPS/TLS/sinredirect y cuotas sin cambios.
- Sin claves/direcciones/URLs/cuerpos/headers/excepciones en diagnóstico o logs.
- Solo system_admin exclusivo; sin permisos/endpoints/UI nuevos o migraciones.
- Caché no recrea una consulta; un deadline no acredita causa de red.

## Review Focus

1. Excepción con secretos embebidos: sobre/respuesta no los contienen (Task1/2).
2. JSON ambiguo o sobre manipulado: categoría allowlist, nunca texto libre (Task1).
3. Hijo colgado: terminado/esperado y compatible TimeoutError (Task1).
4. Fallo cacheado: marcado sin inventar causa ni consumir cuota (Task2).
5. Actor revocado/ajeno: no acceso diagnóstico ni consulta externa (Task2).

### Task 1: Protocolo seguro del worker

**Files:** modificar `backend/institutions/geocoding_transport.py`;
crear `backend/institutions/tests_geocoding_diagnostics.py`;
conservar `backend/institutions/tests_geocoding_deadline.py`.

**Interfaces:** `fetch_json(address, api_key)` conserva éxito;
`run_worker(script, payload, timeout=5)` valida sobre cerrado.
Errores tipados llevan `code` y HTTPstatus opcional validado.

- [x] Escribir testsRED para clasificación de erroresconcanarios, respuesta
  inválida/grande, fallo deproceso, sobrehostil y deadline con hijo real.
- [x] Ejecutar pruebas sinDB/red y confirmar falla por diagnóstico ausente.
- [x] Implementar sobre/errores tipados sin textoexterno; deadline compatible
  conTimeoutError; no cambios de timeout/retry/redirección/endpoint.
- [x] Repetir testsGREEN y regresionestransport/deadlineexistentes.

### Task 2: Respuesta diagnóstica autorizada y evidencia

**Files:** modificar `backend/institutions/geocoding.py`,
`backend/institutions/geocoding_views.py`, `backend/openapi.json`;
añadir pruebasAPI en `backend/institutions/tests_geocoding_diagnostics.py`;
documentar resultado en `docs/DIAGNOSTICO_GEOAPIFY.md`.

**Interfaces:** `lookup_address(address, retry=False)` devuelve filaexistente
con atributo diagnóstico efímero solo para falloactual. Vista añade
`diagnostic` opcional enunavailable; cacheado usa `cached_unavailable`.

- [x] Escribir testsRED de respuesta categorizada sin canarios, éxito intacto,
  cache sin red/cuota nueva, respuesta sin persistir diagnóstico y autorización.
- [x] Ejecutar RED enPGTESTcontenedorizado, nunca PG55432/.env/proveedorreal.
- [x] Implementar atributo efímero/campo opcional y contratoOpenAPI; mismos
  permisos/estadoHTTP200/no-store; sin logs ni migraciones.
- [x] Ejecutar GREEN: suitebackend completa mediante
  `node ops/deploy/tests/run-backend-tests.mjs`, Ruff/check/OpenAPI; anotar
  fallos/saltos y evidencia real. Auto-revisión de diff y canarios.
- [x] Entregar documentación/resultado local para aprobación separada de
  publicación y despliegue. No inferir autorización de consulta real posterior.
