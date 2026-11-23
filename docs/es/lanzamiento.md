# Plan de lanzamiento

Estado a 23 de noviembre de 2026. Lanzamiento en inglés primero, con Product Hunt como
escaparate y español desde el día 1 (`README.es.md`, `glimo.dev/es/`).

## Diagnóstico

| Pregunta                  | Respuesta                                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Qué es, en una línea      | Tus agentes de IA, de un vistazo: avatares vivos cuyo gesto es su estado real, y decides desde ahí                                                            |
| Para quién                | Quien usa varios agentes (Claude Code, Codex, Cursor, agentes propios) y no quiere abrir cada uno para saber cómo va                                          |
| Qué ola surfea            | Agentes por MCP y trabajo con varios agentes a la vez                                                                                                         |
| Qué es                    | Un protocolo pequeño (Glimo Spec) con su implementación de referencia. Hoy en un solo repositorio; se separa la spec cuando un proyecto externo la implemente |
| Con qué estándares encaja | MCP (servidor por HTTP y puente stdio), Agent Skills (`SKILL.md`), Agent Status Protocol (vocabulario)                                                        |
| Cómo gana dinero CooWeb   | Núcleo Apache-2.0. Fuera del repositorio: vitrinas alojadas con cifrado y equipos, soporte a empresas, plantillas de mundos                                   |
| Nombre                    | Glimo. Dominio `glimo.dev` activo; `glimo` libre en npm y PyPI el 23 de noviembre                                                                             |

## Qué está hecho y verificado

- `glimo.dev` en producción sobre Cloudflare: Worker con la web, la API, el canal en vivo
  (Durable Objects), D1 con Drizzle y el endpoint MCP.
- 110 pruebas unitarias y de Worker (7 s), 18 de navegador (15 s), prueba de humo (2 s) y
  28 sondas de seguridad, todas en verde contra producción.
- Carga: LCP 0,26 s en escritorio y 0,94 s en móvil con 4G lento y CPU ×4; CLS 0; un
  solo dominio, sin terceros.
- Animación: 60 fps estables con 28 glims; solo se animan propiedades compuestas.

## Auditoría del repositorio

| Punto                                                                                      | Estado                                                           |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Promesa en una línea en la primera pantalla                                                | ✓                                                                |
| Comando de instalación antes de la línea 30                                                | ✓ línea 26. Requiere publicar `glimo` en npm                     |
| Demo en la cabecera                                                                        | ✓ `docs/assets/demo.gif`, 17 s, del comando al resultado         |
| 4 a 6 insignias                                                                            | ✓ 4. La de npm se verá vacía hasta publicar                      |
| Tabla de compatibilidad                                                                    | ✓ con estado "MCP estándar". Falta verificar cliente por cliente |
| Licencia permisiva y negocio separado                                                      | ✓ Apache-2.0, `GOVERNANCE.md`                                    |
| CONTRIBUTING con política de IA, issue antes de features, tests, Conventional Commits, DCO | ✓                                                                |
| AGENTS.md con mapa, comandos y reglas                                                      | ✓ más `CLAUDE.md`                                                |
| SECURITY.md y código de conducta                                                           | ✓ El correo `hola@glimo.dev` aún no existe                       |
| Formularios de issue, plantilla de PR, CODEOWNERS, Dependabot                              | ✓                                                                |
| CI en cada PR                                                                              | ✓                                                                |
| Release automático con changelog                                                           | ✗ El changelog es manual por ahora                               |
| README en español                                                                          | ✓                                                                |
| Discord y X enlazados                                                                      | ✗ No existen todavía                                             |
| Integraciones como plugins fuera del núcleo                                                | ✓ Las skills viven en su carpeta y en repositorios propios       |
| Nombre verificado (marca, dominio, cuentas)                                                | Parcial: dominio, npm y PyPI sí; GitHub, X y EUIPO no            |
| Repositorio bajo la organización de CooWeb                                                 | ✗ Está en `lukchamo/glimo`                                       |

## Antes de lanzar, por orden de impacto

1. **Publicar en npm** `glimo`, `@glimo/spec` y `@glimo/glim` (reservar la organización
   `glimo`). Después, poner `cliPublished: true` en `apps/web/src/lib/site.ts` para que la
   web muestre `npx glimo@latest init`. Hasta entonces el comando principal del README falla.
2. **Mover el repositorio a la organización** (CooWeb o una propia `glimo`) y hacerlo
   público. Cambiar `lukchamo/glimo` en `site.ts`, los `package.json`, los README, `docs/`
   y `.github/`. Fusionar la rama en `main`.
3. **Verificar con los cinco clientes** (Claude Code, Codex, Cursor, Gemini CLI, OpenCode)
   y marcar cada fila de la tabla como verificada con su versión.
4. **Canales**: abrir Discord y la cuenta de X, activar Discussions y enlazarlos en los README.
5. **Correo** `hola@glimo.dev` con Email Routing (lo citan SECURITY y el código de conducta).
6. **GitHub**: activar el reporte privado de vulnerabilidades, el escaneo de secretos y
   las alertas de Dependabot.
7. **Marca**: búsqueda y registro de Glimo en la EUIPO a nombre de CooWeb.
8. **Puerta 1**: que 10 personas de fuera creen su vitrina y conecten un agente sin ayuda.
   Anotar dónde se atascan y arreglarlo antes del día del lanzamiento.

## Product Hunt

| Campo                | Propuesta                                                                                                                                                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nombre               | Glimo                                                                                                                                                                                                                      |
| Lema (60 caracteres) | Your AI agents, at a glance                                                                                                                                                                                                |
| Descripción (260)    | Glimo shows your AI agents as living avatars whose expression is their real status. See who is working, who is waiting for you and who got stuck, and approve from the same place. Open source, works with any MCP client. |
| Temas                | Open Source, Developer Tools, Artificial Intelligence                                                                                                                                                                      |
| Enlace principal     | `https://glimo.dev` (el playground crea una vitrina sin instalar nada)                                                                                                                                                     |
| Galería              | 1) `demo.gif` 2) la vitrina con los ocho estados 3) el móvil con una aprobación 4) el comando MCP 5) el playground                                                                                                         |
| Vídeo                | 30 s: un comando, aparece el glim, pide permiso, lo apruebas desde el móvil                                                                                                                                                |
| Primer comentario    | Por qué existe (mirar sin poder actuar genera ansiedad), qué es abierto (spec, glim, CLI, skills), qué falta (cifrado de extremo a extremo, mundo vivo) y qué feedback se busca                                            |

Día y gancho: lanzar pegado a una noticia del ecosistema (versión nueva de MCP o de un
agente de código) y a las 00:01 hora del Pacífico. El mismo día: Show HN, X, Reddit
(r/ClaudeAI, r/LocalLLaMA, r/mcp) y LinkedIn, en inglés y en español. No pedir estrellas ni
votos: enseñar la demo y responder.

## Plan de 90 días

| Fase                      | Qué                                                                                                                                          | Puerta                                                   |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Preparar (hasta el día 0) | Los ocho pendientes de arriba, vídeo de 30 s                                                                                                 | 10 personas de fuera lo usan sin ayuda                   |
| Lanzar (días 0 a 7)       | Product Hunt y el resto de canales el mismo día. Responder cada issue en menos de 24 h                                                       | Primer PR externo fusionado                              |
| Tracción (días 8 a 30)    | Tabla de compatibilidad verificada, galería de skills de la comunidad, release semanal con changelog y un vídeo corto, MCP App de la vitrina | 10 contribuidores externos con PR fusionado              |
| Comunidad (días 31 a 90)  | Cifrado de extremo a extremo con la frase de 12 palabras, mundo vivo, README en chino y portugués, vitrinas alojadas de pago                 | Spec 1.0 estable y un proyecto externo que la implemente |

## Métricas semanales

| Métrica                                      | Qué mide       | Referencia                                     |
| -------------------------------------------- | -------------- | ---------------------------------------------- |
| Vitrinas creadas y agentes que emiten estado | Adopción real  | Contar desde el día 1 (tabla `vitrinas` de D1) |
| Instalaciones en npm                         | Adopción       | `glimo`, `@glimo/glim`, `@glimo/spec`          |
| PRs fusionados por cada 1.000 estrellas      | Comunidad      | Objetivo por encima de 50                      |
| Forks entre estrellas                        | Uso del código | Sano a partir de 0,10                          |
| Tiempo a la primera respuesta en issues      | Salud          | Menos de 24 h durante el lanzamiento           |
| Estrellas por día                            | Atención       | Mediana de los repos de 2026: 525              |

La web no carga analítica de terceros. Las visitas se ven en la analítica de zona de
Cloudflare (lado servidor). Si se quiere Web Analytics, hay que permitirlo en la política
de seguridad de contenido y quitar `no-transform`: es una decisión, no un descuido.
