// Brand: deep purple #490a48
// Glass aesthetic: translucent surfaces, subtle highlight borders, brand-tinted bg.
// Premium fintech direction — Apple Wallet / Revolut / Linear inspiration.
export const palette = {
  brand: '#490a48',
  brandSoft: '#6a1668',
  brandFaint: '#2a0c28',
  brandGlow: 'rgba(192, 132, 194, 0.35)',

  // Matte near-black with deep-purple tint, used by the AmbientBackground gradient.
  bg: '#0a0610',
  bgTint: '#1a0c1f',
  bgDeep: '#050308',

  // Radial ambient hotspots (top-left lavender, bottom-right pink) layered over bg.
  ambientLavender: 'rgba(155, 120, 220, 0.18)',
  ambientPink: 'rgba(230, 130, 200, 0.10)',
  ambientBlue: 'rgba(90, 130, 220, 0.08)',

  surface: 'rgba(255, 255, 255, 0.04)',
  surfaceAlt: 'rgba(255, 255, 255, 0.07)',
  surfaceStrong: 'rgba(73, 10, 72, 0.35)', // brand-tinted glass

  // Glass surfaces: translucent w/ delicate borders. Use sparingly per design spec.
  glass: 'rgba(255, 255, 255, 0.06)',
  glassStrong: 'rgba(255, 255, 255, 0.10)',
  glassHi: 'rgba(255, 255, 255, 0.12)', // top highlight border
  glassLo: 'rgba(0, 0, 0, 0.24)', // bottom shade border
  glassInner: 'rgba(192, 132, 220, 0.06)', // soft inner glow tint

  text: '#f4e8f3',
  textDim: '#d4c4d4',
  muted: '#9c8aa6',
  border: 'rgba(255, 255, 255, 0.08)',
  borderSoft: 'rgba(255, 255, 255, 0.05)',

  // Accent ramp — deep purple → lavender → soft pink → muted blue.
  accent: '#c084e8',
  accentSoft: 'rgba(192, 132, 232, 0.18)',
  lavender: '#b8a4ff',
  pink: '#f0a8d4',
  blueMuted: '#7a93d6',

  warn: '#f5b340',
  danger: '#f06568',
  ok: '#3ec97f',
  link: '#d8b4dc',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export const font = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 19,
  xl: 24,
  xxl: 30,
} as const;

// Reusable glass surface preset
export const glass = {
  backgroundColor: palette.surface,
  borderTopWidth: 1,
  borderTopColor: palette.glassHi,
  borderBottomWidth: 1,
  borderBottomColor: palette.glassLo,
  borderLeftWidth: 1,
  borderLeftColor: palette.glassHi,
  borderRightWidth: 1,
  borderRightColor: palette.glassHi,
};
