import React from "react";
import { Lightbulb } from "lucide-react";

interface GrammarTipCardProps {
  /** The correct answer text */
  correctAnswer: string;
  /** The explanation of why this answer is correct — often available as item.explanation */
  explanation?: string;
  /** The German text passage the question is based on */
  germanContext?: string;
  /** The CEFR level of the exercise */
  level?: string;
}

function getLevelTip(level?: string): string {
  switch (level?.toUpperCase()) {
    case "A1":
      return "Энэ түвшинд үндсэн өгүүлбэрийн бүтэц (Субъект + Үйл үг + Объект) чухал. Үйл үг нь хоёр дахь байрлалд байдаг.";
    case "A2":
      return "Дайвар угтвар үгс (in, an, auf) болон тэдгээрийн падеж хэрэглээг анхаарах хэрэгтэй.";
    case "B1":
      return "Нийлмэл өгүүлбэрийн холбоос үгс (weil, dass, obwohl) ба үйл үгийн байрлалыг сайн ойлгох хэрэгтэй.";
    default:
      return "Герман хэлний өгүүлбэрийн бүтцийг анхааралтай судлаарай.";
  }
}

export default function GrammarTipCard({
  correctAnswer,
  explanation,
  germanContext,
  level,
}: GrammarTipCardProps) {
  const tip = explanation || getLevelTip(level);

  return (
    <div className="bg-amber-500/10 border-2 border-amber-400/60 rounded-xl p-5 mt-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Lightbulb className="w-5 h-5 text-amber-400" />
        <span className="text-amber-300 font-bold text-base">
          Дүрмийн зөвлөмж
        </span>
      </div>

      {/* Correct answer */}
      <p className="text-emerald-300 font-bold text-lg mb-2">
        ✅ Зөв хариулт: <span className="underline">{correctAnswer}</span>
      </p>

      {/* Explanation / level tip */}
      <p className="text-on-surface-variant text-sm leading-relaxed mb-3">{tip}</p>

      {/* German context refresher */}
      {germanContext && (
        <div className="bg-amber-400/10 rounded-lg px-4 py-3 mt-2">
          <p className="text-xs text-amber-300 font-medium mb-1">
            📖 Эх бичвэрээс:
          </p>
          <p className="text-sm text-on-surface italic">{germanContext}</p>
        </div>
      )}

      {/* Generic grammar refresher */}
      <p className="text-xs text-amber-200/80 mt-3">
        💡 Герман хэлэнд үйл үг нь үндсэн өгүүлбэрт хоёр дахь байрлалд,
        туслах өгүүлбэрт хамгийн сүүлд байрладаг болохыг санаарай.
      </p>
    </div>
  );
}
