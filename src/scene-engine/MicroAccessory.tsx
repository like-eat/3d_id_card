import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { getAccessoryInfo } from '../contracts/accessories'
import { isTapEvent, setPointerCursor, SpeechBubble3D } from './SpeechBubble3D'

const ACCESSORY_QUOTES: Record<string, string[]> = {
  cat: ['喵~ 很高兴认识你！', '摸摸头，今天也要开心呀', '正在打盹…点我干嘛喵'],
  dog: ['汪汪！随时保持好心情', '摇摇尾巴，欢迎来交朋友！', '今天散步吗？汪~'],
  camera: ['咔嚓！留住最闪亮的瞬间', '笑一个，正在对焦中 ✨', '好构图，今天灵感爆棚'],
  coffee: ['来杯手冲，慢慢聊 ☕', '热拿铁已备好，请慢用', '咖啡续航 100%，灵感上线'],
  laptop: ['代码编译通过！零 Bug', '正在把创意变成现实 💻', '深夜灵感，Keyboard on fire'],
  guitar: ['♪ 弹一首轻快的布鲁斯给你', '生活需要一点即兴旋律 🎸', '和弦拨动，好心情起飞'],
  easel: ['用色彩记录微缩世界 🎨', '这一笔留给未来的奇迹', '调色盘已就绪，开始创作'],
  rocket: ['3…2…1… 灵感发射！🚀', '全速推进，奔赴下一站星辰', '推进器已点火，准备起飞'],
}

/** 通用小火花 / 音符飞溅特效（用于吉他与画架点击彩蛋） */
function SparkBurst({ burstTrigger, colors }: { burstTrigger: number; colors: string[] }) {
  const groupRef = useRef<THREE.Group>(null)
  const tapTimeRef = useRef(-99)
  const items = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => {
        const ang = (i / 6) * Math.PI * 2 + 0.3
        return { ang, col: colors[i % colors.length], speed: 0.14 + (i % 2) * 0.05 }
      }),
    [colors],
  )

  useFrame(({ clock }) => {
    const grp = groupRef.current
    if (!grp) return
    if (burstTrigger === 0) {
      grp.visible = false
      return
    }
    if (tapTimeRef.current < 0) tapTimeRef.current = clock.elapsedTime
    const age = clock.elapsedTime - tapTimeRef.current
    if (age > 1.3) {
      grp.visible = false
      return
    }
    grp.visible = true
    const p = age / 1.3
    const fade = Math.sin(p * Math.PI)
    grp.children.forEach((child, idx) => {
      const item = items[idx]
      const r = 0.04 + p * item.speed
      child.position.set(Math.cos(item.ang) * r, Math.sin(item.ang) * r * 0.6, 0.22 + p * 0.22)
      child.scale.setScalar((0.75 + fade * 0.6) * (1 - p * 0.35))
    })
  })

  useEffect(() => {
    if (burstTrigger > 0) tapTimeRef.current = -1
  }, [burstTrigger])

  return (
    <group ref={groupRef} visible={false}>
      {items.map((item, idx) => (
        <mesh key={idx}>
          <octahedronGeometry args={[0.018, 0]} />
          <meshBasicMaterial color={item.col} />
        </mesh>
      ))}
    </group>
  )
}

/* ---------------- 程序化小贴图（咖啡拉花 / 电脑屏幕 / 画布油画） ---------------- */

function makeLatteArtTexture(): THREE.CanvasTexture {
  const s = 128
  const c = document.createElement('canvas')
  c.width = c.height = s
  const ctx = c.getContext('2d')!

  const grad = ctx.createRadialGradient(s / 2, s / 2, 8, s / 2, s / 2, s * 0.5)
  grad.addColorStop(0, '#8d552c')
  grad.addColorStop(0.78, '#73411e')
  grad.addColorStop(1, '#583014')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, s, s)

  // 奶白咖啡心形拉花
  ctx.fillStyle = '#fff5e6'
  ctx.beginPath()
  ctx.moveTo(s * 0.5, s * 0.72)
  ctx.bezierCurveTo(s * 0.22, s * 0.56, s * 0.2, s * 0.3, s * 0.5, s * 0.42)
  ctx.bezierCurveTo(s * 0.8, s * 0.3, s * 0.78, s * 0.56, s * 0.5, s * 0.72)
  ctx.fill()

  ctx.strokeStyle = 'rgba(255, 245, 230, 0.55)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(s / 2, s / 2, s * 0.38, 0, Math.PI * 2)
  ctx.stroke()

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function makeLaptopScreenTexture(): THREE.CanvasTexture {
  const w = 256
  const h = 160
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!

  ctx.fillStyle = '#0f172a'
  ctx.fillRect(0, 0, w, h)

  // 顶栏圆点
  ctx.fillStyle = '#ef4444'
  ctx.beginPath()
  ctx.arc(16, 14, 4, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#f59e0b'
  ctx.beginPath()
  ctx.arc(28, 14, 4, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#10b981'
  ctx.beginPath()
  ctx.arc(40, 14, 4, 0, Math.PI * 2)
  ctx.fill()

  // 左侧文件树竖条
  ctx.fillStyle = '#1e293b'
  ctx.fillRect(10, 26, 52, h - 36)
  ctx.fillStyle = '#38bdf8'
  for (let i = 0; i < 6; i++) {
    ctx.fillRect(16, 36 + i * 16, 26 + ((i * 11) % 16), 5)
  }

  // 右侧彩色代码/图表卡片
  const codeCols = ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#f472b6']
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = codeCols[i % codeCols.length]
    const indent = (i % 3) * 14
    const len = 48 + ((i * 37) % 86)
    ctx.fillRect(74 + indent, 34 + i * 12, Math.min(len, w - 88 - indent), 5)
  }

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function makePaintingTexture(): THREE.CanvasTexture {
  const w = 192
  const h = 144
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!

  // 柔和天空渐变
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.65)
  sky.addColorStop(0, '#ffd1a9')
  sky.addColorStop(0.55, '#f6a8b8')
  sky.addColorStop(1, '#fff1d0')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, h)

  // 暖阳
  ctx.fillStyle = '#fff9df'
  ctx.beginPath()
  ctx.arc(w * 0.7, h * 0.3, 18, 0, Math.PI * 2)
  ctx.fill()

  // 远山与花田
  ctx.fillStyle = '#738fa7'
  ctx.beginPath()
  ctx.moveTo(0, h * 0.65)
  ctx.quadraticCurveTo(w * 0.35, h * 0.44, w * 0.72, h * 0.6)
  ctx.lineTo(w, h * 0.5)
  ctx.lineTo(w, h)
  ctx.lineTo(0, h)
  ctx.fill()

  ctx.fillStyle = '#4e7c59'
  ctx.beginPath()
  ctx.moveTo(0, h * 0.72)
  ctx.quadraticCurveTo(w * 0.5, h * 0.64, w, h * 0.74)
  ctx.lineTo(w, h)
  ctx.lineTo(0, h)
  ctx.fill()

  // 前景花点
  const dots = ['#ffffff', '#fde047', '#fb7185']
  for (let i = 0; i < 28; i++) {
    ctx.fillStyle = dots[i % dots.length]
    ctx.beginPath()
    ctx.arc((i * 47) % w, h * 0.76 + ((i * 19) % 30), 2.5, 0, Math.PI * 2)
    ctx.fill()
  }

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/* ---------------- 1. 橘猫（坐姿萌态 + 翘尾微摇） ---------------- */

function MiniCat() {
  const tailRef = useRef<THREE.Mesh>(null)
  const tailGeo = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.06, 0.04),
      new THREE.Vector3(0.05, 0.11, 0.08),
      new THREE.Vector3(0.085, 0.11, 0.16),
      new THREE.Vector3(0.065, 0.075, 0.22),
    ])
    return new THREE.TubeGeometry(curve, 14, 0.015, 8, false)
  }, [])
  useEffect(() => () => tailGeo.dispose(), [tailGeo])

  useFrame(({ clock }) => {
    if (tailRef.current) {
      tailRef.current.rotation.z = Math.sin(clock.elapsedTime * 2.6) * 0.14
    }
  })

  return (
    <group>
      {/* 奶白布艺小圆垫 */}
      <mesh position={[0, 0, 0.008]} rotation={[Math.PI / 2, 0, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[0.132, 0.142, 0.016, 24]} />
        <meshStandardMaterial color="#f5efe6" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0, 0.012]}>
        <torusGeometry args={[0.13, 0.011, 8, 24]} />
        <meshStandardMaterial color="#d89250" roughness={0.8} />
      </mesh>

      {/* 坐姿圆润橘猫身躯 */}
      <mesh position={[0, 0.012, 0.095]} scale={[1.0, 0.92, 1.15]} castShadow receiveShadow>
        <sphereGeometry args={[0.082, 18, 14]} />
        <meshStandardMaterial color="#e88f3d" roughness={0.78} />
      </mesh>
      {/* 奶油白胸毛 */}
      <mesh position={[0, -0.052, 0.092]} scale={[0.92, 0.6, 1.05]} castShadow>
        <sphereGeometry args={[0.056, 14, 12]} />
        <meshStandardMaterial color="#fff7ec" roughness={0.82} />
      </mesh>
      {/* 前小爪子 */}
      {[-0.032, 0.032].map((x, idx) => (
        <mesh key={idx} position={[x, -0.072, 0.032]} castShadow>
          <sphereGeometry args={[0.021, 10, 10]} />
          <meshStandardMaterial color="#fff7ec" roughness={0.8} />
        </mesh>
      ))}

      {/* 圆猫头 */}
      <mesh position={[0, -0.022, 0.218]} scale={[1.1, 0.96, 0.95]} castShadow>
        <sphereGeometry args={[0.076, 18, 14]} />
        <meshStandardMaterial color="#ee9846" roughness={0.76} />
      </mesh>
      {/* 奶油白脸颊口鼻 */}
      {[-0.018, 0.018].map((x, idx) => (
        <mesh key={idx} position={[x, -0.084, 0.204]}>
          <sphereGeometry args={[0.022, 10, 10]} />
          <meshStandardMaterial color="#fff7ec" roughness={0.8} />
        </mesh>
      ))}
      {/* 粉嫩小鼻头 */}
      <mesh position={[0, -0.1, 0.214]}>
        <sphereGeometry args={[0.01, 8, 8]} />
        <meshStandardMaterial color="#f2849e" roughness={0.5} />
      </mesh>
      {/* 亮黑圆眼 + 白色高光点 */}
      {[-0.032, 0.032].map((x, idx) => (
        <group key={idx} position={[x, -0.086, 0.236]}>
          <mesh>
            <sphereGeometry args={[0.013, 10, 10]} />
            <meshStandardMaterial color="#18181b" roughness={0.2} />
          </mesh>
          <mesh position={[0.004, -0.008, 0.006]}>
            <sphereGeometry args={[0.004, 6, 6]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
        </group>
      ))}

      {/* 双立耳（外橘 + 粉内耳） */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.048, -0.01, 0.282]} rotation={[Math.PI / 2 - 0.1, 0, -s * 0.28]}>
          <mesh castShadow>
            <coneGeometry args={[0.03, 0.062, 10]} />
            <meshStandardMaterial color="#e58835" roughness={0.78} />
          </mesh>
          <mesh position={[0, 0, -0.009]}>
            <coneGeometry args={[0.017, 0.042, 8]} />
            <meshStandardMaterial color="#f8b4c4" roughness={0.7} />
          </mesh>
        </group>
      ))}

      {/* 翘起摇摆橘色尾巴 */}
      <mesh ref={tailRef} geometry={tailGeo} castShadow>
        <meshStandardMaterial color="#dc7c2b" roughness={0.78} />
      </mesh>
    </group>
  )
}

/* ---------------- 2. 柴犬（豆豆眉 + 卷尾巴） ---------------- */

function MiniDog() {
  return (
    <group>
      {/* 暖米布艺底垫 */}
      <mesh position={[0, 0, 0.008]} rotation={[Math.PI / 2, 0, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[0.132, 0.142, 0.016, 24]} />
        <meshStandardMaterial color="#ebe2d3" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0, 0.012]}>
        <torusGeometry args={[0.13, 0.011, 8, 24]} />
        <meshStandardMaterial color="#597d60" roughness={0.8} />
      </mesh>

      {/* 坐姿柴犬身 */}
      <mesh position={[0, 0.01, 0.095]} scale={[1.0, 0.94, 1.12]} castShadow receiveShadow>
        <sphereGeometry args={[0.082, 18, 14]} />
        <meshStandardMaterial color="#d88236" roughness={0.8} />
      </mesh>
      {/* 奶白腹部 */}
      <mesh position={[0, -0.056, 0.092]} scale={[0.92, 0.58, 1.05]} castShadow>
        <sphereGeometry args={[0.058, 14, 12]} />
        <meshStandardMaterial color="#fff8ef" roughness={0.85} />
      </mesh>
      {/* 红绿小项圈 + 小金铃 */}
      <mesh position={[0, -0.006, 0.162]} rotation={[0.15, 0, 0]}>
        <torusGeometry args={[0.058, 0.009, 8, 20]} />
        <meshStandardMaterial color="#c93b3b" roughness={0.55} />
      </mesh>
      <mesh position={[0, -0.064, 0.156]}>
        <sphereGeometry args={[0.013, 10, 10]} />
        <meshStandardMaterial color="#f5c542" metalness={0.85} roughness={0.22} />
      </mesh>

      {/* 柴犬圆脸 */}
      <mesh position={[0, -0.022, 0.218]} scale={[1.08, 0.96, 0.96]} castShadow>
        <sphereGeometry args={[0.076, 18, 14]} />
        <meshStandardMaterial color="#de8a3d" roughness={0.78} />
      </mesh>
      {/* 标志性白色两颊与吻部 */}
      <mesh position={[0, -0.078, 0.205]} scale={[1.15, 0.85, 0.88]}>
        <sphereGeometry args={[0.048, 14, 12]} />
        <meshStandardMaterial color="#fff8ef" roughness={0.85} />
      </mesh>
      {/* 黑亮鼻头 */}
      <mesh position={[0, -0.114, 0.218]}>
        <sphereGeometry args={[0.013, 10, 10]} />
        <meshStandardMaterial color="#18181b" roughness={0.25} />
      </mesh>
      {/* 黑眼珠 + 经典白色豆豆眉 */}
      {[-0.032, 0.032].map((x, idx) => (
        <group key={idx}>
          <mesh position={[x, -0.086, 0.236]}>
            <sphereGeometry args={[0.012, 10, 10]} />
            <meshStandardMaterial color="#18181b" roughness={0.2} />
          </mesh>
          <mesh position={[x, -0.08, 0.258]} scale={[1.1, 0.65, 0.85]}>
            <sphereGeometry args={[0.012, 8, 8]} />
            <meshStandardMaterial color="#fff8ef" roughness={0.8} />
          </mesh>
        </group>
      ))}

      {/* 双三角立耳 */}
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          position={[s * 0.048, -0.008, 0.285]}
          rotation={[Math.PI / 2 - 0.14, 0, -s * 0.3]}
          castShadow
        >
          <coneGeometry args={[0.028, 0.058, 10]} />
          <meshStandardMaterial color="#d27b2f" roughness={0.8} />
        </mesh>
      ))}

      {/* 标志性甜甜圈卷尾 */}
      <mesh position={[0, 0.084, 0.142]} rotation={[0.15, Math.PI / 2, 0]} castShadow>
        <torusGeometry args={[0.034, 0.016, 10, 18]} />
        <meshStandardMaterial color="#e8b885" roughness={0.82} />
      </mesh>
    </group>
  )
}

/* ---------------- 3. 复古单反相机（金属顶盖 + 蓝膜大镜头） ---------------- */

function MiniCamera({ burstTrigger }: { burstTrigger: number }) {
  const flashRef = useRef<THREE.Mesh>(null)
  const flashLightRef = useRef<THREE.PointLight>(null)
  const tapTimeRef = useRef(-99)

  useEffect(() => {
    if (burstTrigger > 0) tapTimeRef.current = -1
  }, [burstTrigger])

  useFrame(({ clock }) => {
    if (burstTrigger === 0) {
      if (flashRef.current) flashRef.current.visible = false
      if (flashLightRef.current) flashLightRef.current.intensity = 0
      return
    }
    if (tapTimeRef.current < 0) tapTimeRef.current = clock.elapsedTime
    const age = clock.elapsedTime - tapTimeRef.current
    const glow = age < 0.45 ? Math.sin((age / 0.45) * Math.PI) : 0
    if (flashRef.current) {
      flashRef.current.visible = glow > 0.02
      flashRef.current.scale.setScalar(0.8 + glow * 1.4)
      ;(flashRef.current.material as THREE.MeshBasicMaterial).opacity = glow * 0.92
    }
    if (flashLightRef.current) {
      flashLightRef.current.intensity = glow * 3.2
    }
  })

  return (
    <group>
      <mesh position={[0, 0, 0.008]} rotation={[Math.PI / 2, 0, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[0.142, 0.15, 0.016, 24]} />
        <meshStandardMaterial color="#2a313c" roughness={0.8} metalness={0.2} />
      </mesh>

      {/* 黑皮革机身 */}
      <mesh position={[0, 0.008, 0.082]} castShadow receiveShadow>
        <boxGeometry args={[0.23, 0.084, 0.132]} />
        <meshStandardMaterial color="#1b2028" roughness={0.88} metalness={0.08} />
      </mesh>
      {/* 银色铝合金顶盖 */}
      <mesh position={[0, 0.008, 0.162]} castShadow>
        <boxGeometry args={[0.234, 0.088, 0.034]} />
        <meshStandardMaterial color="#d4dce6" roughness={0.24} metalness={0.86} />
      </mesh>
      {/* 军舰部取景器棱镜 */}
      <mesh position={[0, 0.008, 0.195]} castShadow>
        <boxGeometry args={[0.082, 0.072, 0.04]} />
        <meshStandardMaterial color="#c8d2de" roughness={0.25} metalness={0.85} />
      </mesh>
      {/* 银色拨盘与红快门钮 */}
      <mesh position={[-0.075, 0.008, 0.186]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.022, 0.022, 0.02, 16]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.22} metalness={0.88} />
      </mesh>
      <mesh position={[0.082, -0.008, 0.186]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.014, 0.014, 0.018, 14]} />
        <meshStandardMaterial color="#e53935" roughness={0.35} metalness={0.3} />
      </mesh>

      {/* 镜头朝 -Y 伸出 */}
      <mesh position={[0, -0.056, 0.095]} castShadow>
        <cylinderGeometry args={[0.058, 0.062, 0.056, 24]} />
        <meshStandardMaterial color="#d0d8e2" roughness={0.22} metalness={0.88} />
      </mesh>
      <mesh position={[0, -0.088, 0.095]} castShadow>
        <cylinderGeometry args={[0.052, 0.056, 0.036, 24]} />
        <meshStandardMaterial color="#161b22" roughness={0.65} metalness={0.3} />
      </mesh>
      {/* 幽蓝光学镀膜镜片 */}
      <mesh position={[0, -0.105, 0.095]} scale={[1, 0.35, 1]}>
        <sphereGeometry args={[0.044, 18, 12]} />
        <meshStandardMaterial color="#1d4ed8" metalness={0.92} roughness={0.08} emissive="#0f295c" emissiveIntensity={0.35} />
      </mesh>
      {/* 相机闪光灯球与高光 */}
      <mesh ref={flashRef} position={[0, -0.12, 0.14]} visible={false}>
        <sphereGeometry args={[0.048, 12, 12]} />
        <meshBasicMaterial color="#fffbe6" transparent opacity={0} depthWrite={false} />
      </mesh>
      <pointLight ref={flashLightRef} position={[0, -0.18, 0.16]} color="#fff7d6" intensity={0} distance={1.1} />
    </group>
  )
}

/* ---------------- 4. 拿铁咖啡杯（陶瓷杯 + 拉花 + 上升热气） ---------------- */

function MiniCoffee({ burstTrigger }: { burstTrigger: number }) {
  const latteTex = useMemo(() => makeLatteArtTexture(), [])
  useEffect(() => () => latteTex.dispose(), [latteTex])

  const steam1 = useRef<THREE.Mesh>(null)
  const steam2 = useRef<THREE.Mesh>(null)
  const tapTimeRef = useRef(-99)

  useEffect(() => {
    if (burstTrigger > 0) tapTimeRef.current = -1
  }, [burstTrigger])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    let boost = 0
    if (burstTrigger > 0) {
      if (tapTimeRef.current < 0) tapTimeRef.current = t
      const age = t - tapTimeRef.current
      if (age < 2.2) boost = 1 - age / 2.2
    }
    const spd = 0.45 + boost * 0.9
    if (steam1.current) {
      const p = (t * spd) % 1
      steam1.current.position.set(-0.02 + Math.sin(t * 2.5) * 0.015, 0, 0.23 + p * (0.12 + boost * 0.14))
      steam1.current.scale.setScalar((1 + p * 0.6) * (1 + boost * 0.55))
      ;(steam1.current.material as THREE.MeshBasicMaterial).opacity = Math.sin(p * Math.PI) * (0.38 + boost * 0.36)
    }
    if (steam2.current) {
      const p = (t * spd + 0.5) % 1
      steam2.current.position.set(0.025 + Math.cos(t * 2.7) * 0.015, -0.01, 0.23 + p * (0.12 + boost * 0.14))
      steam2.current.scale.setScalar((0.85 + p * 0.55) * (1 + boost * 0.55))
      ;(steam2.current.material as THREE.MeshBasicMaterial).opacity = Math.sin(p * Math.PI) * (0.32 + boost * 0.36)
    }
  })

  return (
    <group>
      {/* 胡桃木圆形杯垫 */}
      <mesh position={[0, 0, 0.008]} rotation={[Math.PI / 2, 0, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[0.132, 0.136, 0.016, 24]} />
        <meshStandardMaterial color="#5c3a24" roughness={0.82} />
      </mesh>
      {/* 杯垫边缘小焦糖饼干 */}
      <mesh position={[-0.088, -0.056, 0.022]} rotation={[0.12, 0.2, 0.5]} castShadow>
        <boxGeometry args={[0.044, 0.032, 0.01]} />
        <meshStandardMaterial color="#d49a5a" roughness={0.85} />
      </mesh>

      {/* 奶油白陶瓷大杯体 */}
      <mesh position={[0, 0.008, 0.112]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.09, 0.076, 0.19, 24]} />
        <meshStandardMaterial color="#faf6ef" roughness={0.28} metalness={0.05} />
      </mesh>
      {/* 细金杯口边 */}
      <mesh position={[0, 0.008, 0.207]}>
        <torusGeometry args={[0.089, 0.005, 8, 24]} />
        <meshStandardMaterial color="#d4af37" metalness={0.85} roughness={0.22} />
      </mesh>
      {/* 右侧圆环杯柄 */}
      <mesh position={[0.084, 0.008, 0.115]} rotation={[Math.PI / 2, 0, -Math.PI / 2]} castShadow>
        <torusGeometry args={[0.052, 0.013, 10, 18, Math.PI]} />
        <meshStandardMaterial color="#faf6ef" roughness={0.28} />
      </mesh>

      {/* 心形拿铁拉花咖啡液面 */}
      <mesh position={[0, 0.008, 0.2]}>
        <circleGeometry args={[0.082, 24]} />
        <meshStandardMaterial map={latteTex} roughness={0.42} />
      </mesh>

      {/* 柔和热气粒子 */}
      <mesh ref={steam1} position={[-0.02, 0, 0.24]}>
        <sphereGeometry args={[0.018, 10, 10]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.35} depthWrite={false} />
      </mesh>
      <mesh ref={steam2} position={[0.02, -0.01, 0.28]}>
        <sphereGeometry args={[0.015, 10, 10]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.3} depthWrite={false} />
      </mesh>
    </group>
  )
}

/* ---------------- 5. 笔记本电脑（太空灰金属 + 发光代码屏） ---------------- */

function MiniLaptop() {
  const screenTex = useMemo(() => makeLaptopScreenTexture(), [])
  useEffect(() => () => screenTex.dispose(), [screenTex])

  return (
    <group>
      {/* 极简桌垫 */}
      <mesh position={[0, 0, 0.006]} rotation={[Math.PI / 2, 0, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[0.155, 0.16, 0.012, 24]} />
        <meshStandardMaterial color="#334155" roughness={0.85} />
      </mesh>
      {/* 太空灰下底座 */}
      <mesh position={[0, -0.028, 0.022]} castShadow receiveShadow>
        <boxGeometry args={[0.25, 0.17, 0.018]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.82} roughness={0.25} />
      </mesh>
      {/* 深灰巧克力键盘 */}
      <mesh position={[0, -0.01, 0.032]}>
        <boxGeometry args={[0.21, 0.086, 0.006]} />
        <meshStandardMaterial color="#1e293b" roughness={0.75} />
      </mesh>
      {/* 触控板 */}
      <mesh position={[0, -0.082, 0.032]}>
        <boxGeometry args={[0.082, 0.044, 0.005]} />
        <meshStandardMaterial color="#64748b" metalness={0.7} roughness={0.3} />
      </mesh>

      {/* 上盖屏幕（展开 108° 面向 -Y） */}
      <group position={[0, 0.056, 0.028]} rotation={[-0.32, 0, 0]}>
        <mesh position={[0, 0, 0.086]} castShadow>
          <boxGeometry args={[0.25, 0.012, 0.172]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.82} roughness={0.25} />
        </mesh>
        <mesh position={[0, -0.007, 0.086]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.23, 0.152]} />
          <meshStandardMaterial
            map={screenTex}
            emissive="#ffffff"
            emissiveMap={screenTex}
            emissiveIntensity={0.65}
            roughness={0.22}
          />
        </mesh>
      </group>
    </group>
  )
}

/* ---------------- 6. 民谣木吉他（琴架立姿 + 音孔琴弦） ---------------- */

function MiniGuitar({ burstTrigger }: { burstTrigger: number }) {
  return (
    <group>
      {/* 黑色小圆盘吉他座 */}
      <mesh position={[0, 0, 0.007]} rotation={[Math.PI / 2, 0, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[0.125, 0.132, 0.014, 24]} />
        <meshStandardMaterial color="#27272a" roughness={0.75} metalness={0.35} />
      </mesh>

      {/* 微后倾立起的吉他主体（面向 -Y） */}
      <group rotation={[-0.22, 0, 0]} position={[0, 0, 0.02]}>
        {/* 下圆鼓箱 */}
        <mesh position={[0, 0, 0.086]} castShadow receiveShadow>
          <cylinderGeometry args={[0.088, 0.088, 0.042, 24]} />
          <meshStandardMaterial color="#d48e48" roughness={0.48} />
        </mesh>
        {/* 上圆鼓箱 */}
        <mesh position={[0, 0, 0.168]} castShadow receiveShadow>
          <cylinderGeometry args={[0.066, 0.066, 0.042, 24]} />
          <meshStandardMaterial color="#d48e48" roughness={0.48} />
        </mesh>
        {/* 深色音孔与护板 */}
        <mesh position={[0, -0.022, 0.148]} rotation={[Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.026, 20]} />
          <meshStandardMaterial color="#241309" roughness={0.9} />
        </mesh>
        <mesh position={[0, -0.0215, 0.148]} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.027, 0.032, 20]} />
          <meshStandardMaterial color="#f5e6cc" roughness={0.5} />
        </mesh>
        {/* 琴桥 */}
        <mesh position={[0, -0.023, 0.088]}>
          <boxGeometry args={[0.05, 0.008, 0.014]} />
          <meshStandardMaterial color="#2c180c" roughness={0.7} />
        </mesh>
        {/* 琴颈与指板 */}
        <mesh position={[0, -0.014, 0.27]} castShadow>
          <boxGeometry args={[0.024, 0.016, 0.18]} />
          <meshStandardMaterial color="#593218" roughness={0.62} />
        </mesh>
        {/* 琴头 */}
        <mesh position={[0, -0.012, 0.375]} castShadow>
          <boxGeometry args={[0.034, 0.014, 0.044]} />
          <meshStandardMaterial color="#42220f" roughness={0.55} />
        </mesh>
        {/* 亮银吉他弦 */}
        {[-0.007, -0.002, 0.003, 0.008].map((sx, idx) => (
          <mesh key={idx} position={[sx, -0.024, 0.22]}>
            <boxGeometry args={[0.0018, 0.0018, 0.27]} />
            <meshStandardMaterial color="#e2e8f0" metalness={0.85} roughness={0.2} />
          </mesh>
        ))}
      </group>
      <SparkBurst burstTrigger={burstTrigger} colors={['#fbbf24', '#f472b6', '#60a5fa']} />
    </group>
  )
}

/* ---------------- 7. 艺术画架（木制三角架 + 印象派花山小油画） ---------------- */

function MiniEasel({ burstTrigger }: { burstTrigger: number }) {
  const paintTex = useMemo(() => makePaintingTexture(), [])
  useEffect(() => () => paintTex.dispose(), [paintTex])

  return (
    <group>
      <mesh position={[0, 0, 0.006]} rotation={[Math.PI / 2, 0, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[0.138, 0.145, 0.012, 24]} />
        <meshStandardMaterial color="#e5ded3" roughness={0.9} />
      </mesh>

      {/* 原木三角画架腿 */}
      <mesh position={[-0.068, -0.032, 0.145]} rotation={[-0.18, 0.16, 0]} castShadow>
        <boxGeometry args={[0.014, 0.014, 0.29]} />
        <meshStandardMaterial color="#9c6c41" roughness={0.78} />
      </mesh>
      <mesh position={[0.068, -0.032, 0.145]} rotation={[-0.18, -0.16, 0]} castShadow>
        <boxGeometry args={[0.014, 0.014, 0.29]} />
        <meshStandardMaterial color="#9c6c41" roughness={0.78} />
      </mesh>
      <mesh position={[0, 0.056, 0.135]} rotation={[0.38, 0, 0]} castShadow>
        <boxGeometry args={[0.014, 0.014, 0.28]} />
        <meshStandardMaterial color="#875b34" roughness={0.8} />
      </mesh>
      {/* 横向画托条 */}
      <mesh position={[0, -0.048, 0.095]} castShadow>
        <boxGeometry args={[0.2, 0.022, 0.014]} />
        <meshStandardMaterial color="#b07c4e" roughness={0.75} />
      </mesh>

      {/* 画框与画布 */}
      <group position={[0, -0.036, 0.18]} rotation={[-0.18, 0, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.2, 0.016, 0.156]} />
          <meshStandardMaterial color="#6e4726" roughness={0.7} />
        </mesh>
        <mesh position={[0, -0.009, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.178, 0.136]} />
          <meshStandardMaterial map={paintTex} roughness={0.82} />
        </mesh>
      </group>
      <SparkBurst burstTrigger={burstTrigger} colors={['#f43f5e', '#facc15', '#34d399', '#38bdf8']} />
    </group>
  )
}

/* ---------------- 8. 宇航火箭（金属箭体 + 红翼 + 呼吸尾焰） ---------------- */

function MiniRocket({ burstTrigger }: { burstTrigger: number }) {
  const flameRef = useRef<THREE.Mesh>(null)
  const tapTimeRef = useRef(-99)

  useEffect(() => {
    if (burstTrigger > 0) tapTimeRef.current = -1
  }, [burstTrigger])

  useFrame(({ clock }) => {
    if (flameRef.current) {
      let boost = 0
      if (burstTrigger > 0) {
        if (tapTimeRef.current < 0) tapTimeRef.current = clock.elapsedTime
        const age = clock.elapsedTime - tapTimeRef.current
        if (age < 1.6) boost = Math.sin((age / 1.6) * Math.PI)
      }
      const s = 0.88 + Math.sin(clock.elapsedTime * (11 + boost * 14)) * 0.14 + boost * 1.15
      flameRef.current.scale.set(1 + boost * 0.35, 1 + boost * 0.35, s)
    }
  })

  return (
    <group>
      {/* 金属发射坪底座 */}
      <mesh position={[0, 0, 0.008]} rotation={[Math.PI / 2, 0, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[0.135, 0.145, 0.016, 24]} />
        <meshStandardMaterial color="#1f2937" roughness={0.65} metalness={0.5} />
      </mesh>
      <mesh position={[0, 0, 0.017]}>
        <ringGeometry args={[0.092, 0.112, 24]} />
        <meshBasicMaterial color="#f59e0b" side={THREE.DoubleSide} />
      </mesh>

      {/* 银白火箭箭体 */}
      <mesh position={[0, 0, 0.165]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.052, 0.06, 0.19, 20]} />
        <meshStandardMaterial color="#f1f5f9" roughness={0.28} metalness={0.55} />
      </mesh>
      {/* 航天红鼻锥 */}
      <mesh position={[0, 0, 0.305]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <coneGeometry args={[0.052, 0.095, 20]} />
        <meshStandardMaterial color="#e53935" roughness={0.35} metalness={0.25} />
      </mesh>
      {/* 正前方冰蓝圆形舷窗 */}
      <mesh position={[0, -0.055, 0.19]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.022, 0.005, 8, 16]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.85} roughness={0.2} />
      </mesh>
      <mesh position={[0, -0.056, 0.19]}>
        <sphereGeometry args={[0.02, 12, 10]} />
        <meshStandardMaterial color="#38bdf8" metalness={0.6} roughness={0.12} emissive="#0284c7" emissiveIntensity={0.45} />
      </mesh>
      {/* 3 片红色平衡尾翼 */}
      {[0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((ang, idx) => (
        <group key={idx} rotation={[0, 0, ang]}>
          <mesh position={[0, -0.068, 0.095]} rotation={[0.25, 0, 0]} castShadow>
            <boxGeometry args={[0.012, 0.044, 0.072]} />
            <meshStandardMaterial color="#d32f2f" roughness={0.42} />
          </mesh>
        </group>
      ))}
      {/* 喷管与脉动尾焰 */}
      <mesh position={[0, 0, 0.062]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.032, 0.042, 0.028, 16]} />
        <meshStandardMaterial color="#334155" metalness={0.75} roughness={0.3} />
      </mesh>
      <mesh ref={flameRef} position={[0, 0, 0.036]} rotation={[-Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.03, 0.045, 14]} />
        <meshBasicMaterial color="#fb923c" />
      </mesh>
    </group>
  )
}

/* ---------------- 统一对外导出组件 ---------------- */

export function MicroAccessory({
  accessory,
  greeting,
  position,
  scale = 1,
  rotZ = 0,
}: {
  accessory?: string
  greeting?: string
  position: [number, number, number]
  scale?: number
  rotZ?: number
}) {
  const info = getAccessoryInfo(accessory)
  const [tapTrigger, setTapTrigger] = useState(0)
  const animRef = useRef<THREE.Group>(null)
  const tapTimeRef = useRef(-99)

  useEffect(() => () => setPointerCursor(false), [])

  useFrame(({ clock }) => {
    const grp = animRef.current
    if (!grp) return
    if (tapTrigger === 0) {
      grp.position.z = 0
      grp.rotation.y = 0
      return
    }
    if (tapTimeRef.current < 0) tapTimeRef.current = clock.elapsedTime
    const age = clock.elapsedTime - tapTimeRef.current
    if (!info) return

    if (info.id === 'rocket') {
      const dur = 1.5
      if (age < dur) {
        const p = age / dur
        grp.position.z = Math.sin(p * Math.PI) * 0.28
        grp.rotation.z = Math.sin(p * Math.PI * 3) * 0.08
      } else {
        grp.position.z = 0
        grp.rotation.z = 0
      }
    } else if (info.id === 'cat' || info.id === 'dog') {
      const dur = 1.15
      if (age < dur) {
        const p = age / dur
        grp.position.z = Math.abs(Math.sin(p * Math.PI * 2)) * 0.125
        grp.rotation.y = Math.sin(p * Math.PI * 4) * 0.14
      } else {
        grp.position.z = 0
        grp.rotation.y = 0
      }
    } else {
      const dur = 0.9
      if (age < dur) {
        const p = age / dur
        grp.position.z = Math.sin(p * Math.PI) * 0.08
        grp.rotation.y = Math.sin(p * Math.PI * 2) * 0.09
      } else {
        grp.position.z = 0
        grp.rotation.y = 0
      }
    }
  })

  if (!info) return null

  const quotes = ACCESSORY_QUOTES[info.id] ?? ['你好呀！']
  const bubbleText = greeting?.trim() || quotes[(tapTrigger - 1) % quotes.length] || quotes[0]

  return (
    <group
      position={position}
      rotation={[0, 0, rotZ]}
      scale={scale}
      onClick={(e) => {
        if (!isTapEvent(e)) return
        tapTimeRef.current = -1
        setTapTrigger((n) => n + 1)
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        setPointerCursor(true)
      }}
      onPointerOut={(e) => {
        e.stopPropagation()
        setPointerCursor(false)
      }}
    >
      <group ref={animRef}>
        {info.id === 'cat' && <MiniCat />}
        {info.id === 'dog' && <MiniDog />}
        {info.id === 'camera' && <MiniCamera burstTrigger={tapTrigger} />}
        {info.id === 'coffee' && <MiniCoffee burstTrigger={tapTrigger} />}
        {info.id === 'laptop' && <MiniLaptop />}
        {info.id === 'guitar' && <MiniGuitar burstTrigger={tapTrigger} />}
        {info.id === 'easel' && <MiniEasel burstTrigger={tapTrigger} />}
        {info.id === 'rocket' && <MiniRocket burstTrigger={tapTrigger} />}
      </group>
      <SpeechBubble3D
        text={bubbleText}
        accent={info.accent}
        triggerId={tapTrigger}
        position={[0, 0, 0.5]}
      />
    </group>
  )
}
