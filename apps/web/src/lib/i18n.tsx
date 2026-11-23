// English first, Spanish second. Voice: a teammate who lets you know, never an alarm.
// First the agent, then what is going on. No emojis, no shouting capitals.

import type { GlimState, Locale } from '@glimo/spec';
import { createContext, useContext } from 'react';

const en = {
  meta: {
    homeTitle: 'Glimo: your agents, at a glance',
    homeDescription:
      'Open source engine that shows your AI agents as living avatars whose expression is their real status. See who is working, who is waiting for you and who got stuck. Works with any MCP client.',
    playgroundTitle: 'Playground · Glimo',
    playgroundDescription:
      'Try a glim, validate a Glimo Spec status, open a live vitrina and push states to it from curl or any MCP client.',
    vitrinaTitle: 'Vitrina · Glimo',
    notFoundTitle: 'Not found · Glimo',
  },
  nav: {
    home: 'Glimo, home',
    main: 'Main',
    footer: 'Footer',
    playground: 'Playground',
    skills: 'Skills',
    spec: 'Spec',
    github: 'GitHub',
    start: 'Get started',
    skip: 'Skip to content',
    otherLanguage: 'Español',
    otherLanguageLabel: 'Ver en español',
    pauseMotion: 'Pause motion',
    playMotion: 'Play motion',
  },
  hero: {
    title: 'All your agents, at a glance.',
    lead: 'Glimo connects your agents over MCP and turns them into living avatars that show their real status. See who is working, who is waiting for you and who got stuck, without opening a single dashboard.',
    open: 'Open the playground',
    copy: 'Copy',
    copied: 'Copied',
    commandLabel: 'Command to create a vitrina',
    note: 'Open source, Apache-2.0. Works with any MCP client.',
    github: 'View on GitHub',
    vitrinaLabel: 'Example vitrina',
    vitrinaTitle: 'My vitrina',
    pause: 'Pause demo',
    play: 'Play demo',
  },
  states: {
    title: 'How to read your vitrina',
    lead: 'Each glim changes its eyes, colour and signal with what your agent is doing. Eight states cover everything, from the first plan to the final result.',
    when: {
      idle: 'Connected, no task yet.',
      thinking: 'Got the task, making a plan.',
      working: 'Running tools or delegating.',
      waiting: 'Needs your approval or an answer.',
      blocked: 'Something failed or expired.',
      done: 'Finished, result is ready.',
      tired: 'Hit a rate limit or quota.',
      sleeping: 'Paused until something wakes it.',
    } satisfies Record<GlimState, string>,
  },
  steps: {
    title: 'From zero to vitrina in three steps',
    one: {
      title: 'Connect your agents',
      body: 'Glimo speaks MCP. Add it to Claude Code, Cursor, Codex or any MCP client, or post a status from any script with one request.',
      note: 'Three tools: status, action, vitrina',
    },
    two: {
      title: 'Pick a world',
      body: 'Office, garden or orbit. Change the stage without touching your agents: a world only changes how they look.',
    },
    three: {
      title: 'Share your skills',
      body: 'Package what your agent knows how to do as a SKILL.md, the open Agent Skills format, so anyone can install it.',
      note: 'Seven starter skills included',
    },
  },
  worlds: { office: 'Office', garden: 'Garden', orbit: 'Orbit', label: 'World' },
  skills: {
    title: 'Skills you can install today',
    lead: 'They use the open Agent Skills standard, so they also work in other compatible agents.',
    all: 'See all skills',
    needs: 'Needs',
    install: 'Copy install command',
    copied: 'Command copied',
  },
  spec: {
    title: "Glimo Spec: your agent's status, in one file",
    lead: 'A small JSON says how your agent is, what it needs and what you can do about it. It maps Agent Status Protocol values to eight visual states, and any agent that speaks MCP can emit it.',
    points: [
      'Works with any agent that speaks MCP.',
      'You decide which actions each agent offers.',
      'The same file shows on the web, on your phone and on a wall screen.',
    ],
    read: 'Read the spec',
    schema: 'JSON Schema',
    say: 'Wants to send 12 emails',
    approve: 'Approve sending',
  },
  principles: {
    title: 'Open by default, private by design',
    items: [
      {
        title: 'Act, do not just watch',
        body: 'Every state brings its main action one tap away. Anything that sends, pays, publishes or deletes always asks you first.',
      },
      {
        title: 'Private by design',
        body: 'What your agent sees and thinks never reaches this server in clear text. The hosted vitrina keeps a state, one short line and the actions.',
      },
      {
        title: 'Built on open standards',
        body: 'MCP to connect, Agent Skills to share, Agent Status Protocol for the vocabulary. Code, spec and skills are yours to use and extend.',
      },
    ],
    worksWith: 'Works with any MCP client',
  },
  final: {
    title: 'Open your vitrina in a minute',
    note: 'Free and open source. Your code, your agents, your data.',
  },
  footer: { by: 'An open project by CooWeb.' },
  sentence: {
    idle: '{name} is ready.',
    thinking: '{name} is thinking.',
    working: '{name} is working.',
    waiting: '{name} is waiting for you.',
    blocked: '{name} is blocked.',
    done: '{name} is done.',
    tired: '{name} ran out of energy.',
    sleeping: '{name} is sleeping.',
  } satisfies Record<GlimState, string>,
  vitrina: {
    agents: (n: number) => (n === 1 ? '1 agent' : `${n} agents`),
    waiting: (n: number) => (n === 1 ? '1 waiting for you' : `${n} waiting for you`),
    nothing: 'It needs nothing from you right now.',
    empty: 'No agents yet. Send the first status and its glim shows up here.',
    readOnly: 'Read-only view. Open it with your key to act.',
    confirm: 'The agent marked this as sensitive. Confirm to send it.',
    confirmCta: 'Confirm',
    cancel: 'Cancel',
    sent: '{action}: sent to {name}.',
    failed: 'Could not send it. Try again.',
    live: 'Live',
    connecting: 'Connecting',
    offline: 'Offline',
    rightNow: 'Right now',
    missing: 'This vitrina does not exist or has expired.',
    missingCta: 'Create a new one in the playground',
    noId: 'This address has no vitrina.',
    loading: 'Opening your vitrina',
    selectHint: 'Pick a glim to see what it wants.',
  },
  playground: {
    title: 'Playground',
    lead: 'Everything you need to try Glimo in a minute: poke a glim, validate a status, open a live vitrina and feed it from a terminal or any MCP client.',
    tabs: { lab: 'Glim lab', spec: 'Spec editor', live: 'Live vitrina', stress: 'Stress test' },
    lab: {
      title: 'Glim lab',
      lead: 'One component, eight states. Move the pointer around it, hover it, press it. Blinking, breathing and looking around never change the shape that carries the state.',
      state: 'State',
      size: 'Size',
      signal: 'Show the signal',
      alive: 'Alive',
      usage: 'Usage',
    },
    spec: {
      title: 'Spec editor',
      lead: 'Write a Glimo Spec status and see how it reads. The validator is the same one the server runs.',
      presets: 'Examples',
      valid: 'Valid Glimo Spec v0.1',
      invalid: 'Not valid yet',
      notJson: 'This is not valid JSON.',
      label: 'Status JSON',
    },
    live: {
      title: 'Live vitrina',
      lead: 'Create a hosted vitrina, then push states to it. Every screen that has it open updates through one WebSocket, with only what changed.',
      create: 'Create a vitrina',
      creating: 'Creating',
      again: 'Create another one',
      simulate: 'Simulate a team',
      stop: 'Stop the simulation',
      open: 'Open the live page',
      view: 'View address',
      key: 'Write key',
      keyNote:
        'The key is shown once and only its hash is stored. It stays in this browser. Whoever has the view address can watch; only the key can write or decide.',
      expires:
        'Hosted vitrinas are for trying things out: they are deleted after 7 days without activity. Do not send real data.',
      curl: 'Post a status with curl',
      mcp: 'Add it to Claude Code',
      mcpJson: 'Or to any MCP client (mcp.json)',
      latency: 'Last delivery',
      latencyHint: 'from request to screen',
      failed: 'Could not create the vitrina. Try again in a moment.',
      limited: 'Too many vitrinas from this address. Try again in a minute.',
    },
    stress: {
      title: 'Stress test',
      lead: 'How many living glims can your device animate? Each one blinks, breathes and follows the pointer, and every two seconds a few change state.',
      count: 'Glims',
      fps: 'frames per second',
      slow: 'slowest frame',
      run: 'Run',
      stop: 'Stop',
    },
  },
  notFound: {
    title: 'There is nothing at this address.',
    body: 'The page may have moved, or the vitrina may have expired.',
    home: 'Go to the home page',
  },
};

type Dict = typeof en;

const es: Dict = {
  meta: {
    homeTitle: 'Glimo: tus agentes, de un vistazo',
    homeDescription:
      'Motor open source que muestra a tus agentes de IA como avatares vivos cuyo gesto es su estado real. Mira quién trabaja, quién te espera y quién se atascó. Funciona con cualquier cliente MCP.',
    playgroundTitle: 'Playground · Glimo',
    playgroundDescription:
      'Prueba un glim, valida un estado de Glimo Spec, abre una vitrina en vivo y envíale estados desde curl o cualquier cliente MCP.',
    vitrinaTitle: 'Vitrina · Glimo',
    notFoundTitle: 'No encontrado · Glimo',
  },
  nav: {
    home: 'Glimo, inicio',
    main: 'Principal',
    footer: 'Pie',
    playground: 'Playground',
    skills: 'Skills',
    spec: 'Spec',
    github: 'GitHub',
    start: 'Empezar',
    skip: 'Saltar al contenido',
    otherLanguage: 'English',
    otherLanguageLabel: 'View in English',
    pauseMotion: 'Pausar movimiento',
    playMotion: 'Reanudar movimiento',
  },
  hero: {
    title: 'Todos tus agentes, de un vistazo.',
    lead: 'Glimo conecta tus agentes por MCP y los convierte en avatares vivos que muestran su estado real. Ves quién trabaja, quién te espera y quién se atascó sin abrir un solo panel.',
    open: 'Abrir el playground',
    copy: 'Copiar',
    copied: 'Copiado',
    commandLabel: 'Comando para crear una vitrina',
    note: 'Open source, Apache-2.0. Compatible con cualquier cliente MCP.',
    github: 'Ver en GitHub',
    vitrinaLabel: 'Vitrina de ejemplo',
    vitrinaTitle: 'Mi vitrina',
    pause: 'Pausar demo',
    play: 'Reanudar demo',
  },
  states: {
    title: 'Así se lee tu vitrina',
    lead: 'Cada glim cambia de ojos, color y señal según lo que hace tu agente. Ocho estados lo cubren todo, del primer plan al último resultado.',
    when: {
      idle: 'Conectado y sin tarea.',
      thinking: 'Recibió la tarea y arma el plan.',
      working: 'Ejecuta herramientas o delega.',
      waiting: 'Necesita tu aprobación o una respuesta.',
      blocked: 'Algo falló o caducó.',
      done: 'Terminó y dejó el resultado.',
      tired: 'Llegó a un límite de uso o de cuota.',
      sleeping: 'En pausa hasta que algo lo despierte.',
    },
  },
  steps: {
    title: 'De cero a vitrina en tres pasos',
    one: {
      title: 'Conecta tus agentes',
      body: 'Glimo habla MCP. Añádelo a Claude Code, Cursor, Codex o cualquier cliente MCP, o envía un estado desde cualquier script con una sola petición.',
      note: 'Tres herramientas: estado, acción, vitrina',
    },
    two: {
      title: 'Elige un mundo',
      body: 'Oficina, jardín u órbita. Cambia el escenario sin tocar a tus agentes: un mundo solo cambia cómo se ven.',
    },
    three: {
      title: 'Comparte tus skills',
      body: 'Empaqueta lo que tu agente sabe hacer en un SKILL.md, el formato abierto Agent Skills, para que cualquiera lo instale.',
      note: 'Siete skills de inicio incluidas',
    },
  },
  worlds: { office: 'Oficina', garden: 'Jardín', orbit: 'Órbita', label: 'Mundo' },
  skills: {
    title: 'Skills para instalar hoy',
    lead: 'Usan el estándar abierto Agent Skills, así que también funcionan en otros agentes compatibles.',
    all: 'Ver todas las skills',
    needs: 'Necesita',
    install: 'Copiar comando de instalación',
    copied: 'Comando copiado',
  },
  spec: {
    title: 'Glimo Spec: el estado de tu agente, en un archivo',
    lead: 'Un JSON pequeño dice cómo está tu agente, qué necesita y qué puedes hacer. Traduce los valores de Agent Status Protocol a ocho estados visuales, y cualquier agente que hable MCP puede emitirlo.',
    points: [
      'Funciona con cualquier agente que hable MCP.',
      'Tú decides qué acciones ofrece cada agente.',
      'Un mismo archivo se ve en la web, el móvil y una pantalla de pared.',
    ],
    read: 'Leer la spec',
    schema: 'JSON Schema',
    say: 'Quiere enviar 12 correos',
    approve: 'Aprobar envío',
  },
  principles: {
    title: 'Abierto por defecto, privado por diseño',
    items: [
      {
        title: 'Actuar, no solo mirar',
        body: 'Cada estado trae su acción principal a un toque. Todo lo que envía, paga, publica o borra siempre te pregunta antes.',
      },
      {
        title: 'Privado por diseño',
        body: 'Lo que tu agente ve y piensa nunca llega a este servidor en claro. La vitrina alojada guarda un estado, una frase corta y las acciones.',
      },
      {
        title: 'Sobre estándares abiertos',
        body: 'MCP para conectar, Agent Skills para compartir, Agent Status Protocol para el vocabulario. Código, spec y skills son tuyos para usar y extender.',
      },
    ],
    worksWith: 'Funciona con cualquier cliente MCP',
  },
  final: {
    title: 'Abre tu vitrina en un minuto',
    note: 'Gratis y open source. Tu código, tus agentes, tus datos.',
  },
  footer: { by: 'Un proyecto abierto de CooWeb.' },
  sentence: {
    idle: '{name} está listo.',
    thinking: '{name} está pensando.',
    working: '{name} está trabajando.',
    waiting: '{name} te espera.',
    blocked: '{name} está bloqueado.',
    done: '{name} terminó.',
    tired: '{name} se quedó sin energía.',
    sleeping: '{name} está durmiendo.',
  },
  vitrina: {
    agents: (n: number) => (n === 1 ? '1 agente' : `${n} agentes`),
    waiting: (n: number) => (n === 1 ? '1 te espera' : `${n} te esperan`),
    nothing: 'No necesita nada de ti ahora.',
    empty: 'Aún no hay agentes. Envía el primer estado y su glim aparece aquí.',
    readOnly: 'Vista de solo lectura. Ábrela con tu llave para actuar.',
    confirm: 'El agente marcó esto como sensible. Confirma para enviarlo.',
    confirmCta: 'Confirmar',
    cancel: 'Cancelar',
    sent: '{action}: enviado a {name}.',
    failed: 'No se pudo enviar. Inténtalo de nuevo.',
    live: 'En vivo',
    connecting: 'Conectando',
    offline: 'Sin conexión',
    rightNow: 'Ahora mismo',
    missing: 'Esta vitrina no existe o ha caducado.',
    missingCta: 'Crear una nueva en el playground',
    noId: 'Esta dirección no tiene vitrina.',
    loading: 'Abriendo tu vitrina',
    selectHint: 'Elige un glim para ver qué quiere.',
  },
  playground: {
    title: 'Playground',
    lead: 'Todo lo necesario para probar Glimo en un minuto: toca un glim, valida un estado, abre una vitrina en vivo y aliméntala desde una terminal o cualquier cliente MCP.',
    tabs: {
      lab: 'Laboratorio',
      spec: 'Editor de spec',
      live: 'Vitrina en vivo',
      stress: 'Prueba de carga',
    },
    lab: {
      title: 'Laboratorio de glims',
      lead: 'Un componente, ocho estados. Mueve el puntero a su alrededor, pásale por encima, púlsalo. Parpadear, respirar y mirar nunca cambian la forma que lleva el estado.',
      state: 'Estado',
      size: 'Tamaño',
      signal: 'Mostrar la señal',
      alive: 'Vivo',
      usage: 'Uso',
    },
    spec: {
      title: 'Editor de spec',
      lead: 'Escribe un estado de Glimo Spec y mira cómo se lee. El validador es el mismo que usa el servidor.',
      presets: 'Ejemplos',
      valid: 'Glimo Spec v0.1 válido',
      invalid: 'Aún no es válido',
      notJson: 'Esto no es JSON válido.',
      label: 'JSON del estado',
    },
    live: {
      title: 'Vitrina en vivo',
      lead: 'Crea una vitrina alojada y envíale estados. Cada pantalla que la tenga abierta se actualiza por un único WebSocket, solo con lo que cambió.',
      create: 'Crear una vitrina',
      creating: 'Creando',
      again: 'Crear otra',
      simulate: 'Simular un equipo',
      stop: 'Parar la simulación',
      open: 'Abrir la página en vivo',
      view: 'Dirección de vista',
      key: 'Llave de escritura',
      keyNote:
        'La llave se muestra una vez y solo se guarda su hash. Se queda en este navegador. Quien tenga la dirección de vista puede mirar; solo la llave puede escribir o decidir.',
      expires:
        'Las vitrinas alojadas son para probar: se borran tras 7 días sin actividad. No envíes datos reales.',
      curl: 'Enviar un estado con curl',
      mcp: 'Añadirla a Claude Code',
      mcpJson: 'O a cualquier cliente MCP (mcp.json)',
      latency: 'Última entrega',
      latencyHint: 'de la petición a la pantalla',
      failed: 'No se pudo crear la vitrina. Inténtalo en un momento.',
      limited: 'Demasiadas vitrinas desde esta dirección. Inténtalo en un minuto.',
    },
    stress: {
      title: 'Prueba de carga',
      lead: '¿Cuántos glims vivos puede animar tu dispositivo? Cada uno parpadea, respira y sigue al puntero, y cada dos segundos unos cuantos cambian de estado.',
      count: 'Glims',
      fps: 'fotogramas por segundo',
      slow: 'fotograma más lento',
      run: 'Iniciar',
      stop: 'Parar',
    },
  },
  notFound: {
    title: 'No hay nada en esta dirección.',
    body: 'Puede que la página se haya movido o que la vitrina haya caducado.',
    home: 'Ir al inicio',
  },
};

export const COPY: Record<Locale, Dict> = { en, es };

export const LocaleContext = createContext<Locale>('en');

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function useCopy(): Dict {
  return COPY[useContext(LocaleContext)];
}

export function sentence(locale: Locale, name: string, state: GlimState): string {
  return COPY[locale].sentence[state].replace('{name}', name);
}

/** Path of the same page in a locale: English lives at /, Spanish under /es. */
export function localePath(locale: Locale, path: string): string {
  const clean = path.replace(/^\/es(?=\/|$)/, '') || '/';
  if (locale === 'en') return clean;
  return clean === '/' ? '/es/' : `/es${clean}`;
}

export function localeOf(pathname: string): Locale {
  return /^\/es(\/|$)/.test(pathname) ? 'es' : 'en';
}

export type { Locale };
