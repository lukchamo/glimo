# Glimo: documento de requisitos de producto (PRD)

| Campo            | Valor                                                        |
| ---------------- | ------------------------------------------------------------ |
| Versión          | 0.1 (borrador)                                               |
| Fecha            | 23 de noviembre de 2026                                      |
| Autor            | Luis Carlos Charris (CooWeb)                                 |
| Producto         | Glimo, motor open source de agentes con interfaz de avatares |
| Dominio          | glimo.dev (comprado en Cloudflare)                           |
| Lienzo de diseño | https://claude.ai/artifact/1uxMU24XS7LboqoeDiaPvu            |
| Estado           | Para revisión y arranque de construcción                     |

---

## 1. Resumen

Glimo es un motor open source que conecta agentes de IA por MCP (Model Context Protocol) y los muestra como **avatares vivos, los glims**, cuyo gesto cuenta su estado real. En lugar de abrir paneles, logs o terminales, la persona mira su **vitrina** y sabe en un segundo quién trabaja, quién la espera, quién está bloqueado y quién terminó, y puede actuar desde ahí (aprobar, responder, renovar un acceso, despertar).

Tres ideas lo hacen distinto:

1. **Un protocolo visual de estado.** Ocho estados con forma de ojos, color y señal propios, mapeados a Agent Status Protocol (ASP), y empaquetados en la **Glimo Spec**: un JSON pequeño que cualquier agente MCP puede emitir.
2. **Entrar en la cabeza de cada agente.** Cada glim tiene una vista desde dentro: lo que ve (su punto de vista), lo que piensa y lo que necesita de ti, en vista **Panel** o en vista **Inmersiva** tipo videojuego.
3. **Skills abiertas y publicables.** Las capacidades se empaquetan con el estándar abierto Agent Skills (SKILL.md) y se publican en una tienda pública con revisión de seguridad y firma.

Todo con **privacidad por diseño**: los datos se cifran en el dispositivo con una frase de 12 palabras que solo conoce la persona.

## 2. Problema

- Quien usa varios agentes no sabe qué está pasando sin entrar en cada uno. El estado está repartido entre terminales, correos, dashboards y notificaciones.
- Las herramientas actuales para ver agentes son de nicho: casi todas son solo para agentes de código (Claude Code, Codex), cerradas o de escritorio.
- Los protocolos de UI para agentes que existen (MCP Apps, A2UI, AG-UI) transportan interfaces, pero no definen qué significa "estado" ni cómo se ve.
- Los proyectos de avatares (AIRI, Open-LLM-VTuber) son compañeros de un solo personaje, no un panel de un equipo de agentes.
- Mirar sin poder actuar genera ansiedad: la crítica pública a herramientas tipo Pixel Agents es justo que muestran a los agentes sin dar control.
- La información de los agentes es sensible (correos, finanzas, clientes) y casi ninguna herramienta la cifra con una llave del usuario.

## 3. Visión y principios

**Visión:** que cualquier persona, técnica o no, vea y dirija a su equipo de agentes con la misma facilidad con la que mira a su equipo en una oficina.

Principios de producto (también de marca):

| Principio                        | Qué significa en la práctica                                                  |
| -------------------------------- | ----------------------------------------------------------------------------- |
| Un vistazo basta                 | El estado se entiende en un segundo, también en el móvil y en el reloj.       |
| Cada gesto es un dato            | Nada es decorativo: si el glim cambia, algo pasó en el agente.                |
| Actuar, no solo mirar            | Cada estado trae su acción principal a un toque.                              |
| Lo más cercano es lo más urgente | La interfaz ordena por lo que necesita a la persona, no por orden técnico.    |
| Privado por diseño               | Cifrado con la llave del usuario. Nadie en Glimo puede leer sus datos.        |
| Abierto por defecto              | Código, spec, mundos y skills que cualquiera puede usar, extender y publicar. |

## 4. Usuarios objetivo

| Perfil                                                                             | Necesidad principal                                                   | Cómo usa Glimo                                                |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------- |
| Fundador u operador de pyme con varios agentes (ventas, soporte, facturas, agenda) | Saber qué hacen sus agentes y aprobar lo importante sin perder tiempo | Vitrina en el móvil, notificaciones cuando un glim lo espera  |
| Persona desarrolladora de agentes y servidores MCP                                 | Dar a sus agentes una interfaz de estado sin construirla              | Emite Glimo Spec desde su agente, usa la vitrina o la MCP App |
| Equipo no técnico (ONG, administración, pyme)                                      | Entender y supervisar agentes sin leer logs                           | Mundo vivo, vista Panel, lenguaje llano                       |
| Creador de skills                                                                  | Que su skill la use mucha gente                                       | Publica con `glimo publish` en la tienda                      |

## 5. Propuesta de valor y diferenciación

| Lo que existe                              | Qué cubre                                                | Qué le falta y aporta Glimo                                                                   |
| ------------------------------------------ | -------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| MCP Apps (extensión oficial de MCP)        | Interfaces interactivas dentro de clientes MCP           | No define estado ni avatar. Glimo se apoya en ella para mostrarse en Claude, ChatGPT y otros. |
| A2UI y AG-UI                               | Interfaces generadas por agentes y transporte de eventos | Genéricos. Glimo añade el significado del estado y su representación.                         |
| Agent Status Protocol (borrador v0.1)      | Vocabulario de estados para sistemas multiagente         | No trata avatares ni representación visual. Glimo lo usa como entrada.                        |
| Open Face Protocol, ADA                    | Protocolos de cara o avatar para agentes                 | Muy tempranos, sin MCP ni equipo de agentes.                                                  |
| AIRI, Open-LLM-VTuber                      | Compañeros con avatar Live2D/VRM y MCP                   | Un solo personaje, sin vitrina de equipo ni skills públicas.                                  |
| Pixel Agents, PixelHQ, AgentsRoom, Agentfy | Visualizar agentes de código, estado en el móvil         | Solo código, mayormente cerrados, sin protocolo abierto.                                      |
| OpenClaw + ClawHub                         | Agente personal open source con registro de skills       | Sin capa visual de estado. Tuvo un ataque a su cadena de suministro vía skills.               |

Fuentes en `docs/01-investigacion-mercado.md`.

## 6. Alcance

### 6.1 MVP (v0.1)

1. Motor que conecta servidores MCP desde un `mcp.json` y crea agentes.
2. Glimo Spec v0.1 (estado, motivo, frase, acciones, punto de vista, pensamientos, urgencia).
3. Componente Glim con los 8 estados (web y móvil).
4. Vitrina web responsive (prioridad móvil) con acciones en hoja inferior.
5. Vista "Dentro de un glim" en modo Panel.
6. Alta con frase de cifrado de 12 palabras y cifrado local.
7. Conexión del cerebro: clave de API de Claude y modelo local. Plan de Claude vía crédito del Agent SDK si se confirma en la documentación oficial.
8. CLI: `npx glimo init` y `glimo connect`.
9. Web pública glimo.dev con la Home A.
10. Instalación de skills locales en formato SKILL.md.

### 6.2 Siguientes versiones (v0.2 y v0.3)

1. Mundo vivo (escena con actividades cotidianas e interacciones entre glims).
2. Vista Inmersiva tipo videojuego.
3. Mundos: Oficina, Jardín y Órbita, más plantillas propias (`world.json`).
4. Tienda pública de skills con `glimo publish`, revisión de seguridad y firma.
5. MCP App de la vitrina para clientes compatibles.
6. App móvil nativa con notificaciones push.
7. Sincronización cifrada entre dispositivos.

### 6.3 Futuro

1. **Acuerdos entre glimos:** compartir tu glimo con el de otras personas para que acuerden lugar, hora o gustos y decidan entre dos o tres (por ejemplo, por mayoría).
2. Reloj y pantallas de pared.
3. Mundos y skills de la comunidad con valoraciones.

### 6.4 Fuera de alcance por ahora

- Construir un modelo propio.
- Ejecutar agentes de terceros fuera de MCP.
- Recuperación de la frase de cifrado por parte de Glimo (no es posible por diseño).

## 7. Requisitos funcionales

### A. Motor (brain)

- **RF-A1** Leer un `mcp.json` con servidores MCP y listarlos.
- **RF-A2** Crear agentes, cada uno con nombre, servidores MCP permitidos, skills y cerebro.
- **RF-A3** Cada agente publica su estado en formato Glimo Spec en cada cambio relevante.
- **RF-A4** Recibir acciones de la persona (`approve`, `respond`, `open`, `pause`, `resume`, `retry`, `wake`, `undo`) y devolverlas al agente.
- **RF-A5** Ninguna acción con efecto externo (enviar, pagar, publicar, borrar) se ejecuta sin aprobación si la skill o la persona la marcan como sensible.
- **RF-A6** Registrar la conversación entre agentes cuando colaboran (por ejemplo, Agenda pasa a Correo la hora nueva).

### B. Sistema de estados

- **RF-B1** Ocho estados: `idle` (Listo), `thinking` (Pensando), `working` (Trabajando), `waiting` (Te espera), `blocked` (Bloqueado), `done` (Hecho), `tired` (Sin energía), `sleeping` (Durmiendo).
- **RF-B2** Cada estado tiene forma de ojos, color y señal propios. El estado nunca depende solo del color.
- **RF-B3** Mapeo a Agent Status Protocol definido en `docs/03-glimo-spec.md`.
- **RF-B4** Urgencia derivada: `high` (te espera, bloqueado), `mid` (hecho, sin energía), `low` (resto). La interfaz ordena y acerca por urgencia.

### C. Vitrina (móvil primero)

- **RF-C1** Resumen en una frase: "2 agentes te esperan" más el desglose ("2 trabajando, 1 bloqueado, 1 sin energía").
- **RF-C2** Rejilla de glims con nombre y estado. Al tocar uno se abre una hoja con qué quiere y sus dos acciones.
- **RF-C3** Selector de mundo.
- **RF-C4** Navegación: Vitrina, Skills, Mundos, Ajustes.

### D. Mundo vivo

- **RF-D1** Escena donde cada glim hace una actividad cotidiana coherente con su estado (escribir en el escritorio, tomar un café si está sin energía, dormir en el sofá, quedarse ante una puerta cerrada si está bloqueado).
- **RF-D2** Mostrar interacciones entre glims cuando colaboran (bocadillos entre ellos).
- **RF-D3** Columna "Ahora mismo" ordenada por urgencia.
- **RF-D4** Tocar un glim abre "Dentro de" ese glim.

### E. Dentro de un glim: vista Panel

- **RF-E1** **Lo que ve:** la pantalla o tarea que tiene delante, en qué se fija ahora y los elementos con su estado.
- **RF-E2** **Lo que piensa:** pensamientos en orden hasta el actual, guardados cifrados.
- **RF-E3** Herramientas MCP y skills que usa.
- **RF-E4** Acción principal y secundaria.
- **RF-E5** Selector Panel / Inmersiva.

### F. Dentro de un glim: vista Inmersiva

- **RF-F1** Espacio vacío en primera persona con información flotante.
- **RF-F2** La distancia indica prioridad: lo que necesita a la persona flota más cerca y resaltado; lo que no, se aleja.
- **RF-F3** Los demás glims se ven en el horizonte haciendo lo suyo, con sus interacciones. Se puede saltar a cualquiera.
- **RF-F4** Barra inferior tipo videojuego con todos los glims.
- **RF-F5** En móvil o con movimiento reducido, se muestra como lista apilada.

### G. Mundos

- **RF-G1** Mundos incluidos: Oficina, Jardín, Órbita.
- **RF-G2** Un mundo es una carpeta con `world.json`, fondo, objetos y lugar de cada glim, más una versión vertical para el móvil.
- **RF-G3** Cambiar de mundo no toca a los agentes, solo cómo se ven.

### H. Skills

- **RF-H1** Formato Agent Skills (carpeta con SKILL.md más scripts y referencias opcionales).
- **RF-H2** Cada skill declara qué servidores MCP necesita y qué estados y acciones puede producir (por ejemplo, "te espera para aprobar cada envío").
- **RF-H3** Tienda pública con búsqueda en lenguaje natural, categorías y filtros por conexión.
- **RF-H4** `glimo publish` con revisión de seguridad automática y firma con la cuenta del autor.
- **RF-H5** Instalar una skill pide confirmar los permisos que usa.

### I. Cerebro

- **RF-I1** Opciones: Claude con plan de pago (vía crédito del Agent SDK, a confirmar), Claude con clave de API, modelo local open source.
- **RF-I2** El cerebro se puede cambiar por agente.

### J. Privacidad y cifrado

- **RF-J1** En el alta se genera una frase de 12 palabras. La persona debe confirmar que la guardó y comprobar una palabra.
- **RF-J2** Datos, memorias y pensamientos se cifran en el dispositivo con una llave derivada de la frase.
- **RF-J3** La sincronización entre dispositivos solo mueve datos cifrados.
- **RF-J4** Glimo no guarda la frase ni puede recuperarla.
- **RF-J5** La interfaz explica con honestidad que, para pensar, el glim envía al modelo solo lo que cada tarea necesita (salvo con modelo local).

Detalle en `docs/05-privacidad-y-cifrado.md`.

### K. MCP App

- **RF-K1** La vitrina se ofrece como MCP App para que se vea dentro de clientes compatibles.

### L. CLI

- **RF-L1** `npx glimo init` crea la configuración y abre la vitrina.
- **RF-L2** `glimo connect ./mcp.json` conecta servidores.
- **RF-L3** `glimo publish <skill>` publica una skill.

### M. Notificaciones

- **RF-M1** Aviso push cuando un glim pasa a `waiting` o `blocked`, con acción directa.

### N. Acuerdos entre glimos (futuro)

- **RF-N1** Invitar a los glimos de otras personas a un acuerdo (por ejemplo, una cena).
- **RF-N2** Cada glimo comparte solo lo mínimo: huecos libres, zona y gustos. Nunca la agenda completa ni los correos.
- **RF-N3** Regla de decisión configurable (unanimidad o mayoría, por ejemplo 2 de 3).
- **RF-N4** Resultado con propuesta, votos y "Aceptar y añadir al calendario".

## 8. Requisitos no funcionales

| Área          | Requisito                                                                                                                                                                                                                                    |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rendimiento   | Animar solo `transform` y `opacity`. Redibujar por eventos, no en bucle. Pausar render con la pestaña oculta. Imágenes fijas para glims lejanos. Vista 2D en equipos lentos. Objetivo propuesto: 60 fps en la vista Inmersiva en escritorio. |
| Tiempo real   | Un único canal (WebSocket o SSE) por vitrina, con cambios incrementales.                                                                                                                                                                     |
| Accesibilidad | WCAG 2.1 AA. Contraste 4,5:1. Objetivos táctiles de 44 px o más. Respeta "reducir movimiento". Botones y enlaces reales.                                                                                                                     |
| Privacidad    | Servidor sin conocimiento de los datos (solo blobs cifrados).                                                                                                                                                                                |
| Seguridad     | Skills firmadas y revisadas. Permisos por acción. Aprobación obligatoria para acciones sensibles.                                                                                                                                            |
| Idioma        | Español primero, inglés después. Tono: compañero que avisa, no alarma.                                                                                                                                                                       |
| Open source   | Repositorio público, licencia por decidir (MIT o Apache-2.0).                                                                                                                                                                                |

## 9. Pantallas de referencia

Todas están en el lienzo y en `design/canvas/` (ver `docs/06-pantallas.md`):

- Marca, Sistema de estados, Componente Glim
- App móvil: la vitrina (interactiva)
- Home A: La vitrina · Home B: Mundos · Home C: Skills primero
- Mundo vivo y vista desde dentro (interactiva)
- Modo inmersivo (interactiva)
- Alta con frase de cifrado (interactiva)
- Glimos de acuerdo (futuro)

## 10. Arquitectura

Resumen en `docs/04-arquitectura.md`: motor MCP local o en la nube, Glimo Spec como contrato, clientes web y móvil, tienda de skills, y despliegue en Cloudflare para glimo.dev (`docs/07-despliegue-cloudflare.md`).

## 11. Métricas de éxito (propuestas)

| Métrica                 | Cómo se mide                                               | Objetivo                                   |
| ----------------------- | ---------------------------------------------------------- | ------------------------------------------ |
| Activación              | Tiempo desde `npx glimo init` hasta ver el primer glim     | [OBJETIVO, por ejemplo menos de 5 minutos] |
| Acción desde la vitrina | % de estados `waiting` resueltos sin salir de Glimo        | [OBJETIVO]                                 |
| Retención               | Personas que abren la vitrina 3 o más días por semana      | [OBJETIVO]                                 |
| Ecosistema              | Skills publicadas y agentes externos que emiten Glimo Spec | [OBJETIVO]                                 |
| Comunidad               | Estrellas, forks y contribuidores en GitHub                | [OBJETIVO]                                 |

## 12. Riesgos y mitigaciones

| Riesgo                                                                                                                 | Mitigación                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Cambios en la política de Anthropic sobre usar planes de Claude en apps de terceros (ha cambiado varias veces en 2026) | Ofrecer siempre API key y modelo local. Usar solo vías oficiales (Agent SDK). Revisar docs.claude.com antes de cada versión. |
| Ataques a la cadena de suministro vía skills (le pasó a ClawHub)                                                       | Revisión automática, firma, permisos explícitos, skills base auditadas.                                                      |
| La persona pierde la frase de cifrado                                                                                  | Paso de comprobación obligatorio, opción de imprimir, aviso claro. Estudiar recuperación social en el futuro.                |
| Expectativa de "todo cifrado" cuando el modelo procesa datos                                                           | Copy honesto en el alta y en ajustes. Opción de modelo local.                                                                |
| Competencia de protocolos (ASP, Open Face, ADA)                                                                        | No inventar vocabulario: usar ASP como entrada y aportar la capa visual y de acción.                                         |
| Rendimiento de la vista Inmersiva en móviles                                                                           | Vista Panel por defecto en móvil y versión 2D.                                                                               |
| Marca no registrada                                                                                                    | Búsqueda y registro en la EUIPO antes del lanzamiento.                                                                       |

## 13. Roadmap por fases

| Fase           | Contenido                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------- |
| 0. Marca y web | Registrar marca, publicar glimo.dev con la Home A, repositorio público con README y spec v0.1 |
| 1. MVP         | Motor + CLI + componente Glim + vitrina + Panel + cifrado + cerebro                           |
| 2. Experiencia | Mundo vivo, Inmersiva, mundos, app móvil, push, MCP App                                       |
| 3. Ecosistema  | Tienda de skills con `glimo publish`, mundos de la comunidad                                  |
| 4. Social      | Acuerdos entre glimos                                                                         |

## 14. Preguntas abiertas

1. Licencia: ¿MIT o Apache-2.0?
2. Entidad titular de la marca y del repositorio (Cooweb LLC o CooWeb Colombia SAS).
3. ¿Nombre propio para el protocolo ("Glimo Spec") o proponerlo como extensión de ASP?
4. Modelo de sostenibilidad: ¿hosting gestionado, tienda, soporte a empresas?
5. ¿Primer público: personas desarrolladoras (CLI) o pymes (app)?
6. Confirmar en docs.claude.com cómo autenticar el plan de Claude vía Agent SDK.

## 15. Glosario

- **Glim:** avatar de un agente. Su gesto es su estado.
- **Glimo:** el motor y la marca. También, el conjunto de glims de una persona.
- **Vitrina:** vista para ver a todos los glims de un vistazo.
- **Mundo:** escenario donde viven los glims (Oficina, Jardín, Órbita o propio).
- **Skill:** capacidad empaquetada en formato Agent Skills.
- **Glimo Spec:** JSON con el estado de un agente, lo que ve, lo que piensa y lo que necesita.
