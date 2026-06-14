// Grant admin access via a Firebase custom claim (admin:true) instead of
// matching on email in firestore.rules. The app signs users in with
// email/password and never verifies the address, so an email claim is just an
// unverified string — a stranger could register an admin's email and inherit
// admin. A custom claim is set only here (Admin SDK) and cannot be forged by a
// client, so the email never matters again.
//
// Claims take effect on the user's NEXT token refresh, so each admin must log
// out and back in (or the app calls getIdToken(true)) before the new
// firestore.rules `request.auth.token.admin == true` check passes for them.
//
// Order of operations when rolling this out (do NOT reorder — step 3 before
// step 1/2 locks the admins out):
//   1. npx tsx scripts/setAdminClaims.ts            # dry run — lists targets
//   2. npx tsx scripts/setAdminClaims.ts --apply    # set the claims
//   3. both admins log out and log back in           # refresh their tokens
//   4. npx tsx scripts/deployFirestoreRules.ts       # publish the new rule
//   5. confirm the admin dashboard still loads
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

import { getFirebaseAdmin } from '../backend/lib/firebaseAdmin';

// The accounts that should hold admin. Keep in sync with whoever needs the
// admin dashboard; re-run with --apply after editing.
const ADMIN_EMAILS = ['hanaa5qn@gmail.com', 'yubndaayubnda@gmail.com'];

const APPLY = process.argv.includes('--apply');

async function main() {
  const admin = getFirebaseAdmin();
  if (!admin) {
    console.error('Firebase Admin not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON (or the trio) in .env.');
    process.exit(1);
  }

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — admin:true for ${ADMIN_EMAILS.length} account(s).\n`);

  let failures = 0;
  for (const email of ADMIN_EMAILS) {
    try {
      const user = await admin.auth.getUserByEmail(email);
      const already = user.customClaims?.admin === true;
      if (already) {
        console.log(`  = ${email} (${user.uid}) already admin:true — skipping`);
        continue;
      }

      if (!APPLY) {
        console.log(`  + ${email} (${user.uid}) would be granted admin:true`);
        continue;
      }

      // Merge so we never clobber any other claims the account may carry.
      await admin.auth.setCustomUserClaims(user.uid, { ...(user.customClaims ?? {}), admin: true });
      console.log(`  ✓ ${email} (${user.uid}) granted admin:true`);
    } catch (err) {
      failures++;
      const code = (err as { code?: string })?.code ?? '';
      if (code === 'auth/user-not-found') {
        console.error(`  ✗ ${email}: NO ACCOUNT — this person must sign in to the app at least once first.`);
      } else {
        console.error(`  ✗ ${email}: ${(err as Error)?.message || err}`);
      }
    }
  }

  if (APPLY) {
    console.log('\nDone. Remind each admin to LOG OUT and LOG BACK IN so their token picks up the claim,');
    console.log('then deploy the rules: npx tsx scripts/deployFirestoreRules.ts');
  } else {
    console.log('\nDry run only. Re-run with --apply to set the claims.');
  }

  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error('SET ADMIN CLAIMS FAILED:', err?.message || err);
  process.exit(1);
});
