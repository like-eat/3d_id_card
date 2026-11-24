/** 16 型 MBTI 卡通形象元数据（复用 public/mbti/<CODE>.png 透明底精灵） */

export interface MbtiInfo {
  code: string
  title: string
  group: 'analyst' | 'diplomat' | 'sentinel' | 'explorer'
  color: string
  avatar: string
}

export const MBTI_LIST: MbtiInfo[] = [
  // 分析家（紫）
  { code: 'INTJ', title: '建筑师', group: 'analyst', color: '#8b6fa8', avatar: '/mbti/INTJ.png' },
  { code: 'INTP', title: '逻辑学家', group: 'analyst', color: '#9c7bb5', avatar: '/mbti/INTP.png' },
  { code: 'ENTJ', title: '指挥官', group: 'analyst', color: '#8a5d8e', avatar: '/mbti/ENTJ.png' },
  { code: 'ENTP', title: '辩论家', group: 'analyst', color: '#9a6882', avatar: '/mbti/ENTP.png' },

  // 外交家（绿）
  { code: 'INFJ', title: '提倡者', group: 'diplomat', color: '#4c9a6e', avatar: '/mbti/INFJ.png' },
  { code: 'INFP', title: '调停者', group: 'diplomat', color: '#6ba862', avatar: '/mbti/INFP.png' },
  { code: 'ENFJ', title: '主人公', group: 'diplomat', color: '#478f5c', avatar: '/mbti/ENFJ.png' },
  { code: 'ENFP', title: '竞选者', group: 'diplomat', color: '#4ba883', avatar: '/mbti/ENFP.png' },

  // 守护者（蓝）
  { code: 'ISTJ', title: '物流师', group: 'sentinel', color: '#4a8ea6', avatar: '/mbti/ISTJ.png' },
  { code: 'ISFJ', title: '守卫者', group: 'sentinel', color: '#53a6b0', avatar: '/mbti/ISFJ.png' },
  { code: 'ESTJ', title: '总经理', group: 'sentinel', color: '#448da3', avatar: '/mbti/ESTJ.png' },
  { code: 'ESFJ', title: '执政官', group: 'sentinel', color: '#4ea3b8', avatar: '/mbti/ESFJ.png' },

  // 探险家（黄）
  { code: 'ISTP', title: '鉴赏家', group: 'explorer', color: '#c99b2e', avatar: '/mbti/ISTP.png' },
  { code: 'ISFP', title: '探险家', group: 'explorer', color: '#cfa536', avatar: '/mbti/ISFP.png' },
  { code: 'ESTP', title: '企业家', group: 'explorer', color: '#d4a62a', avatar: '/mbti/ESTP.png' },
  { code: 'ESFP', title: '表演者', group: 'explorer', color: '#c49830', avatar: '/mbti/ESFP.png' },
]

export function getMbtiInfo(code?: string | null): MbtiInfo | null {
  if (!code) return null
  const upper = code.trim().toUpperCase()
  return MBTI_LIST.find((m) => m.code === upper) ?? null
}
