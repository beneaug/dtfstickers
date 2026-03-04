interface Particle {
  emoji: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  scale: number;
  targetScale: number;
  life: number;
  maxLife: number;
  fontSize: number;
}

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let particles: Particle[] = [];
let rafId: number | null = null;
let dpr = 1;

const emojiCache = new Map<string, HTMLCanvasElement>();

function getEmojiImage(emoji: string, size: number): HTMLCanvasElement {
  const key = `${emoji}-${size}`;
  const cached = emojiCache.get(key);
  if (cached) return cached;

  const s = Math.round(size * dpr);
  const pad = Math.round(s * 0.5);
  const dim = s + pad * 2;
  const c = document.createElement("canvas");
  c.width = dim;
  c.height = dim;
  const octx = c.getContext("2d")!;
  octx.font = `${s}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  octx.textAlign = "center";
  octx.textBaseline = "middle";
  octx.fillText(emoji, dim / 2, dim / 2);

  emojiCache.set(key, c);
  return c;
}

export function registerCanvas(c: HTMLCanvasElement): void {
  canvas = c;
  ctx = c.getContext("2d");
  dpr = window.devicePixelRatio || 1;
  resize();
  window.addEventListener("resize", resize);
}

export function unregisterCanvas(): void {
  window.removeEventListener("resize", resize);
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  canvas = null;
  ctx = null;
  particles = [];
}

function resize(): void {
  if (!canvas) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
}

const GRAVITY = 0.12;

export function burst(
  x: number,
  y: number,
  emojis: string[],
  count = 5,
): void {
  if (!canvas) return;
  for (let i = 0; i < count; i++) {
    const emoji = emojis[Math.floor(Math.random() * emojis.length)];
    particles.push({
      emoji,
      x: x * dpr,
      y: y * dpr,
      vx: (Math.random() - 0.5) * 10 * dpr,
      vy: -(Math.random() * 5 + 2) * dpr,
      rotation: (Math.random() - 0.5) * 0.4,
      scale: 0.15,
      targetScale: 0.5 + Math.random() * 0.5,
      life: 0,
      maxLife: 80 + Math.floor(Math.random() * 30),
      fontSize: 22 + Math.floor(Math.random() * 18),
    });
  }
  if (rafId === null) startLoop();
}

function startLoop(): void {
  const tick = () => {
    if (!ctx || !canvas || particles.length === 0) {
      rafId = null;
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life++;

      if (p.life >= p.maxLife) {
        particles.splice(i, 1);
        continue;
      }

      // Physics
      p.vy += GRAVITY * dpr;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;

      // Spring-in scale
      p.scale += (p.targetScale - p.scale) * 0.25;

      // Rotation from horizontal velocity
      p.rotation += p.vx * 0.004;

      // Fade in last 30%
      const lifeRatio = p.life / p.maxLife;
      const opacity = lifeRatio > 0.7 ? 1 - (lifeRatio - 0.7) / 0.3 : 1;

      const img = getEmojiImage(p.emoji, p.fontSize);
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.scale(p.scale, p.scale);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      ctx.restore();
    }

    rafId = requestAnimationFrame(tick);
  };

  rafId = requestAnimationFrame(tick);
}
