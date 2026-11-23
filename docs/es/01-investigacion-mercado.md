# Investigación de mercado (noviembre de 2026)

Qué existe parecido a Glimo y qué hueco queda. Cifras y fechas según las fuentes consultadas el 23 de noviembre de 2026.

## Conclusión

Todas las piezas existen por separado, pero nadie junta en un producto abierto:

1. un cerebro MCP de uso general (no solo para código),
2. una vitrina de varios avatares que muestran el estado real de un vistazo,
3. prioridad móvil,
4. skills publicables por la comunidad,
5. un protocolo abierto que traduce el estado del agente a lo que se ve, con acciones.

**Posicionamiento recomendado:** no inventar otro vocabulario de estados. Tomar el de Agent Status Protocol como entrada y aportar lo que falta: el manifest visual con acciones (Glimo Spec), el renderizador de varios mundos con prioridad móvil y la distribución como MCP App.

## 1. Protocolos de UI para agentes (genéricos, sin avatares)

| Proyecto               | Qué es                                                                                                                                                                            | Relación con Glimo                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **MCP Apps**           | Primera extensión oficial de MCP (26 de enero de 2026). Las herramientas declaran recursos de UI que el cliente muestra en un iframe aislado. Une MCP-UI y el Apps SDK de OpenAI. | Transporte para que la vitrina aparezca dentro de Claude, ChatGPT, VS Code y otros clientes compatibles. |
| **A2UI** (Google)      | Formato JSON declarativo para que un agente componga interfaces desde un catálogo de widgets. Versión de producción 0.9.1.                                                        | Alternativa de transporte. No define estado.                                                             |
| **AG-UI** (CopilotKit) | Protocolo de eventos entre agente e interfaz, con 16 tipos de evento estándar.                                                                                                    | Útil para el flujo de eventos. No define estado ni avatar.                                               |

## 2. Compañeros con avatar (un personaje, sin vitrina)

| Proyecto                 | Qué es                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| **AIRI** (moeru-ai, MIT) | Compañero autoalojado con avatares Live2D y VRM, voz y un sistema de plugins basado en MCP. Puede jugar a Minecraft o Factorio. |
| **Open-LLM-VTuber**      | Compañero de voz con avatar Live2D, unas 10.447 estrellas en GitHub y soporte de MCP para usar herramientas externas.           |

Están pensados como compañero, no como panel de estado de un equipo de agentes.

## 3. Varios agentes como personajes (solo código)

| Proyecto                   | Qué es                                                                                                                            |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Pixel Agents**           | Extensión de VS Code que convierte los agentes de código de las terminales en personajes pixel-art en una oficina. Se hizo viral. |
| **PixelHQ** (iOS)          | Oficina pixel que reacciona en tiempo real a las sesiones de Claude Code.                                                         |
| **PixelFloor**             | Visualización pixel-art de pipelines de agentes con estados idle, working, celebrating y error.                                   |
| **pixtuoid**               | Oficina pixel-art en la terminal para agentes de código.                                                                          |
| **AI Town** (a16z)         | Pueblo virtual open source donde personajes con IA viven y conversan.                                                             |
| **AI Village** (AI Digest) | Experimento en vivo con agentes de distintos laboratorios que colaboran en tareas reales.                                         |

Crítica pública que hay que tener en cuenta: un análisis señala que Pixel Agents formaliza la vigilancia sin dar control (miras agentes que no puedes parar). En Glimo, el avatar tiene que permitir actuar.

## 4. Estado de agentes en el móvil (cerrados y solo para código)

Agentfy (Live Activity y Dynamic Island), AgentWatch (iPhone y Apple Watch), AgentsRoom (estado por colores y un avatar por rol), Fleet Command, CodeVibe, Cmd+Ctrl, Codync y Perch. Demuestran que hay demanda, pero ninguno es abierto ni de uso general.

## 5. Skills y registros

| Proyecto               | Qué es                                                                                                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Agent Skills**       | Formato abierto creado por Anthropic y publicado como estándar el 18 de diciembre de 2025: una carpeta con SKILL.md, scripts y referencias. Lo adoptan muchos agentes. |
| **OpenClaw + ClawHub** | Agente personal open source (MIT) con registro público de skills (más de 3.000). Sufrió un ataque serio a su cadena de suministro a través de las skills.              |

Lección: Glimo usa SKILL.md tal cual y exige revisión y firma al publicar.

## 6. Protocolos de avatar y estado (competencia directa, muy tempranos)

| Proyecto                         | Estado                                                                                                                                                                                                                                                     |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Agent Status Protocol (ASP)**  | Borrador v0.1 del 16 de octubre de 2026, de la Open Voice Interoperability Initiative (Linux Foundation AI & Data). Cinco dimensiones: ciclo de vida, salud, tarea, turno y gobernanza. No trata avatares ni representación visual y no tiene mapeo a MCP. |
| **Open Face Protocol**           | Cara animada controlada por JSON: 11 estados y 13 emociones, servicio hospedado en oface.io. No menciona MCP.                                                                                                                                              |
| **ADA (Agent Driven Avatar)**    | Protocolo JSON y formato Avatar.md. Una estrella, 10 commits, sin MCP.                                                                                                                                                                                     |
| **Chitin Presentation Protocol** | Protocolo de presentación con etiquetas de emoción y negociación de capacidades.                                                                                                                                                                           |

## 7. Política de Anthropic sobre planes de Claude en apps de terceros

- Febrero de 2026: Anthropic aclara que el inicio de sesión de los planes Free, Pro y Max es solo para Claude Code y Claude.ai.
- Abril de 2026: se bloquea el uso de planes en herramientas de terceros como OpenClaw.
- 13 de mayo de 2026: los planes de pago reciben un crédito mensual del "Agent SDK" para uso programático, que incluye agentes de terceros. Es un crédito aparte del uso normal, facturado a precio de API, que caduca cada mes.

Implicación: Glimo puede ofrecer "Claude con tu plan" por la vía del Agent SDK, más la clave de API y el modelo local. Confirmar el flujo exacto en docs.claude.com antes de construir.

## Fuentes

- [MCP Apps, anuncio oficial](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/)
- [SEP-1865: MCP Apps](https://modelcontextprotocol.io/seps/1865-mcp-apps-interactive-user-interfaces-for-mcp)
- [modelcontextprotocol/ext-apps](https://github.com/modelcontextprotocol/ext-apps)
- [A2UI en GitHub](https://github.com/google/A2UI)
- [Introducing A2UI (Google)](https://developers.googleblog.com/introducing-a2ui-an-open-project-for-agent-driven-interfaces/)
- [Getting started with AG-UI (InfoWorld)](https://www.infoworld.com/article/4248550/getting-started-with-ag-ui-the-agent-user-interaction-protocol.html)
- [AIRI](https://github.com/moeru-ai/airi)
- [Open-LLM-VTuber y MCP](https://docs.llmvtuber.com/en/docs/user-guide/mcp/overview)
- [Open-LLM-VTuber review (DEV)](https://dev.to/andrew-ooo/open-llm-vtuber-review-offline-ai-companion-with-live2d-327m)
- [Pixel Agents](https://github.com/pablodelucca/pixel-agents)
- [Crítica a Pixel Agents (UC Strategies)](https://ucstrategies.com/news/this-viral-ai-tool-does-nothing-but-developers-cant-stop-watching-it/)
- [PixelHQ](https://apps.apple.com/ca/app/pixelhq/id6758467298)
- [PixelFloor](https://github.com/fumeilab/pixelfloor)
- [pixtuoid](https://github.com/IvanWng97/pixtuoid)
- [AI Town](https://github.com/a16z-infra/ai-town)
- [AI Village](https://theaidigest.org/village)
- [AgentsRoom](https://apps.apple.com/app/id6761265182)
- [Agentfy](https://apps.apple.com/app/id6757966311)
- [Agent Skills](https://agentskills.io)
- [Qué es OpenClaw (DataCamp)](https://www.datacamp.com/blog/what-is-openclaw)
- [ClawHub](https://github.com/openclaw/clawhub)
- [Agent Status Protocol (arXiv)](https://arxiv.org/pdf/2610.21538)
- [Open Face Protocol](https://openface.pages.dev/docs/protocol.html)
- [ADA](https://github.com/kuibu/ADA)
- [Chitin Presentation Protocol](https://chitin-net.pages.dev/protocol)
- [Anthropic aclara la prohibición (The Register)](https://www.theregister.com/2026/02/20/anthropic_clarifies_ban_third_party_claude_access)
- [Anthropic Bans Claude Subscription OAuth in Third-Party Apps (WinBuzzer)](https://winbuzzer.com/2026/02/19/anthropic-bans-claude-subscription-oauth-in-third-party-apps-xcxwbn/)
- [Anthropic reinstates third-party agent usage, with a catch (VentureBeat)](https://venturebeat.com/ai/anthropic-reinstates-openclaw-and-third-party-agent-usage-on-claude-subscriptions-with-a-catch/)
