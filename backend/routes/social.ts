import type { Express, Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import {
  firebaseAdminMissingMessage,
  getFirebaseAdmin,
  verifyFirebaseBearer,
} from '../lib/firebaseAdmin';
import { decideDuelWinner, normalizeCode, randomCode, weekMinutes } from '../lib/socialLogic';

// =============================================================================
// Нийгмийн өсөлтийн API — урилга (referral), тулаан (duel), найзуудын
// долоо хоногийн самбар (leaderboard).
//
// Бүх төлөв сервер талд Admin SDK-ээр бичигдэнэ: клиент бусдын profile-д
// шууд хандахгүй тул firestore.rules өөрчлөгдөхгүй. Шагнал (+1 streak freeze,
// duelStats, friendUids) зөвхөн эндээс олгогдоно.
//
// Тулааны асуултууд серверт хадгалагдахгүй: duels/{code} зөвхөн {seed, level}
// хадгална, хоёр тоглогчийн клиент ижил seed-ээс яг ижил 10 асуултыг
// угсарна (frontend/src/duel.ts). Сервер зөвхөн оноо/хугацааг бүртгэж
// ялагчийг тогтооно.
// =============================================================================

const DUEL_QUESTION_COUNT = 10;
const VALID_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const REFERRAL_REDEEM_WINDOW_DAYS = 7;
// backend/lib/plans.ts-тэй ижил: эдгээр статустай billing-ийг идэвхтэй гэж үзнэ.
const ACTIVE_BILLING_STATUSES = ['active', 'paid', 'trialing'];

interface DuelSlot {
  uid: string;
  name: string;
  avatar: string;
  score?: number;
  total?: number;
  timeMs?: number;
  submittedAt?: string;
}

interface DuelDoc {
  code: string;
  seed: number;
  level: string;
  status: 'open' | 'finished';
  createdAt: string;
  challenger: DuelSlot;
  opponent?: DuelSlot;
  winnerUid?: string | null; // null = тэнцсэн
}

// --- Туслахууд -----------------------------------------------------------------

async function callerIdentity(db: FirebaseFirestore.Firestore, uid: string) {
  const snap = await db.collection('users').doc(uid).get();
  const data = snap.exists ? (snap.data() as Record<string, unknown>) : {};
  return {
    name: typeof data.name === 'string' && data.name ? data.name : 'Суралцагч',
    avatar: typeof data.avatar === 'string' ? data.avatar : '',
    data,
  };
}

// Тоглогчдод харагдах нийтийн төлөв (uid задруулахгүй).
function publicDuel(duel: DuelDoc, viewerUid?: string) {
  const slot = (s?: DuelSlot) => s ? {
    name: s.name,
    avatar: s.avatar,
    score: s.score ?? null,
    total: s.total ?? null,
    timeMs: s.timeMs ?? null,
    isMe: viewerUid ? s.uid === viewerUid : false,
    submitted: typeof s.score === 'number',
  } : null;

  const winnerSide = duel.status !== 'finished' ? undefined
    : duel.winnerUid === null ? 'draw'
    : duel.winnerUid === duel.challenger.uid ? 'challenger'
    : 'opponent';

  return {
    code: duel.code,
    seed: duel.seed,
    level: duel.level,
    status: duel.status,
    createdAt: duel.createdAt,
    challenger: slot(duel.challenger),
    opponent: slot(duel.opponent),
    ...(winnerSide ? { winnerSide } : {}),
    ...(viewerUid && duel.status === 'finished'
      ? { iWon: duel.winnerUid === viewerUid, draw: duel.winnerUid === null }
      : {}),
  };
}

// Хоёр хэрэглэгчийг хооронд нь найз болгоно (давхардалгүй).
function crossAddFriends(
  tx: FirebaseFirestore.Transaction,
  db: FirebaseFirestore.Firestore,
  uidA: string,
  uidB: string,
) {
  if (uidA === uidB) return;
  tx.set(db.collection('users').doc(uidA), { friendUids: FieldValue.arrayUnion(uidB) }, { merge: true });
  tx.set(db.collection('users').doc(uidB), { friendUids: FieldValue.arrayUnion(uidA) }, { merge: true });
}

type Admin = NonNullable<ReturnType<typeof getFirebaseAdmin>>;

// Хамгаалалтын нийтлэг бэлтгэл: admin байгаа эсэх + нэвтрэлт.
async function requireAuth(req: Request, res: Response): Promise<{ admin: Admin; uid: string } | null> {
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
  return { admin, uid: user.uid };
}

export function registerSocialRoute(app: Express) {
  // --- Тулаан үүсгэх -----------------------------------------------------------
  app.post('/api/social/duels', async (req, res) => {
    const ctx = await requireAuth(req, res);
    if (!ctx) return;
    const { admin, uid } = ctx;

    const level = VALID_LEVELS.includes(req.body?.level) ? String(req.body.level) : 'A1';
    const { name, avatar } = await callerIdentity(admin.db, uid);

    const duel: DuelDoc = {
      code: randomCode(8),
      seed: Math.floor(Math.random() * 0x7fffffff),
      level,
      status: 'open',
      createdAt: new Date().toISOString(),
      challenger: { uid, name, avatar },
    };

    try {
      await admin.db.collection('duels').doc(duel.code).create(duel);
    } catch {
      // Код давхцсан (маш ховор) — нэг удаа дахин оролдоно.
      duel.code = randomCode(8);
      await admin.db.collection('duels').doc(duel.code).create(duel);
    }

    return res.status(201).json(publicDuel(duel, uid));
  });

  // --- Тулааны жагсаалт (минийх) ------------------------------------------------
  // Нэг талбар дээрх хоёр query-г нэгтгэж composite index шаардлагагүй болгоно.
  app.get('/api/social/duels', async (req, res) => {
    const ctx = await requireAuth(req, res);
    if (!ctx) return;
    const { admin, uid } = ctx;

    const [asChallenger, asOpponent] = await Promise.all([
      admin.db.collection('duels').where('challenger.uid', '==', uid).limit(40).get(),
      admin.db.collection('duels').where('opponent.uid', '==', uid).limit(40).get(),
    ]);

    const byCode = new Map<string, DuelDoc>();
    for (const doc of [...asChallenger.docs, ...asOpponent.docs]) {
      const duel = doc.data() as DuelDoc;
      byCode.set(duel.code, duel);
    }
    const duels = [...byCode.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 20)
      .map((d) => publicDuel(d, uid));

    return res.json({ duels });
  });

  // --- Тулааны нийтийн урьдчилсан харагдац (нэвтрэлтгүй) -------------------------
  // Урилгын линк нээсэн зочинд challenger-ийн нэр/түвшинг үзүүлж, бүртгүүлэхийг
  // урамшуулна. seed-ийг буцаадаг тул нэвтэрсэн тоглогч асуултаа угсарч чадна.
  app.get('/api/social/duels/:code', async (req, res) => {
    const admin = getFirebaseAdmin();
    if (!admin) return res.status(503).json({ error: firebaseAdminMissingMessage() });

    const code = normalizeCode(req.params.code);
    const snap = await admin.db.collection('duels').doc(code).get();
    if (!snap.exists) return res.status(404).json({ error: 'Тулаан олдсонгүй.' });

    const viewer = await verifyFirebaseBearer(req).catch(() => null);
    return res.json(publicDuel(snap.data() as DuelDoc, viewer?.uid));
  });

  // --- Оноо илгээх ---------------------------------------------------------------
  app.post('/api/social/duels/:code/submit', async (req, res) => {
    const ctx = await requireAuth(req, res);
    if (!ctx) return;
    const { admin, uid } = ctx;

    const code = normalizeCode(req.params.code);
    const score = Number(req.body?.score);
    const total = Number(req.body?.total) || DUEL_QUESTION_COUNT;
    const timeMs = Number(req.body?.timeMs);
    if (!Number.isFinite(score) || score < 0 || score > total || !Number.isFinite(timeMs) || timeMs < 0) {
      return res.status(400).json({ error: 'Оноо/хугацаа буруу байна.' });
    }

    const { name, avatar } = await callerIdentity(admin.db, uid);
    const duelRef = admin.db.collection('duels').doc(code);

    try {
      const result = await admin.db.runTransaction(async (tx) => {
        const snap = await tx.get(duelRef);
        if (!snap.exists) return { status: 404 as const, error: 'Тулаан олдсонгүй.' };
        const duel = snap.data() as DuelDoc;

        if (duel.status === 'finished') return { status: 409 as const, error: 'Тулаан аль хэдийн дууссан.' };

        const isChallenger = duel.challenger.uid === uid;
        const isOpponent = duel.opponent?.uid === uid;
        if (!isChallenger && !isOpponent && duel.opponent) {
          return { status: 409 as const, error: 'Энэ тулаанд өөр хүн аль хэдийн орсон байна.' };
        }

        const mySlot: DuelSlot = {
          uid, name, avatar, score, total, timeMs,
          submittedAt: new Date().toISOString(),
        };

        if (isChallenger) {
          if (typeof duel.challenger.score === 'number') {
            return { status: 409 as const, error: 'Та оноогоо аль хэдийн илгээсэн.' };
          }
          duel.challenger = { ...duel.challenger, ...mySlot };
        } else {
          if (isOpponent && typeof duel.opponent?.score === 'number') {
            return { status: 409 as const, error: 'Та оноогоо аль хэдийн илгээсэн.' };
          }
          duel.opponent = { ...(duel.opponent ?? mySlot), ...mySlot };
        }

        const bothDone =
          typeof duel.challenger.score === 'number' && typeof duel.opponent?.score === 'number';

        if (bothDone && duel.opponent) {
          duel.status = 'finished';
          duel.winnerUid = decideDuelWinner(
            { uid: duel.challenger.uid, score: duel.challenger.score!, timeMs: duel.challenger.timeMs ?? 0 },
            { uid: duel.opponent.uid, score: duel.opponent.score!, timeMs: duel.opponent.timeMs ?? 0 },
          );

          // Шагнал, статистик хоёр талдаа нэг transaction дотор.
          const users = admin.db.collection('users');
          for (const side of [duel.challenger, duel.opponent]) {
            const won = duel.winnerUid === side.uid;
            const draw = duel.winnerUid === null;
            tx.set(users.doc(side.uid), {
              duelStats: {
                wins: FieldValue.increment(won ? 1 : 0),
                losses: FieldValue.increment(!won && !draw ? 1 : 0),
                draws: FieldValue.increment(draw ? 1 : 0),
              },
              ...(won ? { streakFreezeCount: FieldValue.increment(1) } : {}),
            }, { merge: true });
          }
          crossAddFriends(tx, admin.db, duel.challenger.uid, duel.opponent.uid);
        }

        tx.set(duelRef, duel);
        return { status: 200 as const, duel };
      });

      if (result.status !== 200) return res.status(result.status).json({ error: result.error });
      const duel = result.duel!;
      return res.json({
        ...publicDuel(duel, uid),
        ...(duel.status !== 'finished' ? { waitingForOpponent: true } : {}),
      });
    } catch (err) {
      console.error('Duel submit failed:', err);
      return res.status(502).json({ error: 'Оноог хадгалж чадсангүй.' });
    }
  });

  // --- Урилгын код (минийхийг баталгаажуулж буцаана) ------------------------------
  app.post('/api/social/referral', async (req, res) => {
    const ctx = await requireAuth(req, res);
    if (!ctx) return;
    const { admin, uid } = ctx;

    const userRef = admin.db.collection('users').doc(uid);
    const snap = await userRef.get();
    const data = snap.exists ? (snap.data() as Record<string, unknown>) : {};

    let code = typeof data.referralCode === 'string' ? data.referralCode : '';
    if (!code) {
      // Код давхцвал дахин сонгоно (referralCodes/{code} create нь atomic).
      for (let attempt = 0; attempt < 5 && !code; attempt++) {
        const candidate = randomCode(6);
        try {
          await admin.db.collection('referralCodes').doc(candidate).create({ uid, createdAt: new Date().toISOString() });
          code = candidate;
        } catch {
          // давхцал — дараагийн оролдлого
        }
      }
      if (!code) return res.status(502).json({ error: 'Урилгын код үүсгэж чадсангүй.' });
      await userRef.set({ referralCode: code }, { merge: true });
    }

    return res.json({
      code,
      invitesCount: typeof data.invitesCount === 'number' ? data.invitesCount : 0,
    });
  });

  // --- Урилгын код ашиглах (шинэ бүртгэл) -----------------------------------------
  app.post('/api/social/referral/redeem', async (req, res) => {
    const ctx = await requireAuth(req, res);
    if (!ctx) return;
    const { admin, uid } = ctx;

    // Энгийн урилгын код эсвэл тулааны код — тулааны линкээр бүртгүүлсэн шинэ
    // хэрэглэгчид challenger нь урьсан хүн гэж тооцогдоно.
    const code = normalizeCode(req.body?.code);
    const duelCode = normalizeCode(req.body?.duelCode);
    if (!code && !duelCode) return res.status(400).json({ error: 'Урилгын код хоосон байна.' });

    let inviterUid = '';
    if (code) {
      const codeSnap = await admin.db.collection('referralCodes').doc(code).get();
      inviterUid = codeSnap.exists ? String((codeSnap.data() as Record<string, unknown>).uid ?? '') : '';
    } else {
      const duelSnap = await admin.db.collection('duels').doc(duelCode).get();
      inviterUid = duelSnap.exists ? (duelSnap.data() as DuelDoc).challenger.uid : '';
    }
    if (!inviterUid) return res.status(404).json({ error: 'Урилгын код олдсонгүй.' });
    if (inviterUid === uid) return res.status(400).json({ error: 'Өөрийн урилгын кодыг ашиглах боломжгүй.' });

    try {
      const outcome = await admin.db.runTransaction(async (tx) => {
        const meRef = admin.db.collection('users').doc(uid);
        const inviterRef = admin.db.collection('users').doc(inviterUid);
        const [meSnap, inviterSnap] = await Promise.all([tx.get(meRef), tx.get(inviterRef)]);
        const me = meSnap.exists ? (meSnap.data() as Record<string, unknown>) : {};
        const inviter = inviterSnap.exists ? (inviterSnap.data() as Record<string, unknown>) : {};

        // Идемпотент: аль хэдийн уригдсан бол юу ч хийхгүй.
        if (typeof me.referredBy === 'string' && me.referredBy) {
          return { redeemed: false as const, already: me.referredBy === inviterUid };
        }

        // Зөвхөн шинэ данс (бүртгүүлснээс хойш 7 хоногийн дотор) урамшуулна.
        const createdAt = typeof me.createdAt === 'string' ? Date.parse(me.createdAt) : NaN;
        const ageMs = Date.now() - createdAt;
        if (!Number.isFinite(createdAt) || ageMs > REFERRAL_REDEEM_WINDOW_DAYS * 24 * 3600 * 1000) {
          return { redeemed: false as const, tooOld: true };
        }

        // Урилгын гол шагнал: хоёр тал хоёулаа байнгын Pro эрх авна.
        // Аль хэдийн төлбөртэй данстай бол давхар олгохгүй.
        const meBilling = (me.billing ?? {}) as { status?: string };
        const hasActiveBilling = ACTIVE_BILLING_STATUSES.includes((meBilling.status ?? '').toLowerCase());
        const inviterBilling = (inviter.billing ?? {}) as { status?: string };
        const inviterHasActiveBilling = ACTIVE_BILLING_STATUSES.includes((inviterBilling.status ?? '').toLowerCase());

        const referralProGrant = { plan: 'pro', status: 'active', interval: 'month', provider: 'referral' };

        tx.set(meRef, {
          referredBy: inviterUid,
          streakFreezeCount: FieldValue.increment(1),
          ...(hasActiveBilling ? {} : { billing: referralProGrant }),
        }, { merge: true });
        tx.set(inviterRef, {
          invitesCount: FieldValue.increment(1),
          streakFreezeCount: FieldValue.increment(1),
          ...(inviterHasActiveBilling ? {} : { billing: referralProGrant }),
        }, { merge: true });
        crossAddFriends(tx, admin.db, uid, inviterUid);
        return { redeemed: true as const, proGranted: !hasActiveBilling };
      });

      if (!outcome.redeemed && outcome.tooOld) {
        return res.status(400).json({ error: 'Урилга зөвхөн шинэ бүртгэлд (7 хоногийн дотор) хүчинтэй.' });
      }
      return res.json({
        redeemed: outcome.redeemed,
        ...(outcome.redeemed && outcome.proGranted ? { proGranted: true } : {}),
      });
    } catch (err) {
      console.error('Referral redeem failed:', err);
      return res.status(502).json({ error: 'Урилгыг бүртгэж чадсангүй.' });
    }
  });

  // --- Найзуудын долоо хоногийн самбар ---------------------------------------------
  app.get('/api/social/leaderboard', async (req, res) => {
    const ctx = await requireAuth(req, res);
    if (!ctx) return;
    const { admin, uid } = ctx;

    const meSnap = await admin.db.collection('users').doc(uid).get();
    const me = meSnap.exists ? (meSnap.data() as Record<string, unknown>) : {};
    const friendUids = Array.isArray(me.friendUids)
      ? (me.friendUids as unknown[]).filter((v): v is string => typeof v === 'string').slice(0, 50)
      : [];

    const friendSnaps = await Promise.all(
      friendUids.map((fuid) => admin.db.collection('users').doc(fuid).get()),
    );

    const row = (profile: Record<string, unknown>, isMe: boolean) => ({
      name: typeof profile.name === 'string' && profile.name ? profile.name : 'Суралцагч',
      avatar: typeof profile.avatar === 'string' ? profile.avatar : '',
      minutes: weekMinutes(profile.studySecondsByDate as Record<string, number> | undefined),
      isMe,
    });

    const rows = [
      row(me, true),
      ...friendSnaps.filter((s) => s.exists).map((s) => row(s.data() as Record<string, unknown>, false)),
    ].sort((a, b) => b.minutes - a.minutes);

    return res.json({ leaderboard: rows });
  });
}
