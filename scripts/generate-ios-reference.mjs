import { writeFileSync } from 'node:fs';
import { GLOSSARY, GLOSSARY_FORMS } from '../lib/game/glossary.ts';
import { SCRIPTS, scriptRoles } from '../lib/game/types.ts';

writeFileSync('ios/Fearville/glossary.json', JSON.stringify({ terms: GLOSSARY, forms: GLOSSARY_FORMS }, null, 2) + '\n');
writeFileSync('ios/Fearville/roles.json', JSON.stringify(Object.keys(SCRIPTS).flatMap((script) => scriptRoles(script).map((r) => ({ ...r, script }))), null, 2) + '\n');
