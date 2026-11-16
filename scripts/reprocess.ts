import 'dotenv/config';
import { ne } from 'drizzle-orm';

import { db } from '@/lib/db';
import { resources } from '@/lib/db/schema/resources';
import { processDocument } from '@/lib/documents';

// Minden még fel nem dolgozott dokumentum (feltöltés és mentett jegyzet) feldolgozása, pl. embedding modell váltás után
async function main() {
  const pending = await db.select({ id: resources.id, fileName: resources.fileName }).from(resources).where(ne(resources.status, 'processed'));
  console.log(`Reprocessing ${pending.length} document(s)`);
  let failed = 0;
  for (const [i, doc] of pending.entries()) {
    try {
      await processDocument(doc.id);
    } catch (e) {
      failed++;
      console.error(`  ✗ ${doc.fileName ?? doc.id}: ${e instanceof Error ? e.message : e}`);
    }
    process.stdout.write(`\r  ${i + 1} / ${pending.length}`);
  }
  console.log(`\nDone: ${pending.length - failed} processed, ${failed} failed.`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
