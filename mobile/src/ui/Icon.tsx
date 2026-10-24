import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { ReactNode } from 'react';

/** Те же линейные иконки, что и в вебе (стиль Lucide), + пара для мобилки. */
const PATHS: Record<string, ReactNode> = {
  dashboard: (<><Path d="M5 21V12" /><Path d="M12 21V4" /><Path d="M19 21V9" /></>),
  box: (<>
    <Path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
    <Path d="m3.3 7 8.7 5 8.7-5" /><Path d="M12 22V12" /></>),
  ban: (<><Circle cx="12" cy="12" r="10" /><Path d="m4.9 4.9 14.2 14.2" /></>),
  flame: (<Path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />),
  receipt: (<>
    <Path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <Path d="M14 2v4a2 2 0 0 0 2 2h4" /><Path d="M10 9H8" /><Path d="M16 13H8" /><Path d="M16 17H8" /></>),
  truck: (<>
    <Path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" /><Path d="M15 18H9" />
    <Path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
    <Circle cx="17" cy="18" r="2" /><Circle cx="7" cy="18" r="2" /></>),
  trash: (<>
    <Path d="M3 6h18" /><Path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <Path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><Path d="M10 11v6" /><Path d="M14 11v6" /></>),
  sparkles: (<>
    <Path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
    <Path d="M20 3v4" /><Path d="M22 5h-4" /></>),
  calendar: (<><Path d="M8 2v4" /><Path d="M16 2v4" /><Rect x="3" y="4" width="18" height="18" rx="2" /><Path d="M3 10h18" /></>),
  clock: (<><Circle cx="12" cy="12" r="10" /><Path d="M12 6v6l4 2" /></>),
  chevronDown: <Path d="m6 9 6 6 6-6" />,
  chevronRight: <Path d="m9 18 6-6-6-6" />,
  arrowRight: (<><Path d="M5 12h14" /><Path d="m12 5 7 7-7 7" /></>),
  arrowUpRight: (<><Path d="M7 7h10v10" /><Path d="M7 17 17 7" /></>),
  info: (<><Circle cx="12" cy="12" r="10" /><Path d="M12 16v-4" /><Path d="M12 8h.01" /></>),
  x: (<><Path d="M18 6 6 18" /><Path d="m6 6 12 12" /></>),
  lightbulb: (<>
    <Path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
    <Path d="M9 18h6" /><Path d="M10 22h4" /></>),
  sun: (<>
    <Circle cx="12" cy="12" r="4" /><Path d="M12 2v2" /><Path d="M12 20v2" /><Path d="m4.93 4.93 1.41 1.41" />
    <Path d="m17.66 17.66 1.41 1.41" /><Path d="M2 12h2" /><Path d="M20 12h2" /><Path d="m6.34 17.66-1.41 1.41" />
    <Path d="m19.07 4.93-1.41 1.41" /></>),
  moon: <Path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />,
  monitor: (<><Rect x="2" y="3" width="20" height="14" rx="2" /><Path d="M8 21h8" /><Path d="M12 17v4" /></>),
  menu: (<><Path d="M4 6h16" /><Path d="M4 12h16" /><Path d="M4 18h16" /></>),
  utensils: (<>
    <Path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" /><Path d="M7 2v20" />
    <Path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" /></>),
  plus: (<><Path d="M5 12h14" /><Path d="M12 5v14" /></>),
  minus: <Path d="M5 12h14" />,
  check: <Path d="M20 6 9 17l-5-5" />,
  user: (<><Path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><Circle cx="12" cy="7" r="4" /></>),
  checkCircle: (<><Circle cx="12" cy="12" r="10" /><Path d="m9 12 2 2 4-4" /></>),
  xCircle: (<><Circle cx="12" cy="12" r="10" /><Path d="m15 9-6 6" /><Path d="m9 9 6 6" /></>),
  alertTriangle: (<>
    <Path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
    <Path d="M12 9v4" /><Path d="M12 17h.01" /></>),
  loader: <Path d="M21 12a9 9 0 1 1-6.219-8.56" />,
  // — мобильные —
  bell: (<><Path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><Path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>),
  server: (<>
    <Rect x="2" y="2" width="20" height="8" rx="2" /><Rect x="2" y="14" width="20" height="8" rx="2" />
    <Path d="M6 6h.01" /><Path d="M6 18h.01" /></>),
  refresh: (<><Path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><Path d="M21 3v5h-5" />
    <Path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><Path d="M8 16H3v5" /></>),
};

export type IconName = keyof typeof PATHS;

type Props = { name: IconName; size?: number; color: string; strokeWidth?: number };

export default function Icon({ name, size = 18, color, strokeWidth = 1.8 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {PATHS[name]}
    </Svg>
  );
}
