import { useEffect, useRef, useState } from 'react'
import type { Quest } from '@/lib/types'
import { inferCinema, offreLabel, type QuestCinemaTheme } from '@/lib/questCinema'
import { DIFFICULTY_LABELS } from '@/lib/format'

type Phase = 'title' | 'entrance' | 'dialogue' | 'climax' | 'outro' | 'ended'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  tw: number
}

interface Sim {
  phase: Phase
  t: number
  gt: number
  lineIdx: number
  charIdx: number
  holdT: number
  heroX: number
  heroWalk: boolean
  talking: boolean
  embers: Particle[]
  twinkle: number[]
  seed: number
}

const CHAR_SPEED = 62 // caractères par seconde
const LINE_HOLD = 1.05 // secondes d'attente entre deux répliques

function mulberry32(seed: number) {
  return () => {
    let a = seed
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hexToRgba(hex: string, a: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

function makeParticles(theme: QuestCinemaTheme, w: number, h: number, rnd: () => number): Particle[] {
  const count = Math.max(36, Math.floor((w * h) / 18000))
  const particles: Particle[] = []
  const upward = theme.particles === 'embers'
  for (let i = 0; i < count; i += 1) {
    particles.push({
      x: rnd() * w,
      y: upward ? h * (0.4 + rnd() * 0.6) : rnd() * h,
      vx: (rnd() - 0.5) * 14,
      vy: upward ? -(8 + rnd() * 26) : (rnd() - 0.5) * 12,
      size: 0.8 + rnd() * 2.4,
      tw: rnd() * Math.PI * 2,
    })
  }
  return particles
}

function resetSim(theme: QuestCinemaTheme, w: number, h: number): Sim {
  const seed = Math.floor(Math.random() * 1_000_000)
  const rnd = mulberry32(seed)
  const twinkle: number[] = []
  for (let i = 0; i < 90; i += 1) twinkle.push(rnd() * w, rnd() * h * 0.7, rnd() * Math.PI * 2)
  return {
    phase: 'title',
    t: 0,
    gt: 0,
    lineIdx: 0,
    charIdx: 0,
    holdT: 0,
    heroX: -140,
    heroWalk: false,
    talking: false,
    embers: makeParticles(theme, w, h, rnd),
    twinkle,
    seed,
  }
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const test = current ? `${current} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current)
      current = word
    } else {
      current = test
    }
  }
  if (current) lines.push(current)
  return lines
}

// ---------------------------------------------------------------------------
// Dessin du décor
// ---------------------------------------------------------------------------

function drawSky(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  sim: Sim,
  theme: QuestCinemaTheme,
  t: number,
) {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#07060d')
  g.addColorStop(0.55, '#0d0a18')
  g.addColorStop(0.8, hexToRgba(theme.accentSoft, 0.28))
  g.addColorStop(1, hexToRgba(theme.accent, 0.55))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  // Étoiles scintillantes
  for (let i = 0; i < sim.twinkle.length; i += 3) {
    const sx = sim.twinkle[i]
    const sy = sim.twinkle[i + 1]
    const phase = sim.twinkle[i + 2] + t * 1.2
    const a = 0.25 + 0.55 * Math.abs(Math.sin(phase))
    ctx.fillStyle = `rgba(255, 245, 220, ${a})`
    ctx.beginPath()
    ctx.arc(sx, sy, 0.7 + a * 0.9, 0, Math.PI * 2)
    ctx.fill()
  }

  // Brumes dérivantes
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < 3; i += 1) {
    const bx = ((i * 0.37 + t * 0.012) % 1.3 - 0.15) * w
    const grad = ctx.createRadialGradient(bx, h * (0.55 + i * 0.12), 10, bx, h * (0.55 + i * 0.12), w * 0.5)
    grad.addColorStop(0, hexToRgba(theme.accentSoft, 0.16))
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)
  }
  ctx.globalCompositeOperation = 'source-over'

  // Sol
  const floorY = h * 0.82
  const fg = ctx.createLinearGradient(0, floorY, 0, h)
  fg.addColorStop(0, hexToRgba(theme.accent, 0.4))
  fg.addColorStop(0.12, '#0b0813')
  fg.addColorStop(1, '#05040a')
  ctx.fillStyle = fg
  ctx.fillRect(0, floorY, w, h - floorY)
  ctx.strokeStyle = hexToRgba(theme.accent, 0.5)
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.moveTo(0, floorY)
  ctx.lineTo(w, floorY)
  ctx.stroke()
}

function drawBiome(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  sim: Sim,
  theme: QuestCinemaTheme,
) {
  const rnd = mulberry32(sim.seed + 7)
  const floorY = h * 0.82
  const ac = theme.accent
  const soft = theme.accentSoft

  if (theme.biome === 'citadelle') {
    // Tours de données avec fenêtres lumineuses
    for (let i = 0; i < 5; i += 1) {
      const bx = w * (0.06 + i * 0.24 + rnd() * 0.06)
      const bw = w * (0.045 + rnd() * 0.02)
      const bh = h * (0.34 + rnd() * 0.2)
      const top = floorY - bh
      const tg = ctx.createLinearGradient(bx, top, bx + bw, top)
      tg.addColorStop(0, '#241d3a')
      tg.addColorStop(1, '#120d20')
      ctx.fillStyle = tg
      ctx.fillRect(bx, top, bw, bh)
      ctx.strokeStyle = hexToRgba(ac, 0.22)
      ctx.strokeRect(bx, top, bw, bh)
      for (let fy = top + 8; fy < floorY - 8; fy += h * 0.045) {
        for (let fx = bx + 4; fx < bx + bw - 6; fx += 9) {
          if (rnd() > 0.62) {
            ctx.fillStyle = hexToRgba(ac, 0.5 + 0.3 * Math.sin(sim.gt * 2 + fx))
            ctx.fillRect(fx, fy, 4, h * 0.018)
          }
        }
      }
    }
    // Circuit lumineux entre les tours
    ctx.strokeStyle = hexToRgba(ac, 0.35)
    ctx.lineWidth = 1.2
    ctx.setLineDash([6, 7])
    ctx.lineDashOffset = -sim.gt * 14
    ctx.beginPath()
    ctx.moveTo(0, floorY - h * 0.42)
    for (let x = 0; x <= w; x += w / 8) {
      ctx.lineTo(x, floorY - h * 0.42 + Math.sin(x * 0.012 + sim.gt * 0.7) * h * 0.03)
    }
    ctx.stroke()
    ctx.setLineDash([])
  } else if (theme.biome === 'foret') {
    for (let i = 0; i < 8; i += 1) {
      const bx = w * (rnd() * 1.02)
      const bh = h * (0.3 + rnd() * 0.22)
      ctx.fillStyle = '#0c0a14'
      ctx.beginPath()
      ctx.ellipse(bx, floorY - bh * 0.1, w * 0.05, bh * 0.9, 0, Math.PI, 0)
      ctx.fill()
      ctx.fillStyle = '#171226'
      ctx.fillRect(bx - 3, floorY - bh * 0.32, 6, bh * 0.32)
    }
  } else if (theme.biome === 'temple') {
    for (let i = 0; i < 4; i += 1) {
      const bx = w * (0.05 + i * 0.3)
      const bw = w * 0.06
      const top = floorY - h * 0.48
      ctx.fillStyle = '#171228'
      ctx.fillRect(bx, top, bw, h * 0.48)
      ctx.fillStyle = hexToRgba(ac, 0.5)
      ctx.fillRect(bx - 4, top, bw + 8, 5)
      ctx.fillStyle = '#0d0a17'
      ctx.fillRect(bx + bw * 0.3, top + h * 0.06, bw * 0.4, h * 0.34)
    }
    // Symboles flottants
    for (let i = 0; i < 8; i += 1) {
      const sx = w * (0.1 + i * 0.12)
      const sy = floorY - h * (0.24 + 0.1 * Math.sin(sim.gt + i))
      ctx.fillStyle = hexToRgba(ac, 0.5 + 0.4 * Math.sin(sim.gt * 1.5 + i * 2))
      ctx.font = `bold ${12 + i}px serif`
      ctx.textAlign = 'center'
      ctx.fillText('✦', sx, sy)
    }
  } else {
    // Forge : enclume, lames plantées, braises
    const ax = w * 0.18
    const aw = w * 0.16
    ctx.fillStyle = '#1c1530'
    ctx.fillRect(ax, floorY - h * 0.07, aw, h * 0.05)
    ctx.fillStyle = '#241b3d'
    ctx.beginPath()
    ctx.moveTo(ax - aw * 0.15, floorY - h * 0.07)
    ctx.lineTo(ax + aw * 0.6, floorY - h * 0.07)
    ctx.lineTo(ax + aw * 0.45, floorY - h * 0.02)
    ctx.lineTo(ax - aw * 0.05, floorY - h * 0.02)
    ctx.closePath()
    ctx.fill()
    for (let i = 0; i < 3; i += 1) {
      const bx = w * (0.8 + i * 0.06)
      const bh = h * 0.2
      ctx.strokeStyle = hexToRgba(ac, 0.8)
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(bx, floorY)
      ctx.lineTo(bx, floorY - bh)
      ctx.stroke()
    }
    ctx.font = `${Math.round(h * 0.05)}px serif`
    ctx.textAlign = 'center'
    ctx.fillStyle = hexToRgba(ac, 0.8)
    ctx.fillText('⚒', ax + aw * 0.2, floorY - h * 0.1)
  }

  void soft
}

function drawParticles(ctx: CanvasRenderingContext2D, w: number, h: number, sim: Sim, theme: QuestCinemaTheme, dt: number) {
  ctx.globalCompositeOperation = 'lighter'
  for (const p of sim.embers) {
    if (theme.particles === 'embers') {
      p.y += p.vy * dt
      p.x += p.vx * dt * 0.4
      p.tw += dt * 3
      if (p.y < -10) {
        p.y = h + 10
        p.x = Math.random() * w
      }
    } else {
      p.x += p.vx * dt
      p.y += p.vy * dt * 0.3
      p.tw += dt * 2
      if (p.x < -10) p.x = w + 10
      if (p.x > w + 10) p.x = -10
      if (p.y < -10) p.y = h + 10
      if (p.y > h + 10) p.y = -10
    }
    const a = 0.35 + 0.5 * Math.abs(Math.sin(p.tw))
    let color = theme.accent
    if (theme.particles === 'fireflies') color = '#a9ffd1'
    if (theme.particles === 'sparks') color = '#cfe0ff'
    ctx.fillStyle = hexToRgba(color, a)
    ctx.shadowColor = color
    ctx.shadowBlur = 8
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
  }
  ctx.globalCompositeOperation = 'source-over'
}

// ---------------------------------------------------------------------------
// Le gardien (personnage qui bouge et parle)
// ---------------------------------------------------------------------------

function drawHero(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  sim: Sim,
  theme: QuestCinemaTheme,
  t: number,
  phase: Phase,
) {
  const floorY = h * 0.82
  const s = Math.max(0.7, Math.min(1.5, w / 960))
  const hx = sim.heroX
  const hy = floorY
  const bob = sim.heroWalk ? Math.abs(Math.sin(t * 10)) * 4 * s : Math.sin(t * 1.6) * 1.5 * s
  const ac = theme.accent

  // Ombre portée
  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  ctx.beginPath()
  ctx.ellipse(hx, hy - 2 * s, 34 * s, 6 * s, 0, 0, Math.PI * 2)
  ctx.fill()

  const legsY = hy - 52 * s
  // Jambes (animation de marche)
  const swing = sim.heroWalk ? Math.sin(t * 10) * 10 * s : 0
  ctx.strokeStyle = '#181224'
  ctx.lineWidth = 9 * s
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(hx - 8 * s, legsY)
  ctx.lineTo(hx - 8 * s + swing * 0.7, hy - 8 * s)
  ctx.moveTo(hx + 8 * s, legsY)
  ctx.lineTo(hx + 8 * s - swing * 0.7, hy - 8 * s)
  ctx.stroke()
  // Bottes
  ctx.fillStyle = '#241a38'
  ctx.fillRect(hx - 16 * s + swing * 0.7, hy - 11 * s, 12 * s, 5 * s)
  ctx.fillRect(hx + 6 * s - swing * 0.7, hy - 11 * s, 12 * s, 5 * s)

  const bodyY = legsY - 2 * s
  // Cape qui ondule
  const wave = Math.sin(t * 3) * 6 * s
  ctx.fillStyle = '#2a1d4d'
  ctx.beginPath()
  ctx.moveTo(hx - 6 * s, bodyY)
  ctx.quadraticCurveTo(hx - 34 * s, bodyY + 18 * s + wave, hx - 26 * s + wave, hy - 14 * s)
  ctx.quadraticCurveTo(hx - 6 * s, hy - 20 * s, hx + 10 * s, hy - 12 * s)
  ctx.quadraticCurveTo(hx + 30 * s, bodyY + 16 * s + wave, hx + 8 * s, bodyY)
  ctx.closePath()
  ctx.fill()

  // Torse / armure
  const tg = ctx.createLinearGradient(0, bodyY - 40 * s, 0, bodyY)
  tg.addColorStop(0, '#3a2a63')
  tg.addColorStop(1, '#1b1230')
  ctx.fillStyle = tg
  ctx.beginPath()
  ctx.moveTo(hx - 16 * s, bodyY)
  ctx.quadraticCurveTo(hx - 24 * s, bodyY - 34 * s, hx, bodyY - 44 * s)
  ctx.quadraticCurveTo(hx + 24 * s, bodyY - 34 * s, hx + 16 * s, bodyY)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = hexToRgba(ac, 0.55)
  ctx.lineWidth = 1.6 * s
  ctx.stroke()
  // Ceinture
  ctx.fillStyle = hexToRgba(ac, 0.75)
  ctx.fillRect(hx - 16 * s, bodyY - 12 * s, 32 * s, 4 * s)

  // Épaulettes
  ctx.fillStyle = '#241a3e'
  ctx.beginPath()
  ctx.arc(hx - 18 * s, bodyY - 30 * s, 7 * s, 0, Math.PI * 2)
  ctx.arc(hx + 18 * s, bodyY - 30 * s, 7 * s, 0, Math.PI * 2)
  ctx.fill()

  // Tête + capuche
  const headY = bodyY - 54 * s
  ctx.fillStyle = '#140f24'
  ctx.beginPath()
  ctx.arc(hx, headY, 13 * s, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#241a3e'
  ctx.beginPath()
  ctx.moveTo(hx - 17 * s, headY + 2 * s)
  ctx.quadraticCurveTo(hx - 4 * s, headY - 24 * s, hx + 17 * s, headY + 2 * s)
  ctx.quadraticCurveTo(hx, headY + 12 * s, hx - 17 * s, headY + 2 * s)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = hexToRgba(ac, 0.5)
  ctx.lineWidth = 1.3 * s
  ctx.stroke()

  // Yeux (lueur quand il parle ou en climax)
  const eyesOn = sim.talking || phase === 'climax'
  ctx.fillStyle = eyesOn ? hexToRgba(ac, 0.95) : 'rgba(120, 100, 180, 0.6)'
  ctx.shadowColor = ac
  ctx.shadowBlur = eyesOn ? 10 : 0
  ctx.beginPath()
  ctx.arc(hx - 5 * s, headY + 1 * s, 1.6 * s, 0, Math.PI * 2)
  ctx.arc(hx + 5 * s, headY + 1 * s, 1.6 * s, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowBlur = 0

  // Épée (au côté, levée en climax)
  const swordAngle = phase === 'climax' ? -2.1 + Math.sin(t * 2) * 0.06 : -0.5
  const swordX = hx + 22 * s
  const swordY = bodyY - 16 * s
  ctx.save()
  ctx.translate(swordX, swordY)
  ctx.rotate(swordAngle)
  const lg = ctx.createLinearGradient(0, -46 * s, 0, 0)
  lg.addColorStop(0, '#fff6d8')
  lg.addColorStop(0.5, ac)
  lg.addColorStop(1, '#7a5a1a')
  ctx.fillStyle = lg
  ctx.shadowColor = ac
  ctx.shadowBlur = 14
  ctx.beginPath()
  ctx.moveTo(-2.2 * s, 0)
  ctx.lineTo(-1 * s, -46 * s)
  ctx.lineTo(1 * s, -46 * s)
  ctx.lineTo(2.2 * s, 0)
  ctx.closePath()
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.fillStyle = hexToRgba(ac, 0.9)
  ctx.fillRect(-3 * s, -4 * s, 6 * s, 3.4 * s)
  ctx.restore()

  void bob
}

// ---------------------------------------------------------------------------
// Surcouches texte
// ---------------------------------------------------------------------------

function drawTitle(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  quest: Quest,
  theme: QuestCinemaTheme,
) {
  const inT = Math.min(1, t / 1.1)
  const a = inT * (1 - Math.max(0, (t - 3.4) / 0.9))
  if (a <= 0) return
  ctx.save()
  ctx.globalAlpha = a
  const titleSize = Math.max(24, Math.round(w * 0.042))
  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(255, 246, 224, 0.92)'
  ctx.shadowColor = theme.accent
  ctx.shadowBlur = 22
  ctx.font = `700 ${titleSize}px Cinzel, Georgia, serif`
  ctx.fillText(quest.title, w / 2, h * 0.34)
  ctx.shadowBlur = 0
  ctx.font = `600 ${Math.max(12, Math.round(titleSize * 0.42))}px Inter, sans-serif`
  ctx.fillStyle = hexToRgba(theme.accent, 0.9)
  ctx.fillText(theme.biomeName, w / 2, h * 0.34 + titleSize * 0.9)
  const offre = offreLabel(quest)
  if (offre) {
    ctx.font = `500 ${Math.max(11, Math.round(titleSize * 0.34))}px Inter, sans-serif`
    ctx.fillStyle = 'rgba(230, 220, 245, 0.7)'
    ctx.fillText(`Issue de l'offre : ${offre}`, w / 2, h * 0.34 + titleSize * 1.35)
  }
  ctx.restore()
}

function drawDialogue(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  sim: Sim,
  theme: QuestCinemaTheme,
  text: string,
) {
  const heroX = sim.heroX
  const floorY = h * 0.82
  const maxW = Math.min(w * 0.8, 640)
  const lineH = 20
  const partial = text.slice(0, sim.charIdx)
  ctx.font = '14px Inter, system-ui, sans-serif'
  const lines = wrapText(ctx, partial, maxW - 36)
  const padX = 16
  const padY = 12
  const bw = Math.min(maxW, Math.max(180, Math.min(maxW, ctx.measureText(partial).width) + padX * 2))
  const bh = lines.length * lineH + padY * 2 + 20
  const bx = heroX - bw / 2
  const by = floorY - h * 0.34 - bh

  ctx.fillStyle = 'rgba(9, 7, 16, 0.92)'
  ctx.strokeStyle = hexToRgba(theme.accent, 0.7)
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.moveTo(bx + 10, by)
  ctx.lineTo(bx + bw - 10, by)
  ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + 10)
  ctx.lineTo(bx + bw, by + bh - 10)
  ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - 10, by + bh)
  ctx.lineTo(bx + 10, by + bh)
  ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - 10)
  ctx.lineTo(bx, by + 10)
  ctx.quadraticCurveTo(bx, by, bx + 10, by)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  // Petite pointe vers le personnage
  ctx.fillStyle = 'rgba(9, 7, 16, 0.92)'
  ctx.beginPath()
  ctx.moveTo(heroX - 7, by + bh)
  ctx.lineTo(heroX, by + bh + 9)
  ctx.lineTo(heroX + 7, by + bh)
  ctx.closePath()
  ctx.fill()

  ctx.font = `600 11px Cinzel, Georgia, serif`
  ctx.fillStyle = theme.accent
  ctx.textAlign = 'left'
  ctx.fillText(theme.gardien, bx + padX, by + padY + 10)

  ctx.font = '14px Inter, system-ui, sans-serif'
  ctx.fillStyle = 'rgba(245, 240, 255, 0.94)'
  lines.forEach((line, i) => {
    ctx.fillText(line, bx + padX, by + padY + 26 + i * lineH)
  })
  ctx.textAlign = 'left'
}

function drawClimax(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  quest: Quest,
  theme: QuestCinemaTheme,
) {
  const a = Math.min(1, t / 0.6)
  if (a <= 0) return
  ctx.save()
  ctx.globalAlpha = a
  ctx.fillStyle = 'rgba(5, 4, 10, 0.55)'
  ctx.fillRect(0, 0, w, h)
  ctx.textAlign = 'center'
  const big = Math.max(30, Math.round(w * 0.06))
  ctx.font = `800 ${big}px Cinzel, Georgia, serif`
  ctx.fillStyle = theme.accent
  ctx.shadowColor = theme.accent
  ctx.shadowBlur = 26
  ctx.fillText(`⚡ ${quest.xp_reward} XP`, w / 2, h * 0.4)
  ctx.shadowBlur = 0
  ctx.font = `600 ${Math.max(13, Math.round(big * 0.4))}px Inter, sans-serif`
  ctx.fillStyle = 'rgba(255, 246, 224, 0.92)'
  ctx.fillText(`Difficulté : ${DIFFICULTY_LABELS[quest.difficulty]}`, w / 2, h * 0.4 + big * 0.85)

  // Runes de compétences
  const skills = quest.skills.slice(0, 6)
  const gap = Math.min(120, w / (skills.length + 1))
  skills.forEach((skill, i) => {
    const sx = w / 2 - ((skills.length - 1) * gap) / 2 + i * gap
    const sy = h * 0.6
    const delay = 0.15 + i * 0.12
    const sa = Math.max(0, Math.min(1, (t - delay) / 0.35))
    ctx.globalAlpha = a * sa
    const cut = skill.length > 18 ? `${skill.slice(0, 17)}…` : skill
    ctx.font = `600 ${Math.max(11, Math.round(w * 0.014))}px Inter, sans-serif`
    const tw = ctx.measureText(cut).width + 22
    ctx.fillStyle = 'rgba(10, 8, 18, 0.9)'
    ctx.strokeStyle = hexToRgba(theme.accent, 0.75)
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.roundRect(sx - tw / 2, sy - 14, tw, 28, 12)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = theme.accent
    ctx.fillText(cut, sx, sy + 5)
  })
  ctx.restore()
}

// ---------------------------------------------------------------------------
// Composant
// ---------------------------------------------------------------------------

interface QuestCinematicProps {
  quest: Quest
  onDone?: () => void
}

export default function QuestCinematic({ quest, onDone }: QuestCinematicProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const simRef = useRef<Sim>({ phase: 'title', t: 0, gt: 0, lineIdx: 0, charIdx: 0, holdT: 0, heroX: -140, heroWalk: false, talking: false, embers: [], twinkle: [], seed: 1 })
  const rafRef = useRef<number>(0)
  const lastRef = useRef<number>(0)
  const pausedRef = useRef(false)
  const sizeRef = useRef({ w: 0, h: 0 })
  const themeRef = useRef<QuestCinemaTheme>(inferCinema(quest))

  const [playing, setPlaying] = useState(true)
  const [ended, setEnded] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const theme = themeRef.current
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const w = wrap.clientWidth
      const h = wrap.clientHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      sizeRef.current = { w, h }
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    simRef.current = resetSim(theme, sizeRef.current.w || 800, sizeRef.current.h || 420)
    lastRef.current = performance.now()

    const update = (sim: Sim, dt: number, w: number) => {
      sim.gt += dt
      sim.t += dt
      const cible = w * 0.5
      switch (sim.phase) {
        case 'title':
          if (sim.t >= 4.4) {
            sim.phase = 'entrance'
            sim.t = 0
          }
          break
        case 'entrance': {
          sim.heroWalk = true
          sim.heroX += ((cible + 140) / 2.8) * dt
          if (sim.heroX >= cible) {
            sim.heroX = cible
            sim.heroWalk = false
            sim.phase = 'dialogue'
            sim.t = 0
          }
          break
        }
        case 'dialogue': {
          const line = theme.lines[sim.lineIdx]
          if (line) {
            sim.talking = sim.charIdx < line.length
            if (sim.charIdx < line.length) {
              sim.charIdx = Math.min(line.length, sim.charIdx + CHAR_SPEED * dt)
            } else {
              sim.holdT += dt
              if (sim.holdT >= LINE_HOLD) {
                sim.holdT = 0
                sim.lineIdx += 1
                sim.charIdx = 0
              }
            }
          } else {
            sim.talking = false
            sim.phase = 'climax'
            sim.t = 0
          }
          break
        }
        case 'climax':
          if (sim.t >= 5.2) {
            sim.phase = 'outro'
            sim.t = 0
          }
          break
        case 'outro':
          if (sim.t >= 1.1) {
            sim.phase = 'ended'
            sim.t = 0
            sim.talking = false
            setEnded(true)
          }
          break
        case 'ended':
          break
      }
    }

    const loop = (now: number) => {
      const sim = simRef.current
      const { w, h } = sizeRef.current
      const dt = Math.min(0.05, (now - lastRef.current) / 1000)
      lastRef.current = now
      if (!pausedRef.current) {
        update(sim, dt, w)
        draw(ctx, sim, w, h, theme, quest, dt)
      }
      rafRef.current = requestAnimationFrame(loop)
    }

    const onVisibility = () => {
      if (document.hidden && !pausedRef.current) togglePause(true)
    }
    document.addEventListener('visibilitychange', onVisibility)
    rafRef.current = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(rafRef.current)
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const togglePause = (force?: boolean) => {
    const next = force ?? !pausedRef.current
    pausedRef.current = next
    setPlaying(!next)
  }

  const replay = () => {
    const sim = simRef.current
    const { w, h } = sizeRef.current
    const theme = themeRef.current
    Object.assign(sim, resetSim(theme, w || 800, h || 420))
    pausedRef.current = false
    setPlaying(true)
    setEnded(false)
    lastRef.current = performance.now()
  }

  const skip = () => {
    const sim = simRef.current
    sim.phase = 'outro'
    sim.t = 1.05
    sim.talking = false
  }

  if (collapsed) {
    return (
      <button
        type="button"
        className="btn btn-block border-base-300 bg-base-100"
        onClick={() => setCollapsed(false)}
        aria-label="Agrandir la cinématique"
      >
        🎬 Réveiller la cinématique
      </button>
    )
  }

  return (
    <div ref={wrapRef} className="relative aspect-[16/9] max-h-[540px] w-full overflow-hidden rounded-box bg-black">
      <canvas ref={canvasRef} className="absolute inset-0" aria-label={`Cinématique de la quête : ${quest.title}`} />
      <div className="pointer-events-none absolute bottom-3 left-4 flex max-w-[60%] flex-col gap-0.5">
        <span className="badge badge-sm border-primary/40 bg-black/40 font-semibold text-primary backdrop-blur-sm">
          🎬 {themeRef.current.biomeName}
        </span>
        {offreLabel(quest) && (
          <span className="badge badge-sm bg-black/40 text-base-content/70 backdrop-blur-sm">
            Issue de l'offre : {offreLabel(quest)}
          </span>
        )}
      </div>
      <div className="absolute right-3 top-3 flex gap-1.5">
        <button
          type="button"
          className="btn btn-circle btn-sm border-white/10 bg-black/40 backdrop-blur-sm"
          onClick={() => togglePause()}
          aria-label={playing ? 'Pause' : 'Lecture'}
        >
          {playing ? '⏸' : '▶'}
        </button>
        <button
          type="button"
          className="btn btn-circle btn-sm border-white/10 bg-black/40 backdrop-blur-sm"
          onClick={replay}
          aria-label="Rejouer la cinématique"
        >
          ↺
        </button>
        <button
          type="button"
          className="btn btn-circle btn-sm border-white/10 bg-black/40 backdrop-blur-sm"
          onClick={skip}
          aria-label="Passer la cinématique"
        >
          ⏭
        </button>
        <button
          type="button"
          className="btn btn-circle btn-sm border-white/10 bg-black/40 backdrop-blur-sm"
          onClick={() => setCollapsed(true)}
          aria-label="Réduire la cinématique"
        >
          ⌄
        </button>
      </div>
      {ended && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/50 backdrop-blur-[2px]">
          <p className="font-display text-2xl font-bold text-primary">Quête dévoilée</p>
          {onDone ? (
            <button type="button" className="btn btn-primary" onClick={onDone}>
              ⚔️ Poursuivre
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={replay}>
              ↺ Revoir la scène
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function draw(
  ctx: CanvasRenderingContext2D,
  sim: Sim,
  w: number,
  h: number,
  theme: QuestCinemaTheme,
  quest: Quest,
  dt: number,
) {
  if (w < 2 || h < 2) return
  const t = sim.gt
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#05040a'
  ctx.fillRect(0, 0, w, h)

  drawSky(ctx, w, h, sim, theme, t)
  drawBiome(ctx, w, h, sim, theme)
  drawParticles(ctx, w, h, sim, theme, dt)

  const showHero = sim.phase !== 'title'
  if (showHero) drawHero(ctx, w, h, sim, theme, t, sim.phase)

  if (sim.phase === 'title') drawTitle(ctx, w, h, sim.t, quest, theme)

  if (sim.phase === 'dialogue') {
    const line = theme.lines[sim.lineIdx]
    if (line) drawDialogue(ctx, w, h, sim, theme, line)
  }

  if (sim.phase === 'climax') drawClimax(ctx, w, h, sim.t, quest, theme)

  if (sim.phase === 'outro') {
    ctx.fillStyle = `rgba(5, 4, 10, ${Math.min(1, sim.t / 1.1)})`
    ctx.fillRect(0, 0, w, h)
  }

  // Fondu d'ouverture
  if (sim.phase === 'title') {
    const fade = Math.min(1, sim.t / 0.9)
    ctx.fillStyle = `rgba(5, 4, 10, ${1 - fade})`
    ctx.fillRect(0, 0, w, h)
  }
}
