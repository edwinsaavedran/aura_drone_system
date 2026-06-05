# Unidad 3 - Backlog estratégico

> Resultado esperado de la unidad: el estudiante deja de pensar en “la hora del evento” como verdad absoluta y aprende a razonar sobre orden, causalidad, consenso, consistencia y observabilidad distribuida.

La Unidad 2 cerró la comunicación distribuida base con PC02. La Unidad 3 avanza sobre coordinación distribuida: qué significa ordenar eventos, tomar decisiones con fallas, reconciliar estados y explicar el sistema con evidencia.

Fuente de verdad académica: `docs/GESTION SID 2026 I.pdf`.

## Ruta propuesta

| Sesión | Tema | Entregable esperado | Aporte a AURA |
|---|---|---|---|
| 21 | Tiempo físico, skew, drift y límites de sincronización | Laboratorio determinístico en `monitor-telemetria` y guía de análisis. | Muestra por qué los timestamps físicos ayudan, pero no prueban orden global. |
| 22 | Sincronización de relojes: visión general y efectos en sistemas distribuidos | Laboratorio determinístico `lab:clock-sync`, tests y guía de análisis. | Explica qué mejora la sincronización física y qué límites mantiene. |
| 23 | Lamport clocks y orden parcial | Lab de eventos ordenados por contador lógico. | Permite razonar sobre “ocurrió antes” sin depender solo de hora física. |
| 24 | Vector clocks y causalidad | Comparación de causalidad, concurrencia y conflicto. | Distingue eventos causalmente relacionados de eventos concurrentes. |
| 25 | Exclusión mutua distribuida | Taller comparativo de enfoques y simulación de acceso a recurso compartido. | Evita que múltiples nodos ejecuten una sección crítica a la vez. |
| 26 | Locks distribuidos, leases y riesgos operativos | Caso aplicado de locks, expiración, renovación y fallas. | Enseña por qué un lock distribuido necesita tiempo, ownership y tolerancia a fallas. |
| 27 | Elección de líder y failure detectors | Simulación y comparación de algoritmos/failure detectors. | Define quién coordina una acción cuando hay múltiples nodos candidatos y fallas parciales. |
| 28 | Coordinación distribuida en escenarios reales | ABP sobre coordinación de múltiples nodos de AURA. | Integra tiempo, causalidad, locks, líder y fallas en un diseño defendible. |
| 29 | Laboratorio integrador de sincronización y coordinación | Simulador/laboratorio de integración. | Prepara la defensa técnica de PC3 con evidencia ejecutable. |
| 30 | Práctica Calificada 3 | Desarrollo y sustentación técnica. | Evalúa sincronización y coordinación distribuida. |

## Criterio de avance

Cada sesión debe dejar:

- un concepto distribuido explicado con un escenario de AURA;
- una simulación o prueba determinística;
- una guía breve para interpretar la salida;
- una limitación explícita que el estudiante pueda defender.

## Fuera de alcance inmediato

- No introducir brokers reales antes de necesitar el concepto.
- No integrar `centro-logistica` en la Sesión 21.
- No vender sincronización física como solución completa de orden global.
- No adelantar Lamport a la Sesión 22: según la fuente oficial, primero se trabaja sincronización de relojes.

## Evidencia implementada

| Sesión | Evidencia |
|---|---|
| 21 | `services/monitor-telemetria/src/physical-time-lab.js`, `services/monitor-telemetria/test/physical-time-lab.test.js`, `docs/instrucciones-laboratorio-sesion-21.md`. |
| 22 | `services/monitor-telemetria/src/clock-sync-lab.js`, `services/monitor-telemetria/test/clock-sync-lab.test.js`, `docs/instrucciones-laboratorio-sesion-22.md`, script `lab:clock-sync`. |

## Siguiente paso

Implementar la Sesión 23 con relojes de Lamport y orden parcial. La secuencia oficial se mantiene: Sesión 21 tiempo físico, Sesión 22 sincronización de relojes, Sesión 23 Lamport.
