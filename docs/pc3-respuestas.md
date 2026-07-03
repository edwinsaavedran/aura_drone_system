# PC3 - AURA Coordinación bajo Falla

## Datos del estudiante

- Nombre: Joel Villalta
- Correo: u20218511@utp.edu.pe
- Curso: Sistemas Distribuidos - Unidad 3
- Fecha: 2026-07-03

## Fase 1 - Tiempo físico y sincronización

**Idea central en lenguaje simple:** cada servicio tiene su propio reloj, y esos relojes no están perfectamente en hora. Algunos van adelantados y otros atrasados (a eso se le llama *skew*), y además la corrección que conocemos tiene un margen de error de ±300 ms. Es como comparar la hora de cuatro relojes de pulsera distintos: aunque los cuatro digan una hora, no puedes jurar cuál evento pasó primero si la diferencia entre ellos es menor que el error de los relojes.

### Corrección conceptual de los timestamps

Si un reloj tiene skew +400 ms, significa que va 400 ms adelantado, así que la hora "real" estimada se obtiene restando ese adelanto (y al revés si va atrasado):

| Evento | Servicio | Hora reportada | Skew conocido | Hora corregida estimada | Rango real posible (±300 ms) |
|---|---|---:|---:|---:|---|
| E1 `BatteryLow` (18%) | monitor-telemetria | 10:15:00.300 | +400 ms | 10:14:59.900 | 10:14:59.600 – 10:15:00.200 |
| E2 `MissionAssigned` | centro-logistica | 10:15:00.100 | -200 ms | 10:15:00.300 | 10:15:00.000 – 10:15:00.600 |
| E3 `DroneAvailable` | gestor-flota | 10:15:00.250 | +100 ms | 10:15:00.150 | 10:14:59.850 – 10:15:00.450 |
| E4 `BatteryCritical` (12%) | monitor-telemetria | 10:15:00.500 | +400 ms | 10:15:00.100 | 10:14:59.800 – 10:15:00.400 |

Nótese algo importante: **la corrección invierte el orden aparente**. Mirando solo la hora reportada, E2 (00.100) parece anterior a E1 (00.300). Pero corrigiendo el skew, E1 (59.900) parece anterior a E2 (00.300). Y como los rangos de error de ±300 ms se superponen entre sí, en realidad **no podemos afirmar ninguno de los dos órdenes con certeza**.

### Respuestas

**1. ¿Se puede afirmar que `MissionAssigned` ocurrió antes que `BatteryLow` solo por timestamp físico?**

No. La hora reportada dice una cosa (E2 antes que E1) y la hora corregida por skew dice la contraria (E1 antes que E2). Además, los rangos posibles de ambos eventos se superponen (E1 pudo ocurrir entre 59.600 y 00.200, y E2 entre 00.000 y 00.600). Cuando dos rangos se pisan, el reloj físico no alcanza como prueba: solo podemos decir "ocurrieron aproximadamente al mismo tiempo, sin orden demostrable".

**2. ¿Qué riesgo operativo aparece si AURA ordena estos eventos solo por timestamp?**

El riesgo es tomar decisiones con una historia falsa de los hechos. Por ejemplo: si el sistema concluye que la misión se asignó *antes* de la alerta de batería baja, puede considerar la asignación "legítima" y mantener el dron volando; pero si en realidad la alerta llegó primero, se asignó una misión a un dron que ya estaba avisando que se quedaba sin batería. Eso puede terminar en un dron que se apaga en pleno vuelo sobre una ciudad: un riesgo físico real, no solo un error de datos.

**3. ¿Qué campos temporales deberían registrarse como mínimo?**

Para cada evento, no basta con guardar "la hora". Se necesita:

- **Hora del reloj del servicio (wall-clock)**: lo que marcó el reloj local al emitir el evento.
- **Servicio emisor**: qué máquina/servicio puso esa hora (porque cada reloj tiene su propio desvío).
- **Skew conocido o estimado**: cuánto sabemos que ese reloj está adelantado o atrasado.
- **Margen de error de sincronización**: la incertidumbre (aquí ±300 ms).
- **Tiempo monotónico o duración local**: un contador interno que solo avanza y nunca "salta", útil para medir cuánto duró algo dentro de un mismo proceso.
- **Correlation/trace id**: un identificador que une todos los eventos de una misma operación, para reconstruir la historia sin depender de la hora.
- **Id de evento y productor**: identificador único del evento y de quién lo creó.
- **Metadata causal (vector clock u orden lógico)** si existe: la evidencia de "quién sabía qué" al momento de emitir.

**4. ¿Qué decisión de negocio no debería depender solo del reloj físico?**

Ninguna decisión donde el orden de los hechos cambia el resultado y hay riesgo de daño. En AURA, la más clara es: **asignar o mantener una misión a un dron cuando existe una alerta de batería**. Decidir "la asignación fue antes que la alerta, así que es válida" basándose solo en timestamps es apostar la seguridad del vuelo a relojes que sabemos imprecisos. Esa decisión debe apoyarse en orden causal (Fase 2) y en reglas de protección del recurso (Fase 3), no en la hora.

## Fase 2 - Vector clocks y causalidad

**Idea central en lenguaje simple:** como los relojes físicos no son confiables, usamos otro truco: cada proceso lleva un contador de "cuántas cosas he visto", y cuando se mandan mensajes, se contagian esos contadores. Así, en lugar de preguntar "¿a qué hora pasó?", preguntamos "¿quién ya sabía de qué cuando actuó?". Si el que decidió no había recibido cierta información, los contadores lo delatan.

### Procedimiento de cálculo

Orden de componentes: `[P1, P2, P3]` = `[monitor-telemetria, centro-logistica, gestor-flota]`. Todos inician en `[0,0,0]`.

1. **a** — P1 hace un evento local (recibe telemetría batería 18%): incrementa su componente. P1 pasa de `[0,0,0]` a **`[1,0,0]`**.
2. **m1** — P1 envía `BatteryLowAlert` a P2: enviar también incrementa. P1 pasa a **`[2,0,0]`** y el mensaje viaja con `[2,0,0]` adjunto.
3. **d** — P2 recibe m1: toma el máximo entre su vector `[0,0,0]` y el recibido `[2,0,0]` → `[2,0,0]`, y luego incrementa su propio componente → **`[2,1,0]`**.
4. **b** — P1 evento local (telemetría GPS): incrementa → **`[3,0,0]`**.
5. **m3** — P2 envía solicitud de estado a P3: incrementa su componente (`[2,1,0]` → `[2,2,0]`) y adjunta **`[2,2,0]`** al mensaje.
6. **e** — P2 evento local (registra decisión preliminar de misión): incrementa → **`[2,3,0]`**.
7. **f** — P3 recibe m3: máximo entre `[0,0,0]` y `[2,2,0]` → `[2,2,0]`, incrementa su componente → **`[2,2,1]`**.
8. **c** — P1 evento local (recibe telemetría batería 12%): incrementa → **`[4,0,0]`**.
9. **m2** — P3 envía estado actualizado a P1: incrementa (`[2,2,1]` → `[2,2,2]`) y adjunta **`[2,2,2]`**.
10. **g** — P1 recibe m2: máximo entre `[4,0,0]` y `[2,2,2]` → `[4,2,2]`, incrementa su componente → **`[5,2,2]`**.

### Tabla de eventos completada

| # | Etiqueta | Proceso | Acción | Mensaje recibido | Vector resultante |
|---:|---|---|---|---|---|
| 1 | a | P1 | recibe telemetría batería 18% | - | `[1,0,0]` |
| 2 | m1 | P1 → P2 | envía `BatteryLowAlert` | - | `[2,0,0]` (viaja con el mensaje) |
| 3 | d | P2 | recibe `BatteryLowAlert` | m1 | `[2,1,0]` |
| 4 | b | P1 | recibe telemetría GPS | - | `[3,0,0]` |
| 5 | m3 | P2 → P3 | solicita estado del dron | - | `[2,2,0]` (viaja con el mensaje) |
| 6 | e | P2 | registra decisión preliminar de misión | - | `[2,3,0]` |
| 7 | f | P3 | recibe solicitud de estado | m3 | `[2,2,1]` |
| 8 | c | P1 | recibe telemetría batería 12% | - | `[4,0,0]` |
| 9 | m2 | P3 → P1 | envía estado actualizado | - | `[2,2,2]` (viaja con el mensaje) |
| 10 | g | P1 | recibe estado actualizado | m2 | `[5,2,2]` |

### Comparaciones requeridas

Regla de lectura: X ocurrió-antes que Y si **todos** los números de X son ≤ los de Y y al menos uno es menor. Si cada uno gana en un componente distinto, son **concurrentes**: ninguno sabía del otro.

| Comparación | Relación | Evidencia vectorial | Implicación para AURA |
|---|---|---|---|
| a vs d | `before` | `[1,0,0]` ≤ `[2,1,0]` en todo componente, y es menor en varios | La alerta de batería 18% sí llegó causalmente al Centro de Logística: cuando P2 procesó la alerta (d), ya "sabía" de a. Esta cadena es confiable. |
| d vs e | `before` | `[2,1,0]` ≤ `[2,3,0]`, menor en el componente de P2 | La decisión preliminar (e) se tomó **después** de recibir la alerta de batería baja (18%). El Centro de Logística no puede alegar que no conocía esa alerta. |
| b vs d | `concurrent` | `b=[3,0,0]` gana en P1 (3>2); `d=[2,1,0]` gana en P2 (1>0) | La telemetría GPS y la recepción de la alerta no tienen relación causal: viajaban "en paralelo". AURA no debe asumir que la decisión consideró el GPS más reciente. |
| c vs e | `concurrent` | `c=[4,0,0]` gana en P1 (4>2); `e=[2,3,0]` gana en P2 (3>0) | **El hallazgo más grave:** la lectura de batería crítica (12%) y la decisión preliminar de misión son concurrentes. La decisión se tomó **sin conocer** que la batería había caído a nivel crítico. La misión preliminar debe tratarse como decisión con información incompleta y revisarse. |
| f vs g | `before` | `[2,2,1]` ≤ `[5,2,2]`, menor en P1 y P3 | La solicitud de estado fue recibida por el gestor de flota antes (causalmente) de que P1 recibiera el estado actualizado. La cadena solicitud → respuesta → recepción está completa y es verificable. |
| e vs g | `concurrent` | `e=[2,3,0]` gana en P2 (3>2); `g=[5,2,2]` gana en P1 (5>2) y P3 (2>0) | La decisión preliminar no está en la historia causal del estado actualizado que recibió P1, ni al revés. Es decir: cuando el estado actualizado circuló, la decisión de P2 aún no era conocida por esa rama. Hay dos "verdades" en paralelo que alguien debe reconciliar. |

### Conclusión de la fase

Lo que se puede defender con evidencia: la decisión preliminar (e) sí conocía la alerta de batería **baja** (18%), porque a → d → e forma una cadena causal completa. Lo que también se puede defender: esa misma decisión **no conocía** la batería **crítica** (12%), porque c y e son concurrentes. Por lo tanto, la decisión preliminar del Centro de Logística no es "incorrecta", pero sí es **incompleta**, y AURA debe tratarla como provisional hasta reconciliarla con la telemetría crítica y el estado actualizado del dron.

## Fase 3 - Locks, leases y fencing

**Idea central en lenguaje simple:** un *lock* es como colgar un cartel de "ocupado" sobre el dron para que nadie más lo toque. Un *lease* es ese mismo cartel pero con fecha de vencimiento (TTL): si el que lo colgó se demora demasiado, el cartel se cae solo y otro puede pasar. El problema es que el primero puede despertar más tarde creyendo que su cartel sigue puesto. El *fencing token* es la defensa: cada cartel trae un número de turno creciente (21, 22, 23...), y el recurso solo acepta órdenes del número de turno más alto que haya visto. Así, el que se quedó dormido con el turno 21 no puede pisar lo que hizo el turno 22.

### Diagnóstico requerido

| Campo | Respuesta |
|---|---|
| `leaseDeadline` de LC1 | `T0 + 3000 ms`. LC1 adquirió el lock en T0 con TTL de 3000 ms, así que su permiso venció 3 segundos después de T0. Como LC1 quedó bloqueado 4500 ms (T2 → T6), despertó ~1500 ms después de que su permiso ya había caducado. |
| Estado de LC1 en T7 | Dueño obsoleto (*stale owner*): cree que todavía tiene el lock, pero su lease expiró en T3 y el lock fue legítimamente adquirido por LC2 en T4. LC1 opera con una foto vieja de la realidad. |
| Riesgo si se acepta la escritura de LC1 | Doble asignación: `Drone-Alpha-1` quedaría asignado a la vez a `M-2002` (LC2) y `M-2001` (LC1). Dos misiones creerían ser dueñas del mismo dron físico, con rutas y clientes distintos. Además se corrompería la trazabilidad: la última escritura ganaría "en silencio". |
| Comparación de fencing requerida | El recurso protegido debe comparar el token que trae la escritura contra el mayor token ya aceptado: se acepta solo si `fence_entrante > último_fence_aceptado`. Aquí: fence de LC1 = 21, último aceptado = 22 (de LC2). Como 21 < 22, se rechaza. |
| Decisión segura sobre `M-2001` | Rechazar la escritura de LC1 en el recurso. La asignación vigente de `Drone-Alpha-1` a `M-2002` se mantiene intacta. |
| Compensación o revisión necesaria | `M-2001` no desaparece: queda sin dron. Debe pasar a estado "pendiente de reasignación": volver a la cola para que se le asigne otro dron disponible, notificar al flujo de negocio y registrar en auditoría por qué se rechazó el intento original. |

### Conceptos obligatorios

| Concepto | Qué garantiza | Qué no garantiza | Riesgo si se omite |
|---|---|---|---|
| Lock | Que, mientras el sistema funcione bien, solo un actor a la vez trabaje sobre el recurso (exclusión mutua). | No garantiza nada si el dueño muere o se cuelga: sin vencimiento, el recurso queda bloqueado para siempre; y no protege por sí solo contra dueños que despiertan tarde. | Dos actores modifican el mismo dron a la vez, o el dron queda "secuestrado" por un proceso muerto. |
| Lease con TTL | Que el sistema se recupera solo: si el dueño desaparece, el permiso caduca y otro puede continuar. Evita bloqueos eternos. | No garantiza que el dueño anterior *sepa* que perdió el permiso. Un proceso pausado puede despertar convencido de que aún manda. | Exactamente el incidente de LC1: un dueño vencido escribe creyendo que sigue autorizado. |
| Renovación | Que un dueño sano y activo pueda conservar el permiso durante operaciones largas, extendiendo el vencimiento antes de que llegue. | No garantiza éxito si el proceso está pausado o la red falla justo cuando tocaba renovar; renovar tarde equivale a no renovar. | Operaciones legítimas largas pierden el lock a mitad de camino sin que nadie lo note hasta que es tarde. |
| Fencing token | Que el **recurso protegido** pueda distinguir órdenes frescas de órdenes viejas, comparando números de turno crecientes. Es la única defensa que funciona aunque el emisor esté confundido. | No garantiza el orden correcto de negocio ni valida el contenido de la operación; solo filtra por antigüedad del permiso. Requiere que el recurso guarde el último token aceptado. | Escrituras de dueños vencidos se aceptan como válidas y aparece la doble asignación. |
| Operación idempotente | Que repetir la misma operación (por reintento o mensaje duplicado) produzca el mismo resultado que hacerla una vez, sin efectos dobles. | No garantiza exclusión mutua ni orden: dos operaciones *distintas* siguen pudiendo chocar. | Los reintentos, inevitables en sistemas distribuidos, duplican asignaciones, cobros o comandos. |

### Decisión de flota

**1. ¿Debe AURA aceptar la asignación de LC1 a `M-2001`?**
No. LC1 llega con un lease vencido (venció en T0+3000 ms y despertó después) y con un fence (21) inferior al último aceptado (22). Cualquiera de las dos razones basta para rechazar.

**2. ¿Qué debe validar el recurso protegido antes de persistir la asignación?**
En este orden: (1) que quien manda la orden actúa bajo el líder/epoch vigente; (2) que el lease del emisor no está vencido en el momento de la escritura; (3) que el fencing token es estrictamente mayor que el último aceptado para ese dron; (4) que el dron no está ya asignado a otra misión activa. La validación debe hacerla **el recurso** (el registro de asignaciones), no el cliente, porque el cliente puede estar confundido sobre su propio estado.

**3. ¿Qué debería quedar registrado en auditoría?**
Cada intento, aceptado o rechazado, con: actor, misión, dron, timestamp físico con su margen, fence presentado, último fence aceptado, estado del lease (deadline calculado vs momento del intento), líder/epoch bajo el que se emitió, decisión tomada y razón exacta del rechazo. Con eso, cualquier revisor puede reconstruir el incidente sin adivinar.

**4. ¿Qué harías con la misión `M-2001`: rechazar, reintentar, compensar o dejar en revisión?**
La **escritura** de LC1 se rechaza, pero la **misión** no se descarta: pasa a reintento controlado — vuelve a la cola de asignación para recibir otro dron disponible, con un nuevo lock, nuevo fence y verificación previa de batería. Si no hay drones disponibles, queda en revisión con alerta al operador. No corresponde "compensar" porque el rechazo por fencing evitó el daño: no hubo doble asignación que revertir (y eso, precisamente, debe celebrarse en la métrica de "compensaciones evitadas").

### Métricas mínimas

Para ver este riesgo venir en producción, propongo medir:

- **Intentos de adquisición de lock** (por recurso y por actor): volumen y tasa de contención — si muchos pelean por el mismo dron, hay un cuello de botella.
- **Expiraciones de lease** (contador + razón): cada expiración es un casi-incidente; una subida sostenida indica TTL mal calibrado u operaciones lentas.
- **Operaciones rechazadas por fencing** (contador por recurso): cada rechazo es una doble escritura evitada; si nunca es cero, hay dueños stale circulando de forma crónica.
- **Duración de operación crítica vs TTL** (histograma y ratio p99/TTL): si la operación tarda cerca del TTL (como los 4500 ms de LC1 contra 3000 ms de TTL), es cuestión de tiempo que explote; alertar cuando p99 > 70% del TTL.
- **Renovaciones tardías o fallidas**: renovar tarde es la antesala de perder el lock sin saberlo.
- **Escrituras de owners stale detectadas**: cuántas veces alguien intentó escribir después de perder el lock — mide qué tan frecuente es el escenario LC1.
- **Compensaciones por doble asignación evitada**: cuántas misiones tuvieron que reencolarse por rechazo de fencing; mide el costo de negocio del problema, no solo el síntoma técnico.

## Fase 4 - Failure detector y elección de líder

**Idea central en lenguaje simple:** en un sistema distribuido no existe un detector perfecto de "está muerto". Solo existe "hace rato que no me contesta". Un nodo puede estar caído de verdad, o simplemente pausado, lento o con la red cortada — y desde afuera esos casos se ven idénticos. Por eso la palabra correcta es *sospechado*, no *muerto*. Y como un sospechoso puede despertar en cualquier momento creyéndose todavía jefe, el sistema necesita un número de mandato (*epoch*) que diga quién es el jefe legítimo actual.

### Preguntas sobre failure detector

**1. ¿Qué puede afirmar RP2 sobre RP5 en T5?**
Solo esto: "no he recibido heartbeats de RP5 durante más de 3000 ms (el `suspectTimeout`)". Eso es un hecho verificable sobre lo que RP2 *observó*, no sobre lo que le *pasa* a RP5. RP2 puede declarar a RP5 **sospechado** y actuar en consecuencia (iniciar elección), pero no puede afirmar que RP5 está muerto.

**2. ¿Por qué `suspected` no significa `dead`?**
Porque el silencio tiene muchas causas indistinguibles desde afuera: el nodo pudo morir, pero también pudo quedar pausado (por ejemplo, por una pausa larga del recolector de memoria), estar sobrecargado, o tener la red rota solo hacia RP2. En todos esos casos el nodo sigue vivo y puede volver. Tratar "sospechado" como "muerto confirmado" lleva a decisiones irreversibles (liberar sus locks, borrar su estado, ignorar su epoch) que explotan cuando el "muerto" resucita. Y aquí RP5 efectivamente resucita en T9.

**3. ¿Qué riesgo introduce que RP5 esté pausado y luego despierte?**
Split-brain: dos nodos actuando como líder al mismo tiempo. RP5 despierta sin saber que hubo elección; su memoria dice "soy el líder". Si nadie lo frena, tendremos a RP4 y RP5 emitiendo comandos simultáneos y contradictorios sobre la misma flota.

**4. ¿Qué evidencia mínima debería registrarse para justificar la elección?**
Último heartbeat recibido de RP5 (timestamp y de quién); el cálculo "ahora − último heartbeat > suspectTimeout" con los valores concretos; qué nodo declaró la sospecha y cuándo; a quiénes se les envió mensaje de elección y qué respondió cada uno (RP4 respondió; RP3 y RP5 no, dentro del `electionTimeout` de 5000 ms); el epoch anterior y el nuevo epoch anunciado; y quién reconoció al nuevo líder. Con ese registro, la elección es defendible ante cualquier auditoría: no fue un golpe de estado, fue un procedimiento con evidencia.

### Elección tipo Bully

En el algoritmo Bully, "manda el de id más grande que esté vivo": cuando alguien sospecha que el líder cayó, desafía a todos los que tienen id mayor que el suyo; si ninguno contesta, se proclama; si alguno contesta, le cede la elección.

| Paso | Acción | Resultado esperado | Riesgo o límite |
|---:|---|---|---|
| 1 | RP2 detecta ausencia de heartbeat del líder RP5 | RP2 marca a RP5 como **sospechado** tras superar el `suspectTimeout` (3000 ms sin señales) y registra la evidencia | La sospecha puede ser falsa (RP5 solo está pausado o la red falla hacia RP2). Un timeout muy corto provoca elecciones innecesarias; uno muy largo deja al sistema sin líder demasiado tiempo |
| 2 | RP2 inicia elección | Se abre formalmente un proceso de elección; RP2 se postula provisionalmente y arranca el `electionTimeout` (5000 ms) | Varios nodos pueden detectar la falla a la vez e iniciar elecciones simultáneas; el protocolo debe tolerarlo sin producir dos ganadores |
| 3 | RP2 contacta nodos con id mayor | Envía mensajes de elección a RP3 (id 3), RP4 (id 4) y RP5 (id 5): "si estás vivo, tú tienes prioridad" | Depende de la red: un mensaje perdido hacia un nodo mayor vivo puede coronar a un líder equivocado. RP2 no puede distinguir "no contestó porque murió" de "no contestó porque el mensaje se perdió" |
| 4 | RP4 responde y RP3/RP5 no responden | RP4, al responder, toma el control de la elección y repite el proceso hacia arriba: contacta a RP5 (único id mayor que el suyo) | RP3 está caído y RP5 pausado, pero eso solo se sabe *después*; en el momento solo hay silencio. Si RP5 respondiera tarde (después del timeout), su respuesta llega a una elección ya decidida |
| 5 | RP4 asume liderazgo si no aparece un nodo mayor válido | Vencido el `electionTimeout` sin respuesta de RP5, RP4 se autoproclama líder legítimo | Ventana sin líder mientras corre el timeout: nadie coordina rutas durante esos segundos. El sistema debe tolerar esa pausa sin aceptar comandos ambiguos |
| 6 | RP4 anuncia nuevo líder/epoch | RP4 difunde "soy líder con epoch 7" (el anterior era 6); todos los nodos y **todos los recursos protegidos** actualizan el epoch vigente | Si algún nodo o recurso no se entera del nuevo epoch (mensaje perdido, nodo aislado), seguirá aceptando órdenes del epoch viejo. El anuncio debe persistirse y validarse en el lado que recibe comandos, no solo en los coordinadores |

### Líder viejo y split-brain

**1. ¿Qué debe pasar si RP5 despierta después de T9 e intenta emitir comandos?**
Sus comandos deben ser **rechazados automáticamente** por todo aquel que los reciba, y el propio RP5 debe descubrir por esos rechazos que hubo elección, degradarse a seguidor y sincronizarse con RP4. No basta con esperar que RP5 "se dé cuenta solo": despertó con memoria vieja y actuará según ella hasta que algo externo lo frene.

**2. ¿Qué mecanismo permite rechazar comandos de líderes viejos?**
Un **epoch** (o *term*, es el mismo concepto): un número de mandato que sube en cada elección y viaja dentro de cada comando. RP5 emite con epoch 6; el vigente es 7; como 6 < 7, se rechaza. Es la misma idea que el fencing token de la Fase 3, aplicada al liderazgo: números crecientes que hacen imposible que el pasado pise al presente. Fencing protege recursos individuales; epoch protege la autoridad de coordinación — en AURA conviene usar ambos.

**3. ¿Dónde debe validarse ese mecanismo?**
En el **receptor** de cada comando: el servicio o recurso que va a ejecutar la orden (gestor de flota, registro de asignaciones, cada dron si aplica). Nunca solo en el emisor, porque el emisor confundido es exactamente el caso del que nos defendemos. Cada receptor guarda el epoch más alto que ha visto y rechaza todo comando con epoch menor. Así, aunque RP5 esté convencido de ser líder, ninguna de sus órdenes surte efecto.

**4. ¿Qué pasaría si AURA acepta comandos de RP4 y RP5 al mismo tiempo?**
Split-brain con consecuencias físicas: dos planificadores emitiendo rutas y asignaciones contradictorias sobre la misma flota. Un mismo dron podría recibir dos destinos, dos misiones podrían reclamar el mismo dron, las entregas se duplicarían o perderían, y la telemetría dejaría de cuadrar con las órdenes. En un sistema que mueve objetos voladores sobre una ciudad, eso no es solo inconsistencia de datos: es riesgo de colisión y de pérdida de control operativo.

## Fase 5 - Implementación acotada

**Archivo implementado:** `services/centro-logistica/src/pc3-coordination-lab.js`

**Comando de ejecución:**

```bash
node services/centro-logistica/src/pc3-coordination-lab.js
```

**Qué simula (en lenguaje simple):** un único guardián del registro de asignaciones (`FleetManager`) que recibe intentos de asignar el dron `Drone-Alpha-1` y aplica cuatro filtros en orden: ¿vienes de parte del jefe vigente? (epoch), ¿tu permiso sigue vivo? (lease), ¿tu número de turno es el más nuevo? (fence), ¿el dron está libre? Solo si pasa los cuatro, la asignación se guarda. Cada decisión queda registrada con su razón.

**Salida relevante (recortada a lo esencial):**

```json
{
  "lc2": {
    "decision": "accepted",
    "reason": "valid-lease-fence-and-leader",
    "detail": "asignación persistida con fence=22",
    "missionId": "M-2002",
    "fence": 22
  },
  "lc1Old": {
    "decision": "rejected",
    "reason": "lease-expired",
    "detail": "leaseDeadline=3000ms < nowMs=7600ms (owner=LC1)",
    "missionId": "M-2001",
    "fence": 21
  },
  "rp5OldLeader": {
    "decision": "rejected",
    "reason": "stale-leader",
    "detail": "leader RP5 epoch=6 < currentLeaderEpoch=7",
    "missionId": "M-2003",
    "fence": 20
  },
  "lc3Duplicate": {
    "decision": "rejected",
    "reason": "drone-already-assigned",
    "detail": "Drone-Alpha-1 ya asignado a M-2002 con fence=22",
    "missionId": "M-2004",
    "fence": 23
  },
  "assignments": [
    ["Drone-Alpha-1", { "missionId": "M-2002", "actor": "LC2", "fence": 22, "assignedAtMs": 4600 }]
  ]
}
```

**Interpretación técnica:**

- **LC2 aceptado:** su lease estaba vigente (adquirido en 4500 ms, TTL 3000 ms, escribió en 4600 ms, muy dentro del plazo), su fence 22 era el más alto visto y actuaba bajo el líder vigente (epoch 7). Es la única escritura que merece persistirse.
- **LC1 rechazado (`lease-expired`):** su `leaseDeadline` era `0 + 3000 = 3000 ms` y despertó a escribir en `7600 ms`, es decir 4600 ms después de perder el permiso. El cálculo explícito del deadline demuestra la detección de escritura post-vencimiento. Nótese que, aunque el lease se le hubiera pasado por alto, su fence 21 < 22 lo habría frenado igual: hay defensa en profundidad.
- **RP5 rechazado (`stale-leader`):** emitió con epoch 6 cuando el vigente es 7. Se rechaza **antes** de mirar lease o fence, porque la autoridad se valida primero: un líder ilegítimo no debe siquiera competir por el recurso.
- **LC3 rechazado (`drone-already-assigned`):** caso agregado a propósito con lease vigente, líder correcto y fence más alto (23), para demostrar que la prevención de doble asignación es una regla independiente: aun con todos los permisos en regla, un dron ya asignado no se reasigna en silencio.
- **Estado final:** `Drone-Alpha-1` queda asignado solo a `M-2002`, que es exactamente el resultado seguro que el análisis de la Fase 3 exigía. El `auditLog` de la salida completa registra los cuatro intentos con actor, razón y detalle, cumpliendo lo pedido en auditoría.

**Limitaciones explícitas de la simulación:**

- Corre en un solo proceso: no hay red real, ni mensajes perdidos, ni relojes físicos desincronizados de verdad.
- El tiempo (`nowMs`) es inyectado a mano, no medido: no se prueban pausas reales de GC ni drift de reloj.
- El epoch del líder y los fences se comparan contra estado **local en memoria**; en producción, el último fence aceptado y el epoch vigente deben persistirse en el recurso protegido para sobrevivir reinicios.
- No hay concurrencia real: las llamadas llegan en orden secuencial, así que no se prueba la carrera verdadera entre LC1 y LC2.
- No implementa consenso, quórum, membresía ni failover — deliberadamente, porque esta fase solo demuestra las **reglas de decisión** que el recurso debe aplicar, no la infraestructura que las distribuye.

## Fase 6 - Decisión arquitectónica

Cambio de sombrero: ya no soy quien escribe el script, sino quien decide qué piezas comprar/operar para que este incidente no se repita. La regla de oro: ninguna herramienta se recomienda "porque es famosa", sino por la garantía concreta que aporta, lo que cuesta operarla y lo que aun así puede fallar.

### Matriz de problemas

| Problema | Opción recomendada | Garantía buscada | Tradeoff/costo | ¿Se implementa en Fase 5? |
|---|---|---|---|---|
| Evitar doble asignación de drones | **DB atómica** (restricción de unicidad + escritura condicional) combinada con **fencing token** e **Idempotency-Key** | Que la última línea de defensa sea el propio almacén de datos: una restricción "un dron activo = una misión" que ninguna carrera puede violar, más el rechazo de escritores viejos por fence y de reintentos duplicados por clave de idempotencia | La base de datos se vuelve punto de contención y su esquema debe modelar bien "asignación activa"; el fencing exige que todo escritor lo porte y todo recurso lo valide; la idempotencia exige generar y almacenar claves por operación | Sí, en versión simulada: chequeo de dron ya asignado + comparación de fence en memoria (sin DB real ni claves de idempotencia) |
| Elegir líder de planificador-rutas | **etcd lease** (elección basada en lease sobre un almacén con consenso Raft) — alternativa equivalente: ZooKeeper ephemeral sequential node | Un solo líder legítimo a la vez, con epoch/revision creciente emitido por un sistema que internamente usa consenso; si el líder muere, su lease caduca y otro toma el puesto sin intervención manual | Operar un clúster etcd (3-5 nodos): instalación, monitoreo, backups, upgrades; latencia extra en cada renovación; si el clúster etcd pierde quórum, no se puede elegir líder (se prioriza consistencia sobre disponibilidad) | No — prohibido en Fase 5. Allí solo se simuló la *consecuencia* (un epoch vigente contra el que se compara) |
| Rechazar comandos de líderes viejos | **Fencing token / epoch** validado en cada receptor (el epoch lo emite el mismo etcd de la fila anterior) | Que ningún comando de un mandato anterior surta efecto, aunque el emisor esté convencido de ser líder: comparación `epoch_comando >= epoch_vigente` en el lado que ejecuta | Todos los servicios receptores deben modificarse para portar, persistir y validar el epoch; hay que definir qué hacer con comandos en vuelo durante el cambio de mandato | Sí, en versión simulada: `isLeaderStale` rechaza epoch 6 contra el vigente 7 |
| Publicar configuración dinámica | **etcd** como almacén de configuración con *watches* (suscripción a cambios) | Que todos los servicios converjan a la misma configuración versionada, con notificación de cambios y posibilidad de leer "la última versión confirmada" | Los servicios pasan a depender de etcd también para configuración (más acoplamiento al mismo clúster); hay que decidir el comportamiento cuando etcd no responde (¿usar la última config conocida?); la propagación no es instantánea | No — fuera del alcance de la PC3; no se simuló |
| Detectar instancias saludables | **Consul health check** (chequeos activos + membresía con gossip) | Visibilidad continua de qué instancias responden, con estados graduales (pasa / advertencia / falla) integrados al descubrimiento de servicios: los clientes dejan de enrutar hacia instancias enfermas | Otro sistema que operar además de etcd (o comprometerse con un solo ecosistema); los health checks miden "responde al chequeo", no "funciona correctamente": sigue siendo detección **imperfecta**, con falsos positivos bajo carga | No — en Fase 5 el estado "sospechado/pausado" de RP5 se dio como dato del escenario, no se detectó |

### Aclaración obligatoria

En la Fase 5 **no** se implementó etcd, ZooKeeper ni Raft: solo reglas locales que simulan las decisiones que el recurso protegido debe tomar. Para la recomendación futura:

- **Qué garantía aportan:** etcd/ZooKeeper ofrecen un almacén pequeño y fuertemente consistente (basado en consenso Raft/ZAB) donde "quién tiene el lock", "quién es líder" y "cuál es el epoch vigente" tienen una única respuesta verdadera a la vez, con números de versión crecientes que sirven como fencing tokens nativos.
- **Qué problema concreto resuelven:** eliminan la ambigüedad que causó este incidente — dos Centros de Logística creyéndose dueños del mismo lock y dos planificadores creyéndose líderes — porque la fuente de verdad ya no es la memoria de cada proceso sino un servicio con quórum.
- **Qué costo introducen:** un clúster más que operar (3-5 nodos, monitoreo, backups, upgrades, capacitación), latencia adicional en cada adquisición/renovación, y una decisión explícita de diseño: cuando el clúster de coordinación pierde quórum, el sistema **deja de poder coordinar** (se elige consistencia sobre disponibilidad — correcto para asignar drones, pero hay que asumirlo).
- **Qué modo de falla todavía queda:** el cliente pausado. etcd puede expirar el lease de LC1 y dar el lock a LC2, pero no puede impedir que LC1 despierte y dispare una escritura: esa escritura viajará de todos modos.
- **Qué validación debe existir en el recurso protegido:** por lo anterior, el recurso final (registro de asignaciones) debe seguir validando fencing token/epoch en cada escritura, exactamente como se simuló en la Fase 5. La coordinación externa reduce la frecuencia del problema; la validación en el recurso elimina su impacto. Ninguna de las dos sola es suficiente.

## Cierre técnico

**Qué aceptaría:** la asignación de LC2 (`Drone-Alpha-1` → `M-2002`), porque es la única escritura con lease vigente, fence más alto y líder legítimo; y el liderazgo de RP4 con epoch 7, porque la elección tiene evidencia registrable (silencio de RP5 más allá del `suspectTimeout`, elección con timeout cumplido, anuncio de nuevo epoch).

**Qué rechazaría:** la escritura de LC1 (lease vencido 4600 ms antes y fence 21 < 22), todo comando de RP5 con epoch 6 (líder de un mandato anterior), y cualquier afirmación de orden entre E1/E2/E3/E4 basada solo en timestamps físicos, porque el skew más el margen de ±300 ms hace que sus rangos se superpongan.

**Qué dejaría en revisión:** la misión `M-2001`, que se quedó sin dron y debe reencolarse con verificación previa de batería; la decisión preliminar del Centro de Logística, porque los vector clocks demuestran que se tomó sin conocer la batería crítica (c y e son concurrentes) ni el estado actualizado del dron (e y g son concurrentes); y el estado real de RP5 y RP3, que siguen siendo *sospechados* — no muertos confirmados — hasta que respondan o se verifique su estado por otro canal.

**Límites honestos:** mi evidencia demuestra reglas de decisión correctas en una simulación de un solo proceso; no demuestra comportamiento bajo red real, concurrencia verdadera ni fallas de la propia capa de coordinación. Por eso la arquitectura futura combina las dos capas: coordinación con quórum (etcd) para reducir la frecuencia de conflictos, y validación de fencing/epoch en cada recurso protegido para que, cuando el conflicto igual llegue — y llegará —, el daño sea cero.
