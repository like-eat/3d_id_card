import { useCallback, useEffect, useState } from 'react'
import type { TemplateId } from '../contracts/scene-spec'

export type SfxKind =
  | 'standee'
  | 'cat'
  | 'dog'
  | 'camera'
  | 'coffee'
  | 'laptop'
  | 'guitar'
  | 'easel'
  | 'rocket'
  | 'sakura'
  | 'koi'
  | 'cabin'
  | 'core'
  | 'beach'
  | 'lake'

let soundEnabled = false
const listeners = new Set<() => void>()

let audioCtx: AudioContext | null = null
let ambientCleanups: Array<() => void> = []
let ambientKey = ''

function notify() {
  listeners.forEach((fn) => fn())
}

function getOrCreateContext(): AudioContext | null {
  try {
    if (typeof window === 'undefined') return null
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    if (!audioCtx) audioCtx = new Ctor()
    if (audioCtx.state === 'suspended') {
      void audioCtx.resume().catch(() => {})
    }
    return audioCtx
  } catch {
    return null
  }
}

function createNoiseBuffer(ctx: AudioContext, seconds = 2): AudioBuffer {
  const sampleRate = ctx.sampleRate
  const len = Math.floor(sampleRate * seconds)
  const buf = ctx.createBuffer(1, len, sampleRate)
  const data = buf.getChannelData(0)
  let last = 0
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1
    // 温和低通粉红/布朗噪声，听感柔和不刺耳
    last = (last + 0.045 * white) / 1.045
    data[i] = last * 2.2
  }
  return buf
}

export function stopAmbientSound(): void {
  try {
    ambientCleanups.forEach((fn) => {
      try {
        fn()
      } catch {
        // ignore cleanup error
      }
    })
  } finally {
    ambientCleanups = []
    ambientKey = ''
  }
}

function startAmbientSound(template: TemplateId, isNight: boolean): void {
  if (!soundEnabled) return
  const nextKey = `${template}:${isNight ? 'night' : 'day'}`
  if (ambientKey === nextKey) return

  stopAmbientSound()
  const ctx = getOrCreateContext()
  if (!ctx) return

  ambientKey = nextKey

  try {
    const now = ctx.currentTime
    const master = ctx.createGain()
    master.gain.setValueAtTime(0.0001, now)
    master.gain.linearRampToValueAtTime(0.038, now + 0.85)
    master.connect(ctx.destination)

    const cleanups: Array<() => void> = []
    cleanups.push(() => {
      try {
        const t = ctx.currentTime
        master.gain.cancelScheduledValues(t)
        master.gain.setValueAtTime(master.gain.value, t)
        master.gain.linearRampToValueAtTime(0.0001, t + 0.25)
      } catch {
        // ignore
      }
    })

    const noiseSrc = ctx.createBufferSource()
    noiseSrc.buffer = createNoiseBuffer(ctx, 3)
    noiseSrc.loop = true

    const filter = ctx.createBiquadFilter()
    const noiseGain = ctx.createGain()

    if (template === 'coast') {
      // 柔和海浪慢节拍呼吸起伏
      filter.type = 'lowpass'
      filter.frequency.value = isNight ? 360 : 480
      noiseGain.gain.value = 0.52

      const lfo = ctx.createOscillator()
      const lfoGain = ctx.createGain()
      lfo.type = 'sine'
      lfo.frequency.value = 0.14
      lfoGain.gain.value = 0.34
      lfo.connect(lfoGain)
      lfoGain.connect(noiseGain.gain)
      lfo.start()
      cleanups.push(() => {
        try {
          lfo.stop()
        } catch {
          // ignore
        }
      })
    } else if (template === 'snow_cabin') {
      // 冬日炉火微风（带轻微暖低频脉动）
      filter.type = 'bandpass'
      filter.frequency.value = 320
      filter.Q.value = 0.7
      noiseGain.gain.value = 0.56

      const crackleTimer = window.setInterval(() => {
        if (!soundEnabled || ambientKey !== nextKey || !audioCtx) return
        try {
          const t = audioCtx.currentTime
          const osc = audioCtx.createOscillator()
          const g = audioCtx.createGain()
          osc.type = 'triangle'
          osc.frequency.setValueAtTime(170 + Math.random() * 140, t)
          osc.frequency.exponentialRampToValueAtTime(70, t + 0.05)
          g.gain.setValueAtTime(0.015, t)
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.055)
          osc.connect(g).connect(master)
          osc.start(t)
          osc.stop(t + 0.06)
        } catch {
          // ignore
        }
      }, 1400)
      cleanups.push(() => window.clearInterval(crackleTimer))
    } else if (template === 'city') {
      // 未来科技：极轻低频全息空间底音
      filter.type = 'lowpass'
      filter.frequency.value = 240
      noiseGain.gain.value = 0.28

      const pad1 = ctx.createOscillator()
      const pad2 = ctx.createOscillator()
      const padGain = ctx.createGain()
      pad1.type = 'sine'
      pad2.type = 'sine'
      pad1.frequency.value = 110
      pad2.frequency.value = 164.81
      padGain.gain.value = 0.22
      pad1.connect(padGain)
      pad2.connect(padGain)
      padGain.connect(master)
      pad1.start()
      pad2.start()
      cleanups.push(() => {
        try {
          pad1.stop()
          pad2.stop()
        } catch {
          // ignore
        }
      })
    } else if (template === 'sakura_garden') {
      // 樱花庭院：轻风 + 偶尔清脆风铃泛音
      filter.type = 'bandpass'
      filter.frequency.value = 460
      filter.Q.value = 0.65
      noiseGain.gain.value = 0.4

      const chimeNotes = [784, 880, 1046.5, 1174.7]
      const chimeTimer = window.setInterval(() => {
        if (!soundEnabled || ambientKey !== nextKey || !audioCtx) return
        try {
          const t = audioCtx.currentTime
          const osc = audioCtx.createOscillator()
          const g = audioCtx.createGain()
          osc.type = 'sine'
          osc.frequency.setValueAtTime(chimeNotes[Math.floor(Math.random() * chimeNotes.length)], t)
          g.gain.setValueAtTime(0.001, t)
          g.gain.linearRampToValueAtTime(0.065, t + 0.03)
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9)
          osc.connect(g).connect(master)
          osc.start(t)
          osc.stop(t + 0.95)
        } catch {
          // ignore
        }
      }, 3400)
      cleanups.push(() => window.clearInterval(chimeTimer))
    } else {
      // 晨雾森林：微风沙沙（夜晚叠加极轻虫鸣微光）
      filter.type = 'bandpass'
      filter.frequency.value = isNight ? 520 : 410
      filter.Q.value = 0.75
      noiseGain.gain.value = 0.44

      if (isNight) {
        const cricketTimer = window.setInterval(() => {
          if (!soundEnabled || ambientKey !== nextKey || !audioCtx) return
          try {
            const t = audioCtx.currentTime
            const osc = audioCtx.createOscillator()
            const g = audioCtx.createGain()
            osc.type = 'sine'
            osc.frequency.setValueAtTime(2280, t)
            g.gain.setValueAtTime(0.001, t)
            g.gain.linearRampToValueAtTime(0.035, t + 0.025)
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14)
            osc.connect(g).connect(master)
            osc.start(t)
            osc.stop(t + 0.15)
          } catch {
            // ignore
          }
        }, 2800)
        cleanups.push(() => window.clearInterval(cricketTimer))
      }
    }

    noiseSrc.connect(filter).connect(noiseGain).connect(master)
    noiseSrc.start()
    cleanups.push(() => {
      try {
        noiseSrc.stop()
      } catch {
        // ignore
      }
    })

    ambientCleanups = cleanups
  } catch {
    ambientCleanups = []
    ambientKey = ''
  }
}

function playTone(
  ctx: AudioContext,
  opts: {
    type?: OscillatorType
    freq: number
    endFreq?: number
    delay?: number
    duration: number
    gain?: number
  },
) {
  const t = ctx.currentTime + (opts.delay ?? 0)
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = opts.type ?? 'sine'
  osc.frequency.setValueAtTime(opts.freq, t)
  if (opts.endFreq) {
    osc.frequency.exponentialRampToValueAtTime(opts.endFreq, t + opts.duration)
  }
  const peak = Math.min(0.14, opts.gain ?? 0.075)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(peak, t + 0.015)
  g.gain.exponentialRampToValueAtTime(0.0001, t + opts.duration)
  osc.connect(g).connect(ctx.destination)
  osc.start(t)
  osc.stop(t + opts.duration + 0.02)
}

/** 点击立牌/宠物/场景彩蛋时播放轻量程序化音效（静音开关关闭时不发声） */
export function playEasterEggSfx(kind: SfxKind): void {
  if (!soundEnabled) return
  const ctx = getOrCreateContext()
  if (!ctx) return

  try {
    switch (kind) {
      case 'cat':
        playTone(ctx, { type: 'sine', freq: 560, endFreq: 860, duration: 0.14, gain: 0.08 })
        playTone(ctx, { type: 'sine', freq: 840, endFreq: 640, delay: 0.12, duration: 0.18, gain: 0.07 })
        break
      case 'dog':
        playTone(ctx, { type: 'triangle', freq: 290, endFreq: 420, duration: 0.11, gain: 0.08 })
        playTone(ctx, { type: 'triangle', freq: 340, endFreq: 480, delay: 0.13, duration: 0.12, gain: 0.08 })
        break
      case 'camera':
        playTone(ctx, { type: 'square', freq: 1400, endFreq: 260, duration: 0.045, gain: 0.055 })
        playTone(ctx, { type: 'triangle', freq: 980, endFreq: 180, delay: 0.045, duration: 0.06, gain: 0.05 })
        break
      case 'coffee':
        playTone(ctx, { type: 'sine', freq: 523.25, duration: 0.18, gain: 0.06 })
        playTone(ctx, { type: 'sine', freq: 659.25, delay: 0.08, duration: 0.22, gain: 0.06 })
        break
      case 'laptop':
        playTone(ctx, { type: 'triangle', freq: 880, duration: 0.06, gain: 0.055 })
        playTone(ctx, { type: 'triangle', freq: 1174.7, delay: 0.055, duration: 0.08, gain: 0.055 })
        break
      case 'guitar':
        ;[329.63, 440, 554.37, 659.25].forEach((f, idx) => {
          playTone(ctx, { type: 'triangle', freq: f, delay: idx * 0.055, duration: 0.34, gain: 0.065 })
        })
        break
      case 'easel':
        ;[587.33, 739.99, 880].forEach((f, idx) => {
          playTone(ctx, { type: 'sine', freq: f, delay: idx * 0.065, duration: 0.24, gain: 0.06 })
        })
        break
      case 'rocket':
        playTone(ctx, { type: 'sawtooth', freq: 190, endFreq: 720, duration: 0.38, gain: 0.045 })
        playTone(ctx, { type: 'sine', freq: 720, endFreq: 1040, delay: 0.18, duration: 0.25, gain: 0.055 })
        break
      case 'sakura':
        ;[783.99, 987.77, 1174.66, 1567.98].forEach((f, idx) => {
          playTone(ctx, { type: 'sine', freq: f, delay: idx * 0.07, duration: 0.42, gain: 0.055 })
        })
        break
      case 'koi':
        playTone(ctx, { type: 'sine', freq: 480, endFreq: 960, duration: 0.16, gain: 0.065 })
        playTone(ctx, { type: 'sine', freq: 720, endFreq: 1180, delay: 0.09, duration: 0.24, gain: 0.055 })
        break
      case 'cabin':
        playTone(ctx, { type: 'triangle', freq: 261.63, duration: 0.26, gain: 0.07 })
        playTone(ctx, { type: 'sine', freq: 329.63, delay: 0.08, duration: 0.3, gain: 0.065 })
        playTone(ctx, { type: 'sine', freq: 392.0, delay: 0.16, duration: 0.36, gain: 0.06 })
        break
      case 'core':
        playTone(ctx, { type: 'sine', freq: 240, endFreq: 880, duration: 0.32, gain: 0.065 })
        playTone(ctx, { type: 'triangle', freq: 660, endFreq: 1320, delay: 0.1, duration: 0.28, gain: 0.05 })
        break
      case 'beach':
      case 'lake':
        playTone(ctx, { type: 'sine', freq: 523.25, endFreq: 783.99, duration: 0.22, gain: 0.065 })
        playTone(ctx, { type: 'sine', freq: 659.25, endFreq: 1046.5, delay: 0.11, duration: 0.28, gain: 0.055 })
        break
      case 'standee':
      default:
        playTone(ctx, { type: 'sine', freq: 659.25, duration: 0.12, gain: 0.065 })
        playTone(ctx, { type: 'sine', freq: 880, delay: 0.07, duration: 0.18, gain: 0.065 })
        break
    }
  } catch {
    // ignore Web Audio failure cleanly
  }
}

export function useSceneSound() {
  const [enabled, setEnabled] = useState(soundEnabled)

  useEffect(() => {
    const sync = () => setEnabled(soundEnabled)
    listeners.add(sync)
    return () => {
      listeners.delete(sync)
    }
  }, [])

  const syncAmbient = useCallback((template: TemplateId, isNight: boolean) => {
    if (soundEnabled) {
      startAmbientSound(template, isNight)
    } else {
      stopAmbientSound()
    }
  }, [])

  const toggleSound = useCallback((template: TemplateId, isNight: boolean) => {
    soundEnabled = !soundEnabled
    notify()
    if (soundEnabled) {
      startAmbientSound(template, isNight)
      playEasterEggSfx('standee')
    } else {
      stopAmbientSound()
    }
  }, [])

  const stopAmbient = useCallback(() => {
    stopAmbientSound()
  }, [])

  return { enabled, toggleSound, syncAmbient, stopAmbient }
}
