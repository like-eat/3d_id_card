import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer, OrbitControls } from '@react-three/drei'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { SceneSpec } from '../contracts/scene-spec'
import { resolveSceneTheme } from '../contracts/moods'
import type { CardProfile } from './cardTexture'
import { EasterEggGuideProvider } from './SpeechBubble3D'
import { ForestDioramaCard } from './ForestDiorama'
import { CoastDioramaCard } from './CoastDiorama'
import { CityDioramaCard } from './CityDiorama'
import { SakuraDioramaCard } from './SakuraDiorama'
import { SnowCabinDioramaCard } from './SnowCabinDiorama'

/** WebGL 可用性检测：除创建上下文外，再做一次真实着色器编译探测（US-006 / FR-22） */
export function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    const gl = (canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null
    if (!gl) return false
    const vs = gl.createShader(gl.VERTEX_SHADER)
    if (!vs) return false
    gl.shaderSource(vs, 'attribute vec3 p; void main(){ gl_Position = vec4(p, 1.0); }')
    gl.compileShader(vs)
    const ok = gl.getShaderParameter(vs, gl.COMPILE_STATUS)
    gl.deleteShader(vs)
    return !!ok
  } catch {
    return false
  }
}

type Quality = 'low' | 'medium' | 'high'

function detectQuality(target: SceneSpec['quality']['target']): Quality {
  if (target !== 'auto') return target
  const nav = navigator as Navigator & { deviceMemory?: number }
  const mem = nav.deviceMemory ?? 4
  const cores = navigator.hardwareConcurrency ?? 4
  if (mem <= 2 || cores <= 2) return 'low'
  if (mem <= 4 || cores <= 4) return 'medium'
  return 'high'
}

export const CARD_W = 3.2
export const CARD_H = CARD_W / 1.586

/* ---------------- 光照配置（影棚极简背景 + 自然光影） ---------------- */

const LIGHTING_CFG: Record<
  SceneSpec['environment']['lighting']['preset'],
  { sun: string; sunI: number; hemiSky: string; hemiGround: string; hemiI: number }
> = {
  morning: { sun: '#fff3df', sunI: 2.15, hemiSky: '#d4e6f8', hemiGround: '#3d4f3c', hemiI: 1.15 },
  noon: { sun: '#fffdf7', sunI: 2.5, hemiSky: '#dcebfa', hemiGround: '#4a5448', hemiI: 1.2 },
  golden_hour: { sun: '#ffc285', sunI: 2.55, hemiSky: '#f7d8b5', hemiGround: '#594234', hemiI: 1.05 },
  dusk: { sun: '#f29b78', sunI: 1.65, hemiSky: '#989ec4', hemiGround: '#2f2c3d', hemiI: 0.9 },
  overcast: { sun: '#eef3f7', sunI: 1.5, hemiSky: '#d5dde5', hemiGround: '#48504c', hemiI: 1.25 },
  night: { sun: '#8faee6', sunI: 0.9, hemiSky: '#2a4170', hemiGround: '#0e1420', hemiI: 0.65 },
}

const STUDIO_BG: Record<SceneSpec['template'], string> = {
  mountain_forest: '#f0e2e7', // 极简柔粉影棚底
  coast: '#f2eae2',           // 温暖奶油沙白影棚底
  city: '#070c17',            // 深邃黑曜科技蓝影棚底
  sakura_garden: '#f7edf0',   // 淡樱雾白影棚底
  snow_cabin: '#dce7f3',      // 静谧冬日微光蓝灰影棚底
}

/* ---------------- 相机与交互 ---------------- */

export type ViewPreset = 'commercial' | 'front' | 'back' | 'free' | 'side'

const VIEW_POSITIONS: Record<ViewPreset, [number, number, number]> = {
  commercial: [1.55, 4.35, 3.05],
  front: [0.0, 4.95, 1.35],
  back: [0.0, 4.95, 1.35],
  free: [3.2, 4.3, 3.6],
  side: [2.35, 0.72, 3.55],
}

function CameraRig({ view, spec }: { view: ViewPreset; spec: SceneSpec }) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const controls = useThree((s) => s.controls) as { target: THREE.Vector3 } | null

  const aspect = size.width > 0 && size.height > 0 ? size.width / size.height : 1.5
  const distScale = aspect < 1.38 ? Math.min(2.15, 1.38 / aspect) : 1

  const target = useRef(
    new THREE.Vector3(
      VIEW_POSITIONS[view][0] * distScale,
      VIEW_POSITIONS[view][1] * distScale,
      VIEW_POSITIONS[view][2] * distScale,
    ),
  )
  const lerping = useRef(true)
  const first = useRef(true)

  useEffect(() => {
    const [bx, by, bz] = VIEW_POSITIONS[view]
    target.current.set(bx * distScale, by * distScale, bz * distScale)
    lerping.current = true
  }, [view, distScale])

  useFrame((_, dt) => {
    if (first.current) {
      camera.position.copy(target.current)
      first.current = false
      lerping.current = false
    }
    if (lerping.current) {
      camera.position.lerp(target.current, Math.min(1, dt * 3.4))
      if (camera.position.distanceTo(target.current) < 0.04) lerping.current = false
    }
    if (controls) {
      controls.target.lerp(new THREE.Vector3(0, 0.1, 0), Math.min(1, dt * 3))
    }
  })

  return (
    <OrbitControls
      makeDefault
      enablePan={false}
      enableZoom={spec.camera.allowOrbit}
      minPolarAngle={0.18}
      maxPolarAngle={1.45}
      minDistance={3.0}
      maxDistance={Math.max(12, 12 * distScale)}
      onStart={() => {
        lerping.current = false
      }}
    />
  )
}

/* ---------------- 场景总装 ---------------- */

function SceneContent({
  spec,
  profile,
  view,
  quality,
  qrText,
  hourOverride,
  onSculpt,
}: {
  spec: SceneSpec
  profile: CardProfile
  view: ViewPreset
  quality: Quality
  qrText: string
  hourOverride?: number
  onSculpt?: (x: number, y: number) => void
}) {
  const theme = resolveSceneTheme(spec, hourOverride)
  // 当自动昼夜启用时，把当前计算出的 mood/lighting 同步进传给子沙盘的 spec，确保所有地标着色一致
  const effectiveSpec = useMemo<SceneSpec>(() => {
    if (!spec.autoMood) return spec
    return {
      ...spec,
      mood: theme.mood.id,
      environment: {
        ...spec.environment,
        lighting: { ...spec.environment.lighting, preset: theme.mood.lightingPreset },
      },
    }
  }, [spec, theme.mood.id, theme.mood.lightingPreset])

  const moodCfg = theme.mood.lightingCfg
  const manualOverride = !spec.autoMood && spec.environment.lighting.preset !== theme.mood.lightingPreset
  const presetLight = LIGHTING_CFG[effectiveSpec.environment.lighting.preset] ?? LIGHTING_CFG.morning
  const light = manualOverride
    ? {
        ...moodCfg,
        sun: presetLight.sun,
        sunI: presetLight.sunI,
        hemiSky: presetLight.hemiSky,
        hemiGround: presetLight.hemiGround,
        hemiI: presetLight.hemiI,
      }
    : moodCfg

  const [dx, dy, dz] = spec.environment.lighting.direction
  const group = useRef<THREE.Group>(null)
  const flipped = view === 'back'
  const targetX = flipped ? Math.PI / 2 : -Math.PI / 2
  const tpl = spec.template
  const bgColor = theme.bgColor || STUDIO_BG[tpl] || '#f0e2e7'

  useFrame(({ clock }, dt) => {
    if (group.current) {
      group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, targetX, Math.min(1, dt * 3.4))
      group.current.position.y = Math.sin(clock.elapsedTime * 0.85) * 0.025
    }
  })

  return (
    <>
      <color attach="background" args={[bgColor]} />
      <Suspense fallback={null}>
        {/* 程序化 PBR 环境反射 */}
        <Environment resolution={128} frames={1}>
          <Lightformer
            form="ring"
            intensity={light.envIntensity}
            position={[0, 8, 2]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={10}
            color={light.sun}
          />
          <Lightformer
            form="rect"
            intensity={light.envIntensity * 0.85}
            position={[-6, 4, -5]}
            rotation={[0, Math.PI / 4, 0]}
            scale={[8, 4, 1]}
            color={light.hemiSky}
          />
          <Lightformer
            form="rect"
            intensity={theme.isDark ? 0.65 : 0.75}
            position={[6, 3, 5]}
            rotation={[0, -Math.PI / 4, 0]}
            scale={[6, 4, 1]}
            color={light.rimColor}
          />
        </Environment>

        {/* 自然天光 + 主平行光 + 轮廓补光 */}
        <hemisphereLight args={[light.hemiSky, light.hemiGround, light.hemiI]} />
        <directionalLight
          position={[dx * 6 + 2.5, dy * 7 + 5.5, dz * 6 + 3.0]}
          intensity={light.sunI}
          color={light.sun}
          castShadow={quality !== 'low'}
          shadow-mapSize={[quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024]}
          shadow-bias={-0.0005}
          shadow-camera-left={-3.5}
          shadow-camera-right={3.5}
          shadow-camera-top={3.5}
          shadow-camera-bottom={-3.5}
          shadow-camera-near={1}
          shadow-camera-far={22}
        />
        <directionalLight position={[-4.5, 4.5, -4.5]} intensity={light.rimI} color={light.rimColor} />

        {/* 极薄双面名片主体 */}
        <group ref={group} rotation={[-Math.PI / 2, 0, 0]}>
          {tpl === 'mountain_forest' && (
            <ForestDioramaCard
              spec={effectiveSpec}
              profile={profile}
              quality={quality}
              qrText={qrText}
              onSculpt={onSculpt}
            />
          )}
          {tpl === 'coast' && (
            <CoastDioramaCard
              spec={effectiveSpec}
              profile={profile}
              quality={quality}
              qrText={qrText}
              onSculpt={onSculpt}
            />
          )}
          {tpl === 'city' && (
            <CityDioramaCard
              spec={effectiveSpec}
              profile={profile}
              quality={quality}
              qrText={qrText}
              onSculpt={onSculpt}
            />
          )}
          {tpl === 'sakura_garden' && (
            <SakuraDioramaCard
              spec={effectiveSpec}
              profile={profile}
              quality={quality}
              qrText={qrText}
              onSculpt={onSculpt}
            />
          )}
          {tpl === 'snow_cabin' && (
            <SnowCabinDioramaCard
              spec={effectiveSpec}
              profile={profile}
              quality={quality}
              qrText={qrText}
              onSculpt={onSculpt}
            />
          )}
        </group>

        <CameraRig view={view} spec={effectiveSpec} />
      </Suspense>
    </>
  )
}

export function CardScene({
  spec,
  profile,
  view = 'commercial',
  qrText = 'https://3d.card',
  hourOverride,
  showGuide = false,
  onCardClick,
  onSculpt,
}: {
  spec: SceneSpec
  profile: CardProfile
  view?: ViewPreset
  qrText?: string
  hourOverride?: number
  showGuide?: boolean
  onCardClick?: (side: 'front' | 'back') => void
  onSculpt?: (x: number, y: number) => void
}) {
  const quality = useMemo(() => detectQuality(spec.quality.target), [spec.quality.target])
  const [paused, setPaused] = useState(false)
  const reduceMotion = useMemo(
    () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )

  useEffect(() => {
    const onVis = () => setPaused(document.hidden)
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  return (
    <Canvas
      shadows={quality !== 'low'}
      dpr={[1, quality === 'high' ? 2 : 1.5]}
      frameloop={paused || reduceMotion ? 'demand' : 'always'}
      camera={{ position: VIEW_POSITIONS[view], fov: 36, near: 0.1, far: 80 }}
      style={{ width: '100%', height: '100%', touchAction: 'none' }}
      gl={{
        antialias: quality !== 'low',
        powerPreference: 'high-performance',
        preserveDrawingBuffer: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.08,
      }}
      onPointerMissed={() => onCardClick?.('front')}
    >
      <EasterEggGuideProvider showGuide={showGuide}>
        <SceneContent
          spec={spec}
          profile={profile}
          view={view}
          quality={quality}
          qrText={qrText}
          hourOverride={hourOverride}
          onSculpt={onSculpt}
        />
      </EasterEggGuideProvider>
    </Canvas>
  )
}
