// =============================================================================
// English track — streak badge + weekly leaderboard.
// -----------------------------------------------------------------------------
// Surfaces the SAME streak and weekly-minutes leaderboard the German track shows,
// driven by the SAME shared account profile (see stats.tsx). Rendered at the top
// of the IELTS and SAT home tabs so the English section has identical streak +
// leaderboard function and monochrome design to German.
// =============================================================================
import React, { useEffect, useState } from 'react';
import { Flame, Loader2, Trophy } from 'lucide-react';
import { fetchLeaderboard, LeaderboardRow } from '../../frontend/src/social';
import { useEnglishStats } from './stats';

export default function StreakLeaderboard() {
  const { streak, profile, enabled } = useEnglishStats();
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [boardAvailable, setBoardAvailable] = useState(true);

  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    let cancelled = false;
    void (async () => {
      try {
        const board = await fetchLeaderboard();
        if (cancelled) return;
        setLeaderboard(board.leaderboard);
        setBoardAvailable(true);
      } catch {
        // 503 (Firebase Admin not configured) or any error → hide the board and
        // degrade gracefully, exactly like the German SocialSection.
        if (!cancelled) setBoardAvailable(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [enabled, profile?.studySecondsByDate]);

  // Signed-out / guest: nothing to show (no cloud streak or leaderboard).
  if (!enabled) return null;

  const showBoard = boardAvailable && leaderboard.length > 1;

  return (
    <section className="rounded-3xl bg-ink-raise p-6 sm:p-7 space-y-5">
      {/* Streak badge — mirrors the German sidebar streak card. */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="bg-ink-2 text-paper text-sm font-bold rounded-xl px-4 py-3 flex items-center gap-2 border border-ink-line">
          <Flame className="w-5 h-5 text-paper fill-paper-2 animate-pulse" />
          Streak: {streak} өдөр
          <span className="ml-1 text-[11px] font-serif bg-paper text-ink px-2.5 py-0.5 rounded-full font-extrabold uppercase tracking-wide">
            AUTO
          </span>
        </div>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-paper-2" />}
      </div>

      {/* Weekly leaderboard — identical content/shape to the German board. */}
      {showBoard && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-paper-3 uppercase tracking-[0.18em]">
            Найзуудын долоо хоногийн самбар (суралцсан минут)
          </h3>
          <div className="space-y-1.5">
            {leaderboard.map((row, i) => (
              <div
                key={`${row.name}-${i}`}
                className={`flex items-center gap-3 rounded-xl px-4 py-2.5 border ${
                  row.isMe ? 'bg-ink-2 border-ink-line-2' : 'bg-ink-raise border-ink-line'
                }`}
              >
                <span className="w-6 text-center font-serif font-light text-sm text-paper-2">{i + 1}</span>
                {row.avatar ? (
                  <img src={row.avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-ink-2" />
                )}
                <span className="text-sm font-medium text-paper truncate flex-1">
                  {row.isMe ? `${row.name} (та)` : row.name}
                </span>
                <span className="text-sm font-serif font-light text-paper">{row.minutes} мин</span>
                {i === 0 && row.minutes > 0 && <Trophy className="w-4 h-4 text-paper" />}
              </div>
            ))}
          </div>
        </div>
      )}

      {boardAvailable && !showBoard && !loading && (
        <p className="text-xs text-paper-3 leading-relaxed">
          Өдөр бүр хичээллэснээр streak чинь өснө. Найз урих эсвэл тулаанд оролцсоноор найзуудын
          долоо хоногийн самбар энд гарч ирнэ.
        </p>
      )}
    </section>
  );
}
