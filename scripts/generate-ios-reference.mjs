import { UI_TEXT } from '../lib/ui-text/registry.ts';
import { writeFileSync } from 'node:fs';
import { GLOSSARY, GLOSSARY_FORMS } from '../lib/game/glossary.ts';
import { SCRIPTS, scriptRoles } from '../lib/game/types.ts';
import { iosCatalog } from '../lib/tutorials/ios.ts';

writeFileSync('ios/Fearville/glossary.json', JSON.stringify({ terms: GLOSSARY, forms: GLOSSARY_FORMS }, null, 2) + '\n');
writeFileSync('ios/Fearville/roles.json', JSON.stringify(Object.keys(SCRIPTS).flatMap((script) => scriptRoles(script).map((r) => ({ ...r, script }))), null, 2) + '\n');
writeFileSync('ios/Fearville/tutorials.json', JSON.stringify(iosCatalog(), null, 2) + '\n');

await (await import("node:fs/promises")).writeFile(new URL("../ios/Fearville/ui-text.json", import.meta.url), JSON.stringify(UI_TEXT,null,2)+"\n");
