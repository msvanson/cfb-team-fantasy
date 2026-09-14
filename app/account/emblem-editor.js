'use client';

import { useMemo, useRef, useState } from 'react';
import {
  EMBLEM_COLORS,
  EMBLEM_PRESETS,
  EMBLEM_SHAPES,
  cloneEmblemConfig,
  createLegacyEmblem,
  normalizeEmblemConfig
} from '../../lib/emblem-config';
import {
  EmblemArtwork,
  EmblemShape,
  RosterAvatar
} from '../roster-avatar';

let layerSequence = 0;

function layerId() {
  layerSequence += 1;

  return `layer-${Date.now().toString(36)}-${layerSequence}`;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function ColorPicker({
  label,
  value,
  onChange
}) {
  return <div className="emblemColorPicker">
    <span>{label}</span>

    <div>
      {EMBLEM_COLORS.map((color) => <button
        key={color.key}
        type="button"
        className={
          value === color.value
            ? 'selected'
            : ''
        }
        style={{
          background: color.value
        }}
        onClick={() => onChange(color.value)}
        aria-label={`${label}: ${color.key}`}
        title={color.key}
      />)}
    </div>
  </div>;
}

export default function EmblemEditor({
  value,
  avatarKey,
  avatarColor,
  onChange
}) {
  const fallback = useMemo(
    () => createLegacyEmblem(
      avatarKey,
      avatarColor
    ),
    [
      avatarKey,
      avatarColor
    ]
  );

  const config =
    normalizeEmblemConfig(value) || fallback;

  const [
    selectedId,
    setSelectedId
  ] = useState(
    config.layers.at(-1)?.id || ''
  );

  const [text, setText] = useState('');
  const canvasRef = useRef(null);
  const dragRef = useRef(null);

  const selected =
    config.layers.find(
      (layer) => layer.id === selectedId
    ) || config.layers.at(-1);

  function change(next) {
    const normalized =
      normalizeEmblemConfig(next);

    if (normalized) {
      onChange(normalized);
    }
  }

  function updateLayer(id, patch) {
    change({
      ...config,
      layers: config.layers.map((layer) =>
        layer.id === id
          ? {
            ...layer,
            ...patch
          }
          : layer
      )
    });
  }

  function addShape(shape) {
    if (config.layers.length >= 4) {
      return;
    }

    const id = layerId();

    change({
      ...config,
      layers: [
        ...config.layers,
        {
          id,
          type: 'shape',
          shape,
          color: '#ffffff',
          x: 50,
          y: 50,
          size: 48,
          rotation: 0
        }
      ]
    });

    setSelectedId(id);
  }

  function addText() {
    const clean = text
      .trim()
      .toUpperCase();

    if (
      !/^[A-Z0-9]{1,3}$/.test(clean)
      || config.layers.length >= 4
    ) {
      return;
    }

    const id = layerId();

    change({
      ...config,
      layers: [
        ...config.layers,
        {
          id,
          type: 'text',
          text: clean,
          color: '#ffffff',
          x: 50,
          y: 50,
          size: clean.length === 1
            ? 58
            : clean.length === 2
              ? 48
              : 38,
          rotation: 0
        }
      ]
    });

    setSelectedId(id);
    setText('');
  }

  function removeLayer() {
    if (
      !selected
      || config.layers.length === 1
    ) {
      return;
    }

    const remaining =
      config.layers.filter(
        (layer) => layer.id !== selected.id
      );

    change({
      ...config,
      layers: remaining
    });

    setSelectedId(
      remaining.at(-1)?.id || ''
    );
  }

  function moveLayer(direction) {
    if (!selected) {
      return;
    }

    const layers = [
      ...config.layers
    ];

    const index = layers.findIndex(
      (layer) => layer.id === selected.id
    );

    const nextIndex = clamp(
      index + direction,
      0,
      layers.length - 1
    );

    if (index === nextIndex) {
      return;
    }

    const [layer] = layers.splice(
      index,
      1
    );

    layers.splice(
      nextIndex,
      0,
      layer
    );

    change({
      ...config,
      layers
    });
  }

  function choosePreset(preset) {
    const next =
      cloneEmblemConfig(preset.config);

    next.layers = next.layers.map(
      (layer) => ({
        ...layer,
        id: layerId()
      })
    );

    change(next);

    setSelectedId(
      next.layers.at(-1)?.id || ''
    );
  }

  function startDrag(event, id) {
    event.preventDefault();
    event.stopPropagation();

    const rect =
      canvasRef.current?.getBoundingClientRect();

    const layer = config.layers.find(
      (item) => item.id === id
    );

    if (!rect || !layer) {
      return;
    }

    event.currentTarget
      .setPointerCapture?.(event.pointerId);

    dragRef.current = {
      pointerId: event.pointerId,
      id,
      startX: event.clientX,
      startY: event.clientY,
      layerX: layer.x,
      layerY: layer.y,
      width: rect.width,
      height: rect.height
    };

    setSelectedId(id);
  }

  function drag(event) {
    const current = dragRef.current;

    if (
      !current
      || current.pointerId !== event.pointerId
    ) {
      return;
    }

    event.preventDefault();

    updateLayer(current.id, {
      x: clamp(
        current.layerX
          + (
            (
              event.clientX
              - current.startX
            ) / current.width
          ) * 100,
        5,
        95
      ),
      y: clamp(
        current.layerY
          + (
            (
              event.clientY
              - current.startY
            ) / current.height
          ) * 100,
        5,
        95
      )
    });
  }

  function endDrag(event) {
    if (
      dragRef.current?.pointerId
      === event.pointerId
    ) {
      dragRef.current = null;
    }
  }

  const canvasStyle = {
    '--emblem-background': config.background,
    '--emblem-background-2': config.background2,
    borderColor: config.border
  };

  return <div className="emblemEditor">
    <div className="emblemEditorHeader">
      <div>
        <h3>Emblem Builder</h3>

        <p>
          Build inside the circle.
          Drag any layer to position it.
        </p>
      </div>

      <RosterAvatar
        emblemConfig={config}
        size="lg"
      />
    </div>

    <fieldset className="identityOptions">
      <legend>
        Start with a preset
      </legend>

      <div className="emblemPresetGrid">
        {EMBLEM_PRESETS.map(
          (preset) => <button
            key={preset.key}
            type="button"
            onClick={
              () => choosePreset(preset)
            }
          >
            <RosterAvatar
              emblemConfig={preset.config}
              size="md"
            />

            <span>
              {preset.label}
            </span>
          </button>
        )}
      </div>
    </fieldset>

    <div className="emblemWorkspace">
      <div
        ref={canvasRef}
        className="emblemCanvas"
        style={canvasStyle}
        onPointerMove={drag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <EmblemArtwork
          config={config}
          selectedId={selected?.id}
          onLayerPointerDown={startDrag}
        />
      </div>

      <div className="emblemLayerList">
        <b>Layers</b>

        {[...config.layers]
          .reverse()
          .map((layer) => <button
            key={layer.id}
            type="button"
            className={
              selected?.id === layer.id
                ? 'selected'
                : ''
            }
            onClick={
              () => setSelectedId(layer.id)
            }
          >
            <span
              style={{
                color: layer.color
              }}
            >
              {layer.type === 'text'
                ? layer.text
                : '◆'}
            </span>

            {layer.type === 'text'
              ? `Text: ${layer.text}`
              : EMBLEM_SHAPES.find(
                (shape) =>
                  shape.key === layer.shape
              )?.label}
          </button>)}

        <small>
          {config.layers.length}/4 layers
        </small>
      </div>
    </div>

    <fieldset className="identityOptions">
      <legend>Add a shape</legend>

      <div className="emblemShapeGrid">
        {EMBLEM_SHAPES.map(
          (shape) => <button
            key={shape.key}
            type="button"
            disabled={
              config.layers.length >= 4
            }
            onClick={
              () => addShape(shape.key)
            }
          >
            <svg
              viewBox="0 0 100 100"
              aria-hidden="true"
            >
              <EmblemShape
                shape={shape.key}
              />
            </svg>

            <span>{shape.label}</span>
          </button>
        )}
      </div>
    </fieldset>

    <fieldset className="identityOptions">
      <legend>
        Add letters or numbers
      </legend>

      <div className="emblemTextAdd">
        <input
          className="field"
          value={text}
          onChange={(event) =>
            setText(
              event.target.value
                .toUpperCase()
                .replace(
                  /[^A-Z0-9]/g,
                  ''
                )
                .slice(0, 3)
            )
          }
          placeholder="1–3 characters"
          maxLength={3}
        />

        <button
          type="button"
          className="button secondary"
          disabled={
            !text
            || config.layers.length >= 4
          }
          onClick={addText}
        >
          Add Text
        </button>
      </div>
    </fieldset>

    <div className="emblemBackgroundControls">
      <ColorPicker
        label="Circle color"
        value={config.background}
        onChange={(background) =>
          change({
            ...config,
            background
          })
        }
      />

      <ColorPicker
        label="Circle accent"
        value={config.background2}
        onChange={(background2) =>
          change({
            ...config,
            background2
          })
        }
      />

      <ColorPicker
        label="Outer ring"
        value={config.border}
        onChange={(border) =>
          change({
            ...config,
            border
          })
        }
      />
    </div>

    {selected
      ? <fieldset className="identityOptions emblemSelectedControls">
        <legend>
          Edit selected layer
        </legend>

        <ColorPicker
          label="Layer color"
          value={selected.color}
          onChange={(color) =>
            updateLayer(
              selected.id,
              { color }
            )
          }
        />

        <label>
          <span>
            Size
            <b>
              {Math.round(selected.size)}
            </b>
          </span>

          <input
            type="range"
            min="15"
            max="95"
            value={selected.size}
            onChange={(event) =>
              updateLayer(
                selected.id,
                {
                  size: Number(
                    event.target.value
                  )
                }
              )
            }
          />
        </label>

        <label>
          <span>
            Rotation
            <b>
              {Math.round(
                selected.rotation
              )}°
            </b>
          </span>

          <input
            type="range"
            min="-180"
            max="180"
            value={selected.rotation}
            onChange={(event) =>
              updateLayer(
                selected.id,
                {
                  rotation: Number(
                    event.target.value
                  )
                }
              )
            }
          />
        </label>

        <div className="emblemLayerActions">
          <button
            type="button"
            className="button secondary"
            onClick={() => moveLayer(-1)}
          >
            Send Back
          </button>

          <button
            type="button"
            className="button secondary"
            onClick={() => moveLayer(1)}
          >
            Bring Front
          </button>

          <button
            type="button"
            className="button secondary emblemDelete"
            disabled={
              config.layers.length === 1
            }
            onClick={removeLayer}
          >
            Delete
          </button>
        </div>
      </fieldset>
      : null}
  </div>;
}
