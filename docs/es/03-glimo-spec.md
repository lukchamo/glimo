# Glimo Spec v0.1 (borrador)

Contrato entre cualquier agente y la interfaz de Glimo. Un JSON pequeño dice cómo está el agente, qué ve, qué piensa, qué necesita y qué se puede hacer.

- Esquema: `spec/glimo-spec.schema.json` (JSON Schema 2020-12)
- Ejemplos: `spec/examples/`
- Tipos TypeScript: `reference/react/glimo-spec.ts`

## Principios

1. **Pequeño:** solo `spec`, `agent`, `state` y `updatedAt` son obligatorios.
2. **Compatible con ASP:** `state` es la capa visual y `reason` lleva el valor de Agent Status Protocol que lo causa.
3. **Accionable:** cada estado puede declarar acciones. La interfaz nunca inventa acciones.
4. **Privado:** `pov` y `thoughts` son datos sensibles. Se guardan y sincronizan cifrados y nunca salen a la tienda pública ni a otros glimos.

## Campos

| Campo       | Tipo                   | Obligatorio | Descripción                                                 |
| ----------- | ---------------------- | ----------- | ----------------------------------------------------------- |
| `spec`      | `"glimo/0.1"`          | Sí          | Versión                                                     |
| `agent`     | objeto `{ id, name }`  | Sí          | Identidad del agente                                        |
| `state`     | enum (8)               | Sí          | Estado visual                                               |
| `reason`    | string                 | No          | Valor de ASP que lo causa (por ejemplo `awaiting-approval`) |
| `say`       | string ≤ 120           | No          | Frase corta para la vitrina ("Quiere enviar 12 correos")    |
| `urgency`   | `high` / `mid` / `low` | No          | Si falta, se deriva del estado                              |
| `actions`   | lista                  | No          | Acciones disponibles                                        |
| `pov`       | objeto                 | No          | Lo que ve: `app`, `focus`, `items[]`                        |
| `thoughts`  | lista                  | No          | Pensamientos `{ at, text }`, el último es el actual         |
| `tools`     | lista de string        | No          | Servidores MCP en uso                                       |
| `skills`    | lista de string        | No          | Skills en uso                                               |
| `world`     | objeto                 | No          | `{ id, spot, activity }` para el mundo vivo                 |
| `talkingTo` | lista de ids           | No          | Glims con los que colabora ahora                            |
| `updatedAt` | fecha ISO 8601         | Sí          | Momento del estado                                          |

## Estados y mapeo a Agent Status Protocol

| `state`    | Nombre      | Valores de ASP que lo producen                                                                                                               |
| ---------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `idle`     | Listo       | lifecycle `online`, `idle`                                                                                                                   |
| `thinking` | Pensando    | task `submitted`, `queued`                                                                                                                   |
| `working`  | Trabajando  | task `working`, `delegated`, `retrying` · lifecycle `busy`                                                                                   |
| `waiting`  | Te espera   | task `input-required`, `auth-required`, `awaiting-approval`                                                                                  |
| `blocked`  | Bloqueado   | task `failed`, `rejected`, `timed-out` · health `unhealthy`, `auth-error`, `dependency-down`, `stalled` · lifecycle `crashed`, `unreachable` |
| `done`     | Hecho       | task `completed`                                                                                                                             |
| `tired`    | Sin energía | health `rate-limited`, `quota-exhausted`, `overloaded` · lifecycle `at-capacity`                                                             |
| `sleeping` | Durmiendo   | lifecycle `paused`, `offline`, `draining`, `stopping`                                                                                        |

Si varios valores aplican a la vez, gana el de mayor prioridad: `blocked` > `waiting` > `tired` > `working` > `thinking` > `done` > `idle` > `sleeping`.

## Urgencia derivada

| Urgencia | Estados                                   | Comportamiento en la interfaz                                                                    |
| -------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `high`   | `waiting`, `blocked`                      | Primero en "Ahora mismo", notificación push, en la vista Inmersiva flota más cerca y en amarillo |
| `mid`    | `done`, `tired`                           | Visible sin interrumpir                                                                          |
| `low`    | `idle`, `thinking`, `working`, `sleeping` | En segundo plano: "No necesita nada de ti ahora"                                                 |

## Acciones

Vocabulario base: `approve`, `respond`, `open`, `pause`, `resume`, `retry`, `wake`, `undo`, `renew-access`, `raise-limit`.

```json
{ "id": "approve", "label": "Aprobar envío", "kind": "primary", "sensitive": true }
```

- `kind`: `primary` o `secondary`.
- `sensitive: true` exige confirmación de la persona y queda registrado.

## Transporte

1. **Recurso MCP:** el agente expone `glimo://status/{agentId}` y avisa con `notifications/resources/updated`.
2. **Herramienta MCP:** `glimo_status` para leer el estado y `glimo_action` para enviar acciones.
3. **Canal en vivo:** el motor reparte los cambios a los clientes por WebSocket o SSE, con cambios incrementales.
4. **MCP App:** la vitrina se declara como recurso `ui://glimo/vitrina` (extensión `io.modelcontextprotocol/ui`).

## Versiones

- Cambios que añaden campos: versión menor. Cambios que rompen: versión mayor.
- Los clientes ignoran los campos que no conocen.
