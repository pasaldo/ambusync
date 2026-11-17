# Revisión independiente del buzón —17/11/2026

## Alcance y método

Una revisión independiente en contexto nuevo sobre
`c07faec4305e6f6d4ed14f0cc19bbe0a5a22f53e..f60f5966878fb5c1ad334a57c9f9de887d1cff02`.
Lectura estática de código, diseño, plan, tests y evidencia; sin modificar archivos,
ejecutar suites, acceder a secretos/proveedores o desplegar.
Veredicto recibido: **con correcciones**, ningún crítico identificado.
El autor valida las correcciones mediante TDD y suites; no segunda revisión.

## Hallazgos y tratamiento

### I1 — Importante: pérdida de incertidumbre al cambiar formularios

Reenvío usaba generación del formulario/geocoding. Editar/Nueva/Cerrar mientras
elPOSTestaba pendiente invalidaba su callback; una respuesta perdida podía
liberar el botón sin exigir reconciliación. ReproducidoRED en tres pruebas de
navegador con respuesta retenida. Corregido mediante ciclo de vida independiente,
guardias síncronas porinstitución y aviso persistente asociado al botón.
Buscar solo reconcilia incertidumbres existentes al iniciar esa búsqueda.
Las tres regresiones comprueban que Editar/Nueva/Cerrar no permiten otro envío
y que Buscar no reenvía automáticamente.

### M1 — Reevaluado como importante: canal de captura en administración institucional

El revisor lo clasificó menor. Se elevó por efecto funcional: después de activar
la primera cuenta, crear/reinvitar cuentas desde administración institucional
seguía sugiriendo entregaexterna a direcciones ficticias; podía bloquear la
continuación de la demostración. El contrato general de captura exige distinguirla.
GETmanagement/config ahora comunica modo sin credenciales. Altas/reenvíos
confirman captura; recuperación gestionada explica captura condicional, sin
garantizarla. No se cambió la respuesta pública genérica de recuperación.
Dos pruebasbackendRED porcampoausente y una pruebaUIRED porcopiaincorrecta;
GREEN trascorrección.

### M2 — Menor diferido: fixture de contenido hostil

Falta un mensaje de prueba con imágenes/CSS/fonts/links externos y un canario que
observe intentosHTTP/DNS/browser. Las pruebas actuales acreditan denegación de
APIs auxiliares y ausencia de rutaexterna enelruntimeaislado, **no ausencia de
todo intento de fetch enRender con egreso disponible**. CSP restrictiva,
herramientas denegadas y relay/forwarding/versioncheck apagados siguen vigentes.
No se implementó esa ampliación en esta pasada; debe preservarse como limitación.

## Decisiones sobre aspectos que el revisor no juzgó

1. Render/billing/aceptaciónremota: pendientes de autorización y evidencia reales;
   ensayosDocker no los sustituyen.
2. Fuerza real decontraseña: el hash no acredita longitud/entropía. Procedimiento
   humano privado20–72bytesUTF8/mínimo20caracteres ybcrypt12; no afirmar generación
   ni validación de una credencialreal que todavía no existe.
3. Procedencia/seguridadupstream: autor contrastó digests y licencias oficiales
   MIT/Apache-2.0; no auditoríaindependiente de dependencias ni garantía supplychain.
4. Resultados nuevos: pruebas ejecutadas por autor; revisión independiente estática,
   sin atribuirle ejecución.
5. Rendimiento sostenido yUIbajolímites: noSLA. Se añadió a smokefinal una apertura
   real deUIy mensaje bajo512MiB/0.1CPU, además deAPIs; no equivale a carga sostenida
   o toda la plataformaRender.
6. HistóricoA–L/correoreal/dispositivos/respaldo: fuera deestaentrega; conservar
   sus aprobaciones y pendientes, no usar este cambio para cerrarL/M.

## Otras decisiones de ejecución

- Usar worktreeaislado existente yDockeruserlocal; arranquesDocker solo autorizados,
  sininstalación/reinicioOS. Normalizar encabezadosTask para scripts fue mecánico.
- Docker29 no publica puertos de redesinternal: usar relay deingreso desechable
  con upstreamfijo enlosensayos, dejando runtime aislado sin salida.
- Consolidar comprobación deimagen/supervisor deTask3 enTask5; no omitir la
  aceptaciónintegrada.
- Reenvío usa bloqueousuarios→membresía→activación, relectura de institución sin
  introducir inversión de locks; carrerascruzadas verificadas.
- Quitar filecapabilities heredadas de binarios, innecesarias enpuertos>1024,
  conRED→GREENimagenreal.
- Revisar desdeSHApublicadoanteriorc07faec, no rehacer revisión dehistóricoA–L.

Si cualquiera de estos supuestos cambia, revalidar aislamiento, arranque,
autorización/concurrencia y promoción; no aplicar cambiosremotos por inferencia.
