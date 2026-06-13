// One-off smoke test: creates a 100₮ Byl checkout to prove the token and
// project id work, then prints only non-secret fields. Run: npx tsx scripts/bylSmokeTest.ts
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

import { createBylCheckout, getBylCheckout, getBylConfigState } from '../backend/lib/payments/byl';

async function main() {
  const state = getBylConfigState();
  console.log('config:', JSON.stringify(state));
  if (!state.configured) process.exit(1);

  const checkout = await createBylCheckout({
    amountMnt: 100,
    itemName: 'Vivid Lingua smoke test',
    clientReferenceId: `vl_smoke_${Date.now()}`,
  });
  console.log('created checkout id:', checkout.id, '| url:', checkout.url, '| status:', checkout.status);

  const fetched = await getBylCheckout(String(checkout.id));
  console.log('fetched status:', fetched.status, '| amount_total:', fetched.amount_total);
}

main().catch((err) => {
  console.error('SMOKE TEST FAILED:', err?.message || err);
  process.exit(1);
});
