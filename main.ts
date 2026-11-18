// Solmar Heat — make.fun entrypoint.
// Copies game/ and screenshots/ into the output directory and writes the
// dossier with the kit's own library, so the gate can rebuild it byte
// for byte. Runs on Node 22+, standard library only, no network.

import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outputDir, { recursive: true });
for (const dir of ['game', 'screenshots']) {
  const dest = join(outputDir, dir);
  rmSync(dest, { recursive: true, force: true });
  cpSync(join(repoRoot, dir), dest, { recursive: true });
}

// The same caps the bounty's scorer builds the dossier with.
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163_840,
  screenshots: { max: 4, max_bytes: 262_144 },
  game_max_files: 993,
  game_max_bytes: 48 * 1024 * 1024,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
console.log(`Solmar Heat: wrote dossier.json (${dossier.length} bytes) to ${outputDir}`);
