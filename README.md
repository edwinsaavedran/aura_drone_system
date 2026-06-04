# AURA Drone System

**AURA** es el proyecto de laboratorio del curso de **Sistemas Distribuidos / Arquitectura Distribuida**. El caso de estudio simula un sistema de orquestación de drones para entregas urbanas, construido paso a paso con microservicios, contratos REST/gRPC, resiliencia, eventos y decisiones arquitectónicas defendibles.

El objetivo no es “hacer endpoints porque sí”. El objetivo es que el estudiante aprenda a diseñar, implementar, probar y justificar sistemas distribuidos reales: sistemas donde hay latencia, fallas parciales, duplicados, contratos versionados, servicios que no siempre responden y decisiones técnicas que tienen consecuencias.

## Estado actual

El estado actual del repo es **Unidad 2 cerrada con PC02** y **Unidad 3 iniciada con la Sesión 21**.

Esto significa que el proyecto ya no debe leerse solo como una secuencia de laboratorios. La **Práctica Calificada 02** cierra resiliencia, semánticas de entrega, backpressure, patrones de comunicación, naming y discovery básico. La **Unidad 3** empieza desde ese piso para estudiar tiempo, orden, causalidad y coordinación distribuida.

Ruta principal para revisar el hito actual:

```text
docs/PC02-20261.pdf        # enunciado original de la práctica
docs/pc2-respuestas.md     # solución docente, evidencia y decisiones técnicas
```

| Área | Estado |
|---|---|
| Hito vigente | **PC02 cerrada; Unidad 3 iniciada con Sesión 21**. |
| Arquitectura base | Alineada y documentada para sesiones 11–18. |
| REST v1 | Implementado en `gestor-flota`, `centro-logistica` y `planificador-rutas`. |
| gRPC | Implementado en `monitor-telemetria`. |
| Resiliencia | `centro-logistica → planificador-rutas` con timeout, retry limitado, backoff exponencial con jitter, clasificación retryable/no retryable y propagación de headers. |
| Semánticas de entrega | Consumidor in-memory de `EntregaCompletada` con idempotencia por `eventId` y estado de negocio. |
| Patrones de comunicación | Laboratorio in-memory para request/response, pub/sub, cola FIFO y streaming. |
| Backpressure | Laboratorio in-memory para presión de streaming, cola bounded, backlog, drops/sampling y retry. |
| Naming/discovery | Comunicación inter-servicio mediante configuración y nombres lógicos en Docker Compose. |
| Tiempo físico | Laboratorio determinístico en `monitor-telemetria` para wall-clock, monotonic clock, skew, drift y tolerancia. |
| Tests | Suites por servicio con `npm test`. |

## Qué queda construido al cierre de PC02

La PC02 consolida la capa de comunicación distribuida de AURA. Al llegar a este punto, el estudiante puede demostrar:

- gestión de drones mediante REST;
- gestión de órdenes de entrega mediante REST;
- planificación de rutas como servicio separado;
- telemetría por gRPC streaming;
- resiliencia con timeout, retry, backoff exponencial con jitter e idempotencia;
- trazabilidad básica con `X-Correlation-Id`;
- propagación de intención de negocio con `Idempotency-Key`;
- consumo idempotente de eventos críticos como `EntregaCompletada`;
- presión operacional con backlog, lag, drops, sampling, retry y colas bounded;
- selección justificada de request/response, pub/sub, cola y streaming;
- naming/discovery básico mediante variables de entorno y nombres lógicos de servicio.

El objetivo defendible de PC02 es claro: una orden se recibe, se planifica, resiste fallas parciales, evita duplicados de negocio y permite explicar qué flujos se degradan y cuáles no se descartan.

## Cómo revisar PC02

La solución de PC02 integra cuatro frentes: resiliencia síncrona, consumo idempotente de `EntregaCompletada`, evidencia de backpressure y revisión de naming/discovery.

Guía docente completa:

```text
docs/pc2-respuestas.md
```

Verificación mínima:

```bash
cd services/centro-logistica
npm test
```

```bash
cd services/planificador-rutas
npm test
```

Evidencia operacional recomendada:

```bash
cd services/centro-logistica
npm run lab:delivery-events duplicate-event
npm run lab:delivery-events same-mission-different-event
npm run lab:delivery-events wrong-mission
npm run lab:backpressure -- --controlled
npm run lab:operational-pressure -- --controlled
```

Puntos que debe poder defender la entrega:

| Fase PC02 | Evidencia |
|---|---|
| Resiliencia | Timeout, retry limitado, backoff exponencial con jitter, clasificación retryable/no retryable y propagación de `X-Correlation-Id`/`Idempotency-Key`. |
| `EntregaCompletada` | Evento nuevo procesado, duplicado por `eventId` ignorado, evento distinto sobre misión ya completada sin efecto duplicado, misión inválida rechazada. |
| Backpressure | Métricas `produced/sent`, `accepted`, `processed`, `dropped/sampled`, `buffered/backlog/queueDepth`, `consumerLag/lag`, `rejected` y `retry`. |
| Naming/discovery | `PLANIFICADOR_RUTAS_URL` para comunicación inter-servicio y nombres consistentes de eventos/tópicos en labs. |

## Servicios del sistema

| Servicio | Puerto local | Responsabilidad | Contrato principal |
|---|---:|---|---|
| `services/gestor-flota` | `8001` | Registrar y consultar drones. | REST `/api/v1/drones` |
| `services/centro-logistica` | `8002` | Crear órdenes y coordinar planificación. | REST `/api/v1/orders` |
| `services/planificador-rutas` | `8003` | Calcular rutas para entregas. | REST `/api/v1/routes/plan` |
| `services/monitor-telemetria` | `50051` | Recibir telemetría de drones. | gRPC `TelemetryService` |

## Ejecución rápida

### Con Docker Compose

Desde la raíz del proyecto:

```bash
docker compose up --build
```

Validación rápida:

```bash
curl -i http://localhost:8001/health
curl -i http://localhost:8002/health
curl -i http://localhost:8003/health
```

> Nota: `centro-logistica` usa `PLANIFICADOR_RUTAS_URL=http://planificador-rutas:8000` dentro de Docker Compose.

### Por servicio

En cada carpeta de servicio:

```bash
npm install
npm start
```

Pruebas:

```bash
npm test
```

Regresión recomendada:

```bash
cd services/centro-logistica && npm test
cd ../planificador-rutas && npm test
cd ../monitor-telemetria && npm test
cd ../gestor-flota && npm test
```

## Ruta didáctica de la Unidad 2

La unidad está organizada en sesiones incrementales y un hito integrador. Cada sesión agrega una decisión, un contrato, una prueba o una pieza ejecutable. La PC02 no aparece como “otro documento”: valida que las piezas construidas hasta la sesión 18 funcionan juntas bajo presión.

| Hito | Tema central | Entregables | Aporte al proyecto final |
|---|---|---|---|
| 11 | Fundamentos de comunicación distribuida | Arquitectura base, responsabilidades de servicios, alcance MVP. | Define qué existe en AURA, qué servicio hace qué y cuál es el flujo principal. |
| 12 | Síncrono vs asíncrono, latencia y fallas parciales | Matriz de comunicación, fallas esperadas, timeouts iniciales. | Evita diseñar “como si la red fuera perfecta”; prepara decisiones de resiliencia. |
| 13 | REST, gRPC, contratos e IDL | Contratos v1, estructura base, `telemetry.proto`, primeras pruebas. | Convierte la arquitectura en APIs y contratos ejecutables. |
| 14 | Serialización, versionado y compatibilidad | Norma `/api/v1`, reglas JSON/protobuf, estados y eventos. | Permite evolucionar el sistema sin romper consumidores. |
| 15 | Timeouts, retries, backoff e idempotencia | Política de resiliencia, tests de falla, guía de laboratorio. | Hace que el flujo `centro-logistica → planificador-rutas` tolere fallas reales. |
| 16 | Semánticas de entrega | Consumidor idempotente de `EntregaCompletada`, matriz de semánticas, pruebas de duplicados y pérdida. | Define qué pasa cuando un mensaje llega dos veces, tarde o nunca. |
| 17 | Request/response, pub/sub, colas y streaming | Laboratorio didáctico con REST, gRPC streaming, pub/sub y cola FIFO in-memory. | Compara patrones de comunicación sobre flujos reales de AURA sin introducir broker todavía. |
| 18 | Backpressure y desacoplamiento | Laboratorio de presión con buffers bounded, backlog, drops/sampling, retry y reducción de tasa. | Evita confundir desacoplamiento con capacidad infinita. |
| **PC02** | Integración evaluada de Unidad 2 | Solución docente, pruebas, laboratorios y justificación técnica. | Comprueba que resiliencia, eventos, backpressure, patrones y naming se pueden defender como sistema. |
| 19 | Naming, identificadores y discovery | Catálogo de IDs, nombres de eventos, servicios y claves técnicas. | Da consistencia operativa al sistema y prepara trazabilidad. |
| 20 | Integración y cierre | Demo integrada, decisiones arquitectónicas y backlog de Unidad 3. | Cierra un MVP defendible y deja el camino para coordinación distribuida avanzada. |

## Ruta didáctica de la Unidad 3

La Unidad 3 parte de una pregunta incómoda pero necesaria: si cada nodo observa su propio tiempo, ¿cómo defendemos orden, causalidad y decisiones coordinadas?

| Hito | Tema central | Entregables | Aporte al proyecto final |
|---|---|---|---|
| **21** | Tiempo físico, skew, drift y límites de sincronización | Laboratorio `lab:physical-time`, tests y guía de laboratorio. | Demuestra que los timestamps físicos son útiles como metadatos, pero no prueban orden global ni reemplazan relojes monotónicos para duraciones. |
| 22 | Sincronización de relojes: visión general y efectos en sistemas distribuidos | Próximo laboratorio didáctico. | Mostrará cómo estimar offset/delay, aplicar correcciones y evaluar confianza sin vender sincronización como orden global perfecto. |
| 23 | Lamport clocks y orden parcial | Laboratorio posterior de relojes lógicos. | Permitirá razonar sobre orden parcial sin confiar solo en hora física. |
| 24 | Vector clocks y causalidad | Laboratorio posterior de causalidad. | Permitirá distinguir eventos causalmente relacionados de eventos concurrentes. |
| 25 | Exclusión mutua distribuida | Laboratorio posterior de coordinación de acceso a recurso compartido. | Evitará que múltiples nodos ejecuten una sección crítica simultáneamente. |
| 26 | Locks distribuidos, leases y riesgos operativos | Laboratorio posterior de locks, ownership, expiración y renovación. | Mostrará por qué un lock distribuido necesita tiempo, leases y manejo de fallas. |
| 27 | Elección de líder y failure detectors | Laboratorio posterior de liderazgo ante fallas parciales. | Permitirá decidir quién coordina cuando hay múltiples nodos candidatos. |
| 28 | Coordinación distribuida en escenarios reales | Diseño aplicado sobre escenarios AURA con múltiples nodos. | Integrará tiempo, causalidad, locks, líder y fallas en una decisión defendible. |
| 29 | Laboratorio integrador de sincronización y coordinación | Simulador/laboratorio integrador. | Preparará evidencia técnica para PC3. |
| 30 | Práctica Calificada 3 | Desarrollo y sustentación técnica. | Evaluará sincronización y coordinación distribuida. |

## Qué aprende el estudiante

Al trabajar este proyecto, el estudiante practica competencias que sí aparecen en sistemas distribuidos reales:

- diseñar límites entre servicios;
- elegir REST, gRPC, eventos o colas según el problema;
- versionar contratos sin romper consumidores;
- manejar fallas parciales y latencia;
- aplicar timeout, retry, backoff e idempotencia;
- probar comportamiento distribuido, no solo funciones aisladas;
- documentar decisiones técnicas con evidencia;
- construir un MVP incremental y defendible.

## Entregables esperados por sesión

Cada sesión debe dejar evidencia. No alcanza con decir “se entendió”: debe existir un artefacto revisable.

| Tipo de entregable | Ejemplos en este repo |
|---|---|
| Decisión arquitectónica | Matrices, políticas y criterios en `docs/`. |
| Contrato | Endpoints REST `/api/v1`, archivo protobuf, payloads JSON. |
| Prueba ejecutable | `npm test` por servicio. |
| Evidencia de laboratorio | Guías y bitácoras en `docs/`. |
| Implementación mínima | Código Node.js/Express/gRPC en `services/`. |

Regla de trabajo por sesión:

1. decisión arquitectónica;
2. contrato;
3. prueba o escenario de validación;
4. implementación mínima;
5. evidencia para defender la decisión.

## Base didáctica actual: Sesión 21

La Sesión 21 muestra los límites prácticos del tiempo físico en sistemas distribuidos:

```text
wall-clock: útil para metadatos humanos, peligroso para duraciones
monotonic clock: correcto para medir latencia, timeout y elapsed time
skew/offset: relojes de nodos pueden diferir
drift: el error crece entre sincronizaciones
tolerance window: el servidor valida cuánto error acepta
```

Comandos principales:

```bash
cd services/monitor-telemetria
npm run lab:physical-time -- --skew
npm run lab:physical-time -- --drift
npm run lab:physical-time -- --tolerance
```

Guía completa:

```text
docs/instrucciones-laboratorio-sesion-21.md
```

## Laboratorio anterior: Sesión 18

La Sesión 18 muestra que desacoplar no elimina la presión: hay que medir backlog, lag, límites y velocidad de consumo.

```text
streaming pressure: telemetría -> buffer bounded -> consumidor lento
queue pressure: OrderCreated -> notificaciones bounded -> retry/defer
operational pressure: concierto -> pedidos + drones + entregas + auditoría + dashboard
business rule: telemetría puede samplearse; auditoría/EntregaCompletada no se descartan silenciosamente
```

Comandos principales:

```bash
cd services/monitor-telemetria
npm run lab:telemetry-pressure -- --saturated
```

```bash
cd services/centro-logistica
npm run lab:backpressure -- --controlled
```

```bash
cd services/centro-logistica
npm run lab:operational-pressure -- --concert
```

Guía completa:

```text
docs/instrucciones-laboratorio-sesion-18.md
```

## Laboratorio anterior: Sesión 17

La Sesión 17 compara patrones de comunicación sobre flujos AURA:

```text
request/response: centro-logistica -> planificador-rutas
pub/sub: OrderCreated -> notificaciones + auditoría + dashboard
cola FIFO: trabajos de notificación
streaming: telemetría de drones
```

Comandos principales:

```bash
cd services/centro-logistica
npm run lab:communication-patterns -- --orders=5
```

```bash
cd services/monitor-telemetria
npm run lab:telemetry-stream -- --concert --count=100 --skip-delay
```

Guía completa:

```text
docs/instrucciones-laboratorio-sesion-17.md
```

## Laboratorio anterior: Sesión 16

La Sesión 16 valida semánticas de entrega para eventos de negocio:

```text
EntregaCompletada → centro-logistica
```

Logro esperado:

> El estudiante implementa un consumidor idempotente que procesa `EntregaCompletada` con semántica at-least-once, deduplicando por `eventId` y protegiendo el efecto final con estado de negocio.

Simulador didáctico por escenario:

```bash
cd services/centro-logistica
node src/delivery-events-lab.js duplicate-event
```

Escenarios cubiertos:

| Escenario | Resultado esperado |
|---|---|
| Mensaje perdido | Sin duplicado, pero orden y dron quedan desactualizados. |
| Evento duplicado con mismo `eventId` | Segunda llegada ignorada; efecto aplicado una sola vez. |
| Evento distinto para la misma misión | Estado de orden evita reaplicar entrega. |
| Evento inconsistente | Rechazo reportado; sin liberar dron ni entregar orden. |

Guía completa:

```text
docs/instrucciones-laboratorio-sesion-16.md
```

## Laboratorio anterior: Sesión 15

La Sesión 15 valida resiliencia en el flujo:

```text
centro-logistica → planificador-rutas
```

Logro esperado:

> El estudiante define e implementa en Node.js una política básica de timeout, retry, backoff e idempotencia para la interacción Centro de Logística → Planificador de Rutas, simulando fallos y evitando la creación duplicada de misiones para una misma orden de entrega.

Escenarios cubiertos:

| Escenario | Resultado esperado |
|---|---|
| Camino feliz | Ruta planificada, una sola orden creada. |
| Servicio lento | Timeout controlado, retry con backoff, sin duplicar misión. |
| Planificador no disponible | Retries agotados, respuesta controlada, sin persistencia parcial. |
| Zona inválida | Error no retryable `422`, sin retry, sin crear orden. |
| Doble solicitud con misma `Idempotency-Key` | Segunda llamada devuelve replay idempotente, sin duplicar. |

Guía completa:

```text
docs/instrucciones-laboratorio-sesion-15.md
```

## Documentación principal

| Documento | Propósito |
|---|---|
| `docs/GESTION SID 2026 I.pdf` | Fuente de verdad académica para la secuencia oficial de sesiones y unidades. |
| `docs/unidad-3-backlog.md` | Roadmap estratégico de sesiones 21–30 sobre tiempo, orden, causalidad, consenso y consistencia. |
| `docs/unidad-2-backlog.md` | Backlog y cronograma detallado de sesiones 11–20. |
| `docs/pc2-respuestas.md` | Solución docente de PC02 con comandos, evidencia, decisiones, limitaciones y checklist de revisión. |
| `docs/instrucciones-laboratorio-sesion-21.md` | Guía para estudiar tiempo físico, skew, drift, tolerancia y límites de sincronización. |
| `docs/sesiones-11-15-resiliencia.md` | Alineación técnica de sesiones 11–15 y política implementada. |
| `docs/instrucciones-laboratorio-sesion-18.md` | Guía para medir backpressure, backlog, sampling y colas bounded. |
| `docs/instrucciones-laboratorio-sesion-17.md` | Guía para comparar request/response, pub/sub, colas y streaming. |
| `docs/instrucciones-laboratorio-sesion-16.md` | Guía para validar semánticas de entrega e idempotencia de eventos. |
| `docs/instrucciones-laboratorio-sesion-15.md` | Guía paso a paso para validar resiliencia en laboratorio. |
| `docs/sesion-13-cierre-y-prueba-funcional.md` | Evidencia de cierre funcional inicial. |

## Cómo evaluar avances

Un avance de sesión está completo cuando cumple estas condiciones:

- el tema está explicado en `docs/`;
- existe código mínimo si la sesión lo requiere;
- hay prueba ejecutable o escenario verificable;
- la evidencia se puede repetir desde cero;
- el estudiante puede explicar por qué se tomó esa decisión técnica.

## Próximo paso

El siguiente trabajo es la **Sesión 22: sincronización de relojes: visión general y efectos en sistemas distribuidos**.

Ahí se va a estudiar cómo estimar offset y delay, qué ocurre con redes asimétricas, cómo corregir relojes y por qué sincronizar ayuda pero no prueba orden global perfecto.
