'use client'

import React from 'react'

interface IconProps {
  className?: string
  size?: number
}

// Modern Figma-style Icons for Premium Cybersecurity Design

export const ShieldCheckIcon = ({ className = '', size = 24 }: IconProps) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    className={className}
  >
    <path 
      d="M12 2L4 6V12C4 17.5 7.5 22.5 12 22.5C16.5 22.5 20 17.5 20 12V6L12 2Z" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
      fill="none"
    />
    <path 
      d="M9 12L11 14L15 10" 
      stroke="currentColor" 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
  </svg>
)

export const ZapIcon = ({ className = '', size = 24 }: IconProps) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    className={className}
  >
    <path 
      d="M13 2L3 14H12L11 22L21 10H12L13 2Z" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
      fill="none"
    />
  </svg>
)

export const RocketIcon = ({ className = '', size = 24 }: IconProps) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    className={className}
  >
    <path 
      d="M4.5 16.5C4.5 16.5 5.5 7.5 12 4C18.5 7.5 19.5 16.5 19.5 16.5L16.5 20.5L12 18L7.5 20.5L4.5 16.5Z" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
      fill="none"
    />
    <circle 
      cx="12" 
      cy="10" 
      r="2" 
      stroke="currentColor" 
      strokeWidth="2"
      fill="none"
    />
  </svg>
)

export const InfinityIcon = ({ className = '', size = 24 }: IconProps) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    className={className}
  >
    <path 
      d="M17.5 12C19.9853 12 22 9.98528 22 7.5C22 5.01472 19.9853 3 17.5 3C15.0147 3 13 5.01472 13 7.5C13 9.98528 15.0147 12 17.5 12ZM17.5 12L12 17.5M12 17.5C12 20.5376 9.53757 23 6.5 23C3.46243 23 1 20.5376 1 17.5C1 14.4624 3.46243 12 6.5 12C9.53757 12 12 14.4624 12 17.5Z" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
      fill="none"
    />
  </svg>
)

export const AlertTriangleIcon = ({ className = '', size = 24 }: IconProps) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    className={className}
  >
    <path 
      d="M10.29 3.86L1.82 18A2 2 0 003.54 21H20.46A2 2 0 0022.18 18L13.71 3.86A2 2 0 0010.29 3.86Z" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
      fill="none"
    />
    <line 
      x1="12" 
      y1="9" 
      x2="12" 
      y2="13" 
      stroke="currentColor" 
      strokeWidth="2.5" 
      strokeLinecap="round"
    />
    <circle 
      cx="12" 
      cy="17" 
      r="1.5" 
      fill="currentColor"
    />
  </svg>
)

export const TargetIcon = ({ className = '', size = 24 }: IconProps) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    className={className}
  >
    <circle 
      cx="12" 
      cy="12" 
      r="10" 
      stroke="currentColor" 
      strokeWidth="2"
      fill="none"
    />
    <circle 
      cx="12" 
      cy="12" 
      r="6" 
      stroke="currentColor" 
      strokeWidth="2"
      fill="none"
    />
    <circle 
      cx="12" 
      cy="12" 
      r="2" 
      stroke="currentColor" 
      strokeWidth="2"
      fill="none"
    />
  </svg>
)

export const SearchIcon = ({ className = '', size = 24 }: IconProps) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    className={className}
  >
    <circle 
      cx="11" 
      cy="11" 
      r="8" 
      stroke="currentColor" 
      strokeWidth="2"
      fill="none"
    />
    <path 
      d="M21 21L16.65 16.65" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
  </svg>
)

export const CalendarIcon = ({ className = '', size = 24 }: IconProps) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    className={className}
  >
    <rect 
      x="3" 
      y="4" 
      width="18" 
      height="18" 
      rx="2" 
      ry="2" 
      stroke="currentColor" 
      strokeWidth="2"
      fill="none"
    />
    <line 
      x1="16" 
      y1="2" 
      x2="16" 
      y2="6" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round"
    />
    <line 
      x1="8" 
      y1="2" 
      x2="8" 
      y2="6" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round"
    />
    <line 
      x1="3" 
      y1="10" 
      x2="21" 
      y2="10" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round"
    />
  </svg>
)

export const ClockIcon = ({ className = '', size = 24 }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    className={className}
  >
    <circle
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="2"
      fill="none"
    />
    <path
      d="M12 6V12L16 14"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export const MailIcon = ({ className = '', size = 24 }: IconProps) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    className={className}
  >
    <path 
      d="M4 4H20C21.1 4 22 4.9 22 6V18C22 19.1 21.1 20 20 20H4C2.9 20 2 19.1 2 18V6C2 4.9 2.9 4 4 4Z" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
      fill="none"
    />
    <polyline 
      points="22,6 12,13 2,6" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
      fill="none"
    />
  </svg>
)

export const PhoneIcon = ({ className = '', size = 24 }: IconProps) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    className={className}
  >
    <path 
      d="M22 16.92V19.92C22 20.92 21.11 21.81 20.11 21.81C9.06001 21.81 0.190002 12.94 0.190002 1.89C0.190002 0.89 1.08 0 2.08 0H5.08C6.08 0 7.08 0.89 7.08 1.89V5.89C7.08 6.89 6.19 7.78 5.19 7.78H3.78C5.78 12.78 11.22 18.22 16.22 20.22V18.81C16.22 17.81 17.11 16.92 18.11 16.92H22Z" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
      fill="none"
    />
  </svg>
)

export const ProcessIcon = ({ className = '', size = 24 }: IconProps) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    className={className}
  >
    <circle 
      cx="12" 
      cy="12" 
      r="3" 
      stroke="currentColor" 
      strokeWidth="2"
      fill="none"
    />
    <path 
      d="M19.4 15A1.65 1.65 0 0 0 21 13.35A1.65 1.65 0 0 0 19.4 11.65L19.4 9A1.65 1.65 0 0 0 21 7.35A1.65 1.65 0 0 0 19.4 5.65V3A2 2 0 0 0 17.4 1H15A1.65 1.65 0 0 0 13.35 2.6A1.65 1.65 0 0 0 11.65 1H9A1.65 1.65 0 0 0 7.35 2.6A1.65 1.65 0 0 0 5.65 1H3A2 2 0 0 0 1 3V5.65A1.65 1.65 0 0 0 2.6 7.35A1.65 1.65 0 0 0 1 9V11.65A1.65 1.65 0 0 0 2.6 13.35A1.65 1.65 0 0 0 1 15V17.4A2 2 0 0 0 3 19.4H5.65A1.65 1.65 0 0 0 7.35 21A1.65 1.65 0 0 0 9 19.4H11.65A1.65 1.65 0 0 0 13.35 21A1.65 1.65 0 0 0 15 19.4H17.4A2 2 0 0 0 19.4 17.4V15Z" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
      fill="none"
    />
  </svg>
)

export const ShieldIcon = ({ className = '', size = 24 }: IconProps) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    className={className}
  >
    <path 
      d="M12 2L4 6V12C4 17.5 7.5 22.5 12 22.5C16.5 22.5 20 17.5 20 12V6L12 2Z" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
      fill="currentColor"
      fillOpacity="0.1"
    />
  </svg>
)

export const CheckCircleIcon = ({ className = '', size = 24 }: IconProps) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    className={className}
  >
    <circle 
      cx="12" 
      cy="12" 
      r="10" 
      stroke="currentColor" 
      strokeWidth="2"
      fill="currentColor"
      fillOpacity="0.1"
    />
    <path 
      d="M9 12L11 14L15 10" 
      stroke="currentColor" 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
  </svg>
)

export const MonitorIcon = ({ className = '', size = 24 }: IconProps) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    className={className}
  >
    <rect 
      x="2" 
      y="3" 
      width="20" 
      height="14" 
      rx="2" 
      ry="2" 
      stroke="currentColor" 
      strokeWidth="2"
      fill="currentColor"
      fillOpacity="0.1"
    />
    <line 
      x1="8" 
      y1="21" 
      x2="16" 
      y2="21" 
      stroke="currentColor" 
      strokeWidth="2"
      strokeLinecap="round"
    />
    <line 
      x1="12" 
      y1="17" 
      x2="12" 
      y2="21" 
      stroke="currentColor" 
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
)

export const BarChartIcon = ({ className = '', size = 24 }: IconProps) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    className={className}
  >
    <line 
      x1="12" 
      y1="20" 
      x2="12" 
      y2="10" 
      stroke="currentColor" 
      strokeWidth="2"
      strokeLinecap="round"
    />
    <line 
      x1="18" 
      y1="20" 
      x2="18" 
      y2="4" 
      stroke="currentColor" 
      strokeWidth="2"
      strokeLinecap="round"
    />
    <line 
      x1="6" 
      y1="20" 
      x2="6" 
      y2="16" 
      stroke="currentColor" 
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
)

export const CloudIcon = ({ className = '', size = 24 }: IconProps) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    className={className}
  >
    <path 
      d="M18 10H16.74C16.3659 7.49025 14.2356 5.5 11.64 5.5C9.43375 5.5 7.57425 6.88425 6.91725 8.79525C4.56075 9.13425 2.5 11.1053 2.5 13.5C2.5 16.5376 5.03757 19.075 8.075 19.075H18C20.7614 19.075 23 16.8364 23 14.075C23 11.3136 20.7614 9.075 18 9.075V10Z" 
      stroke="currentColor" 
      strokeWidth="2"
      fill="currentColor"
      fillOpacity="0.1"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export const LayersIcon = ({ className = '', size = 24 }: IconProps) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    className={className}
  >
    <polygon 
      points="12,2 2,7 12,12 22,7 12,2" 
      stroke="currentColor" 
      strokeWidth="2" 
      fill="currentColor"
      fillOpacity="0.1"
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
    <polyline 
      points="2,17 12,22 22,17" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
    <polyline 
      points="2,12 12,17 22,12" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
  </svg>
)

export const SettingsIcon = ({ className = '', size = 24 }: IconProps) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    className={className}
  >
    <circle 
      cx="12" 
      cy="12" 
      r="3" 
      stroke="currentColor" 
      strokeWidth="2"
      fill="currentColor"
      fillOpacity="0.1"
    />
    <path 
      d="M19.4 15A1.65 1.65 0 0 0 21 13.35A1.65 1.65 0 0 0 19.4 11.65L19.4 9A1.65 1.65 0 0 0 21 7.35A1.65 1.65 0 0 0 19.4 5.65V3A2 2 0 0 0 17.4 1H15A1.65 1.65 0 0 0 13.35 2.6A1.65 1.65 0 0 0 11.65 1H9A1.65 1.65 0 0 0 7.35 2.6A1.65 1.65 0 0 0 5.65 1H3A2 2 0 0 0 1 3V5.65A1.65 1.65 0 0 0 2.6 7.35A1.65 1.65 0 0 0 1 9V11.65A1.65 1.65 0 0 0 2.6 13.35A1.65 1.65 0 0 0 1 15V17.4A2 2 0 0 0 3 19.4H5.65A1.65 1.65 0 0 0 7.35 21A1.65 1.65 0 0 0 9 19.4H11.65A1.65 1.65 0 0 0 13.35 21A1.65 1.65 0 0 0 15 19.4H17.4A2 2 0 0 0 19.4 17.4V15Z" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
  </svg>
)

export const MessageSquareIcon = ({ className = '', size = 24 }: IconProps) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    className={className}
  >
    <path 
      d="M21 15A2 2 0 0 1 19 17H7L4 20V6A2 2 0 0 1 6 4H19A2 2 0 0 1 21 6V15Z" 
      stroke="currentColor" 
      strokeWidth="2" 
      fill="currentColor"
      fillOpacity="0.1"
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
  </svg>
)

export const BuildingIcon = ({ className = '', size = 24 }: IconProps) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    className={className}
  >
    <path 
      d="M6 22V4C6 3.45 6.45 3 7 3H17C17.55 3 18 3.45 18 4V22" 
      stroke="currentColor" 
      strokeWidth="2" 
      fill="currentColor"
      fillOpacity="0.1"
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
    <line 
      x1="2" 
      y1="22" 
      x2="22" 
      y2="22" 
      stroke="currentColor" 
      strokeWidth="2"
      strokeLinecap="round"
    />
    <line 
      x1="10" 
      y1="7" 
      x2="10" 
      y2="7" 
      stroke="currentColor" 
      strokeWidth="3"
      strokeLinecap="round"
    />
    <line 
      x1="14" 
      y1="7" 
      x2="14" 
      y2="7" 
      stroke="currentColor" 
      strokeWidth="3"
      strokeLinecap="round"
    />
    <line 
      x1="10" 
      y1="11" 
      x2="10" 
      y2="11" 
      stroke="currentColor" 
      strokeWidth="3"
      strokeLinecap="round"
    />
    <line 
      x1="14" 
      y1="11" 
      x2="14" 
      y2="11" 
      stroke="currentColor" 
      strokeWidth="3"
      strokeLinecap="round"
    />
  </svg>
)

export const UsersIcon = ({ className = '', size = 24 }: IconProps) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    className={className}
  >
    <path 
      d="M17 21V19C17 17.9391 16.5786 16.9217 15.8284 16.1716C15.0783 15.4214 14.0609 15 13 15H5C3.93913 15 2.92172 15.4214 2.17157 16.1716C1.42143 16.9217 1 17.9391 1 19V21" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
    <circle 
      cx="9" 
      cy="7" 
      r="4" 
      stroke="currentColor" 
      strokeWidth="2"
      fill="currentColor"
      fillOpacity="0.1"
    />
    <path 
      d="M23 21V19C23 18.1645 22.7155 17.3561 22.2094 16.6994C21.7033 16.0427 20.9999 15.5741 20.2 15.3622" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path 
      d="M16 3.13C16.8003 3.3421 17.5037 3.81079 18.0098 4.46748C18.5159 5.12416 18.8004 5.93256 18.8004 6.76798C18.8004 7.6034 18.5159 8.4118 18.0098 9.06849C17.5037 9.72517 16.8003 10.1939 16 10.406" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export const HandshakeIcon = ({ className = '', size = 24 }: IconProps) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    className={className}
  >
    <path 
      d="M20.42 4.58C19.9 4.06 19.19 3.76 18.45 3.76C17.71 3.76 17 4.06 16.48 4.58L15.07 5.99L18.01 8.93L19.42 7.52C19.94 7 20.24 6.29 20.24 5.55C20.24 4.81 19.94 4.1 19.42 3.58V4.58Z" 
      stroke="currentColor" 
      strokeWidth="2" 
      fill="currentColor"
      fillOpacity="0.1"
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
    <path 
      d="M14.66 6.4L8.93 12.13C8.63 12.43 8.43 12.84 8.37 13.28L7.8 16.72C7.69 17.37 8.13 17.81 8.78 17.7L12.22 17.13C12.66 17.07 13.07 16.87 13.37 16.57L19.1 10.84" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
    <path 
      d="M5 20H19" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round"
    />
  </svg>
)

export const BookOpenIcon = ({ className = '', size = 24 }: IconProps) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    className={className}
  >
    <path 
      d="M2 3H8C9.06087 3 10.0783 3.42143 10.8284 4.17157C11.5786 4.92172 12 5.93913 12 7V21C12 20.2044 11.6839 19.4413 11.1213 18.8787C10.5587 18.3161 9.79565 18 9 18H2V3Z" 
      stroke="currentColor" 
      strokeWidth="2" 
      fill="currentColor"
      fillOpacity="0.1"
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
    <path 
      d="M22 3H16C14.9391 3 13.9217 3.42143 13.1716 4.17157C12.4214 4.92172 12 5.93913 12 7V21C12 20.2044 12.3161 19.4413 12.8787 18.8787C13.4413 18.3161 14.2044 18 15 18H22V3Z" 
      stroke="currentColor" 
      strokeWidth="2" 
      fill="currentColor"
      fillOpacity="0.1"
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
  </svg>
)

export const GlobeIcon = ({ className = '', size = 24 }: IconProps) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    className={className}
  >
    <circle 
      cx="12" 
      cy="12" 
      r="10" 
      stroke="currentColor" 
      strokeWidth="2"
      fill="currentColor"
      fillOpacity="0.1"
    />
    <line 
      x1="2" 
      y1="12" 
      x2="22" 
      y2="12" 
      stroke="currentColor" 
      strokeWidth="2"
      strokeLinecap="round"
    />
    <path 
      d="M12 2C14.5013 4.73835 15.9228 8.29203 16 12C15.9228 15.708 14.5013 19.2616 12 22C9.49872 19.2616 8.07725 15.708 8 12C8.07725 8.29203 9.49872 4.73835 12 2Z" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
  </svg>
)

export const BrainIcon = ({ className = '', size = 24 }: IconProps) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    className={className}
  >
    <path 
      d="M9.5 2C8.5 2 7.7 2.8 7.7 3.8C7.2 3.8 6.8 4.2 6.8 4.7C6.8 5.2 7.2 5.6 7.7 5.6C7.7 6.6 8.5 7.4 9.5 7.4C10.5 7.4 11.3 6.6 11.3 5.6C11.8 5.6 12.2 5.2 12.2 4.7C12.2 4.2 11.8 3.8 11.3 3.8C11.3 2.8 10.5 2 9.5 2Z" 
      stroke="currentColor" 
      strokeWidth="2" 
      fill="currentColor"
      fillOpacity="0.1"
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
    <path 
      d="M6 8.5C5.2 8.5 4.5 9.2 4.5 10C4.5 10.8 5.2 11.5 6 11.5C6.8 11.5 7.5 10.8 7.5 10C7.5 9.2 6.8 8.5 6 8.5Z" 
      stroke="currentColor" 
      strokeWidth="2" 
      fill="currentColor"
      fillOpacity="0.1"
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
    <path 
      d="M14.5 7C13.7 7 13 7.7 13 8.5C13 9.3 13.7 10 14.5 10C15.3 10 16 9.3 16 8.5C16 7.7 15.3 7 14.5 7Z" 
      stroke="currentColor" 
      strokeWidth="2" 
      fill="currentColor"
      fillOpacity="0.1"
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
    <path 
      d="M12 12C10.9 12 10 12.9 10 14C10 15.1 10.9 16 12 16C13.1 16 14 15.1 14 14C14 12.9 13.1 12 12 12Z" 
      stroke="currentColor" 
      strokeWidth="2" 
      fill="currentColor"
      fillOpacity="0.1"
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
    <path 
      d="M8.5 16.5C7.7 16.5 7 17.2 7 18C7 18.8 7.7 19.5 8.5 19.5C9.3 19.5 10 18.8 10 18C10 17.2 9.3 16.5 8.5 16.5Z" 
      stroke="currentColor" 
      strokeWidth="2" 
      fill="currentColor"
      fillOpacity="0.1"
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
    <path 
      d="M15.5 16.5C14.7 16.5 14 17.2 14 18C14 18.8 14.7 19.5 15.5 19.5C16.3 19.5 17 18.8 17 18C17 17.2 16.3 16.5 15.5 16.5Z" 
      stroke="currentColor" 
      strokeWidth="2" 
      fill="currentColor"
      fillOpacity="0.1"
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
    <path 
      d="M6 10L9.5 7.4M14.5 7L11.3 5.6M12 12L10 14M14 14L16 8.5M10 18L12 16M14 18L12 16" 
      stroke="currentColor" 
      strokeWidth="1.5" 
      strokeLinecap="round"
    />
  </svg>
)

export const RobotIcon = ({ className = '', size = 24 }: IconProps) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    className={className}
  >
    {/* Antenna */}
    <line 
      x1="12" 
      y1="2" 
      x2="12" 
      y2="5" 
      stroke="currentColor" 
      strokeWidth="2"
      strokeLinecap="round"
    />
    <circle 
      cx="12" 
      cy="2" 
      r="1" 
      fill="currentColor"
    />
    {/* Head */}
    <rect 
      x="8" 
      y="5" 
      width="8" 
      height="6" 
      rx="1" 
      stroke="currentColor" 
      strokeWidth="2"
      fill="currentColor"
      fillOpacity="0.1"
    />
    {/* Eyes */}
    <circle 
      cx="10" 
      cy="8" 
      r="1" 
      fill="currentColor"
    />
    <circle 
      cx="14" 
      cy="8" 
      r="1" 
      fill="currentColor"
    />
    {/* Body */}
    <rect 
      x="6" 
      y="11" 
      width="12" 
      height="8" 
      rx="2" 
      stroke="currentColor" 
      strokeWidth="2"
      fill="currentColor"
      fillOpacity="0.1"
    />
    {/* Control Panel */}
    <line 
      x1="9" 
      y1="14" 
      x2="11" 
      y2="14" 
      stroke="currentColor" 
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <line 
      x1="9" 
      y1="16" 
      x2="11" 
      y2="16" 
      stroke="currentColor" 
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <circle 
      cx="14.5" 
      cy="15" 
      r="1.5" 
      stroke="currentColor" 
      strokeWidth="1.5"
      fill="none"
    />
    {/* Arms */}
    <line 
      x1="6" 
      y1="13" 
      x2="4" 
      y2="15" 
      stroke="currentColor" 
      strokeWidth="2"
      strokeLinecap="round"
    />
    <line 
      x1="18" 
      y1="13" 
      x2="20" 
      y2="15" 
      stroke="currentColor" 
      strokeWidth="2"
      strokeLinecap="round"
    />
    {/* Legs */}
    <line 
      x1="9" 
      y1="19" 
      x2="9" 
      y2="22" 
      stroke="currentColor" 
      strokeWidth="2"
      strokeLinecap="round"
    />
    <line 
      x1="15" 
      y1="19" 
      x2="15" 
      y2="22" 
      stroke="currentColor" 
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
)

export const FactoryIcon = ({ className = '', size = 24 }: IconProps) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    className={className}
  >
    <path 
      d="M2 20H22V22H2V20Z" 
      stroke="currentColor" 
      strokeWidth="2" 
      fill="currentColor"
      fillOpacity="0.1"
      strokeLinecap="round"
    />
    <path 
      d="M3 20V9L7 6L11 9V11L15 8V11L19 8V20" 
      stroke="currentColor" 
      strokeWidth="2" 
      fill="currentColor"
      fillOpacity="0.1"
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
    <path 
      d="M6 2V6" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round"
    />
    <path 
      d="M10 2V6" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round"
    />
    <path 
      d="M14 2V6" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round"
    />
    <rect 
      x="5" 
      y="13" 
      width="2" 
      height="3" 
      stroke="currentColor" 
      strokeWidth="2"
      fill="currentColor"
      fillOpacity="0.2"
    />
    <rect 
      x="13" 
      y="13" 
      width="2" 
      height="3" 
      stroke="currentColor" 
      strokeWidth="2"
      fill="currentColor"
      fillOpacity="0.2"
    />
  </svg>
)

export const ConstructionIcon = ({ className = '', size = 24 }: IconProps) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    className={className}
  >
    <path 
      d="M14 2L20 8L18 10L12 4L14 2Z" 
      stroke="currentColor" 
      strokeWidth="2" 
      fill="currentColor"
      fillOpacity="0.1"
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
    <path 
      d="M4 14L10 20L8 22L2 16L4 14Z" 
      stroke="currentColor" 
      strokeWidth="2" 
      fill="currentColor"
      fillOpacity="0.1"
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
    <path 
      d="M8 10L10 8L16 14L14 16L8 10Z" 
      stroke="currentColor" 
      strokeWidth="2" 
      fill="currentColor"
      fillOpacity="0.1"
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
    <path 
      d="M15 7L17 9" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round"
    />
    <path 
      d="M7 15L9 17" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round"
    />
  </svg>
)

export const HealthcareIcon = ({ className = '', size = 24 }: IconProps) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    className={className}
  >
    <path 
      d="M19 14C19 15.86 17.36 17.5 15.5 17.5C13.64 17.5 12 15.86 12 14C12 12.14 13.64 10.5 15.5 10.5C17.36 10.5 19 12.14 19 14Z" 
      stroke="currentColor" 
      strokeWidth="2" 
      fill="currentColor"
      fillOpacity="0.1"
    />
    <path 
      d="M12 2L13.09 8.26L22 9L13.09 9.74L12 16L10.91 9.74L2 9L10.91 8.26L12 2Z" 
      stroke="currentColor" 
      strokeWidth="2" 
      fill="currentColor"
      fillOpacity="0.1"
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
    <line 
      x1="12" 
      y1="6" 
      x2="12" 
      y2="10" 
      stroke="currentColor" 
      strokeWidth="2.5"
      strokeLinecap="round"
    />
    <line 
      x1="10" 
      y1="8" 
      x2="14" 
      y2="8" 
      stroke="currentColor" 
      strokeWidth="2.5"
      strokeLinecap="round"
    />
    <path 
      d="M5 19C7 19 9 21 12 21C15 21 17 19 19 19" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round"
    />
  </svg>
)

export const BriefcaseIcon = ({ className = '', size = 24 }: IconProps) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    className={className}
  >
    <rect 
      x="2" 
      y="7" 
      width="20" 
      height="14" 
      rx="2" 
      ry="2" 
      stroke="currentColor" 
      strokeWidth="2"
      fill="currentColor"
      fillOpacity="0.1"
    />
    <path 
      d="M16 21V5C16 4.47 15.79 3.96 15.41 3.59C15.04 3.21 14.53 3 14 3H10C9.47 3 8.96 3.21 8.59 3.59C8.21 3.96 8 4.47 8 5V21" 
      stroke="currentColor" 
      strokeWidth="2"
      fill="currentColor"
      fillOpacity="0.1"
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
    <line 
      x1="10" 
      y1="12" 
      x2="14" 
      y2="12" 
      stroke="currentColor" 
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
)

export const ChevronLeftIcon = ({ className = '', size = 24 }: IconProps) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    className={className}
  >
    <path 
      d="M15 18L9 12L15 6" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
  </svg>
)

export const ChevronRightIcon = ({ className = '', size = 24 }: IconProps) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    className={className}
  >
    <path 
      d="M9 18L15 12L9 6" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
  </svg>
)

export const ChevronUpIcon = ({ className = '', size = 24 }: IconProps) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    className={className}
  >
    <path 
      d="M18 15L12 9L6 15" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
  </svg>
)

export const ChevronDownIcon = ({ className = '', size = 24 }: IconProps) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    className={className}
  >
    <path 
      d="M6 9L12 15L18 9" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
  </svg>
)

export const CheckIcon = ({ className = '', size = 24 }: IconProps) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    className={className}
  >
    <path 
      d="M20 6L9 17L4 12" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
  </svg>
)

export const LockboxIcon = ({ className = '', size = 24 }: IconProps) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    className={className}
  >
    <rect 
      x="3" 
      y="8" 
      width="18" 
      height="13" 
      rx="2" 
      ry="2" 
      stroke="currentColor" 
      strokeWidth="2"
      fill="currentColor"
      fillOpacity="0.1"
    />
    <path 
      d="M7 8V6C7 4.34315 8.34315 3 10 3H14C15.6569 3 17 4.34315 17 6V8" 
      stroke="currentColor" 
      strokeWidth="2"
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
    <circle 
      cx="12" 
      cy="14" 
      r="2" 
      stroke="currentColor" 
      strokeWidth="2"
      fill="currentColor"
      fillOpacity="0.2"
    />
    <path 
      d="M12 16V18" 
      stroke="currentColor" 
      strokeWidth="2"
      strokeLinecap="round"
    />
    <rect 
      x="9" 
      y="10" 
      width="6" 
      height="1" 
      fill="currentColor" 
      fillOpacity="0.3"
    />
  </svg>
)
