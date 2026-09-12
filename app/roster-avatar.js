import { normalizeEmblemConfig } from '../lib/emblem-config';

const ICON_LABELS = {
  helmet: 'Helmet',
  football: 'Football',
  trophy: 'Trophy',
  stadium: 'Stadium',
  playbook: 'Playbook',
  megaphone: 'Megaphone',
  goalpost: 'Goalpost',
  star: 'Star'
};

function LegacyIcon({ name }) {
  if (name === 'football') {
    return <>
      <path d="M5 17c-3-3-2-7 1-10s7-4 10-1 2 7-1 10-7 4-10 1Z"/>
      <path d="m9 9 6 6M11 9l-2 2m5 1-2 2"/>
    </>;
  }

  if (name === 'trophy') {
    return <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z"/>
      <path d="M8 6H5v2a3 3 0 0 0 3 3m8-5h3v2a3 3 0 0 1-3 3M12 13v4m-4 3h8m-6-3h4"/>
    </>;
  }

  if (name === 'stadium') {
    return <>
      <path d="M3 10c2-3 16-3 18 0v7c-2 3-16 3-18 0v-7Z"/>
      <path d="M6 9v8m12-8v8M8 13h8m-6 4v-4h4v4"/>
    </>;
  }

  if (name === 'playbook') {
    return <>
      <path d="M5 3h14v18H5z"/>
      <circle cx="9" cy="9" r="1.5"/>
      <path d="m11 15 4-4m0 0v3m0-3h-3M8 18h8"/>
    </>;
  }

  if (name === 'megaphone') {
    return <>
      <path d="m4 11 12-5v12L4 13v-2Z"/>
      <path d="M16 10h3a2 2 0 0 1 0 4h-3M7 14l2 6h3l-1-5"/>
    </>;
  }

  if (name === 'goalpost') {
    return <>
      <path d="M5 4v7h14V4M12 11v9M8 20h8"/>
    </>;
  }

  if (name === 'star') {
    return <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/>;
  }

  return <>
    <path d="M5 14V9a7 7 0 0 1 14 0v5h-5v-3H9v5H5v-2Z"/>
    <path d="M14 14h5v4h-5m-5-7v3H5"/>
  </>;
}

export function EmblemShape({ shape }) {
  if (shape === 'star') {
    return <polygon
      fill="currentColor"
      points="50,5 61,36 95,37 68,57 77,90 50,71 23,90 32,57 5,37 39,36"
    />;
  }

  if (shape === 'diamond') {
    return <polygon
      fill="currentColor"
      points="50,5 95,50 50,95 5,50"
    />;
  }

  if (shape === 'shield') {
    return <path
      fill="currentColor"
      d="M50 5 88 19v29c0 24-15 39-38 47C27 87 12 72 12 48V19L50 5Z"
    />;
  }

  if (shape === 'bolt') {
    return <polygon
      fill="currentColor"
      points="57,3 17,57 43,57 35,97 84,39 57,39"
    />;
  }

  if (shape === 'crown') {
    return <path
      fill="currentColor"
      d="M10 78 5 25l25 20 20-35 20 35 25-20-5 53H10Zm5 10h70v8H15v-8Z"
    />;
  }

  if (shape === 'football') {
    return <g transform="rotate(-32 50 50)">
      <ellipse
        cx="50"
        cy="50"
        rx="43"
        ry="27"
        fill="currentColor"
      />
      <path
        d="M50 27v46M38 39h24M36 47h28M36 55h28M38 63h24"
        fill="none"
        stroke="#fff"
        strokeWidth="5"
        strokeLinecap="round"
      />
    </g>;
  }

  if (shape === 'chevron') {
    return <path
      fill="currentColor"
      fillRule="evenodd"
      d="m5 29 45 43 45-43-14-14-31 29-31-29L5 29Zm0 28 45 43 45-43-14-14-31 29-31-29L5 57Z"
    />;
  }

  if (shape === 'stripes') {
    return <g fill="currentColor">
      <rect x="12" y="8" width="18" height="84" rx="5"/>
      <rect x="41" y="8" width="18" height="84" rx="5"/>
      <rect x="70" y="8" width="18" height="84" rx="5"/>
    </g>;
  }

  return <circle
    cx="50"
    cy="50"
    r="39"
    fill="none"
    stroke="currentColor"
    strokeWidth="12"
  />;
}

export function EmblemArtwork({
  config,
  selectedId = '',
  onLayerPointerDown,
  className = '',
  ...svgProps
}) {
  const emblem = normalizeEmblemConfig(config);

  if (!emblem) {
    return null;
  }

  return <svg
    viewBox="0 0 100 100"
    className={className}
    aria-hidden="true"
    {...svgProps}
  >
    {emblem.layers.map((layer) => <g
      key={layer.id}
      className={
        selectedId === layer.id
          ? 'emblemLayer selected'
          : 'emblemLayer'
      }
      style={{ color: layer.color }}
      transform={`translate(${layer.x} ${layer.y}) rotate(${layer.rotation}) scale(${layer.size / 100}) translate(-50 -50)`}
      onPointerDown={
        onLayerPointerDown
          ? (event) => onLayerPointerDown(event, layer.id)
          : undefined
      }
    >
      {layer.type === 'text'
        ? <text
          x="50"
          y="54"
          fill="currentColor"
          textAnchor="middle"
          dominantBaseline="middle"
          fontFamily="Arial Black, Arial, sans-serif"
          fontSize="68"
          fontWeight="900"
        >
          {layer.text}
        </text>
        : <EmblemShape shape={layer.shape}/>}
    </g>)}
  </svg>;
}

export function RosterAvatar({
  avatarKey = 'helmet',
  avatarColor = 'blue',
  emblemConfig = null,
  size = 'md',
  className = ''
}) {
  const emblem = normalizeEmblemConfig(emblemConfig);

  if (emblem) {
    return <span
      className={
        `rosterAvatar rosterAvatar-${size} rosterAvatarCustom ${className}`.trim()
      }
      title="Custom roster emblem"
      aria-hidden="true"
      style={{
        '--emblem-background': emblem.background,
        '--emblem-background-2': emblem.background2,
        borderColor: emblem.border
      }}
    >
      <EmblemArtwork config={emblem}/>
    </span>;
  }

  const icon = ICON_LABELS[avatarKey]
    ? avatarKey
    : 'helmet';

  const color = [
    'blue',
    'green',
    'red',
    'gold',
    'purple',
    'orange',
    'teal',
    'slate'
  ].includes(avatarColor)
    ? avatarColor
    : 'blue';

  return <span
    className={
      `rosterAvatar rosterAvatar-${size} avatar-${color} ${className}`.trim()
    }
    title={ICON_LABELS[icon]}
    aria-hidden="true"
  >
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <LegacyIcon name={icon}/>
    </svg>
  </span>;
}

export const ROSTER_ICONS = Object.entries(
  ICON_LABELS
).map(([key, label]) => ({
  key,
  label
}));

export const ROSTER_COLORS = [
  'blue',
  'green',
  'red',
  'gold',
  'purple',
  'orange',
  'teal',
  'slate'
];
