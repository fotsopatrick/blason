import { useEffect, useRef } from 'react'

// Arrière-plan sombre animé : nuit étoilée, braises dorées qui montent.
// Léger (une boucle rAF, aucun asset), réutilisable en fond de section.

export default function AmbientBackdrop({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let w = 0
    let h = 0
    let raf = 0
    let last = performance.now()
    const t0 = performance.now()

    const stars: number[] = []
    for (let i = 0; i < 120; i += 1) stars.push(Math.random())

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const t = (now - t0) / 1000
      if (w > 0 && h > 0) {
        const g = ctx.createLinearGradient(0, 0, 0, h)
        g.addColorStop(0, '#07060d')
        g.addColorStop(0.6, '#0d0a18')
        g.addColorStop(1, '#131022')
        ctx.fillStyle = g
        ctx.fillRect(0, 0, w, h)

        for (let i = 0; i < stars.length; i += 3) {
          const sx = stars[i] * w
          const sy = stars[i + 1] * h * 0.7
          const phase = stars[i + 2] * Math.PI * 2 + t * 1.1
          const a = 0.2 + 0.5 * Math.abs(Math.sin(phase))
          ctx.fillStyle = `rgba(255, 245, 220, ${a})`
          ctx.beginPath()
          ctx.arc(sx, sy, 0.6 + a * 0.9, 0, Math.PI * 2)
          ctx.fill()
        }

        ctx.globalCompositeOperation = 'lighter'
        const count = Math.floor((w * h) / 30000)
        for (let i = 0; i < count; i += 1) {
          const bx = (i * 0.618033988749895 + t * 0.018) % 1
          const by = (i * 0.3819 + t * 0.055) % 1
          const x = bx * w + Math.sin(t * 0.6 + i * 2.4) * 8
          const y = h - by * h
          const tw = Math.sin(t * 2 + i * 3) * 0.5 + 0.5
          ctx.fillStyle = `rgba(255, 180, 90, ${0.15 + 0.45 * tw})`
          ctx.shadowColor = '#ffb45a'
          ctx.shadowBlur = 8
          ctx.beginPath()
          ctx.arc(x, y, 1 + tw * 1.6, 0, Math.PI * 2)
          ctx.fill()
          ctx.shadowBlur = 0
        }
        ctx.globalCompositeOperation = 'source-over'
        void dt
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return <canvas ref={ref} className={className} aria-hidden="true" />
}
