# AURA Drone System

**AURA** es el proyecto de laboratorio del curso de **Sistemas Distribuidos / Arquitectura Distribuida**. El caso de estudio simula un sistema de orquestación de drones para entregas urbanas, construido paso a paso con microservicios, contratos REST/gRPC, resiliencia, eventos y decisiones arquitectónicas defendibles.

El objetivo no es “hacer endpoints porque sí”. El objetivo es que el estudiante aprenda a diseñar, implementar, probar y justificar sistemas distribuidos reales: sistemas donde hay latencia, fallas parciales, duplicados, contratos versionados, servicios que no siempre responden y decisiones técnicas que tienen consecuencias.

## Qué vas a construir

Durante la Unidad 2 se construye la capa de comunicación distribuida de AURA:

- gestión de drones mediante REST;
- gestión de órdenes de entrega mediante REST;
- planificación de rutas como servicio separado;
- telemetría por gRPC streaming;
- resiliencia con timeout, retry, backoff e idempotencia;
- preparación para eventos, colas, trazabilidad y semánticas de entrega.

Al final de la unidad, el proyecto debe poder demostrar un flujo distribuido defendible: una orden se recibe, se planifica, se relaciona con flota/telemetría y se observan decisiones técnicas claras para tolerar fallas.

## Estado actual

El proyecto está trabajado hasta **Sesión 16**.

| Área | Estado |
|---|---|
| Arquitectura base | Alineada y documentada para sesiones 11–15. |
| REST v1 | Implementado en `gestor-flota`, `centro-logistica` y `planificador-rutas`. |
| gRPC | Implementado en `monitor-telemetria`. |
| Resiliencia | Implementada en `centro-logistica → planificador-rutas`. |
| Semánticas de entrega | Consumidor in-memory de `EntregaCompletada` con idempotencia por `eventId` y estado de negocio. |
| Tests | Suites por servicio con `npm test`. |
| Laboratorio Sesión 15 | Documentado en `docs/instrucciones-laboratorio-sesion-15.md`. |
| Laboratorio Sesión 16 | Documentado en `docs/instrucciones-laboratorio-sesion-16.md`. |

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

## Cronograma de la Unidad 2

La unidad está organizada en sesiones incrementales. Cada sesión agrega una decisión, un contrato, una prueba o una pieza ejecutable. Así el proyecto final no aparece “mágicamente”: se construye con evidencia.

| Sesión | Tema central | Entregables | Aporte al proyecto final |
|---|---|---|---|
| 11 | Fundamentos de comunicación distribuida | Arquitectura base, responsabilidades de servicios, alcance MVP. | Define qué existe en AURA, qué servicio hace qué y cuál es el flujo principal. |
| 12 | Síncrono vs asíncrono, latencia y fallas parciales | Matriz de comunicación, fallas esperadas, timeouts iniciales. | Evita diseñar “como si la red fuera perfecta”; prepara decisiones de resiliencia. |
| 13 | REST, gRPC, contratos e IDL | Contratos v1, estructura base, `telemetry.proto`, primeras pruebas. | Convierte la arquitectura en APIs y contratos ejecutables. |
| 14 | Serialización, versionado y compatibilidad | Norma `/api/v1`, reglas JSON/protobuf, estados y eventos. | Permite evolucionar el sistema sin romper consumidores. |
| 15 | Timeouts, retries, backoff e idempotencia | Política de resiliencia, tests de falla, guía de laboratorio. | Hace que el flujo `centro-logistica → planificador-rutas` tolere fallas reales. |
| 16 | Semánticas de entrega | Consumidor idempotente de `EntregaCompletada`, matriz de semánticas, pruebas de duplicados y pérdida. | Define qué pasa cuando un mensaje llega dos veces, tarde o nunca. |
| 17 | Request/response, pub/sub, colas y streaming | MVP integrado con REST, gRPC y primer evento de negocio. | Une servicios en un flujo distribuido demostrable de punta a punta. |
| 18 | Backpressure y desacoplamiento | Estrategia para ráfagas, buffering y procesamiento desacoplado. | Evita que telemetría o eventos saturen el sistema. |
| 19 | Naming, identificadores y discovery | Catálogo de IDs, nombres de eventos, servicios y claves técnicas. | Da consistencia operativa al sistema y prepara trazabilidad. |
| 20 | Integración y cierre | Demo integrada, decisiones arquitectónicas y backlog de Unidad 3. | Cierra un MVP defendible y deja el camino para coordinación distribuida avanzada. |

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

## Laboratorio destacado: Sesión 16

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
| `docs/unidad-2-backlog.md` | Backlog y cronograma detallado de sesiones 11–20. |
| `docs/sesiones-11-15-resiliencia.md` | Alineación técnica de sesiones 11–15 y política implementada. |
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

El siguiente trabajo es la **Sesión 17: Request/response, pub/sub, colas y streaming**.

Ahí se conectará el aprendizaje de REST, gRPC, resiliencia y eventos para construir un MVP integrado de comunicación distribuida.
