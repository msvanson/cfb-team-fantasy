export const EMBLEM_COLORS = [
  { key: 'navy', value: '#0f172a' },
  { key: 'blue', value: '#2563eb' },
  { key: 'purple', value: '#7c3aed' },
  { key: 'crimson', value: '#be123c' },
  { key: 'red', value: '#dc2626' },
  { key: 'orange', value: '#ea580c' },
  { key: 'gold', value: '#d4a017' },
  { key: 'green', value: '#15803d' },
  { key: 'teal', value: '#0f766e' },
  { key: 'white', value: '#ffffff' },
  { key: 'silver', value: '#cbd5e1' },
  { key: 'black', value: '#111827' }
];

export const EMBLEM_SHAPES = [
  { key: 'star', label: 'Star' },
  { key: 'diamond', label: 'Diamond' },
  { key: 'shield', label: 'Shield' },
  { key: 'bolt', label: 'Bolt' },
  { key: 'crown', label: 'Crown' },
  { key: 'football', label: 'Football' },
  { key: 'chevron', label: 'Chevron' },
  { key: 'stripes', label: 'Stripes' },
  { key: 'ring', label: 'Ring' }
];

const COLOR_VALUES = new Set(
  EMBLEM_COLORS.map((color) => color.value)
);

const SHAPE_KEYS = new Set(
  EMBLEM_SHAPES.map((shape) => shape.key)
);

const legacyColors = {
  blue: ['#2563eb', '#0f172a'],
  green: ['#15803d', '#0f172a'],
  red: ['#dc2626', '#be123c'],
  gold: ['#d4a017', '#ea580c'],
  purple: ['#7c3aed', '#0f172a'],
  orange: ['#ea580c', '#be123c'],
  teal: ['#0f766e', '#0f172a'],
  slate: ['#cbd5e1', '#111827']
};

const legacyShapes = {
  helmet: 'shield',
  football: 'football',
  trophy: 'crown',
  stadium: 'stripes',
  playbook: 'diamond',
  megaphone: 'bolt',
  goalpost: 'chevron',
  star: 'star'
};

export const EMBLEM_PRESETS = [
  {
    key: 'varsity',
    label: 'Varsity',
    config: {
      version: 1,
      background: '#0f172a',
      background2: '#2563eb',
      border: '#ffffff',
      layers: [
        {
          id: 'varsity-star',
          type: 'shape',
          shape: 'star',
          color: '#ffffff',
          x: 50,
          y: 50,
          size: 68,
          rotation: 0
        }
      ]
    }
  },
  {
    key: 'bolt',
    label: 'Bolt',
    config: {
      version: 1,
      background: '#be123c',
      background2: '#ea580c',
      border: '#ffffff',
      layers: [
        {
          id: 'bolt-main',
          type: 'shape',
          shape: 'bolt',
          color: '#ffffff',
          x: 50,
          y: 50,
          size: 72,
          rotation: -8
        }
      ]
    }
  },
  {
    key: 'crest',
    label: 'Crest',
    config: {
      version: 1,
      background: '#0f172a',
      background2: '#7c3aed',
      border: '#d4a017',
      layers: [
        {
          id: 'crest-shield',
          type: 'shape',
          shape: 'shield',
          color: '#d4a017',
          x: 50,
          y: 52,
          size: 76,
          rotation: 0
        },
        {
          id: 'crest-star',
          type: 'shape',
          shape: 'star',
          color: '#ffffff',
          x: 50,
          y: 46,
          size: 34,
          rotation: 0
        }
      ]
    }
  },
  {
    key: 'champion',
    label: 'Champion',
    config: {
      version: 1,
      background: '#111827',
      background2: '#d4a017',
      border: '#ffffff',
      layers: [
        {
          id: 'champion-ring',
          type: 'shape',
          shape: 'ring',
          color: '#ffffff',
          x: 50,
          y: 50,
          size: 78,
          rotation: 0
        },
        {
          id: 'champion-crown',
          type: 'shape',
          shape: 'crown',
          color: '#d4a017',
          x: 50,
          y: 51,
          size: 55,
          rotation: 0
        }
      ]
    }
  },
  {
    key: 'gameday',
    label: 'Gameday',
    config: {
      version: 1,
      background: '#15803d',
      background2: '#0f172a',
      border: '#ffffff',
      layers: [
        {
          id: 'gameday-stripes',
          type: 'shape',
          shape: 'stripes',
          color: '#ffffff',
          x: 50,
          y: 50,
          size: 82,
          rotation: -18
        },
        {
          id: 'gameday-football',
          type: 'shape',
          shape: 'football',
          color: '#d4a017',
          x: 50,
          y: 50,
          size: 52,
          rotation: 0
        }
      ]
    }
  }
];

function validNumber(value, minimum, maximum) {
  return Number.isFinite(value)
    && value >= minimum
    && value <= maximum;
}

function normalizeColor(value) {
  const color = String(value || '').toLowerCase();
  return COLOR_VALUES.has(color) ? color : null;
}

export function normalizeEmblemConfig(input) {
  if (
    !input
    || typeof input !== 'object'
    || Array.isArray(input)
  ) {
    return null;
  }

  if (
    Number(input.version) !== 1
    || !Array.isArray(input.layers)
  ) {
    return null;
  }

  if (
    input.layers.length < 1
    || input.layers.length > 4
  ) {
    return null;
  }

  const background = normalizeColor(input.background);
  const background2 = normalizeColor(input.background2);
  const border = normalizeColor(input.border);

  if (!background || !background2 || !border) {
    return null;
  }

  const ids = new Set();
  const layers = [];

  for (const layer of input.layers) {
    if (
      !layer
      || typeof layer !== 'object'
      || Array.isArray(layer)
    ) {
      return null;
    }

    const id = String(layer.id || '');

    if (
      !/^[A-Za-z0-9_-]{1,40}$/.test(id)
      || ids.has(id)
    ) {
      return null;
    }

    ids.add(id);

    const type = layer.type === 'text'
      ? 'text'
      : layer.type === 'shape'
        ? 'shape'
        : null;

    const color = normalizeColor(layer.color);
    const x = Number(layer.x);
    const y = Number(layer.y);
    const size = Number(layer.size);
    const rotation = Number(layer.rotation || 0);

    if (!type || !color) {
      return null;
    }

    if (
      !validNumber(x, 5, 95)
      || !validNumber(y, 5, 95)
    ) {
      return null;
    }

    if (
      !validNumber(size, 15, 95)
      || !validNumber(rotation, -180, 180)
    ) {
      return null;
    }

    if (type === 'shape') {
      const shape = String(layer.shape || '');

      if (!SHAPE_KEYS.has(shape)) {
        return null;
      }

      layers.push({
        id,
        type,
        shape,
        color,
        x,
        y,
        size,
        rotation
      });
    } else {
      const text = String(layer.text || '')
        .trim()
        .toUpperCase();

      if (!/^[A-Z0-9]{1,3}$/.test(text)) {
        return null;
      }

      layers.push({
        id,
        type,
        text,
        color,
        x,
        y,
        size,
        rotation
      });
    }
  }

  return {
    version: 1,
    background,
    background2,
    border,
    layers
  };
}

export function createLegacyEmblem(
  avatarKey = 'helmet',
  avatarColor = 'blue'
) {
  const colors =
    legacyColors[avatarColor] || legacyColors.blue;

  return {
    version: 1,
    background: colors[0],
    background2: colors[1],
    border: '#ffffff',
    layers: [
      {
        id: 'legacy-symbol',
        type: 'shape',
        shape: legacyShapes[avatarKey] || 'shield',
        color: '#ffffff',
        x: 50,
        y: 50,
        size: 66,
        rotation: 0
      }
    ]
  };
}

export function cloneEmblemConfig(config) {
  return JSON.parse(JSON.stringify(config));
}
