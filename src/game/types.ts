export type ThiefType = 'video' | 'message' | 'meeting' | 'notification' | 'game';

export type GamePhase = 'start' | 'playing' | 'result';

export type Grade = 'S' | 'A' | 'B' | 'C' | 'D';

export interface ThiefConfig {
  type: ThiefType;
  label: string;
  emoji: string;
  focusCost: number;
  frequency: number;
  baseSpeed: number;
  color: string;
  glowColor: string;
}

export const THIEF_CONFIGS: Record<ThiefType, ThiefConfig> = {
  video: {
    type: 'video',
    label: '刷短视频',
    emoji: '📱',
    focusCost: 15,
    frequency: 0.4,
    baseSpeed: 3.5,
    color: '#ff6b9d',
    glowColor: '#ff6b9d80',
  },
  message: {
    type: 'message',
    label: '回消息',
    emoji: '💬',
    focusCost: 10,
    frequency: 0.35,
    baseSpeed: 3,
    color: '#c084fc',
    glowColor: '#c084fc80',
  },
  meeting: {
    type: 'meeting',
    label: '突然开会',
    emoji: '📋',
    focusCost: 20,
    frequency: 0.15,
    baseSpeed: 2.5,
    color: '#fb923c',
    glowColor: '#fb923c80',
  },
  notification: {
    type: 'notification',
    label: '通知提醒',
    emoji: '🔔',
    focusCost: 8,
    frequency: 0.35,
    baseSpeed: 4,
    color: '#fbbf24',
    glowColor: '#fbbf2480',
  },
  game: {
    type: 'game',
    label: '玩游戏',
    emoji: '🎮',
    focusCost: 18,
    frequency: 0.1,
    baseSpeed: 2.8,
    color: '#34d399',
    glowColor: '#34d39980',
  },
};

export interface Player {
  trackIndex: number;
  x: number;
  y: number;
  targetY: number;
  width: number;
  height: number;
  isJumping: boolean;
  jumpProgress: number;
  jumpHeight: number;
  isHit: boolean;
  hitTimer: number;
  runFrame: number;
  runTimer: number;
}

export interface TimeThief {
  type: ThiefType;
  trackIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
  isDodged: boolean;
  isActive: boolean;
  wobbleOffset: number;
  wobbleSpeed: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface StarField {
  x: number;
  y: number;
  size: number;
  speed: number;
  brightness: number;
}

export interface SpeedLine {
  x: number;
  y: number;
  length: number;
  speed: number;
  alpha: number;
}

export interface GameMetrics {
  score: number;
  combo: number;
  maxCombo: number;
  focusTime: number;
  maxFocusTime: number;
  dodgedThieves: Record<ThiefType, number>;
  totalDodged: number;
  totalHits: number;
  difficulty: number;
  gameTime: number;
}

export function calculateGrade(metrics: GameMetrics): Grade {
  const focusPercent = metrics.focusTime / metrics.maxFocusTime;
  const scorePerSecond = metrics.score / Math.max(metrics.gameTime, 1);
  const dodgeRate = metrics.totalDodged / Math.max(metrics.totalDodged + metrics.totalHits, 1);

  const gradeScore = focusPercent * 40 + Math.min(scorePerSecond / 5, 1) * 30 + dodgeRate * 30;

  if (gradeScore >= 90) return 'S';
  if (gradeScore >= 75) return 'A';
  if (gradeScore >= 55) return 'B';
  if (gradeScore >= 35) return 'C';
  return 'D';
}

export function getComboMultiplier(combo: number): number {
  if (combo >= 10) return 3.0;
  if (combo >= 5) return 2.0;
  if (combo >= 3) return 1.5;
  return 1.0;
}
