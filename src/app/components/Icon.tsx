import React from 'react';
import Svg, { Path, Circle } from 'react-native-svg';

export type IconName =
  | 'home'
  | 'list'
  | 'plus'
  | 'chart'
  | 'settings'
  | 'search'
  | 'filter'
  | 'back'
  | 'forward'
  | 'camera'
  | 'edit'
  | 'check'
  | 'pin'
  | 'image';

interface Props {
  name: IconName;
  size?: number;
  color?: string;
  filled?: boolean;
}

export const Icon: React.FC<Props> = ({ name, size = 24, color = '#ffffff', filled = false }) => {
  const sw = 2;
  const fill = filled ? color : 'none';
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {paths(name, color, sw, fill)}
    </Svg>
  );
};

const paths = (name: IconName, stroke: string, sw: number, fill: string) => {
  switch (name) {
    case 'home':
      return (
        <Path
          d="M3 12 12 3l9 9M5 10v10a1 1 0 0 0 1 1h4v-7h4v7h4a1 1 0 0 0 1-1V10"
          stroke={stroke}
          strokeWidth={sw}
          fill={fill === 'none' ? 'none' : fill}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      );
    case 'list':
      return (
        <>
          <Path d="M8 6h12M8 12h12M8 18h12" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
          <Circle cx={4} cy={6} r={1.2} fill={stroke} />
          <Circle cx={4} cy={12} r={1.2} fill={stroke} />
          <Circle cx={4} cy={18} r={1.2} fill={stroke} />
        </>
      );
    case 'plus':
      return (
        <Path
          d="M12 5v14M5 12h14"
          stroke={stroke}
          strokeWidth={sw + 0.5}
          strokeLinecap="round"
        />
      );
    case 'chart':
      return (
        <>
          <Path d="M4 19V5M4 19h16" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
          <Path d="M8 16v-4M12 16V8M16 16v-6M20 16v-2" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
        </>
      );
    case 'settings':
      return (
        <>
          <Circle cx={12} cy={12} r={3} stroke={stroke} strokeWidth={sw} />
          <Path
            d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"
            stroke={stroke}
            strokeWidth={sw}
            strokeLinejoin="round"
          />
        </>
      );
    case 'search':
      return (
        <>
          <Circle cx={11} cy={11} r={7} stroke={stroke} strokeWidth={sw} />
          <Path d="M21 21l-4.3-4.3" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
        </>
      );
    case 'filter':
      return (
        <Path
          d="M3 5h18M6 12h12M10 19h4"
          stroke={stroke}
          strokeWidth={sw}
          strokeLinecap="round"
        />
      );
    case 'back':
      return (
        <Path d="M15 6l-6 6 6 6" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      );
    case 'forward':
      return (
        <Path d="M9 6l6 6-6 6" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      );
    case 'camera':
      return (
        <>
          <Path
            d="M5 8h3l1.5-2h5L16 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"
            stroke={stroke}
            strokeWidth={sw}
            strokeLinejoin="round"
          />
          <Circle cx={12} cy={13.5} r={3.5} stroke={stroke} strokeWidth={sw} />
        </>
      );
    case 'edit':
      return (
        <Path
          d="M4 20h4l10-10-4-4L4 16v4zM14 6l4 4"
          stroke={stroke}
          strokeWidth={sw}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      );
    case 'check':
      return (
        <Path d="M5 12l4 4 10-10" stroke={stroke} strokeWidth={sw + 0.5} strokeLinecap="round" strokeLinejoin="round" />
      );
    case 'pin':
      return (
        <>
          <Path
            d="M12 22s7-7.59 7-12a7 7 0 0 0-14 0c0 4.41 7 12 7 12z"
            stroke={stroke}
            strokeWidth={sw}
            fill={fill === 'none' ? 'none' : fill}
            strokeLinejoin="round"
          />
          <Circle cx={12} cy={10} r={2.5} stroke={stroke} strokeWidth={sw} />
        </>
      );
    case 'image':
      return (
        <>
          <Path
            d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"
            stroke={stroke}
            strokeWidth={sw}
            strokeLinejoin="round"
          />
          <Circle cx={8.5} cy={10} r={1.6} stroke={stroke} strokeWidth={sw} />
          <Path
            d="M3.5 18l5-5 4 4 3-3 5 5"
            stroke={stroke}
            strokeWidth={sw}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </>
      );
  }
};
