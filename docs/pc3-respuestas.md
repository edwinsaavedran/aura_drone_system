# PC3 - AURA Coordinación bajo Falla

> **Guía de retroalimentación posterior a la evaluación.** Este documento está pensado para que revises tu propia respuesta después de la PC3. No es una plantilla de entrega: es una guía para contrastar tu razonamiento, identificar evidencia que debiste citar y mejorar tu defensa técnica.

## Cómo usar esta guía

Lee cada fase con tu respuesta al lado y marca tres cosas:

1. **Qué afirmaste correctamente.** Verifica si tu conclusión coincide con la evidencia del caso.
2. **Qué evidencia citaste.** Una respuesta fuerte no solo da una conclusión; muestra timestamps, vectores, fences, epochs, estados de nodo o razones de rechazo.
3. **Qué límite declaraste.** En sistemas distribuidos, una buena respuesta también dice qué no se puede probar con la información disponible.

La PC3 evaluaba una idea central: AURA no debe tomar decisiones críticas usando una sola señal aislada. Debías separar tiempo físico, causalidad, ownership, leases, fencing, sospecha de fallas, liderazgo y arquitectura futura.

## Datos del estudiante

| Campo | Respuesta |
|---|---|
| Nombre y apellidos | _Completar por el estudiante_ |
| Código | _Completar por el estudiante_ |
| Curso | Sistemas Distribuidos |
| Evaluación | PC3 - AURA Coordinación bajo Falla |

## Fase 1 - Tiempo físico y sincronización

### Respuesta guiada

No se puede afirmar que `MissionAssigned` ocurrió antes que `BatteryLow` solo porque su timestamp físico reportado sea menor. Esa comparación ignora que los servicios tienen relojes con skews distintos y que existe un error estimado de sincronización de ±300 ms.

La corrección conceptual de los timestamps ayuda a razonar, pero no convierte el wall-clock en prueba causal. Debías mostrar que el orden reportado puede ser engañoso y que AURA necesita evidencia adicional antes de tomar decisiones de negocio sobre una misión.

### Evidencia del caso que debiste citar

| Evento | Servicio | Timestamp físico reportado | Skew conocido | Hora conceptual corregida |
|---|---|---:|---:|---:|
| E1 `BatteryLow` | `monitor-telemetria` | 10:15:00.300 | +400 ms | 10:14:59.900 |
| E2 `MissionAssigned` | `centro-logistica` | 10:15:00.100 | -200 ms | 10:15:00.300 |
| E3 `DroneAvailable` | `gestor-flota` | 10:15:00.250 | +100 ms | 10:15:00.150 |
| E4 `BatteryCritical` | `monitor-telemetria` | 10:15:00.500 | +400 ms | 10:15:00.100 |

La hora corregida se obtiene restando el skew al timestamp reportado. Por ejemplo, E1 aparece como 10:15:00.300 en `monitor-telemetria`, pero ese reloj está adelantado +400 ms; conceptualmente queda alrededor de 10:14:59.900. Aun así, el margen ±300 ms obliga a conservar incertidumbre.

### Qué incluye una respuesta fuerte

- Responde “no” a la pregunta sobre si `MissionAssigned` ocurrió antes que `BatteryLow` solo por timestamp físico.
- Explica que el skew puede invertir la intuición inicial: E2 reporta 10:15:00.100, pero corregido queda cerca de 10:15:00.300; E1 corregido queda cerca de 10:14:59.900.
- Distingue entre orden físico aproximado y causalidad demostrable.
- Menciona campos mínimos: wall-clock reportado, servicio productor, skew, margen de error, monotonic time o duración local, `correlationId`/`traceId`, id de evento, productor y metadata causal.
- Conecta el riesgo con una decisión concreta: asignar, mantener o despachar una misión para un dron con batería baja o crítica no debe depender solo del reloj físico.

### Errores comunes o puntos de mejora

- Decir “E2 ocurrió antes porque 10:15:00.100 es menor que 10:15:00.300”. Esa respuesta usa el dato más visible, pero ignora la sincronización imperfecta.
- Corregir los timestamps y tratarlos como causalidad absoluta. La corrección reduce ambigüedad física; no prueba qué conocía cada servicio.
- Omitir el margen ±300 ms.
- No vincular el análisis temporal con riesgo operacional: auditoría falsa, decisión de misión insegura o explicación incorrecta del incidente.

## Fase 2 - Vector clocks y causalidad

### Respuesta guiada

Los vector clocks permiten razonar sobre conocimiento causal, no sobre “qué línea aparece antes” en una tabla. En esta fase, cada vector usa el orden `[P1, P2, P3]`, donde P1 es `monitor-telemetria`, P2 es `centro-logistica` y P3 es `gestor-flota`.

La conclusión importante es que `centro-logistica` sí conocía causalmente la alerta de batería baja antes de la decisión preliminar `e`, pero no hay evidencia de que conociera la batería crítica `c` ni el estado actualizado recibido en `g`.

### Evidencia del caso que debiste citar

| # | Etiqueta | Proceso | Acción | Mensaje recibido | Vector resultante |
|---:|---|---|---|---|---|
| 1 | a | P1 | recibe telemetría batería 18% | - | `[1, 0, 0]` |
| 2 | m1 | P1 → P2 | envía `BatteryLowAlert` | - | `[2, 0, 0]` |
| 3 | d | P2 | recibe `BatteryLowAlert` | m1 | `[2, 1, 0]` |
| 4 | b | P1 | recibe telemetría GPS | - | `[3, 0, 0]` |
| 5 | m3 | P2 → P3 | solicita estado del dron | - | `[2, 2, 0]` |
| 6 | e | P2 | registra decisión preliminar de misión | - | `[2, 3, 0]` |
| 7 | f | P3 | recibe solicitud de estado | m3 | `[2, 2, 1]` |
| 8 | c | P1 | recibe telemetría batería 12% | - | `[4, 0, 0]` |
| 9 | m2 | P3 → P1 | envía estado actualizado | - | `[2, 2, 2]` |
| 10 | g | P1 | recibe estado actualizado | m2 | `[5, 2, 2]` |

P2 envía `m3` antes de registrar `e`. Por eso P3 no aprende `e` al recibir `m3`, y P1 tampoco aprende `e` cuando recibe `m2`. Este detalle era clave para no inventar causalidad.

### Comparaciones esperadas

| Comparación | Relación | Evidencia vectorial | Implicación para AURA |
|---|---|---|---|
| a vs d | `before` | `[1,0,0] <= [2,1,0]` y al menos un componente es menor. | P2 recibe información derivada de batería baja al procesar `d`. |
| d vs e | `before` | `[2,1,0] <= [2,3,0]`. | La decisión preliminar `e` ocurre después de recibir `BatteryLowAlert`. |
| b vs d | `concurrent` | `[3,0,0]` no es `<= [2,1,0]` y `[2,1,0]` no es `<= [3,0,0]`. | No se prueba que P2 conociera la telemetría GPS `b`. |
| c vs e | `concurrent` | `[4,0,0]` no es `<= [2,3,0]` y `[2,3,0]` no es `<= [4,0,0]`. | La batería crítica al 12% no estaba causalmente incorporada en `e`. |
| f vs g | `before` | `[2,2,1] <= [5,2,2]`. | P1 recibe un estado actualizado que sí depende de la solicitud procesada por P3. |
| e vs g | `concurrent` | `[2,3,0]` y `[5,2,2]` son incomparables. | La decisión preliminar y la recepción del estado actualizado no tienen orden causal garantizado. |

### Qué incluye una respuesta fuerte

- Muestra el procedimiento: evento local incrementa, envío incrementa y adjunta, recepción toma máximo componente a componente y luego incrementa.
- Justifica cada comparación con desigualdad componente a componente.
- Interpreta el resultado en términos de riesgo: `e` se tomó con evidencia incompleta.
- No usa timestamps físicos para corregir relaciones causales.

### Errores comunes o puntos de mejora

- Incrementar en recepción antes de aplicar el máximo componente a componente.
- Incluir `e` dentro de `m3`, aunque `m3` ocurre antes de `e`.
- Confundir `concurrent` con “ocurrieron exactamente al mismo tiempo”. En este contexto significa que no hay orden causal demostrable.
- Responder solo con la tabla sin explicar qué riesgo representa para AURA.

## Fase 3 - Locks, leases y fencing

### Respuesta guiada

AURA no debe aceptar la asignación de LC1 a `M-2001` en T7. LC1 adquirió el lock en T0 con TTL=3000ms y `fence=21`, pero el lease expiró en T3. Luego LC2 adquirió un lock posterior con `fence=22` y asignó `Drone-Alpha-1` a `M-2002` en T5.

En T7, LC1 es un owner obsoleto. Aunque LC1 “empezó primero”, ya no conserva ownership válido para escribir sobre el recurso protegido.

### Evidencia del caso que debiste citar

| Campo | Respuesta esperada |
|---|---|
| `leaseDeadline` de LC1 | T0 + 3000 ms. En la simulación: `0 + 3000 = 3000 ms`. |
| Estado de LC1 en T7 | Owner obsoleto/stale: su lease expiró en T3. |
| Riesgo si se acepta LC1 | Doble asignación de `Drone-Alpha-1`: LC2 ya lo asignó a `M-2002` y LC1 intenta asignarlo a `M-2001`. |
| Comparación de fencing | Rechazar `fence=21` si el último fence aceptado para el dron es `22`. |
| Decisión segura sobre `M-2001` | No aceptar la asignación vieja; dejar la misión en revisión o reintento controlado con lock/fence válido. |
| Compensación o revisión | Registrar el rechazo y decidir replanificación, cola o compensación si hubo efecto parcial externo. |

### Conceptos que debías dominar

| Concepto | Qué garantiza | Qué no garantiza | Riesgo si se omite |
|---|---|---|---|
| Lock | Exclusión temporal mientras el owner es válido y el backend respeta el lock. | No evita escrituras tardías de procesos pausados. | Dos actores pueden creer que coordinan el mismo recurso. |
| Lease con TTL | Limita la vigencia del lock. | No bloquea por sí solo una escritura si el recurso protegido no valida vigencia. | Un owner obsoleto puede escribir fuera de su ventana. |
| Renovación | Extiende ownership si ocurre antes del vencimiento y bajo reglas válidas. | No prueba que la operación completa sea segura. | Operaciones largas pueden seguir con lease vencido. |
| Fencing token | Permite rechazar intentos con tokens anteriores al último aceptado. | No reemplaza transacciones locales, auditoría ni idempotencia. | Un owner viejo puede sobrescribir una decisión nueva. |
| Operación idempotente | Evita duplicar efectos ante reintentos de la misma intención. | No decide liderazgo ni ownership distribuido. | Reintentos o duplicados pueden crear efectos inconsistentes. |

### Qué incluye una respuesta fuerte

- Calcula el deadline del lease y lo relaciona con T7.
- Rechaza `M-2001` por owner obsoleto y `fence=21` menor que `fence=22`.
- Explica que el recurso protegido debe validar lease, owner, fencing token, estado actual del dron e idempotencia antes de persistir.
- Propone auditoría: actor, lock key, owner, `acquiredAtMs`, `ttlMs`, `leaseDeadline`, `nowMs`, fence recibido, último fence aceptado, dron, misión, líder/epoch si aplica, decisión y razón.
- Propone métricas: intentos de adquisición, expiraciones de lease, rechazos por fencing, duración de operación crítica vs TTL, renovaciones tardías, escrituras stale y compensaciones.

### Errores comunes o puntos de mejora

- Aceptar a LC1 porque inició antes. En coordinación distribuida, iniciar antes no equivale a tener derecho vigente de escritura.
- Confiar solo en el lock sin exigir fencing en el recurso protegido.
- No explicar qué ocurre con `M-2001` después del rechazo.
- Liberar o modificar el lock sin demostrar ownership vigente.

## Fase 4 - Failure detector y elección de líder

### Respuesta guiada

En T5, RP2 puede afirmar que RP5 está sospechado porque dejó de recibir heartbeats por más de `suspectTimeout`. No puede afirmar que RP5 está muerto de forma definitiva. Esa diferencia importa porque RP5 está pausado/no responde y luego despierta después de T9.

La elección tipo Bully permite que RP4 sea anunciado como nuevo líder observado, pero esa elección no basta para evitar split-brain si los servicios aceptan comandos de RP5 cuando despierte. Para bloquear líderes viejos, AURA necesita epoch, term o fencing token monotónico validado en el recurso protegido.

### Evidencia del caso que debiste citar

| Nodo | id | Estado observado |
|---|---:|---|
| RP1 | 1 | vivo |
| RP2 | 2 | vivo |
| RP3 | 3 | caído |
| RP4 | 4 | vivo |
| RP5 | 5 | pausado/no responde |

Parámetros relevantes: `heartbeatInterval=1000ms`, `suspectTimeout=3000ms`, `electionTimeout=5000ms`. En la línea de tiempo, RP2 marca a RP5 como sospechado en T5, dispara elección en T6, contacta RP3/RP4/RP5 en T7, recibe respuesta de RP4 en T8 y RP4 se anuncia como nuevo líder en T9; luego RP5 despierta e intenta seguir coordinando.

### Elección tipo Bully esperada

| Paso | Acción | Resultado esperado | Riesgo o límite |
|---:|---|---|---|
| 1 | RP2 detecta ausencia de heartbeat del líder RP5 | RP2 marca a RP5 como sospechado tras superar `suspectTimeout`. | Puede ser falso positivo; sospecha no equivale a muerte. |
| 2 | RP2 inicia elección | La elección queda registrada y busca un líder disponible. | Puede haber elecciones simultáneas. |
| 3 | RP2 contacta nodos con id mayor | Envía mensajes a RP3, RP4 y RP5. | RP3 está caído y RP5 está pausado/no responde. |
| 4 | RP4 responde y RP3/RP5 no responden | RP4 queda como candidato de mayor id disponible observado. | RP5 puede despertar después del timeout. |
| 5 | RP4 asume liderazgo si no aparece un nodo mayor válido | RP4 coordina como nuevo líder observado. | Sin epoch/term/fencing, RP5 podría seguir emitiendo comandos. |
| 6 | RP4 anuncia nuevo líder/epoch | Los servicios deben reconocer el epoch vigente. | Anunciar no basta; cada recurso debe validar el epoch antes de ejecutar. |

### Qué incluye una respuesta fuerte

- Distingue `suspected` de `dead`.
- Explica posibles causas de ausencia de heartbeat: pausa, latencia, partición, scheduling, GC u otro retraso.
- Identifica el riesgo de split-brain cuando RP5 despierta.
- Exige epoch/term/fencing monotónico para rechazar comandos de líderes viejos.
- Ubica la validación en el recurso protegido o servicio que persiste la decisión, no solo en la memoria del líder.

### Errores comunes o puntos de mejora

- Escribir que RP5 está muerto en T5.
- Tratar Bully como garantía productiva completa sin hablar de particiones, pausas o líder viejo.
- Elegir RP4 pero no explicar cómo se rechazan comandos de RP5.
- Validar liderazgo únicamente en el coordinador, cuando el control debe existir donde se aplica el comando.

## Fase 5 - Implementación acotada

### Respuesta guiada

La implementación debía ser pequeña, ejecutable y enfocada en decisiones. No se pedía construir consenso real, ZooKeeper, etcd, Raft, quórums ni failover productivo. La meta era demostrar, con datos del caso, cuatro reglas locales: vencimiento de lease, rechazo por fencing, rechazo de líder viejo y prevención de doble asignación.

### Archivo implementado

```text
services/centro-logistica/src/pc3-coordination-lab.js
```

Si trabajaste fuera del repositorio, el archivo podía llamarse:

```text
pc3-coordination-lab.js
```

### Comando de ejecución

```bash
node services/centro-logistica/src/pc3-coordination-lab.js
```

### Decisiones que tu código debía evidenciar

| Caso | Datos relevantes | Decisión esperada | Razón esperada |
|---|---|---|---|
| `lc2` | `Drone-Alpha-1`, `M-2002`, `nowMs=4600`, `acquiredAtMs=4500`, `ttlMs=3000`, `fence=22`, líder `RP4`, `epoch=7` | `accepted` | Lease vigente, fence nuevo y líder vigente. |
| `lc1Old` | `M-2001`, `nowMs=7600`, `acquiredAtMs=0`, `ttlMs=3000`, `fence=21` | `rejected` | Lease vencido (`leaseDeadline=3000`) y fence menor que `22`. |
| `rp5OldLeader` | `M-2003`, líder `RP5`, `epoch=6`, `currentLeaderEpoch=7`, `fence=20` | `rejected` | Líder obsoleto: `stale-leader`. |

### Salida relevante esperada

La salida no tenía que ser idéntica byte a byte. Sí debía probar ideas equivalentes a estas:

```json
{
  "lc2": {
    "decision": "accepted",
    "missionId": "M-2002",
    "fence": 22,
    "leaseDeadline": 7500
  },
  "lc1Old": {
    "decision": "rejected",
    "reason": "stale-owner-or-fence",
    "leaseDeadline": 3000
  },
  "rp5OldLeader": {
    "decision": "rejected",
    "reason": "stale-leader"
  },
  "assignments": [
    [
      "Drone-Alpha-1",
      {
        "missionId": "M-2002",
        "actor": "LC2",
        "fence": 22,
        "leaderEpoch": 7
      }
    ]
  ]
}
```

### Qué incluye una respuesta fuerte

- Expone `leaseDeadline` como `acquiredAtMs + ttlMs`.
- Usa `nowMs > acquiredAtMs + ttlMs` para detectar vencimiento del lease, declarando la convención si usa otro borde.
- Rechaza fences menores que el último fence aceptado para el dron.
- Rechaza líderes con `leader.epoch < currentLeaderEpoch`.
- Persiste únicamente la asignación segura `Drone-Alpha-1` → `M-2002`.
- Devuelve decisiones estructuradas con `decision`, `reason` y datos suficientes para auditar.

### Errores comunes o puntos de mejora

- Cambiar identificadores o datos del escenario para que la salida resulte más fácil.
- Implementar infraestructura distribuida real en vez de una simulación acotada.
- Rechazar a `rp5OldLeader` por doble asignación antes de evaluar `stale-leader`, cuando el esqueleto pedía rechazar líderes obsoletos primero.
- Mostrar una salida sin interpretación técnica.

### Limitaciones que debías declarar

- No implementa consenso, Raft, Paxos, ZooKeeper, etcd, quórums ni membresía real.
- No modela condiciones de carrera reales entre procesos.
- No persiste estado en una base transaccional.
- No renueva leases ni simula relojes físicos distribuidos.
- Solo demuestra reglas locales de decisión: deadline de lease, fencing, líder obsoleto y prevención de doble asignación.

## Fase 6 - Decisión arquitectónica

### Respuesta guiada

La decisión arquitectónica debía conectar cada problema con una garantía concreta. Nombrar herramientas no era suficiente. Una buena respuesta explica qué reduce el mecanismo, qué costo introduce y qué falla residual queda.

### Matriz de decisión esperada

| Problema | Opción recomendada | Garantía buscada | Tradeoff/costo | ¿Se implementa en Fase 5? |
|---|---|---|---|---|
| Evitar doble asignación de drones | DB atómica + fencing token + Idempotency-Key | Escritura única por dron/misión, rechazo de owners obsoletos y reintentos seguros. | Requiere constraints, transacciones, diseño de idempotencia y auditoría. | No; la Fase 5 solo simula la regla local. |
| Elegir líder de planificador-rutas | ZooKeeper ephemeral sequential node o mecanismo basado en Raft/etcd lease | Liderazgo coordinado con sesión/lease y orden observable. | Complejidad operativa, dependencia externa, monitoreo y manejo de particiones. | No. |
| Rechazar comandos de líderes viejos | Fencing token / epoch / term validado en el recurso protegido | Bloquear comandos stale aunque el líder viejo despierte. | Todos los consumidores deben validar el token; requiere monotonicidad persistente. | Sí, de forma acotada mediante `leader.epoch`. |
| Publicar configuración dinámica | etcd lease / store consistente de configuración | Configuración versionada, observable y con cambios ordenados. | Operar un sistema basado en Raft, backups, monitoreo y políticas de cambio. | No. |
| Detectar instancias saludables | Consul health check | Señales de salud y descubrimiento operativo. | Puede tener falsos positivos/negativos; no reemplaza consenso, fencing ni validación de comandos. | No. |

### Qué incluye una respuesta fuerte

- Separa persistencia crítica, coordinación/liderazgo y rechazo de actores obsoletos.
- Recomienda una DB con operación atómica, constraints e idempotency key para asignaciones críticas.
- Recomienda ZooKeeper, etcd o un protocolo basado en Raft para liderazgo productivo, explicando costos operativos.
- Exige epoch/term/fencing validado en el recurso protegido.
- Declara que la Fase 5 no implementa estas herramientas productivas; solo simula reglas locales.

### Errores comunes o puntos de mejora

- Escribir “usar etcd” sin explicar garantía, costo ni falla residual.
- Usar Consul health check como si resolviera liderazgo consistente.
- Decir que Redis lock basta sin fencing ni validación en el recurso protegido.
- No distinguir entre una simulación académica y una arquitectura productiva.

## Cierre técnico

Una respuesta defendible para AURA acepta únicamente la asignación segura de `LC2` a `M-2002`, rechaza el intento viejo de `LC1-old` sobre `M-2001` y rechaza comandos de `RP5-old-leader` por epoch obsoleto. `M-2001` no debe desaparecer ni aceptarse silenciosamente: debe quedar en revisión, replanificación o compensación según la evidencia operacional.

También debías declarar límites: no se prueba causalidad solo con timestamps físicos; no se puede afirmar que RP5 murió, solo que fue sospechado; no se puede confiar en un lock vencido ni en un líder viejo sin validación en el recurso protegido.

### Checklist de autoevaluación

- [ ] Expliqué por qué los timestamps físicos no prueban causalidad.
- [ ] Usé los skews y el margen ±300 ms sin convertirlos en certeza absoluta.
- [ ] Calculé o defendí los vector clocks con el orden `[P1, P2, P3]`.
- [ ] Identifiqué que `c` vs `e` y `e` vs `g` son concurrentes.
- [ ] Rechacé a LC1 en T7 por lease vencido y `fence=21` frente a `fence=22`.
- [ ] Expliqué qué debe pasar con `M-2001` después del rechazo.
- [ ] Diferencié `suspected` de `dead` para RP5.
- [ ] Exigí epoch, term o fencing validado en el recurso protegido para evitar split-brain.
- [ ] Mantuve la Fase 5 como una simulación pequeña, no como consenso real.
- [ ] Conecté cada recomendación arquitectónica con garantía, costo y falla residual.
- [ ] No cambié datos oficiales del caso: timestamps, identificadores, fences, epochs, misiones, nodos ni estados.

Si tu respuesta falló en alguno de estos puntos, la mejora no es escribir más texto. La mejora es citar mejor la evidencia, separar lo que sabes de lo que no puedes probar y defender decisiones que reduzcan riesgo operacional.
