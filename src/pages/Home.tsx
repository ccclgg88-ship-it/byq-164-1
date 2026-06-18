import { useEffect, useRef, useState, useCallback } from "react";
import { GameEngine } from "@/game/engine";
import { GamePhase, GameMetrics, THIEF_CONFIGS, ThiefType } from "@/game/types";

const GRADE_COLORS: Record<string, string> = {
  S: "from-yellow-400 to-amber-500",
  A: "from-green-400 to-emerald-500",
  B: "from-blue-400 to-cyan-500",
  C: "from-orange-400 to-amber-500",
  D: "from-red-400 to-rose-500",
};

const GRADE_TEXT_COLORS: Record<string, string> = {
  S: "text-yellow-300",
  A: "text-green-300",
  B: "text-blue-300",
  C: "text-orange-300",
  D: "text-red-300",
};

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<GamePhase>("start");
  const [metrics, setMetrics] = useState<GameMetrics | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new GameEngine(canvasRef.current);
    engineRef.current = engine;

    engine.onPhaseChange = (p) => setPhase(p);
    engine.onMetricsUpdate = (m) => setMetrics({ ...m });

    engine.resize();

    engine.start();
    engine.stop();
    engine.reset();

    const idleLoop = () => {
      if (engine.phase === "start") {
        const now = performance.now();
        const dt = 0.016;
        engine["updateStars"](dt);
        engine["bgScrollX"] += 60 * dt;
        engine["render"]();
      }
      if (engine.phase === "start") {
        requestAnimationFrame(idleLoop);
      }
    };
    requestAnimationFrame(idleLoop);

    return () => {
      engine.destroy();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        ["ArrowUp", "ArrowDown", " ", "Enter", "w", "W", "s", "S"].includes(
          e.key
        )
      ) {
        e.preventDefault();
      }
      engineRef.current?.handleKeyDown(e.key);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      engineRef.current?.resize();
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    engineRef.current?.handleTouchStart(touch.clientY);
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const touch = e.changedTouches[0];
    engineRef.current?.handleTouchEnd(touch.clientY);
  }, []);

  const handleStart = useCallback(() => {
    if (phase === "start") {
      engineRef.current?.start();
    } else if (phase === "result") {
      engineRef.current?.reset();
      engineRef.current?.start();
    }
  }, [phase]);

  const grade = metrics ? calculateGrade(metrics) : "D";

  return (
    <div
      ref={containerRef}
      className="relative w-screen h-screen overflow-hidden bg-[#050510]"
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      />

      {phase === "start" && <StartOverlay onStart={handleStart} />}

      {phase === "result" && metrics && (
        <ResultOverlay
          metrics={metrics}
          grade={grade}
          onRestart={handleStart}
        />
      )}

      {phase === "playing" && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 text-white/40 text-xs pointer-events-none select-none">
          <span className="px-2 py-1 rounded border border-white/10">↑↓ 切换轨道</span>
          <span className="px-2 py-1 rounded border border-white/10">空格 跳跃</span>
          <span className="px-2 py-1 rounded border border-white/10">触屏: 滑动切换 / 点击跳跃</span>
        </div>
      )}
    </div>
  );
}

function StartOverlay({ onStart }: { onStart: () => void }) {
  const thiefTypes: ThiefType[] = [
    "video",
    "message",
    "meeting",
    "notification",
    "game",
  ];

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0a0a2e]/60 to-[#050510]/80" />

      <div className="relative z-10 flex flex-col items-center gap-6 px-4">
        <div className="text-5xl md:text-7xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 tracking-tight text-center"
          style={{ fontFamily: "'Noto Sans SC', sans-serif" }}>
          时间小偷大逃亡
        </div>

        <p className="text-white/50 text-sm md:text-base max-w-md text-center">
          在四条任务轨道上奔跑，躲避从后方逼近的「时间小偷」！
        </p>

        <div className="flex flex-wrap justify-center gap-3 mt-2">
          {thiefTypes.map((type) => {
            const config = THIEF_CONFIGS[type];
            return (
              <div
                key={type}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs"
                style={{
                  backgroundColor: config.color + "15",
                  border: `1px solid ${config.color}40`,
                  color: config.color,
                }}
              >
                <span>{config.emoji}</span>
                <span>{config.label}</span>
              </div>
            );
          })}
        </div>

        <button
          onClick={onStart}
          className="mt-4 px-8 py-3 rounded-xl text-lg font-bold text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 transition-all duration-200 shadow-lg shadow-cyan-500/25 hover:shadow-cyan-400/40 active:scale-95"
        >
          开始逃亡
        </button>

        <div className="flex flex-col items-center gap-1 text-white/30 text-xs mt-2">
          <span>↑↓ / WS 切换轨道　　空格 跳跃</span>
          <span>触屏：上下滑动切换 / 点击跳跃</span>
        </div>
      </div>
    </div>
  );
}

function ResultOverlay({
  metrics,
  grade,
  onRestart,
}: {
  metrics: GameMetrics;
  grade: string;
  onRestart: () => void;
}) {
  const thiefTypes: ThiefType[] = [
    "video",
    "message",
    "meeting",
    "notification",
    "game",
  ];
  const focusPercent = Math.round(
    (metrics.focusTime / metrics.maxFocusTime) * 100
  );
  const dodgeRate = Math.round(
    (metrics.totalDodged /
      Math.max(metrics.totalDodged + metrics.totalHits, 1)) *
      100
  );

  return (
    <div className="absolute inset-0 flex items-center justify-center z-10">
      <div className="absolute inset-0 bg-[#050510]/80 backdrop-blur-sm" />

      <div className="relative z-10 flex flex-col items-center gap-5 px-4 max-w-lg w-full">
        <div
          className={`text-7xl md:text-8xl font-black bg-gradient-to-br ${GRADE_COLORS[grade]} bg-clip-text text-transparent`}
          style={{ fontFamily: "'Press Start 2P', monospace" }}
        >
          {grade}
        </div>

        <div className="text-white/60 text-sm">
          {grade === "S"
            ? "专注之王！时间小偷望尘莫及！"
            : grade === "A"
            ? "出色！你几乎掌控了所有时间！"
            : grade === "B"
            ? "不错！大部分时间都在你手中！"
            : grade === "C"
            ? "还需努力，别让小偷有机可乘！"
            : "小偷笑开了花……再试一次！"}
        </div>

        <div className="grid grid-cols-3 gap-4 w-full">
          <StatCard label="得分" value={metrics.score.toString()} />
          <StatCard label="专注时间" value={`${focusPercent}%`} />
          <StatCard label="闪避率" value={`${dodgeRate}%`} />
          <StatCard label="最高连击" value={metrics.maxCombo.toString()} />
          <StatCard label="躲避次数" value={metrics.totalDodged.toString()} />
          <StatCard label="被抓次数" value={metrics.totalHits.toString()} />
        </div>

        <div className="w-full bg-white/5 rounded-xl p-4">
          <div className="text-white/40 text-xs mb-3">躲过的分心类型</div>
          <div className="flex flex-wrap gap-2">
            {thiefTypes.map((type) => {
              const config = THIEF_CONFIGS[type];
              const count = metrics.dodgedThieves[type];
              return (
                <div
                  key={type}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm"
                  style={{
                    backgroundColor: count > 0 ? config.color + "20" : "#ffffff08",
                    border: `1px solid ${count > 0 ? config.color + "40" : "#ffffff10"}`,
                    color: count > 0 ? config.color : "#ffffff30",
                  }}
                >
                  <span>{config.emoji}</span>
                  <span>{config.label}</span>
                  <span className="font-bold ml-1">x{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        <button
          onClick={onRestart}
          className="mt-2 px-8 py-3 rounded-xl text-lg font-bold text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 transition-all duration-200 shadow-lg shadow-cyan-500/25 hover:shadow-cyan-400/40 active:scale-95"
        >
          再来一局
        </button>

        <div className={`text-sm font-bold ${GRADE_TEXT_COLORS[grade]}`}>
          别让小偷得逞！
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/5 rounded-lg p-3 flex flex-col items-center gap-1">
      <div className="text-white/40 text-xs">{label}</div>
      <div className="text-white font-bold text-lg">{value}</div>
    </div>
  );
}

function calculateGrade(metrics: GameMetrics): string {
  const focusPercent = metrics.focusTime / metrics.maxFocusTime;
  const scorePerSecond = metrics.score / Math.max(metrics.gameTime, 1);
  const dodgeRate =
    metrics.totalDodged /
    Math.max(metrics.totalDodged + metrics.totalHits, 1);
  const gradeScore =
    focusPercent * 40 +
    Math.min(scorePerSecond / 5, 1) * 30 +
    dodgeRate * 30;
  if (gradeScore >= 90) return "S";
  if (gradeScore >= 75) return "A";
  if (gradeScore >= 55) return "B";
  if (gradeScore >= 35) return "C";
  return "D";
}
