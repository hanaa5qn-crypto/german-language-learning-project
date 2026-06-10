import React, { useMemo, useRef, useState } from 'react';
import {
  BookOpen, Headphones, Edit3, Mic, Sparkles, ArrowRight, Volume2,
  Lock, Crown, Loader2, QrCode, CheckCircle2, X,
} from 'lucide-react';
import {
  PLACEMENT_BLOCKS, PLACEMENT_TOTAL_QUESTIONS, BLOCK_STOP_SCORE,
  PLACEMENT_RESULT_PRICE_MNT, PlacementAnswer, PlacementQuestion,
  PlacementRecord, PlacementSkill, scorePlacement,
} from './placement';
import { getAuthInstance } from './firebase';

interface PlacementTestProps {
  isFounder: boolean;
  onFinish: (record: PlacementRecord) => void;
  onSkip: () => void;
}

type Phase = 'intro' | 'quiz' | 'paywall' | 'result';

const SKILL_META: Record<PlacementSkill, { label: string; icon: React.ReactNode }> = {
  read: { label: 'Унших', icon: <BookOpen className="w-4 h-4" /> },
  listen: { label: 'Сонсох', icon: <Headphones className="w-4 h-4" /> },
  write: { label: 'Бичих', icon: <Edit3 className="w-4 h-4" /> },
  speak: { label: 'Ярих', icon: <Mic className="w-4 h-4" /> },
};

// Сонсох асуултын герман бичвэрийг TTS-ээр уншуулна (бичвэрийг харуулахгүй).
function speakGerman(text: string) {
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'de-DE';
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  } catch {
    // TTS байхгүй орчинд асуулт алгасагдахгүй — зөвхөн дуугүй үлдэнэ.
  }
}

interface QPayInvoice {
  senderInvoiceNo: string;
  qrImage?: string;
  shortUrl?: string;
}

function qrImageSrc(qrImage?: string): string | null {
  if (!qrImage) return null;
  return qrImage.startsWith('data:') ? qrImage : `data:image/png;base64,${qrImage}`;
}

export default function PlacementTest({ isFounder, onFinish, onSkip }: PlacementTestProps) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [blockIndex, setBlockIndex] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const answersRef = useRef<PlacementAnswer[]>([]);
  const blockCorrectRef = useRef(0);
  const [record, setRecord] = useState<PlacementRecord | null>(null);

  // Төлбөрийн төлөв (paywall шат)
  const [invoice, setInvoice] = useState<QPayInvoice | null>(null);
  const [payLoading, setPayLoading] = useState(false);
  const [payMessage, setPayMessage] = useState<{ type: 'info' | 'error'; text: string } | null>(null);

  const question: PlacementQuestion | null = PLACEMENT_BLOCKS[blockIndex]?.[questionIndex] ?? null;
  const answeredCount = answersRef.current.length;

  const skillTotals = useMemo(() => record?.skillScores ?? null, [record]);

  const finishQuiz = () => {
    const scored = scorePlacement(answersRef.current);
    if (isFounder) {
      const unlockedRecord: PlacementRecord = { ...scored, unlocked: true, unlockedBy: 'founder' };
      setRecord(unlockedRecord);
      setPhase('result');
    } else {
      setRecord(scored);
      setPhase('paywall');
    }
  };

  const submitAnswer = () => {
    if (!question || selected === null) return;
    const correct = selected === question.correctIndex;
    answersRef.current.push({ questionId: question.id, skill: question.skill, correct });
    if (correct) blockCorrectRef.current += 1;
    setSelected(null);

    const isLastInBlock = questionIndex === PLACEMENT_BLOCKS[blockIndex].length - 1;
    if (!isLastInBlock) {
      setQuestionIndex(questionIndex + 1);
      return;
    }

    // Блок дууслаа: оноо хэт бага бол тестийг эртхэн дуусгана.
    const blockCorrect = blockCorrectRef.current;
    blockCorrectRef.current = 0;
    const isLastBlock = blockIndex === PLACEMENT_BLOCKS.length - 1;
    if (isLastBlock || blockCorrect <= BLOCK_STOP_SCORE) {
      finishQuiz();
    } else {
      setBlockIndex(blockIndex + 1);
      setQuestionIndex(0);
    }
  };

  const startQPay = async () => {
    setPayLoading(true);
    setPayMessage(null);
    try {
      const token = await getAuthInstance().currentUser?.getIdToken();
      const response = await fetch('/api/payments/qpay/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ product: 'placement' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Төлбөр эхлүүлэхэд алдаа гарлаа.');
      setInvoice({ senderInvoiceNo: data.senderInvoiceNo, qrImage: data.qrImage, shortUrl: data.shortUrl });
      setPayMessage({ type: 'info', text: 'QPay нэхэмжлэл үүслээ. QR уншуулж төлөөд "Төлбөр шалгах" дарна уу.' });
    } catch (err: any) {
      setPayMessage({ type: 'error', text: err?.message || 'Төлбөр эхлүүлэхэд алдаа гарлаа.' });
    } finally {
      setPayLoading(false);
    }
  };

  const checkQPay = async () => {
    if (!invoice || !record) return;
    setPayLoading(true);
    setPayMessage(null);
    try {
      const token = await getAuthInstance().currentUser?.getIdToken();
      const response = await fetch(`/api/payments/qpay/invoices/${encodeURIComponent(invoice.senderInvoiceNo)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Төлбөр шалгахад алдаа гарлаа.');
      if (data.paid || data.status === 'paid') {
        setRecord({ ...record, unlocked: true, unlockedBy: 'qpay' });
        setPhase('result');
      } else {
        setPayMessage({ type: 'info', text: 'Төлбөр хараахан баталгаажаагүй байна. Төлснөөс хойш хэдэн секунд хүлээгээд дахин шалгана уу.' });
      }
    } catch (err: any) {
      setPayMessage({ type: 'error', text: err?.message || 'Төлбөр шалгахад алдаа гарлаа.' });
    } finally {
      setPayLoading(false);
    }
  };

  const shell = (content: React.ReactNode, footer?: React.ReactNode) => (
    <div className="fixed inset-0 bg-[#020205] z-[100] flex flex-col items-center justify-between pb-10 pt-6 px-4 md:px-12 animate-fade-in text-white overflow-y-auto">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-900/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-900/10 rounded-full blur-[120px] pointer-events-none"></div>

      <header className="w-full max-w-[640px] flex flex-col gap-4 py-2 relative z-10">
        <div className="flex justify-between items-center w-full">
          <h1 className="text-2xl font-black font-space tracking-tight">
            <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">Vivid</span> Lingua
          </h1>
          {phase === 'quiz' && (
            <span className="text-sm font-space text-slate-400 font-bold">{answeredCount + 1} / {PLACEMENT_TOTAL_QUESTIONS}</span>
          )}
        </div>
        <div className="w-full h-2.5 bg-white/5 border border-white/10 rounded-full overflow-hidden relative">
          <div
            className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-500"
            style={{ width: `${phase === 'intro' ? 2 : phase === 'quiz' ? Math.round((answeredCount / PLACEMENT_TOTAL_QUESTIONS) * 100) : 100}%` }}
          />
        </div>
      </header>

      <main className="flex-grow w-full max-w-[640px] flex flex-col justify-center py-8 relative z-10">
        <div className="animate-scale-up space-y-6">{content}</div>
      </main>

      {footer && <footer className="w-full max-w-[640px] flex gap-4 mt-4 relative z-10">{footer}</footer>}
    </div>
  );

  // --- Танилцуулга -----------------------------------------------------------
  if (phase === 'intro') {
    return shell(
      <div className="space-y-6">
        <div className="space-y-2 text-center md:text-left">
          <div className="inline-flex p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl text-purple-400 mb-2">
            <Sparkles className="w-6 h-6" />
          </div>
          <h2 className="text-2xl md:text-3xl font-black font-space">Түвшин тогтоох үнэлгээний тест</h2>
          <p className="text-slate-400 text-sm leading-relaxed">
            Дөрвөн ур чадварыг бүгдийг шалгана: <b className="text-white">Унших · Сонсох · Бичих · Ярих</b>.
            Асуултууд A1-ээс C2 хүртэл аажмаар хүндэрнэ — мэдэхгүй зүйл таарвал санаа зовох хэрэггүй,
            тест таны түвшинд автоматаар тохирно. Ойролцоогоор 10–15 минут зарцуулна.
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(Object.keys(SKILL_META) as PlacementSkill[]).map((s) => (
            <div key={s} className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl p-3 text-sm font-bold text-slate-300">
              <span className="text-purple-400">{SKILL_META[s].icon}</span>
              {SKILL_META[s].label}
            </div>
          ))}
        </div>
      </div>,
      <>
        <button
          onClick={onSkip}
          className="flex-1 py-3.5 border border-white/10 hover:bg-white/5 rounded-xl font-bold transition-all text-slate-300 cursor-pointer"
        >
          Дараа өгөх
        </button>
        <button
          onClick={() => setPhase('quiz')}
          className="flex-[2] bg-gradient-to-r from-purple-500 to-blue-500 text-white font-bold rounded-xl py-3.5 px-6 hover:opacity-95 shadow-[0_4px_20px_rgba(168,85,247,0.3)] transition-all cursor-pointer flex items-center justify-center gap-2"
        >
          Тест эхлүүлэх <ArrowRight className="w-5 h-5" />
        </button>
      </>,
    );
  }

  // --- Асуултууд ---------------------------------------------------------------
  if (phase === 'quiz' && question) {
    return shell(
      <div className="space-y-5">
        <div className="flex items-center gap-2 text-xs font-bold text-purple-300">
          <span className="inline-flex items-center gap-1.5 bg-purple-500/10 border border-purple-500/20 rounded-full px-3 py-1">
            {SKILL_META[question.skill].icon} {SKILL_META[question.skill].label}
          </span>
        </div>
        <p className="text-sm text-slate-400">{question.instruction}</p>

        {question.passage && (
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-[15px] leading-relaxed text-slate-100">
            {question.passage}
          </div>
        )}

        {question.audioText && (
          <button
            onClick={() => speakGerman(question.audioText!)}
            className="flex items-center gap-3 bg-white/5 border border-white/10 hover:border-purple-500/50 rounded-xl p-4 w-full text-left transition-all cursor-pointer"
          >
            <span className="w-11 h-11 flex items-center justify-center bg-gradient-to-r from-purple-500 to-blue-500 rounded-full shrink-0">
              <Volume2 className="w-5 h-5" />
            </span>
            <span className="text-sm font-bold text-slate-200">Сонсох (дахин дарж давтаж болно)</span>
          </button>
        )}

        <h2 className="text-lg md:text-xl font-black font-space">{question.question}</h2>

        <div className="grid grid-cols-1 gap-3">
          {question.choices.map((choice, i) => (
            <button
              key={i}
              onClick={() => setSelected(i)}
              className={`text-left p-4 rounded-xl transition-all cursor-pointer text-[15px] ${
                selected === i
                  ? 'bg-purple-950/40 border-2 border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.3)]'
                  : 'bg-white/5 border border-white/10 hover:border-purple-500/50 hover:bg-white/10'
              }`}
            >
              {choice}
            </button>
          ))}
        </div>
      </div>,
      <button
        onClick={submitAnswer}
        disabled={selected === null}
        className="flex-1 bg-gradient-to-r from-purple-500 to-blue-500 text-white font-bold rounded-xl py-3.5 px-6 disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-95 shadow-[0_4px_20px_rgba(168,85,247,0.3)] transition-all cursor-pointer flex items-center justify-center gap-2"
      >
        Дараах <ArrowRight className="w-5 h-5" />
      </button>,
    );
  }

  // --- Үр дүн түгжээтэй (төлбөрийн шат) ---------------------------------------
  if (phase === 'paywall' && record) {
    return shell(
      <div className="space-y-6">
        <div className="space-y-2 text-center">
          <div className="inline-flex p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-400 mb-2">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-2xl md:text-3xl font-black font-space">Тест дууслаа! 🎉</h2>
          <p className="text-slate-400 text-sm leading-relaxed max-w-md mx-auto">
            Таны дөрвөн ур чадварын үнэлгээ, CEFR түвшин бэлэн боллоо.
            Дэлгэрэнгүй үр дүнг нээж үзэхэд <b className="text-white">{PLACEMENT_RESULT_PRICE_MNT.toLocaleString()}₮</b>.
          </p>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-300">Таны CEFR түвшин</span>
            <span className="text-2xl font-black font-space blur-sm select-none">B?</span>
          </div>
          {(Object.keys(SKILL_META) as PlacementSkill[]).map((s) => (
            <div key={s} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-slate-400">{SKILL_META[s].icon} {SKILL_META[s].label}</span>
              <span className="blur-sm select-none font-bold">●●●</span>
            </div>
          ))}
        </div>

        {invoice ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col items-center gap-3">
            {qrImageSrc(invoice.qrImage) ? (
              <img src={qrImageSrc(invoice.qrImage)!} alt="QPay QR" className="w-44 h-44 rounded-xl bg-white p-2" />
            ) : (
              <QrCode className="w-16 h-16 text-slate-500" />
            )}
            {invoice.shortUrl && (
              <a href={invoice.shortUrl} target="_blank" rel="noreferrer" className="text-sm font-bold text-purple-300 underline">
                Банкны аппаар төлөх
              </a>
            )}
            <button
              onClick={checkQPay}
              disabled={payLoading}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold rounded-xl py-3 px-6 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
            >
              {payLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />} Төлбөр шалгах
            </button>
          </div>
        ) : (
          <button
            onClick={startQPay}
            disabled={payLoading}
            className="w-full bg-gradient-to-r from-purple-500 to-blue-500 text-white font-bold rounded-xl py-3.5 px-6 disabled:opacity-50 hover:opacity-95 shadow-[0_4px_20px_rgba(168,85,247,0.3)] transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            {payLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <QrCode className="w-5 h-5" />}
            QPay-ээр {PLACEMENT_RESULT_PRICE_MNT.toLocaleString()}₮ төлж нээх
          </button>
        )}

        {payMessage && (
          <p className={`text-sm text-center font-bold ${payMessage.type === 'error' ? 'text-red-400' : 'text-slate-300'}`}>
            {payMessage.text}
          </p>
        )}
      </div>,
      <button
        onClick={() => onFinish(record)}
        className="flex-1 py-3.5 border border-white/10 hover:bg-white/5 rounded-xl font-bold transition-all text-slate-400 cursor-pointer flex items-center justify-center gap-2"
      >
        <X className="w-4 h-4" /> Үр дүнг нээлгүй үргэлжлүүлэх
      </button>,
    );
  }

  // --- Нээгдсэн үр дүн ----------------------------------------------------------
  if (phase === 'result' && record && skillTotals) {
    return shell(
      <div className="space-y-6">
        <div className="space-y-2 text-center">
          {record.unlockedBy === 'founder' && (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-full px-3 py-1">
              <Crown className="w-3.5 h-3.5" /> Founder — төлбөргүй нээгдлээ
            </span>
          )}
          <h2 className="text-2xl md:text-3xl font-black font-space">Таны түвшин</h2>
          <div className="text-7xl font-black font-space bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent py-2">
            {record.level}
          </div>
          <p className="text-slate-400 text-sm">
            Нийт {record.totalQuestions} асуултаас {record.totalCorrect} зөв. Сургалт таны түвшнээс эхэлнэ.
          </p>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
          {(Object.keys(SKILL_META) as PlacementSkill[]).map((s) => {
            const score = skillTotals[s];
            const pct = score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0;
            return (
              <div key={s} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-slate-300 font-bold">{SKILL_META[s].icon} {SKILL_META[s].label}</span>
                  <span className="text-slate-400 font-mono text-xs">{score.correct}/{score.total}</span>
                </div>
                <div className="w-full h-2 bg-white/5 border border-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-700" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>,
      <button
        onClick={() => onFinish(record)}
        className="flex-1 bg-gradient-to-r from-purple-500 to-blue-500 text-white font-bold rounded-xl py-3.5 px-6 hover:opacity-95 shadow-[0_4px_20px_rgba(168,85,247,0.3)] transition-all cursor-pointer flex items-center justify-center gap-2"
      >
        {record.level} түвшнээс суралцаж эхлэх <Sparkles className="w-5 h-5 text-yellow-300" />
      </button>,
    );
  }

  return null;
}
