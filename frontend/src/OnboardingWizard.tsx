import React, { useState } from 'react';
import { Target, BookOpen, GraduationCap, Sparkles, Clock, ArrowRight, Check } from 'lucide-react';

interface OnboardingWizardProps {
  userName: string;
  onComplete: (data: { goal: string; level: string; dailyGoalMinutes: number }) => void;
}

export default function OnboardingWizard({ userName, onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState(1);
  const [goal, setGoal] = useState('');
  const [level, setLevel] = useState('');
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState<number | null>(null);

  const goals = [
    { id: 'exam', label: 'Шалгалтад бэлдэх (Goethe/TestDaF)', desc: 'Түвшний шалгалтад өндөр оноо авах' },
    { id: 'work', label: 'Ажил, мэргэжлийн хэрэгцээ', desc: 'Герман түншүүдтэй харилцах, ажиллах' },
    { id: 'travel', label: 'Аялал жуулчлал', desc: 'Герман хэлтэй орнуудаар аялах' },
    { id: 'personal', label: 'Сонирхлоороо сурах', desc: 'Өөрийгөө хөгжүүлэх, шинэ зүйл сурах' },
  ];

  const levels = [
    { id: 'A1', label: 'A1', desc: 'Анхан шат — Энгийн мэндчилгээ, танилцуулга' },
    { id: 'A2', label: 'A2', desc: 'Суурь — Өдөр тутмын харилцаа' },
    { id: 'B1', label: 'B1', desc: 'Дунд — Аялал, ажлын нөхцөл' },
    { id: 'B2', label: 'B2', desc: 'Ахисан — Мэргэжлийн ярилцлага' },
  ];

  const durations = [
    { minutes: 5, label: '5 мин', desc: 'Хөнгөн хичээллэх' },
    { minutes: 10, label: '10 мин', desc: 'Дундаж ачаалалтай хичээллэх' },
    { minutes: 15, label: '15 мин', desc: 'Эрчимтэй хичээллэх' },
    { minutes: 30, label: '30 мин', desc: 'Урт хугацаанд гүнзгийрэх' },
    { minutes: 60, label: '60 мин', desc: 'Супер эрчимтэй хичээллэх' },
  ];

  const handleNext = () => {
    if (step < 3) {
      setStep(step + 1);
    } else if (goal && level && dailyGoalMinutes) {
      onComplete({ goal, level, dailyGoalMinutes });
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const isNextDisabled = () => {
    if (step === 1) return !goal;
    if (step === 2) return !level;
    if (step === 3) return !dailyGoalMinutes;
    return true;
  };

  return (
    <div className="fixed inset-0 bg-background z-[100] flex flex-col items-center justify-between pb-12 pt-6 px-4 md:px-12 animate-fade-in text-white overflow-y-auto">
      {/* Atmospheric background glows in overlay */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-900/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-900/10 rounded-full blur-[120px] pointer-events-none"></div>

      {/* Top Header & Progress */}
      <header className="w-full max-w-[600px] flex flex-col gap-4 py-2 relative z-10">
        <div className="flex justify-between items-center w-full">
          <h1 className="text-2xl font-black font-space tracking-tight">
            <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">Vivid</span> Lingua
          </h1>
          <span className="text-sm font-space text-slate-400 font-bold">Алхам {step} / 3</span>
        </div>
        
        {/* Progress Bar */}
        <div className="w-full h-2.5 bg-white/5 border border-white/10 rounded-full overflow-hidden relative">
          <div 
            className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-500"
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>
      </header>

      {/* Content Area */}
      <main className="flex-grow w-full max-w-[600px] flex flex-col justify-center py-8 relative z-10">
        <div className="animate-scale-up space-y-6">
          {step === 1 && (
            <div className="space-y-6">
              <div className="space-y-2 text-center md:text-left">
                <div className="inline-flex p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl text-purple-400 mb-2">
                  <Target className="w-6 h-6" />
                </div>
                <h2 className="text-2xl md:text-3xl font-black font-space">Таны зорилго юу вэ?</h2>
                <p className="text-slate-400 text-sm">Бид танд тохирсон сургалтын төлөвлөгөө бэлдэх болно</p>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {goals.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => setGoal(g.label)}
                    className={`flex items-center justify-between text-left p-4 rounded-xl transition-all cursor-pointer ${
                      goal === g.label
                        ? 'bg-purple-950/40 border-2 border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.3)]'
                        : 'bg-white/5 border border-white/10 hover:border-purple-500/50 hover:bg-white/10'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-white text-base">{g.label}</div>
                      <div className="text-xs text-slate-400 mt-1">{g.desc}</div>
                    </div>
                    {goal === g.label && <Check className="w-5 h-5 text-purple-400 flex-shrink-0 ml-3" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div className="space-y-2 text-center md:text-left">
                <div className="inline-flex p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-400 mb-2">
                  <GraduationCap className="w-6 h-6" />
                </div>
                <h2 className="text-2xl md:text-3xl font-black font-space">Одоогийн түвшингээ сонгоно уу</h2>
                <p className="text-slate-400 text-sm">Мэдэхгүй бол A1 сонгоно уу — бид тест авч тодорхойлно</p>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {levels.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => setLevel(l.id)}
                    className={`flex items-center justify-between text-left p-4 rounded-xl transition-all cursor-pointer ${
                      level === l.id
                        ? 'bg-purple-950/40 border-2 border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.3)]'
                        : 'bg-white/5 border border-white/10 hover:border-purple-500/50 hover:bg-white/10'
                    }`}
                  >
                    <div>
                      <div className="font-extrabold text-white text-lg font-space">{l.label}</div>
                      <div className="text-xs text-slate-400 mt-1">{l.desc}</div>
                    </div>
                    {level === l.id && <Check className="w-5 h-5 text-purple-400 flex-shrink-0 ml-3" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div className="space-y-2 text-center md:text-left">
                <div className="inline-flex p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 mb-2">
                  <Clock className="w-6 h-6" />
                </div>
                <h2 className="text-2xl md:text-3xl font-black font-space">Өдөрт хэр удаан хичээллэх вэ?</h2>
                <p className="text-slate-400 text-sm">Бид танд тохирсон хичээлийн хэмжээг тааруулна</p>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {durations.map((d) => (
                  <button
                    key={d.minutes}
                    onClick={() => setDailyGoalMinutes(d.minutes)}
                    className={`flex items-center justify-between text-left p-4 rounded-xl transition-all cursor-pointer ${
                      dailyGoalMinutes === d.minutes
                        ? 'bg-purple-950/40 border-2 border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.3)]'
                        : 'bg-white/5 border border-white/10 hover:border-purple-500/50 hover:bg-white/10'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-white text-base">{d.label}</div>
                      <div className="text-xs text-slate-400 mt-1">{d.desc}</div>
                    </div>
                    {dailyGoalMinutes === d.minutes && <Check className="w-5 h-5 text-purple-400 flex-shrink-0 ml-3" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer Navigation */}
      <footer className="w-full max-w-[600px] flex gap-4 mt-4 relative z-10">
        {step > 1 && (
          <button
            onClick={handleBack}
            className="flex-1 py-3.5 border border-white/10 hover:bg-white/5 rounded-xl font-bold transition-all text-slate-300 cursor-pointer"
          >
            Буцах
          </button>
        )}
        <button
          onClick={handleNext}
          disabled={isNextDisabled()}
          className="flex-[2] bg-gradient-to-r from-purple-500 to-blue-500 text-white font-bold rounded-xl py-3.5 px-6 disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-95 shadow-[0_4px_20px_rgba(168,85,247,0.3)] transition-all cursor-pointer flex items-center justify-center gap-2"
        >
          {step === 3 ? (
            <>
              Эхлэцгээе! <Sparkles className="w-5 h-5 text-yellow-300 animate-pulse" />
            </>
          ) : (
            <>
              Үргэлжлүүлэх <ArrowRight className="w-5 h-5" />
            </>
          )}
        </button>
      </footer>
    </div>
  );
}
