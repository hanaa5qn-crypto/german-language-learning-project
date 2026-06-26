import type { Express, Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import {
  firebaseAdminMissingMessage,
  getFirebaseAdmin,
  verifyFirebaseAdmin,
  verifyFirebaseBearer,
} from '../lib/firebaseAdmin';
import {
  parsePercent,
  parseTeacherName,
  parseTeacherCodeId,
  type TeacherCode,
  type UserPromo,
} from '../lib/promo';

// =============================================================================
// Багшийн promo / affiliate API.
//   - Admin: код үүсгэх / жагсаах / идэвх асаах-унтраах (custom claim шаардана).
//   - Сурагч: кодоо холбох (redeem). Хямдрал нь ЭХНИЙ төлбөр дээр payments.ts-д
//     тооцогдоно; 100% код бол checkout үнэгүй идэвхжинэ.
//
// Бүх бичилт Admin SDK-ээр хийгдэх тул `teacherCodes` / `commissions` цуглуулга
// firestore.rules дээр зөвхөн admin-д уншигдана (клиент шууд хандахгүй).
// =============================================================================

type Admin = NonNullable<ReturnType<typeof getFirebaseAdmin>>;

// Admin байгаа эсэх + admin claim шалгана.
async function requireAdminCtx(req: Request, res: Response): Promise<{ admin: Admin; uid: string } | null> {
  const admin = getFirebaseAdmin();
  if (!admin) {
    res.status(503).json({ error: firebaseAdminMissingMessage() });
    return null;
  }
  const decoded = await verifyFirebaseAdmin(req);
  if (!decoded) {
    res.status(403).json({ error: 'Admin эрх шаардлагатай.' });
    return null;
  }
  return { admin, uid: decoded.uid };
}

// Сурагчийн нэвтрэлт шалгана.
async function requireUserCtx(req: Request, res: Response): Promise<{ admin: Admin; uid: string; email: string } | null> {
  const admin = getFirebaseAdmin();
  if (!admin) {
    res.status(503).json({ error: firebaseAdminMissingMessage() });
    return null;
  }
  const user = await verifyFirebaseBearer(req);
  if (!user) {
    res.status(401).json({ error: 'Дахин нэвтэрсний дараа үргэлжлүүлнэ үү.' });
    return null;
  }
  return { admin, uid: user.uid, email: user.email ?? '' };
}

// teacherCodes баримтыг dashboard-д харагдах хэлбэрт хөрвүүлнэ.
function teacherCodePayload(code: string, data: Record<string, unknown>) {
  return {
    code,
    teacherName: String(data.teacherName ?? ''),
    teacherContact: String(data.teacherContact ?? ''),
    discountPercent: Number(data.discountPercent ?? 0),
    commissionPercent: Number(data.commissionPercent ?? 0),
    active: data.active !== false,
    createdAt: String(data.createdAt ?? ''),
    redeemCount: Number(data.redeemCount ?? 0),
    paidConversions: Number(data.paidConversions ?? 0),
    commissionAccruedCents: Number(data.commissionAccruedCents ?? 0),
  };
}

export function registerPromoRoute(app: Express) {
  // --- Admin: шинэ багшийн код үүсгэх -------------------------------------------
  app.post('/api/admin/teacher-codes', async (req: Request, res: Response) => {
    const ctx = await requireAdminCtx(req, res);
    if (!ctx) return;
    const { admin, uid } = ctx;

    const code = parseTeacherCodeId(req.body?.code);
    const teacherName = parseTeacherName(req.body?.teacherName);
    const discountPercent = parsePercent(req.body?.discountPercent);
    const commissionPercent = parsePercent(req.body?.commissionPercent);
    const teacherContact = String(req.body?.teacherContact ?? '').trim().slice(0, 120);

    if (!code) return res.status(400).json({ error: 'Код буруу байна (дор хаяж 3 үсэг/тоо).' });
    if (!teacherName) return res.status(400).json({ error: 'Багшийн нэр шаардлагатай.' });
    if (discountPercent === null) return res.status(400).json({ error: 'Хямдралын хувь 0–100 байх ёстой.' });
    if (commissionPercent === null) return res.status(400).json({ error: 'Комиссын хувь 0–100 байх ёстой.' });

    const doc: TeacherCode = {
      teacherName,
      ...(teacherContact ? { teacherContact } : {}),
      discountPercent,
      commissionPercent,
      active: true,
      createdAt: new Date().toISOString(),
      createdBy: uid,
      redeemCount: 0,
      paidConversions: 0,
      commissionAccruedCents: 0,
    };

    try {
      // create нь atomic — давхар код байвал алдаа өгнө.
      await admin.db.collection('teacherCodes').doc(code).create(doc);
    } catch {
      return res.status(409).json({ error: 'Энэ код аль хэдийн бүртгэгдсэн байна.' });
    }

    return res.status(201).json({ code, ...teacherCodePayload(code, doc as unknown as Record<string, unknown>) });
  });

  // --- Admin: бүх код + статистик жагсаах --------------------------------------
  app.get('/api/admin/teacher-codes', async (req: Request, res: Response) => {
    const ctx = await requireAdminCtx(req, res);
    if (!ctx) return;
    const { admin } = ctx;

    const snap = await admin.db.collection('teacherCodes').get();
    const codes = snap.docs
      .map((d) => teacherCodePayload(d.id, d.data() as Record<string, unknown>))
      .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
    return res.json({ codes });
  });

  // --- Admin: идэвх асаах/унтраах ----------------------------------------------
  app.patch('/api/admin/teacher-codes/:code', async (req: Request, res: Response) => {
    const ctx = await requireAdminCtx(req, res);
    if (!ctx) return;
    const { admin } = ctx;

    const code = parseTeacherCodeId(req.params.code);
    if (!code) return res.status(400).json({ error: 'Код буруу байна.' });

    const ref = admin.db.collection('teacherCodes').doc(code);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Код олдсонгүй.' });

    const update: Record<string, unknown> = {};
    if (typeof req.body?.active === 'boolean') update.active = req.body.active;
    const discount = parsePercent(req.body?.discountPercent);
    if (req.body?.discountPercent !== undefined && discount !== null) update.discountPercent = discount;
    const commission = parsePercent(req.body?.commissionPercent);
    if (req.body?.commissionPercent !== undefined && commission !== null) update.commissionPercent = commission;
    if (Object.keys(update).length === 0) return res.status(400).json({ error: 'Шинэчлэх талбар алга.' });

    await ref.set(update, { merge: true });
    const next = await ref.get();
    return res.json(teacherCodePayload(code, next.data() as Record<string, unknown>));
  });

  // --- Admin: кодыг бүрмөсөн устгах ---------------------------------------------
  // Устгасны дараа redeem нь 404 өгнө — ШИНЭЭР хэн ч холбож чадахгүй. Аль хэдийн
  // холбосон сурагчид өөрсдийн promo snapshot-оороо эхний төлбөрийн хямдралаа
  // хэвээр авна (буцаан хураахгүй).
  app.delete('/api/admin/teacher-codes/:code', async (req: Request, res: Response) => {
    const ctx = await requireAdminCtx(req, res);
    if (!ctx) return;
    const { admin } = ctx;

    const code = parseTeacherCodeId(req.params.code);
    if (!code) return res.status(400).json({ error: 'Код буруу байна.' });

    const ref = admin.db.collection('teacherCodes').doc(code);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Код олдсонгүй.' });

    await ref.delete();
    return res.json({ deleted: true, code });
  });

  // --- Сурагч: багшийн кодоо холбох (нэг л удаа, давхцахгүй) --------------------
  app.post('/api/promo/redeem', async (req: Request, res: Response) => {
    const ctx = await requireUserCtx(req, res);
    if (!ctx) return;
    const { admin, uid } = ctx;

    const code = parseTeacherCodeId(req.body?.code);
    if (!code) return res.status(400).json({ error: 'Promo код буруу байна.' });

    const codeSnap = await admin.db.collection('teacherCodes').doc(code).get();
    if (!codeSnap.exists) return res.status(404).json({ error: 'Promo код олдсонгүй.' });
    const codeData = codeSnap.data() as TeacherCode;
    if (codeData.active === false) return res.status(400).json({ error: 'Энэ promo код идэвхгүй байна.' });

    try {
      const outcome = await admin.db.runTransaction(async (tx) => {
        const userRef = admin.db.collection('users').doc(uid);
        const userSnap = await tx.get(userRef);
        const me = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : {};

        // Давхцахгүй: аль хэдийн promo эсвэл referral авсан бол шинийг олгохгүй.
        if (me.promo && typeof me.promo === 'object') {
          const existing = me.promo as UserPromo;
          return { ok: false as const, reason: existing.code === code ? 'already-this' : 'has-promo' };
        }
        if (typeof me.referredBy === 'string' && me.referredBy) {
          return { ok: false as const, reason: 'has-referral' };
        }

        const promo: UserPromo = {
          code,
          teacherName: codeData.teacherName ?? '',
          discountPercent: Number(codeData.discountPercent ?? 0),
          commissionPercent: Number(codeData.commissionPercent ?? 0),
          firstPaymentDone: false,
        };
        tx.set(userRef, { promo }, { merge: true });
        tx.set(admin.db.collection('teacherCodes').doc(code), {
          redeemCount: FieldValue.increment(1),
        }, { merge: true });
        return { ok: true as const, promo };
      });

      if (!outcome.ok) {
        if (outcome.reason === 'already-this') {
          return res.json({ redeemed: false, already: true });
        }
        return res.status(409).json({
          error: 'Та аль хэдийн нэг promo/урилга ашигласан байна. Давхар хэрэглэх боломжгүй.',
        });
      }
      return res.json({
        redeemed: true,
        discountPercent: outcome.promo.discountPercent,
        teacherName: outcome.promo.teacherName,
      });
    } catch (err) {
      console.error('Promo redeem failed:', err);
      return res.status(502).json({ error: 'Promo кодыг бүртгэж чадсангүй.' });
    }
  });

  // --- Сурагч: одоогийн promo-гийн төлөв (paywall дээр харуулахад) --------------
  app.get('/api/promo/me', async (req: Request, res: Response) => {
    const ctx = await requireUserCtx(req, res);
    if (!ctx) return;
    const { admin, uid } = ctx;

    const snap = await admin.db.collection('users').doc(uid).get();
    const promo = snap.exists ? (snap.data() as Record<string, unknown>).promo : null;
    if (!promo || typeof promo !== 'object') return res.json({ promo: null });
    const p = promo as UserPromo;
    return res.json({
      promo: {
        code: p.code,
        teacherName: p.teacherName,
        discountPercent: p.discountPercent,
        firstPaymentDone: Boolean(p.firstPaymentDone),
      },
    });
  });

  // --- Сурагч: холбосон promo-гоо салгах (өөр код холбохын тулд) ----------------
  // Зөвхөн ХЭРЭГЛЭЭГҮЙ (firstPaymentDone=false) код салгана — аль хэдийн хямдрал
  // авсан кодыг буцаахгүй. Салгасны дараа дахин өөр код холбож болно.
  app.delete('/api/promo/me', async (req: Request, res: Response) => {
    const ctx = await requireUserCtx(req, res);
    if (!ctx) return;
    const { admin, uid } = ctx;

    try {
      const outcome = await admin.db.runTransaction(async (tx) => {
        const userRef = admin.db.collection('users').doc(uid);
        const userSnap = await tx.get(userRef);
        const me = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : {};
        if (!me.promo || typeof me.promo !== 'object') {
          return { ok: false as const, reason: 'none' };
        }
        const existing = me.promo as UserPromo;
        if (existing.firstPaymentDone) {
          return { ok: false as const, reason: 'used' };
        }
        tx.set(userRef, { promo: FieldValue.delete() }, { merge: true });
        // redeemCount-ийг буцаан тооцно (доош нь 0-ээс хэтрүүлэхгүй).
        const codeRef = admin.db.collection('teacherCodes').doc(existing.code);
        const codeSnap = await tx.get(codeRef);
        if (codeSnap.exists) {
          const current = Number(codeSnap.data()?.redeemCount ?? 0);
          tx.set(codeRef, { redeemCount: Math.max(0, current - 1) }, { merge: true });
        }
        return { ok: true as const };
      });

      if (!outcome.ok) {
        if (outcome.reason === 'none') return res.json({ removed: false, already: true });
        return res.status(409).json({ error: 'Аль хэдийн ашигласан кодыг салгах боломжгүй.' });
      }
      return res.json({ removed: true });
    } catch (err) {
      console.error('Promo remove failed:', err);
      return res.status(502).json({ error: 'Promo кодыг салгаж чадсангүй.' });
    }
  });
}
