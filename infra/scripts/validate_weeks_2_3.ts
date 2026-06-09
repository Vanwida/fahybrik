// Validate every prescription_json the builder emits against the SHIPPED Zod
// schema (@fahybrid/shared/domain/prescription). Reads prescriptions from a JSON
// array on stdin. Exits non-zero if any fails. No DB.
import { prescriptionSchema } from '@fahybrid/shared/domain/prescription';

const raw = await new Response(process.stdin as unknown as ReadableStream).text();
const items: { id: number; label: string; prescription: unknown }[] = JSON.parse(raw);

let fail = 0;
for (const it of items) {
  const r = prescriptionSchema.safeParse(it.prescription);
  if (!r.success) {
    fail++;
    console.error(`FAIL [${it.label}]:`, JSON.stringify(it.prescription));
    console.error('  ->', r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  }
}
console.log(`Validated ${items.length} prescriptions. ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
