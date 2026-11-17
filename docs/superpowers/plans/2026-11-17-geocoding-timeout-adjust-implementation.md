# Timeout del worker de geocodificación — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Aprobado17/11: inline, sin subagentes. Preparación local; no publicación/deploy.

**Goal:** Aumentar el timeout del worker de geocodificación de 5s a 10s para evitar deadline_exceeded en consultas lentas, sin reintentos ni cambio de cuota.

**Architecture:** Modificar `run_worker` y `fetch_bytes` en `geocoding_transport.py` para usar `timeout=10`. Pruebas offline con procesos sintéticos; sin red ni credenciales reales.

**Tech Stack:** Python3.14, Django/DRF, dependencias actuales.

**Spec:** [Diseño](2026-11-17-geocoding-timeout-adjust-design.md).

## Global Constraints

- Preparación local, sinpush/deploy/configuración/proveedorreal.
- Timeout propuesto 10s; no reintentos automáticos; cuota sin cambios.
- Sin claves/direcciones/URLs/cuerpos/headers/excepciones en diagnóstico o logs.
- Solo system_admin exclusivo; sin permisos/endpoints/UI nuevos o migraciones.

## Review Focus

1. Valor del timeout: 10s no es inventado; se ajusta a la evidencia de 5.26s observada enRender.
2. Proceso lento: terminado dentro del nuevo timeout y código compatible con TimeoutError.
3. Sin reintentos: `retry` sigue siendo manual y exclusivo.
4. Regressión: suitebackend completa y geocoding existente siguen pasando.

### Task 1: Escribir pruebas RED y verificar fallo

**Files:** crear `backend/institutions/tests_geocoding_timeout.py`.

**Interfaces:** Ninguna nueva; verifica valores existentes de `run_worker` y `fetch_bytes`.

- [ ] Escribir testsRED para worker timeout >= 10s, proceso lento terminado, y parámetro de socket HTTP en fetch_bytes.
- [ ] Ejecutar pruebas sinDB/red y confirmar falla por timeout actual de 5s.

### Task 2: Implementar ajuste de timeout

**Files:** modificar `backend/institutions/geocoding_transport.py`.

**Interfaces:** `run_worker(script, payload, timeout=10)`; `fetch_bytes(address, api_key)` pasa `timeout=10` a `open()`.

- [ ] Implementar `timeout=10` en `run_worker` y en `fetch_bytes`.
- [ ] Sin cambios de lógica de clasificación, reintentos o endpoint.

### Task 3: Verificar GREEN y regresiones

**Files:** conservar `backend/institutions/tests_geocoding.py`, `tests_geocoding_deadline.py`, `tests_geocoding_races.py`, `tests_geocoding_diagnostics.py`.

- [ ] Ejecutar pruebas de timeout nuevas: GREEN.
- [ ] Ejecutar suitebackend completa: `node ops/deploy/tests/run-backend-tests.mjs`.
- [ ] Ejecutar Ruff, check, OpenAPI.
- [ ] Documentar resultado local para aprobación separada de publicación y despliegue.
