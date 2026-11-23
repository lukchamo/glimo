// One place for everything that changes when the project moves (org, domain, npm).

export const SITE = {
  name: 'Glimo',
  origin: 'https://glimo.dev',
  repo: 'lukchamo/glimo',
  repoUrl: 'https://github.com/lukchamo/glimo',
  specUrl: 'https://github.com/lukchamo/glimo/blob/main/docs/spec.md',
  skillsUrl: 'https://github.com/lukchamo/glimo/tree/main/skills',
  /** Flip to true once the `glimo` package is on npm: the site then leads with `npx glimo`. */
  cliPublished: false,
} as const;

export const CREATE_COMMAND = SITE.cliPublished
  ? 'npx glimo@latest init'
  : `curl -X POST ${SITE.origin}/api/vitrinas`;

export const skillInstallCommand = (slug: string) => `npx skills add ${SITE.repo} --skill ${slug}`;
