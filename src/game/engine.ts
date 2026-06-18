import {
  ThiefType,
  PowerUpType,
  GamePhase,
  THIEF_CONFIGS,
  POWERUP_CONFIGS,
  Player,
  TimeThief,
  PowerUp,
  Particle,
  StarField,
  SpeedLine,
  GameMetrics,
  calculateGrade,
  getComboMultiplier,
  getTemporaryMultiplier,
  hasSlowdownEffect,
} from "./types";

const GAME_DURATION = 60;
const TRACK_COUNT = 4;
const PLAYER_X_RATIO = 0.15;
const JUMP_DURATION = 0.4;
const JUMP_HEIGHT_RATIO = 0.6;
const BASE_SPAWN_INTERVAL = 1.4;
const MIN_SPAWN_INTERVAL = 0.35;
const DIFFICULTY_RAMP_TIME = 50;
const INITIAL_FOCUS_TIME = 100;
const PLAYER_SIZE_RATIO = 0.55;
const THIEF_SIZE_RATIO = 0.45;
const TRACK_SWITCH_SPEED = 900;
const STAR_COUNT = 80;
const POWERUP_SPAWN_INTERVAL = 8;
const POWERUP_MIN_SPAWN_INTERVAL = 4;
const POWERUP_SIZE_RATIO = 0.4;
const REWIND_FOCUS_AMOUNT = 25;

interface ScorePopup {
  x: number;
  y: number;
  text: string;
  life: number;
  maxLife: number;
  color: string;
  scale: number;
}

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private dpr = 1;

  phase: GamePhase = "start";
  player!: Player;
  thieves: TimeThief[] = [];
  powerUps: PowerUp[] = [];
  particles: Particle[] = [];
  stars: StarField[] = [];
  speedLines: SpeedLine[] = [];
  scorePopups: ScorePopup[] = [];
  metrics!: GameMetrics;

  private spawnTimer = 0;
  private powerUpSpawnTimer = 0;
  private gameTime = 0;
  private lastTimestamp = 0;
  private animationId = 0;
  private running = false;

  private trackYPositions: number[] = [];
  private trackHeight = 0;
  private trackStartY = 0;

  private shakeTimer = 0;
  private shakeIntensity = 0;
  private flashTimer = 0;
  private flashColor = "";
  private bgScrollX = 0;

  onPhaseChange?: (phase: GamePhase) => void;
  onMetricsUpdate?: (metrics: GameMetrics) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.resize();
    this.initStars();
    this.reset();
  }

  resize() {
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    if (!rect) return;
    this.dpr = window.devicePixelRatio || 1;
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = this.width * this.dpr;
    this.canvas.height = this.height * this.dpr;
    this.canvas.style.width = this.width + "px";
    this.canvas.style.height = this.height + "px";
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.calculateLayout();
    if (this.player) {
      this.player.x = this.width * PLAYER_X_RATIO;
      this.player.targetY = this.trackYPositions[this.player.trackIndex];
      this.player.y = this.player.targetY;
    }
  }

  private calculateLayout() {
    const padding = this.height * 0.08;
    const topOffset = this.height * 0.1;
    const availableHeight = this.height - padding * 2 - topOffset;
    this.trackHeight = availableHeight / TRACK_COUNT;
    this.trackStartY = topOffset + padding;
    this.trackYPositions = [];
    for (let i = 0; i < TRACK_COUNT; i++) {
      this.trackYPositions.push(
        this.trackStartY + this.trackHeight * i + this.trackHeight / 2
      );
    }
  }

  private initStars() {
    this.stars = [];
    for (let i = 0; i < STAR_COUNT; i++) {
      this.stars.push({
        x: Math.random() * 2000,
        y: Math.random() * 1200,
        size: Math.random() * 2 + 0.5,
        speed: Math.random() * 30 + 10,
        brightness: Math.random() * 0.5 + 0.3,
      });
    }
  }

  reset() {
    this.phase = "start";
    this.onPhaseChange?.("start");
    this.thieves = [];
    this.powerUps = [];
    this.particles = [];
    this.speedLines = [];
    this.scorePopups = [];
    this.spawnTimer = 1.5;
    this.powerUpSpawnTimer = 5;
    this.gameTime = 0;
    this.shakeTimer = 0;
    this.flashTimer = 0;
    this.bgScrollX = 0;

    const trackIdx = 1;
    const pw = this.trackHeight * PLAYER_SIZE_RATIO * 0.7;
    const ph = this.trackHeight * PLAYER_SIZE_RATIO;
    this.player = {
      trackIndex: trackIdx,
      x: this.width * PLAYER_X_RATIO,
      y: this.trackYPositions[trackIdx] || 300,
      targetY: this.trackYPositions[trackIdx] || 300,
      width: pw,
      height: ph,
      isJumping: false,
      jumpProgress: 0,
      jumpHeight: this.trackHeight * JUMP_HEIGHT_RATIO,
      isHit: false,
      hitTimer: 0,
      runFrame: 0,
      runTimer: 0,
    };

    this.metrics = {
      score: 0,
      combo: 0,
      maxCombo: 0,
      focusTime: INITIAL_FOCUS_TIME,
      maxFocusTime: INITIAL_FOCUS_TIME,
      dodgedThieves: {
        video: 0,
        message: 0,
        meeting: 0,
        notification: 0,
        game: 0,
      },
      totalDodged: 0,
      totalHits: 0,
      difficulty: 0,
      gameTime: 0,
      pickedUpPowerUps: {
        shield: 0,
        rewind: 0,
        magnifier: 0,
        slowdown: 0,
      },
      activePowerUps: [],
      hasShield: false,
    };
  }

  start() {
    this.phase = "playing";
    this.onPhaseChange?.("playing");
    this.running = true;
    this.lastTimestamp = performance.now();
    this.loop();
  }

  stop() {
    this.running = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = 0;
    }
  }

  destroy() {
    this.stop();
  }

  private loop = () => {
    if (!this.running) return;
    const now = performance.now();
    const dt = Math.min((now - this.lastTimestamp) / 1000, 0.05);
    this.lastTimestamp = now;
    this.update(dt);
    this.render();
    this.animationId = requestAnimationFrame(this.loop);
  };

  private update(dt: number) {
    this.updateStars(dt);
    this.bgScrollX += (60 + this.metrics.difficulty * 120) * dt;

    if (this.phase === "start") return;
    if (this.phase !== "playing") return;

    this.gameTime += dt;
    this.metrics.gameTime = this.gameTime;
    this.metrics.difficulty = Math.min(this.gameTime / DIFFICULTY_RAMP_TIME, 1);

    if (this.gameTime >= GAME_DURATION || this.metrics.focusTime <= 0) {
      this.endGame();
      return;
    }

    this.updatePlayer(dt);
    this.updateSpawning(dt);
    this.updatePowerUpSpawning(dt);
    this.updateThieves(dt);
    this.updatePowerUps(dt);
    this.updateActivePowerUps(dt);
    this.checkCollisions();
    this.checkPowerUpCollisions();
    this.updateParticles(dt);
    this.updateScorePopups(dt);
    this.updateSpeedLines(dt);
    this.updateEffects(dt);
    this.onMetricsUpdate?.(this.metrics);
  }

  private updatePlayer(dt: number) {
    const p = this.player;

    if (p.isJumping) {
      p.jumpProgress += dt / JUMP_DURATION;
      if (p.jumpProgress >= 1) {
        p.isJumping = false;
        p.jumpProgress = 0;
      }
    }

    const dy = p.targetY - p.y;
    const moveAmount = TRACK_SWITCH_SPEED * dt;
    if (Math.abs(dy) < moveAmount) {
      p.y = p.targetY;
    } else {
      p.y += Math.sign(dy) * moveAmount;
    }

    if (p.isHit) {
      p.hitTimer -= dt;
      if (p.hitTimer <= 0) p.isHit = false;
    }

    p.runTimer += dt;
    if (p.runTimer > 0.1) {
      p.runTimer = 0;
      p.runFrame = (p.runFrame + 1) % 4;
    }
  }

  private updateSpawning(dt: number) {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnThief();
      const interval =
        BASE_SPAWN_INTERVAL -
        (BASE_SPAWN_INTERVAL - MIN_SPAWN_INTERVAL) * this.metrics.difficulty;
      this.spawnTimer = interval * (0.8 + Math.random() * 0.4);
    }
  }

  private spawnThief() {
    const trackIndex = Math.floor(Math.random() * TRACK_COUNT);
    const types: ThiefType[] = ["video", "message", "meeting", "notification", "game"];
    const weights = types.map((t) => THIEF_CONFIGS[t].frequency);
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * totalWeight;
    let chosenType: ThiefType = "video";
    for (let i = 0; i < types.length; i++) {
      r -= weights[i];
      if (r <= 0) {
        chosenType = types[i];
        break;
      }
    }

    const config = THIEF_CONFIGS[chosenType];
    const size = this.trackHeight * THIEF_SIZE_RATIO;
    const speed = config.baseSpeed * (1 + this.metrics.difficulty * 0.8);

    this.thieves.push({
      type: chosenType,
      trackIndex,
      x: this.width + size,
      y: this.trackYPositions[trackIndex],
      width: size * 0.8,
      height: size,
      speed,
      isDodged: false,
      isActive: true,
      wobbleOffset: Math.random() * Math.PI * 2,
      wobbleSpeed: 3 + Math.random() * 2,
    });
  }

  private updateThieves(dt: number) {
    const slowdown = hasSlowdownEffect(this.metrics.activePowerUps) ? 0.5 : 1;
    for (const thief of this.thieves) {
      if (!thief.isActive) continue;
      thief.x -= thief.speed * dt * 60 * slowdown;
      thief.wobbleOffset += thief.wobbleSpeed * dt;
      if (thief.x < -thief.width * 2) {
        thief.isActive = false;
      }
    }
    this.thieves = this.thieves.filter((t) => t.isActive);
  }

  private checkCollisions() {
    const p = this.player;

    for (const thief of this.thieves) {
      if (!thief.isActive || thief.isDodged) continue;

      const thiefRight = thief.x + thief.width / 2;
      const playerLeft = p.x - p.width / 2;
      const playerRight = p.x + p.width / 2;
      const thiefLeft = thief.x - thief.width / 2;

      if (thiefRight < playerLeft) {
        if (!thief.isDodged) {
          thief.isDodged = true;
          this.handleDodge(thief);
        }
        continue;
      }

      if (thiefLeft < playerRight && thiefRight > playerLeft) {
        if (thief.trackIndex === p.trackIndex && !p.isJumping) {
          thief.isDodged = true;
          thief.isActive = false;
          this.handleHit(thief);
        }
      }
    }
  }

  private handleDodge(thief: TimeThief) {
    this.metrics.combo++;
    if (this.metrics.combo > this.metrics.maxCombo) {
      this.metrics.maxCombo = this.metrics.combo;
    }
    this.metrics.totalDodged++;
    this.metrics.dodgedThieves[thief.type]++;

    const comboMultiplier = getComboMultiplier(this.metrics.combo);
    const tempMultiplier = getTemporaryMultiplier(this.metrics.activePowerUps);
    const totalMultiplier = comboMultiplier + tempMultiplier;
    const baseScore = 10;
    const points = Math.floor(baseScore * totalMultiplier);
    this.metrics.score += points;

    const config = THIEF_CONFIGS[thief.type];
    this.spawnDodgeParticles(thief.x, thief.y, config.color);

    const comboText =
      this.metrics.combo >= 3 ? ` x${totalMultiplier.toFixed(1)}` : "";
    this.scorePopups.push({
      x: thief.x,
      y: thief.y - thief.height,
      text: `+${points}${comboText}`,
      life: 0.8,
      maxLife: 0.8,
      color: tempMultiplier > 0 ? "#fbbf24" : (this.metrics.combo >= 5 ? "#ffd700" : config.color),
      scale: tempMultiplier > 0 ? 1.4 : (this.metrics.combo >= 5 ? 1.3 : 1),
    });
  }

  private handleHit(thief: TimeThief) {
    const config = THIEF_CONFIGS[thief.type];

    if (this.metrics.hasShield) {
      this.metrics.hasShield = false;
      this.metrics.activePowerUps = this.metrics.activePowerUps.filter(
        (p) => p.type !== "shield"
      );
      this.triggerShake(4, 0.2);
      this.triggerFlash("#60a5fa40", 0.2);
      this.spawnShieldBreakParticles(this.player.x, this.player.y);
      this.scorePopups.push({
        x: this.player.x,
        y: this.player.y - this.player.height,
        text: "护盾抵挡!",
        life: 1.0,
        maxLife: 1.0,
        color: "#60a5fa",
        scale: 1.3,
      });
      return;
    }

    this.metrics.focusTime = Math.max(0, this.metrics.focusTime - config.focusCost);
    this.metrics.combo = 0;
    this.metrics.totalHits++;

    this.player.isHit = true;
    this.player.hitTimer = 0.5;

    this.triggerShake(8, 0.3);
    this.triggerFlash("#ff000040", 0.2);

    this.spawnHitParticles(this.player.x, this.player.y);

    this.scorePopups.push({
      x: this.player.x,
      y: this.player.y - this.player.height,
      text: `-${config.focusCost}`,
      life: 1.0,
      maxLife: 1.0,
      color: "#ff4444",
      scale: 1.2,
    });
  }

  private spawnDodgeParticles(x: number, y: number, color: string) {
    for (let i = 0; i < 12; i++) {
      const angle = (Math.PI * 2 * i) / 12 + Math.random() * 0.5;
      const speed = 60 + Math.random() * 100;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.4 + Math.random() * 0.3,
        maxLife: 0.7,
        color,
        size: 2 + Math.random() * 3,
      });
    }
  }

  private spawnHitParticles(x: number, y: number) {
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 150;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.5 + Math.random() * 0.4,
        maxLife: 0.9,
        color: i % 2 === 0 ? "#ff4444" : "#ff8800",
        size: 3 + Math.random() * 4,
      });
    }
  }

  private spawnShieldBreakParticles(x: number, y: number) {
    for (let i = 0; i < 16; i++) {
      const angle = (Math.PI * 2 * i) / 16;
      const speed = 100 + Math.random() * 80;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.5 + Math.random() * 0.3,
        maxLife: 0.8,
        color: i % 2 === 0 ? "#60a5fa" : "#93c5fd",
        size: 3 + Math.random() * 4,
      });
    }
  }

  private spawnPowerUpParticles(x: number, y: number, color: string) {
    for (let i = 0; i < 16; i++) {
      const angle = (Math.PI * 2 * i) / 16 + Math.random() * 0.3;
      const speed = 80 + Math.random() * 120;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.5 + Math.random() * 0.3,
        maxLife: 0.8,
        color,
        size: 3 + Math.random() * 3,
      });
    }
  }

  private updateParticles(dt: number) {
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  private updateScorePopups(dt: number) {
    for (const sp of this.scorePopups) {
      sp.y -= 50 * dt;
      sp.life -= dt;
    }
    this.scorePopups = this.scorePopups.filter((sp) => sp.life > 0);
  }

  private updatePowerUpSpawning(dt: number) {
    this.powerUpSpawnTimer -= dt;
    if (this.powerUpSpawnTimer <= 0) {
      this.spawnPowerUp();
      const interval =
        POWERUP_SPAWN_INTERVAL -
        (POWERUP_SPAWN_INTERVAL - POWERUP_MIN_SPAWN_INTERVAL) * this.metrics.difficulty;
      this.powerUpSpawnTimer = interval * (0.7 + Math.random() * 0.6);
    }
  }

  private spawnPowerUp() {
    const trackIndex = Math.floor(Math.random() * TRACK_COUNT);
    const types: PowerUpType[] = ["shield", "rewind", "magnifier", "slowdown"];
    const weights = types.map((t) => POWERUP_CONFIGS[t].frequency);
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * totalWeight;
    let chosenType: PowerUpType = "shield";
    for (let i = 0; i < types.length; i++) {
      r -= weights[i];
      if (r <= 0) {
        chosenType = types[i];
        break;
      }
    }

    const config = POWERUP_CONFIGS[chosenType];
    const size = this.trackHeight * POWERUP_SIZE_RATIO;

    this.powerUps.push({
      type: chosenType,
      trackIndex,
      x: this.width + size,
      y: this.trackYPositions[trackIndex],
      width: size,
      height: size,
      isActive: true,
      isPickedUp: false,
      wobbleOffset: Math.random() * Math.PI * 2,
      wobbleSpeed: 2 + Math.random() * 1.5,
      pulsePhase: Math.random() * Math.PI * 2,
    });
  }

  private updatePowerUps(dt: number) {
    const slowdown = hasSlowdownEffect(this.metrics.activePowerUps) ? 0.5 : 1;
    for (const powerUp of this.powerUps) {
      if (!powerUp.isActive) continue;
      powerUp.x -= 200 * dt * slowdown;
      powerUp.wobbleOffset += powerUp.wobbleSpeed * dt;
      powerUp.pulsePhase += dt * 3;
      if (powerUp.x < -powerUp.width * 2) {
        powerUp.isActive = false;
      }
    }
    this.powerUps = this.powerUps.filter((p) => p.isActive && !p.isPickedUp);
  }

  private updateActivePowerUps(dt: number) {
    for (const active of this.metrics.activePowerUps) {
      if (active.totalDuration > 0) {
        active.remainingTime -= dt;
      }
    }
    this.metrics.activePowerUps = this.metrics.activePowerUps.filter(
      (p) => p.totalDuration === 0 || p.remainingTime > 0
    );
  }

  private checkPowerUpCollisions() {
    const p = this.player;

    for (const powerUp of this.powerUps) {
      if (!powerUp.isActive || powerUp.isPickedUp) continue;

      const dx = powerUp.x - p.x;
      const dy = powerUp.y - p.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const hitRadius = (p.width + powerUp.width) / 2;

      if (distance < hitRadius && powerUp.trackIndex === p.trackIndex) {
        powerUp.isPickedUp = true;
        powerUp.isActive = false;
        this.handlePowerUpPickup(powerUp);
      }
    }
  }

  private handlePowerUpPickup(powerUp: PowerUp) {
    const config = POWERUP_CONFIGS[powerUp.type];
    this.metrics.pickedUpPowerUps[powerUp.type]++;

    switch (powerUp.type) {
      case "shield":
        this.metrics.hasShield = true;
        this.metrics.activePowerUps.push({
          type: "shield",
          remainingTime: 0,
          totalDuration: 0,
        });
        break;
      case "rewind":
        this.metrics.focusTime = Math.min(
          this.metrics.maxFocusTime,
          this.metrics.focusTime + REWIND_FOCUS_AMOUNT
        );
        break;
      case "magnifier":
      case "slowdown":
        this.metrics.activePowerUps.push({
          type: powerUp.type,
          remainingTime: config.duration,
          totalDuration: config.duration,
        });
        break;
    }

    this.spawnPowerUpParticles(powerUp.x, powerUp.y, config.color);
    this.triggerFlash(config.glowColor, 0.15);

    this.scorePopups.push({
      x: powerUp.x,
      y: powerUp.y - powerUp.height,
      text: config.label,
      life: 1.2,
      maxLife: 1.2,
      color: config.color,
      scale: 1.2,
    });
  }

  private updateStars(dt: number) {
    for (const star of this.stars) {
      star.x -= star.speed * dt;
      if (star.x < -5) {
        star.x = this.width + 5;
        star.y = Math.random() * this.height;
      }
    }
  }

  private updateSpeedLines(dt: number) {
    if (this.phase === "playing" && Math.random() < this.metrics.difficulty * 0.3) {
      this.speedLines.push({
        x: this.width,
        y: Math.random() * this.height,
        length: 30 + Math.random() * 60,
        speed: 400 + Math.random() * 300 + this.metrics.difficulty * 200,
        alpha: 0.1 + Math.random() * 0.15,
      });
    }
    for (const line of this.speedLines) {
      line.x -= line.speed * dt;
    }
    this.speedLines = this.speedLines.filter((l) => l.x + l.length > 0);
  }

  private updateEffects(dt: number) {
    if (this.shakeTimer > 0) {
      this.shakeTimer -= dt;
      this.shakeIntensity *= 0.92;
    }
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
    }
  }

  private triggerShake(intensity: number, duration: number) {
    this.shakeIntensity = intensity;
    this.shakeTimer = duration;
  }

  private triggerFlash(color: string, duration: number) {
    this.flashColor = color;
    this.flashTimer = duration;
  }

  private endGame() {
    this.phase = "result";
    this.onPhaseChange?.("result");
    this.onMetricsUpdate?.(this.metrics);
  }

  handleKeyDown(key: string) {
    if (this.phase === "start") {
      if (key === " " || key === "Enter") {
        this.start();
      }
      return;
    }
    if (this.phase === "result") {
      if (key === " " || key === "Enter") {
        this.reset();
        this.start();
      }
      return;
    }
    if (this.phase !== "playing") return;

    switch (key) {
      case "ArrowUp":
      case "w":
      case "W":
        this.moveTrack(-1);
        break;
      case "ArrowDown":
      case "s":
      case "S":
        this.moveTrack(1);
        break;
      case " ":
        this.jump();
        break;
    }
  }

  private moveTrack(direction: number) {
    const p = this.player;
    const newTrack = p.trackIndex + direction;
    if (newTrack < 0 || newTrack >= TRACK_COUNT) return;
    p.trackIndex = newTrack;
    p.targetY = this.trackYPositions[newTrack];
  }

  private jump() {
    if (this.player.isJumping) return;
    this.player.isJumping = true;
    this.player.jumpProgress = 0;
  }

  handleTouchStart(y: number) {
    this.touchStartY = y;
  }

  handleTouchEnd(y: number) {
    if (this.phase === "start") {
      this.start();
      return;
    }
    if (this.phase === "result") {
      this.reset();
      this.start();
      return;
    }

    const dy = y - this.touchStartY;
    if (Math.abs(dy) < 20) {
      this.jump();
      return;
    }
    if (dy < 0) this.moveTrack(-1);
    else this.moveTrack(1);
  }

  private touchStartY = 0;

  private render() {
    const ctx = this.ctx;
    ctx.save();

    if (this.shakeTimer > 0) {
      const sx = (Math.random() - 0.5) * this.shakeIntensity * 2;
      const sy = (Math.random() - 0.5) * this.shakeIntensity * 2;
      ctx.translate(sx, sy);
    }

    this.renderBackground();
    this.renderSpeedLinesLayer();
    this.renderTracks();
    this.renderThieves();
    this.renderPowerUps();
    this.renderPlayer();
    this.renderParticlesLayer();
    this.renderScorePopupsLayer();

    if (this.phase === "playing") {
      this.renderHUD();
    }

    this.renderFlash();

    ctx.restore();
  }

  private renderBackground() {
    const ctx = this.ctx;
    const gradient = ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, "#0a0a2e");
    gradient.addColorStop(0.5, "#0d0d1a");
    gradient.addColorStop(1, "#050510");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);

    for (const star of this.stars) {
      if (star.x < 0 || star.x > this.width) continue;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200, 220, 255, ${star.brightness})`;
      ctx.fill();
    }
  }

  private renderSpeedLinesLayer() {
    const ctx = this.ctx;
    for (const line of this.speedLines) {
      ctx.beginPath();
      ctx.moveTo(line.x, line.y);
      ctx.lineTo(line.x + line.length, line.y);
      ctx.strokeStyle = `rgba(150, 180, 255, ${line.alpha})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  private renderTracks() {
    const ctx = this.ctx;

    for (let i = 0; i < TRACK_COUNT; i++) {
      const y = this.trackYPositions[i];
      const halfH = this.trackHeight / 2 - 2;

      ctx.fillStyle = `rgba(20, 20, 50, ${0.3 + i * 0.05})`;
      ctx.fillRect(0, y - halfH, this.width, this.trackHeight - 4);

      ctx.strokeStyle = "rgba(60, 60, 120, 0.3)";
      ctx.lineWidth = 1;
      ctx.setLineDash([8, 12]);
      ctx.beginPath();
      ctx.moveTo(0, y - halfH);
      ctx.lineTo(this.width, y - halfH);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, y + halfH);
      ctx.lineTo(this.width, y + halfH);
      ctx.stroke();
      ctx.setLineDash([]);

      const gridSpacing = 60;
      const offset = this.bgScrollX % gridSpacing;
      ctx.strokeStyle = "rgba(40, 40, 80, 0.2)";
      ctx.lineWidth = 1;
      for (let gx = -offset; gx < this.width; gx += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(gx, y - halfH);
        ctx.lineTo(gx, y + halfH);
        ctx.stroke();
      }
    }
  }

  private renderPlayer() {
    const ctx = this.ctx;
    const p = this.player;
    let drawY = p.y;

    if (p.isJumping) {
      const jumpArc = Math.sin(p.jumpProgress * Math.PI);
      drawY = p.y - p.jumpHeight * jumpArc;
    }

    ctx.save();

    if (p.isHit) {
      const flash = Math.sin(p.hitTimer * 20) > 0;
      if (flash) {
        ctx.globalAlpha = 0.5;
      }
    }

    ctx.shadowColor = "#4fc3f7";
    ctx.shadowBlur = 15;

    const cx = p.x;
    const cy = drawY;
    const hw = p.width / 2;
    const hh = p.height / 2;

    ctx.fillStyle = "#4fc3f7";
    ctx.beginPath();
    ctx.moveTo(cx, cy - hh);
    ctx.lineTo(cx + hw, cy);
    ctx.lineTo(cx, cy + hh);
    ctx.lineTo(cx - hw, cy);
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0;

    ctx.fillStyle = "#b3e5fc";
    ctx.beginPath();
    ctx.moveTo(cx, cy - hh * 0.5);
    ctx.lineTo(cx + hw * 0.4, cy);
    ctx.lineTo(cx, cy + hh * 0.5);
    ctx.lineTo(cx - hw * 0.4, cy);
    ctx.closePath();
    ctx.fill();

    if (!p.isJumping) {
      const legOffset = Math.sin(p.runFrame * Math.PI * 0.5) * 6;
      ctx.strokeStyle = "#4fc3f7";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx - 4, cy + hh);
      ctx.lineTo(cx - 4 + legOffset, cy + hh + 10);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + 4, cy + hh);
      ctx.lineTo(cx + 4 - legOffset, cy + hh + 10);
      ctx.stroke();
    } else {
      ctx.strokeStyle = "#4fc3f7";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx - 4, cy + hh);
      ctx.lineTo(cx - 6, cy + hh + 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + 4, cy + hh);
      ctx.lineTo(cx + 6, cy + hh + 4);
      ctx.stroke();
    }

    if (p.isJumping) {
      for (let i = 0; i < 3; i++) {
        const trailY = cy + hh + 8 + i * 6;
        ctx.strokeStyle = `rgba(79, 195, 247, ${0.4 - i * 0.12})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - 8, trailY);
        ctx.lineTo(cx + 8, trailY);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  private renderThieves() {
    const ctx = this.ctx;

    for (const thief of this.thieves) {
      if (!thief.isActive) continue;
      const config = THIEF_CONFIGS[thief.type];
      const wobbleY = Math.sin(thief.wobbleOffset) * 3;
      const cx = thief.x;
      const cy = thief.y + wobbleY;

      ctx.save();

      ctx.shadowColor = config.glowColor;
      ctx.shadowBlur = 20;

      ctx.fillStyle = config.color + "30";
      ctx.beginPath();
      ctx.arc(cx, cy, thief.width * 0.7, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 0;

      ctx.font = `${thief.height * 0.7}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(config.emoji, cx, cy);

      const labelY = cy + thief.height * 0.5 + 8;
      ctx.font = `bold ${Math.max(10, this.trackHeight * 0.12)}px "Noto Sans SC", sans-serif`;
      ctx.fillStyle = config.color;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(config.label, cx, labelY);

      ctx.restore();
    }
  }

  private renderPowerUps() {
    const ctx = this.ctx;

    for (const powerUp of this.powerUps) {
      if (!powerUp.isActive) continue;
      const config = POWERUP_CONFIGS[powerUp.type];
      const wobbleY = Math.sin(powerUp.wobbleOffset) * 5;
      const pulseScale = 1 + Math.sin(powerUp.pulsePhase) * 0.1;
      const cx = powerUp.x;
      const cy = powerUp.y + wobbleY;

      ctx.save();

      ctx.shadowColor = config.glowColor;
      ctx.shadowBlur = 25;

      const radius = (powerUp.width / 2) * pulseScale;
      ctx.fillStyle = config.color + "25";
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.3, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = config.color + "40";
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 0;

      ctx.font = `${powerUp.height * 0.75 * pulseScale}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(config.emoji, cx, cy);

      const labelY = cy + powerUp.height * 0.5 + 8;
      ctx.font = `bold ${Math.max(10, this.trackHeight * 0.11)}px "Noto Sans SC", sans-serif`;
      ctx.fillStyle = config.color;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(config.label, cx, labelY);

      ctx.restore();
    }
  }

  private renderParticlesLayer() {
    const ctx = this.ctx;
    for (const p of this.particles) {
      const alpha = p.life / p.maxLife;
      ctx.fillStyle =
        p.color + Math.floor(alpha * 255).toString(16).padStart(2, "0");
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private renderScorePopupsLayer() {
    const ctx = this.ctx;
    for (const sp of this.scorePopups) {
      const alpha = sp.life / sp.maxLife;
      const scale = sp.scale * (0.8 + 0.2 * alpha);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `bold ${Math.floor(18 * scale)}px "Noto Sans SC", sans-serif`;
      ctx.fillStyle = sp.color;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = sp.color;
      ctx.shadowBlur = 8;
      ctx.fillText(sp.text, sp.x, sp.y);
      ctx.restore();
    }
  }

  private renderHUD() {
    const ctx = this.ctx;

    const scoreFontSize = Math.max(18, this.width * 0.025);
    ctx.font = `bold ${scoreFontSize}px "Press Start 2P", monospace`;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.shadowColor = "#4fc3f780";
    ctx.shadowBlur = 4;
    ctx.fillText(`${this.metrics.score}`, 20, 15);
    ctx.shadowBlur = 0;

    if (this.metrics.combo >= 3) {
      const comboFontSize = Math.max(14, this.width * 0.018);
      const comboScale = 1 + Math.sin(performance.now() * 0.01) * 0.05;
      ctx.save();
      ctx.translate(this.width / 2, 30);
      ctx.scale(comboScale, comboScale);
      ctx.font = `bold ${comboFontSize}px "Press Start 2P", monospace`;
      ctx.fillStyle = this.metrics.combo >= 10 ? "#ffd700" : this.metrics.combo >= 5 ? "#ff9800" : "#4fc3f7";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 10;
      const multiplier = getComboMultiplier(this.metrics.combo);
      ctx.fillText(`${this.metrics.combo} COMBO x${multiplier}`, 0, 0);
      ctx.restore();
    }

    const barWidth = this.width * 0.3;
    const barHeight = 12;
    const barX = this.width / 2 - barWidth / 2;
    const barY = 10;
    const focusRatio = this.metrics.focusTime / this.metrics.maxFocusTime;

    ctx.fillStyle = "#1a1a3a";
    ctx.fillRect(barX, barY, barWidth, barHeight);

    const barGradient = ctx.createLinearGradient(barX, 0, barX + barWidth * focusRatio, 0);
    if (focusRatio > 0.5) {
      barGradient.addColorStop(0, "#4fc3f7");
      barGradient.addColorStop(1, "#29b6f6");
    } else if (focusRatio > 0.25) {
      barGradient.addColorStop(0, "#ffa726");
      barGradient.addColorStop(1, "#fb8c00");
    } else {
      barGradient.addColorStop(0, "#ef5350");
      barGradient.addColorStop(1, "#c62828");
    }
    ctx.fillStyle = barGradient;
    ctx.fillRect(barX, barY, barWidth * focusRatio, barHeight);

    ctx.strokeStyle = "#3a3a6a";
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barWidth, barHeight);

    ctx.font = `bold 10px "Noto Sans SC", sans-serif`;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`专注 ${Math.ceil(this.metrics.focusTime)}%`, barX + barWidth / 2, barY + barHeight / 2);

    const timeLeft = Math.max(0, GAME_DURATION - this.gameTime);
    const timeFontSize = Math.max(14, this.width * 0.02);
    ctx.font = `bold ${timeFontSize}px "Press Start 2P", monospace`;
    ctx.fillStyle = timeLeft < 10 ? "#ef5350" : "#ffffff";
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText(`${Math.ceil(timeLeft)}s`, this.width - 20, 15);

    let powerUpX = 20;
    const powerUpY = 55;
    const powerUpSize = 36;
    const powerUpGap = 10;

    if (this.metrics.hasShield) {
      const config = POWERUP_CONFIGS.shield;
      ctx.save();
      ctx.shadowColor = config.glowColor;
      ctx.shadowBlur = 15;
      ctx.fillStyle = config.color + "30";
      ctx.beginPath();
      ctx.arc(powerUpX + powerUpSize / 2, powerUpY + powerUpSize / 2, powerUpSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.font = `${powerUpSize * 0.65}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(config.emoji, powerUpX + powerUpSize / 2, powerUpY + powerUpSize / 2);
      ctx.font = `bold 10px "Noto Sans SC", sans-serif`;
      ctx.fillStyle = config.color;
      ctx.fillText("护盾", powerUpX + powerUpSize / 2, powerUpY + powerUpSize + 12);
      ctx.restore();
      powerUpX += powerUpSize + powerUpGap;
    }

    for (const active of this.metrics.activePowerUps) {
      if (active.type === "shield") continue;
      const config = POWERUP_CONFIGS[active.type];
      const progress = active.remainingTime / active.totalDuration;

      ctx.save();
      ctx.shadowColor = config.glowColor;
      ctx.shadowBlur = 15;

      ctx.fillStyle = config.color + "25";
      ctx.beginPath();
      ctx.arc(powerUpX + powerUpSize / 2, powerUpY + powerUpSize / 2, powerUpSize / 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = config.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(
        powerUpX + powerUpSize / 2,
        powerUpY + powerUpSize / 2,
        powerUpSize / 2 + 3,
        -Math.PI / 2,
        -Math.PI / 2 + progress * Math.PI * 2
      );
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.font = `${powerUpSize * 0.6}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(config.emoji, powerUpX + powerUpSize / 2, powerUpY + powerUpSize / 2);

      ctx.font = `bold 10px "Noto Sans SC", sans-serif`;
      ctx.fillStyle = config.color;
      ctx.fillText(
        `${Math.ceil(active.remainingTime)}s`,
        powerUpX + powerUpSize / 2,
        powerUpY + powerUpSize + 12
      );

      ctx.restore();
      powerUpX += powerUpSize + powerUpGap;
    }
  }

  private renderFlash() {
    if (this.flashTimer <= 0) return;
    const alpha = this.flashTimer / 0.2;
    this.ctx.fillStyle = this.flashColor;
    this.ctx.globalAlpha = alpha;
    this.ctx.fillRect(0, 0, this.width, this.height);
    this.ctx.globalAlpha = 1;
  }

  getGrade(): string {
    return calculateGrade(this.metrics);
  }
}
