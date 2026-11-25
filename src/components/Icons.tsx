import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function BaseIcon({ size = 15, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.65}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0, display: 'inline-block', verticalAlign: 'middle', ...props.style }}
      {...props}
    >
      {children}
    </svg>
  )
}

export function IconSparkles(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 3l1.7 4.6L18.3 9.3l-4.6 1.7L12 15.6l-1.7-4.6L5.7 9.3l4.6-1.7L12 3z" />
      <path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z" />
    </BaseIcon>
  )
}

export function IconSoundOn(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.8 5.5a9.5 9.5 0 0 1 0 13" />
    </BaseIcon>
  )
}

export function IconSoundOff(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="22" y1="9" x2="16" y2="15" />
      <line x1="16" y1="9" x2="22" y2="15" />
    </BaseIcon>
  )
}

export function IconFlip(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M3 12a9 9 0 0 1 15.3-6.4L21 8" />
      <polyline points="21 3 21 8 16 8" />
      <path d="M21 12a9 9 0 0 1-15.3 6.4L3 16" />
      <polyline points="3 21 3 16 8 16" />
    </BaseIcon>
  )
}

export function IconContact(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="4" y="3" width="16" height="18" rx="2.5" />
      <circle cx="12" cy="10" r="2.6" />
      <path d="M8 17c.8-2 2.2-3 4-3s3.2 1 4 3" />
    </BaseIcon>
  )
}

export function IconImage(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="M21 15l-4.5-4.5a1.5 1.5 0 0 0-2.1 0L7 18" />
    </BaseIcon>
  )
}

export function IconEye(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M2 12s3.8-6.5 10-6.5S22 12 22 12s-3.8 6.5-10 6.5S2 12 2 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </BaseIcon>
  )
}

export function IconEyeOff(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M9.9 5.2A10.7 10.7 0 0 1 12 5c6.2 0 10 7 10 7a16.8 16.8 0 0 1-4.1 4.9" />
      <path d="M6.6 6.7C3.8 8.6 2 12 2 12s3.8 7 10 7c1.6 0 3.1-.4 4.4-1" />
      <line x1="3" y1="3" x2="21" y2="21" />
    </BaseIcon>
  )
}

export function IconSliders(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <line x1="4" y1="7" x2="20" y2="7" />
      <circle cx="9" cy="7" r="2" fill="currentColor" stroke="none" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <circle cx="15" cy="12" r="2" fill="currentColor" stroke="none" />
      <line x1="4" y1="17" x2="20" y2="17" />
      <circle cx="11" cy="17" r="2" fill="currentColor" stroke="none" />
    </BaseIcon>
  )
}

export function IconChevronDown(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <polyline points="6 9 12 15 18 9" />
    </BaseIcon>
  )
}

export function IconSun(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2.5" x2="12" y2="5" />
      <line x1="12" y1="19" x2="12" y2="21.5" />
      <line x1="5" y1="5" x2="6.8" y2="6.8" />
      <line x1="17.2" y1="17.2" x2="19" y2="19" />
      <line x1="2.5" y1="12" x2="5" y2="12" />
      <line x1="19" y1="12" x2="21.5" y2="12" />
    </BaseIcon>
  )
}

export function IconSunset(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M17 17a5 5 0 0 0-10 0" />
      <line x1="3" y1="17" x2="21" y2="17" />
      <line x1="12" y1="4" x2="12" y2="8" />
      <line x1="5.6" y1="9.6" x2="7.5" y2="11.5" />
      <line x1="18.4" y1="9.6" x2="16.5" y2="11.5" />
    </BaseIcon>
  )
}

export function IconMoon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
    </BaseIcon>
  )
}

export function IconAutoMood(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5a8.5 8.5 0 0 0 0 17z" fill="currentColor" stroke="none" />
    </BaseIcon>
  )
}

export function IconUpload(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </BaseIcon>
  )
}

export function IconCopy(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </BaseIcon>
  )
}

export function IconExternalLink(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </BaseIcon>
  )
}

export function IconCircleFrame(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="10" r="2.4" />
      <path d="M7.5 17.5a5 5 0 0 1 9 0" />
    </BaseIcon>
  )
}

export function IconPolaroid(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <rect x="6.5" y="5.5" width="11" height="10" rx="1" />
    </BaseIcon>
  )
}
