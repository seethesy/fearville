// Export public authoring content only. Never loads saved tables or private state.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const cache = new Map();
// The review renderer keeps visible glossary text and omits decorative role icons.
const overrides = {
  'components/glossary-text.tsx': { GlossaryText: ({ text }) => text },
  'components/role-icon.tsx': { RoleIcon: () => null },
};
function load(file) {
  file = resolve(root, file);
  if (!extname(file))
    file = ['.ts', '.tsx', '.json'].map((x) => file + x).find(existsSync);
  if (!file) throw Error('Cannot resolve content module');
  const relative = file.slice(root.length + 1).replaceAll('\\', '/');
  if (overrides[relative]) return overrides[relative];
  if (cache.has(file)) return cache.get(file).exports;
  if (file.endsWith('.json')) return JSON.parse(readFileSync(file, 'utf8'));
  const module = { exports: {} };
  cache.set(file, module);
  const output = ts.transpileModule(readFileSync(file, 'utf8'), {
    fileName: file,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const localRequire = (spec) =>
    spec.startsWith('@/')
      ? load(spec.slice(2))
      : spec.startsWith('.')
        ? load(resolve(dirname(file), spec))
        : require(spec);
  new Function('require', 'module', 'exports', output)(
    localRequire,
    module,
    module.exports,
  );
  return module.exports;
}

const { GLOSSARY, GLOSSARY_FORMS, glossarySegments } = load(
  'lib/game/glossary.ts',
);
const { HOF_ROLES, HMS_ROLES } = load('lib/game/types/roles.ts');
const { ROLE_TIPS } = load('lib/game/role-tips.ts');
const { TUTORIALS } = load('lib/tutorials/content.ts');
const scripts = { horrors: HOF_ROLES, holyMoonStars: HMS_ROLES };
const header = (title) =>
  `# ${title}\n\nExported by \`npm run content:export\`. Public source text only; no runtime behavior changes.\n\nEdit these review copies directly and retain the IDs. Copy reviewed edits back to the named source before regenerating: rerunning replaces the review copies. Commit or save your edits first.\n\n`;
const write = (name, body) =>
  writeFileSync(resolve(root, 'docs/content-review', name + '.md'), body);
mkdirSync(resolve(root, 'docs/content-review'), { recursive: true });
const uses = new Map(GLOSSARY.map((t) => [t.id, []]));
for (const [script, roles] of Object.entries(scripts))
  for (const role of roles)
    for (const segment of glossarySegments(role.description))
      if (typeof segment !== 'string')
        uses.get(segment.id)?.push(`${script}/${role.id}`);
let glossary = header('Glossary review');
glossary +=
  'Source: `lib/game/glossary.ts`. Linked role text appears in `/rules`, the in-table Rules and Game flow views, and the role picker. Dynamic information and messages also use `GlossaryText`; their runtime contents are intentionally excluded.\n\n';
for (const term of GLOSSARY) {
  const linked = uses.get(term.id);
  const forms = Object.entries(GLOSSARY_FORMS)
    .filter(([, id]) => id === term.id)
    .map(([form]) => form);
  glossary += `## ${term.term} [glossary:${term.id}]\n\nVariants: ${forms.join(', ')}\n\n${term.definition}\n\n`;
  if (term.example) glossary += `Example: ${term.example}\n\n`;
  glossary += `Scripts: ${[...new Set(linked.map((x) => x.split('/')[0]))].join(', ') || 'none'}\n\nLinked from role IDs: ${linked.join(', ') || '**UNUSED in role descriptions**'}\n\n`;
}
glossary +=
  '## Possible missing definitions [gaps:undefined]\n\nHeuristic list of game vocabulary found in ability text without a matching glossary variant; Art should decide which need definitions. This is not an automatic claim that every noun needs an entry.\n\n';
const candidates = [
  'poisoned',
  'poison',
  'drunk',
  'drunkenness',
  'execute',
  'execution',
  'nominate',
  'nomination',
  'dead',
  'revive',
  'register',
  'alignment',
  'haunt',
  'horror',
  'traveler',
  'once per game',
];
for (const word of candidates) {
  const matches = Object.entries(scripts).flatMap(([script, roles]) =>
    roles
      .filter((r) => new RegExp(`\\b${word}\\b`, 'i').test(r.description))
      .map((r) => `${script}/${r.id}`),
  );
  if (matches.length && !GLOSSARY_FORMS[word])
    glossary += `- **${word}** [undefined:${word.replaceAll(' ', '-')}]: ${matches.join(', ')}\n`;
}
for (const [form, id] of Object.entries(GLOSSARY_FORMS))
  if (!uses.has(id)) glossary += `- **BROKEN variant** ${form} → ${id}\n`;
write('glossary', glossary);

let tips =
  header('Role abilities and tips review') +
  'Sources: `lib/game/types/roles.ts`, `lib/game/role-tips.json`. Script and role IDs are the mechanical mapping keys.\n\n';
for (const [script, roles] of Object.entries(scripts)) {
  tips += `## ${script}\n\n`;
  for (const role of roles) {
    const entries = ROLE_TIPS[script]?.[role.id] ?? [];
    tips += `### ${role.name} [role:${script}:${role.id}]\n\nTeam: ${role.team}\n\nAbility [${script}:${role.id}:description]: ${role.description}\n\n`;
    tips += entries.length
      ? entries
          .map((tip, i) => `- [${script}:${role.id}:tip:${i + 1}] ${tip}\n`)
          .join('')
      : '**MISSING TIPS** (coordinate with FEAR-29).\n';
    tips += '\n';
  }
}
write('role-tips', tips);

// Walk the actual React reference tree, so conditional sections, night order,
// interpolation, role text and guides remain in the same display order as the UI.
function markdown(node, path = 'rules') {
  if (node == null || typeof node === 'boolean') return '';
  if (Array.isArray(node))
    return node.map((n, i) => markdown(n, `${path}/${n?.key ?? i}`)).join('');
  if (typeof node !== 'object') return String(node).replace(/\s+/g, ' ');
  const { type, props } = node;
  if (typeof type === 'function')
    return markdown(type(props), `${path}/${type.name}`);
  const id = props.id ? `anchor:${props.id}` : path;
  if (type === 'img') return `\n[Diagram: ${props.alt}]\n`;
  const text = markdown(props.children, id);
  if (typeof type !== 'string') return text; // React fragments
  if (/^h[1-6]$/.test(type))
    return `\n\n${'#'.repeat(Math.min(6, Number(type[1]) + 1))} ${text.trim()} [${id}]\n\n`;
  if (type === 'li') return `\n- ${text.trim()}\n`;
  if (
    [
      'p',
      'article',
      'section',
      'div',
      'nav',
      'ol',
      'ul',
      'dl',
      'dd',
      'dt',
    ].includes(type)
  )
    return `\n${text}\n`;
  if (type === 'strong') return `**${text}**`;
  if (type === 'a') return `[${text}](${props.href}) `;
  return text;
}
const { RulesReference } = load('components/rules-reference.tsx');
let rules =
  header('Rules and how to play review') +
  'Source: `components/rules-reference.tsx`; Night Rite guides: `lib/tutorials/content/rite.ts`. Each script below renders the same component used by `/rules` and the table Rules tab, in display order. Diagram alternative text is included; artwork is not editable prose. IDs identify component/anchor/tree paths, with React keys retained.\n\n';
for (const script of Object.keys(scripts))
  rules +=
    `\n## ${script}\n\n` +
    markdown(
      RulesReference({
        script,
        riteGuides: ['board', 'grid', 'ritual', 'lab'],
      }),
      `rules:${script}`,
    ).replace(/\n{3,}/g, '\n\n');
write('rules', rules);
let tutorials =
  header('Tutorial review') +
  'Source: `lib/tutorials/content/`. Tutorial IDs and step numbers map directly to the ordered catalog. Includes legacy platform overrides for completeness.\n\n';
for (const t of TUTORIALS) {
  tutorials += `## ${t.title} [tutorial:${t.id}]\n\nKind: ${t.kind}; audience: ${t.audience}; platforms: ${(t.platforms ?? ['web', 'ios']).join(', ')}\n\nSummary: ${t.summary}\n\n`;
  t.steps.forEach((step, i) => {
    tutorials += `### ${step.title} [${t.id}:step:${i + 1}]\n\n${step.body}\n\n`;
    if (step.platforms)
      tutorials += `Platforms: ${step.platforms.join(', ')}\n\n`;
    if (step.ios)
      tutorials += `Legacy iOS override: ${JSON.stringify(step.ios)}\n\n`;
  });
}
write('tutorials', tutorials);
console.log(
  `Exported 4 review docs: ${GLOSSARY.length} terms, ${HOF_ROLES.length + HMS_ROLES.length} script-role entries, ${TUTORIALS.length} tutorials.`,
);
