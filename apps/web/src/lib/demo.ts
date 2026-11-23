// The example team shown on the home page. All of it is sample data: it never leaves
// the browser. A gentle script keeps the team busy so visitors see states change.

import type { GlimAction, GlimoStatus, GlimState, Locale } from '@glimo/spec';

type Line = Record<Locale, string>;

interface DemoAction {
  id: string;
  label: Line;
  kind: 'primary' | 'secondary';
  sensitive?: boolean;
}

export interface DemoStatus {
  state: GlimState;
  say: Line;
  actions?: DemoAction[];
}

interface DemoAgent {
  id: string;
  name: Line;
  initial: DemoStatus;
}

const act = (
  id: string,
  en: string,
  es: string,
  kind: DemoAction['kind'] = 'primary',
  sensitive = false,
): DemoAction => ({ id, label: { en, es }, kind, ...(sensitive ? { sensitive } : {}) });

const s = (state: GlimState, en: string, es: string, actions?: DemoAction[]): DemoStatus => ({
  state,
  say: { en, es },
  ...(actions ? { actions } : {}),
});

export const DEMO_AGENTS: DemoAgent[] = [
  {
    id: 'sales',
    name: { en: 'Sales', es: 'Ventas' },
    initial: s(
      'waiting',
      'It wants to send 12 follow-up emails.',
      'Quiere enviar 12 correos de seguimiento.',
      [
        act('approve', 'Approve sending', 'Aprobar envío', 'primary', true),
        act('open', 'See emails', 'Ver correos', 'secondary'),
      ],
    ),
  },
  {
    id: 'support',
    name: { en: 'Support', es: 'Soporte' },
    initial: s('working', 'It is on ticket 18 of 40.', 'Va por el ticket 18 de 40.', [
      act('open', 'See progress', 'Ver progreso'),
      act('pause', 'Pause', 'Pausar', 'secondary'),
    ]),
  },
  {
    id: 'invoices',
    name: { en: 'Invoices', es: 'Facturas' },
    initial: s(
      'tired',
      "It reached the bank API's daily limit. It continues at 00:00.",
      'Llegó al límite diario de la API del banco. Sigue a las 00:00.',
      [act('raise-limit', 'Review limits', 'Revisar límites')],
    ),
  },
  {
    id: 'calendar',
    name: { en: 'Calendar', es: 'Agenda' },
    initial: s(
      'done',
      'It moved 3 meetings to free your Thursday afternoon.',
      'Movió 3 reuniones para dejarte libre el jueves por la tarde.',
      [act('open', 'See changes', 'Ver cambios'), act('undo', 'Undo', 'Deshacer', 'secondary')],
    ),
  },
  {
    id: 'research',
    name: { en: 'Research', es: 'Research' },
    initial: s(
      'thinking',
      'It is planning how to compare 5 new tenders.',
      'Prepara un plan para comparar 5 licitaciones nuevas.',
      [act('open', 'See the plan', 'Ver el plan')],
    ),
  },
  {
    id: 'social',
    name: { en: 'Social', es: 'Redes' },
    initial: s(
      'working',
      "It is scheduling this week's posts on three accounts.",
      'Programa las publicaciones de la semana en tres cuentas.',
      [act('open', 'See calendar', 'Ver calendario'), act('pause', 'Pause', 'Pausar', 'secondary')],
    ),
  },
  {
    id: 'legal',
    name: { en: 'Legal', es: 'Legal' },
    initial: s(
      'sleeping',
      'It wakes up when a new contract reaches your inbox.',
      'Se despierta cuando llegue un contrato nuevo a tu correo.',
      [act('wake', 'Wake up', 'Despertar')],
    ),
  },
  {
    id: 'data',
    name: { en: 'Data', es: 'Datos' },
    initial: s(
      'blocked',
      'It lost access to the database: its credential expired.',
      'Perdió el acceso a la base de datos: la credencial caducó.',
      [
        act('renew-access', 'Renew access', 'Renovar acceso', 'primary', true),
        act('open', 'See the error', 'Ver error', 'secondary'),
      ],
    ),
  },
  {
    id: 'mail',
    name: { en: 'Mail', es: 'Correo' },
    initial: s(
      'waiting',
      'It has 2 drafts ready for you to review before sending.',
      'Tiene 2 borradores listos para que los revises antes de enviar.',
      [
        act('open', 'Review drafts', 'Revisar borradores'),
        act('pause', 'Later', 'Más tarde', 'secondary'),
      ],
    ),
  },
];

/** A loop of small, believable changes. [seconds since the previous step, agent, status] */
export const DEMO_SCRIPT: [number, string, DemoStatus][] = [
  [
    3.2,
    'research',
    s(
      'working',
      'It is reading the requirements of 5 tenders.',
      'Lee los requisitos de 5 licitaciones.',
      [act('open', 'See the plan', 'Ver el plan')],
    ),
  ],
  [
    3.4,
    'support',
    s('done', 'It closed 40 tickets this morning.', 'Cerró 40 tickets esta mañana.', [
      act('open', 'See the summary', 'Ver resumen'),
    ]),
  ],
  [
    3.0,
    'legal',
    s(
      'thinking',
      'A contract arrived. It is deciding what to check first.',
      'Llegó un contrato. Decide qué revisar primero.',
      [act('open', 'See the contract', 'Ver contrato')],
    ),
  ],
  [
    3.6,
    'social',
    s(
      'waiting',
      '3 posts need your OK before they go out.',
      '3 publicaciones necesitan tu visto bueno antes de salir.',
      [
        act('approve', 'Approve posts', 'Aprobar publicaciones', 'primary', true),
        act('open', 'See posts', 'Ver publicaciones', 'secondary'),
      ],
    ),
  ],
  [3.2, 'calendar', s('idle', 'Ready for the next change.', 'Listo para el próximo cambio.')],
  [
    3.4,
    'legal',
    s(
      'working',
      'It is checking the liability clauses.',
      'Revisa las cláusulas de responsabilidad.',
      [act('open', 'See progress', 'Ver progreso')],
    ),
  ],
  [
    3.0,
    'research',
    s(
      'done',
      'The NGO platform tender fits best. The comparison is ready.',
      'La licitación de la plataforma para ONG es la que más encaja. La comparación está lista.',
      [act('open', 'See the comparison', 'Ver comparación')],
    ),
  ],
  [
    3.6,
    'support',
    s(
      'working',
      'New tickets came in. It is on ticket 2 of 9.',
      'Entraron tickets nuevos. Va por el 2 de 9.',
      [act('open', 'See progress', 'Ver progreso'), act('pause', 'Pause', 'Pausar', 'secondary')],
    ),
  ],
  [
    3.2,
    'invoices',
    s(
      'working',
      'The limit was renewed. It is matching the last 48 movements.',
      'El límite se renovó. Concilia los últimos 48 movimientos.',
      [act('open', 'See progress', 'Ver progreso')],
    ),
  ],
  [
    3.4,
    'legal',
    s(
      'sleeping',
      'It wakes up when a new contract reaches your inbox.',
      'Se despierta cuando llegue un contrato nuevo a tu correo.',
      [act('wake', 'Wake up', 'Despertar')],
    ),
  ],
  [
    3.0,
    'calendar',
    s(
      'done',
      'It moved 3 meetings to free your Thursday afternoon.',
      'Movió 3 reuniones para dejarte libre el jueves por la tarde.',
      [act('open', 'See changes', 'Ver cambios'), act('undo', 'Undo', 'Deshacer', 'secondary')],
    ),
  ],
  [
    3.6,
    'research',
    s(
      'thinking',
      'It is planning how to compare 5 new tenders.',
      'Prepara un plan para comparar 5 licitaciones nuevas.',
      [act('open', 'See the plan', 'Ver el plan')],
    ),
  ],
  [
    3.2,
    'invoices',
    s(
      'tired',
      "It reached the bank API's daily limit. It continues at 00:00.",
      'Llegó al límite diario de la API del banco. Sigue a las 00:00.',
      [act('raise-limit', 'Review limits', 'Revisar límites')],
    ),
  ],
  [
    3.4,
    'social',
    s(
      'working',
      "It is scheduling this week's posts on three accounts.",
      'Programa las publicaciones de la semana en tres cuentas.',
      [act('open', 'See calendar', 'Ver calendario'), act('pause', 'Pause', 'Pausar', 'secondary')],
    ),
  ],
];

/** What an agent does after the person decides, in the demo: it gets on with it, then finishes. */
export const DEMO_AFTER: Record<string, [DemoStatus, DemoStatus]> = {
  'sales:approve': [
    s(
      'working',
      'Approved. It is sending the 12 emails.',
      'Aprobado. Está enviando los 12 correos.',
    ),
    s('done', '12 follow-up emails sent.', '12 correos de seguimiento enviados.', [
      act('open', 'See emails', 'Ver correos'),
    ]),
  ],
  'data:renew-access': [
    s(
      'working',
      'Access renewed. It is building the weekly report.',
      'Acceso renovado. Prepara el informe semanal.',
    ),
    s('done', 'The weekly sales report is ready.', 'El informe semanal de ventas está listo.', [
      act('open', 'See the report', 'Ver informe'),
    ]),
  ],
  'mail:open': [
    s(
      'working',
      'It is sending the 2 drafts you reviewed.',
      'Envía los 2 borradores que revisaste.',
    ),
    s('done', 'Both emails are sent.', 'Los dos correos están enviados.', [
      act('open', 'See emails', 'Ver correos'),
    ]),
  ],
  'social:approve': [
    s(
      'working',
      'Approved. It is scheduling the 3 posts.',
      'Aprobado. Programa las 3 publicaciones.',
    ),
    s('done', '3 posts scheduled for this week.', '3 publicaciones programadas para esta semana.', [
      act('open', 'See calendar', 'Ver calendario'),
    ]),
  ],
  'legal:wake': [
    s(
      'working',
      'Awake. It is checking the inbox for contracts.',
      'Despierto. Busca contratos en la bandeja.',
    ),
    s(
      'idle',
      'No new contracts. Ready when you are.',
      'No hay contratos nuevos. Listo cuando quieras.',
    ),
  ],
};

export function toStatus(
  agent: { id: string; name: Line },
  status: DemoStatus,
  locale: Locale,
  updatedAt: string,
): GlimoStatus {
  const actions: GlimAction[] | undefined = status.actions?.map((a) => ({
    id: a.id,
    label: a.label[locale],
    kind: a.kind,
    ...(a.sensitive ? { sensitive: true } : {}),
  }));
  return {
    spec: 'glimo/0.1',
    agent: { id: agent.id, name: agent.name[locale] },
    state: status.state,
    say: status.say[locale],
    ...(actions ? { actions } : {}),
    updatedAt,
  };
}

/** A fixed timestamp so the server render and the first client render agree. */
export const DEMO_EPOCH = '2026-11-23T10:30:00.000Z';
