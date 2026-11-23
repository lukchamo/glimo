# Arquitectura propuesta

Propuesta para arrancar. Todo es revisable; lo marcado como "decisión abierta" está también en el PRD.

## Vista general

```
  Servidores MCP de la persona (correo, CRM, base de datos, calendario…)
                 │  MCP
        ┌────────▼──────────────────────────────┐
        │  Motor Glimo (engine)                 │
        │  · agentes con skills y cerebro       │
        │  · cliente MCP hacia sus servidores   │
        │  · bus de estados → Glimo Spec        │
        │  · servidor MCP propio (status, apps) │
        │  · almacenamiento local cifrado       │
        └──┬───────────────────────┬────────────┘
           │ local (WebSocket)     │ blobs cifrados
           ▼                       ▼
   Vitrina web / app móvil    Cloudflare: Workers + Durable Objects + R2
   MCP App en Claude/ChatGPT        │  (no puede leer nada)
                                    ▼
                           otros dispositivos de la persona

   Tienda de skills: glimo.dev/skills (Workers + D1 + R2 + Queues)
```

## Componentes

| Componente         | Responsabilidad                                                        | Tecnología propuesta                                                                                       |
| ------------------ | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `packages/spec`    | Tipos, JSON Schema y validador de Glimo Spec                           | TypeScript + Zod                                                                                           |
| `packages/glim`    | Componente Glim (8 estados) para web y móvil                           | React y React Native, sin dependencias pesadas                                                             |
| `packages/engine`  | Runtime de agentes, cliente MCP, bus de estados, servidor MCP de Glimo | Node.js + `@modelcontextprotocol/sdk`                                                                      |
| `packages/brains`  | Adaptadores de cerebro con una interfaz común                          | Claude Agent SDK (plan o API key); endpoint compatible con OpenAI para modelos locales (Ollama, LM Studio) |
| `packages/crypto`  | Frase de 12 palabras, derivación de llaves, cifrado                    | `@scure/bip39` (tiene lista en español), libsodium                                                         |
| `packages/cli`     | `npx glimo init`, `connect`, `publish`                                 | Node.js                                                                                                    |
| `packages/mcp-app` | La vitrina como MCP App                                                | `@modelcontextprotocol/ext-apps`                                                                           |
| `apps/web`         | glimo.dev (landing) y app web (vitrina, mundo vivo, panel, inmersiva)  | React + Vite; landing estática                                                                             |
| `apps/mobile`      | App móvil con push                                                     | Expo (React Native)                                                                                        |
| `workers/sync`     | Sincronización cifrada y canal en vivo entre dispositivos              | Cloudflare Workers + Durable Objects + R2                                                                  |
| `workers/registry` | Tienda de skills: índice, paquetes, revisión, firma                    | Cloudflare Workers + D1 + R2 + Queues                                                                      |
| `worlds/`          | Oficina, Jardín, Órbita                                                | `world.json` + SVG                                                                                         |
| `skills/`          | Skills base auditadas                                                  | SKILL.md                                                                                                   |

## Estructura del monorepo

```
glimo/
  apps/web  apps/mobile
  packages/spec  packages/glim  packages/engine  packages/brains
  packages/crypto  packages/cli  packages/mcp-app
  workers/sync  workers/registry
  worlds/oficina  worlds/jardin  worlds/orbita
  skills/
  docs/  design/
```

pnpm workspaces + Turborepo. TypeScript estricto en todo.

## Flujo de un estado

1. Un agente llama a una herramienta MCP (por ejemplo, Gmail para crear borradores).
2. El motor traduce el evento a Glimo Spec (`state: working`) y lo publica en el bus.
3. Cuando el agente necesita aprobación, emite `state: waiting`, `reason: awaiting-approval` y la acción `approve`.
4. La vitrina recibe el cambio, reordena por urgencia y lanza una notificación push.
5. La persona toca "Aprobar envío". La acción vuelve al motor, que la registra y desbloquea al agente.

## Dónde corre el motor

- **MVP:** en el equipo de la persona (`npx glimo`). Lo más simple y lo más privado.
- **Después:** opción en la nube. **Decisión abierta:** si el motor corre en un servidor, necesita las llaves para trabajar mientras la persona duerme. Opciones: que corra en la cuenta de Cloudflare de la propia persona, o en computación confidencial, o asumir y explicar que esa modalidad no es sin conocimiento.

## Rendimiento

| Vista           | Estrategia                                                                                                                                                                                                                                                                                                                  |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vitrina y Panel | DOM ligero. Solo se re-renderiza el glim que cambia.                                                                                                                                                                                                                                                                        |
| Mundo vivo      | Escena 2D con posiciones fijas por mundo; animaciones CSS solo de `transform` y `opacity`.                                                                                                                                                                                                                                  |
| Inmersiva       | Escena en WebGL (Three.js o PixiJS) con glims como sprites instanciados; textos en HTML encima para legibilidad y accesibilidad. Render por eventos, pausa con la pestaña oculta, imágenes fijas para glims lejanos, vuelta a Panel en equipos lentos o con "reducir movimiento". Objetivo propuesto: 60 fps en escritorio. |
| Canal en vivo   | Un WebSocket por vitrina con cambios incrementales (no el estado completo cada vez).                                                                                                                                                                                                                                        |

## Seguridad

- Las skills declaran permisos (servidores MCP y acciones). Instalar una skill pide confirmarlos.
- Acciones sensibles (enviar, pagar, publicar, borrar) siempre requieren aprobación.
- Paquetes de la tienda firmados por su autor y revisados automáticamente antes de publicarse.
- El motor registra cada acción aprobada con quién, cuándo y qué.
