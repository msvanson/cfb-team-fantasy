'use client';

import { useEffect, useState } from 'react';
function signed(value) {
  const number = Number(value || 0);
  return `${number > 0 ? '+' : ''}${number}`;
}
function recapFacts(recap) {
  return recap?.recap_data || {};
}

async function recapRequest(body = null) {
  const response = await fetch(
    '/api/admin/weekly-recaps',
    body
      ? {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        }
      : { cache: 'no-store' }
  );
  const result = await response.json();

  if (!response.ok || result?.ok === false) {
    throw new Error(
      result?.error || 'The weekly recap request failed'
    );
  }

  return result;
}

export function WeeklyRecapEditor() {
  const [recaps, setRecaps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState(null);

  async function loadRecaps() {
    setLoading(true);

    try {
      const result = await recapRequest();
      setRecaps(result.recaps || []);
      setMessage(null);
    } catch (error) {
      setMessage({
        type: 'error',
        text: error?.message || 'Weekly recaps could not be loaded'
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRecaps();
  }, []);

  function editRecap(id, field, value) {
    setRecaps(current => current.map(recap =>
      recap.id === id
        ? { ...recap, [field]: value }
        : recap
    ));
  }

  async function generateRecaps() {
    setBusy('generate');
    setMessage({
      type: 'working',
      text: 'Checking finalized weeksâ¦'
    });

    try {
      const result = await recapRequest({
        action: 'generate'
      });

      setRecaps(result.recaps || []);
      setMessage({
        type: 'success',
        text: result.created
          ? `${result.created} recap draft${result.created === 1 ? '' : 's'} generated.`
          : 'All finalized weeks already have recap drafts.'
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error?.message || 'Recap generation failed'
      });
    } finally {
      setBusy('');
    }
  }

  async function saveRecap(recap, publish = false) {
    const busyKey = `${publish ? 'publish' : 'save'}-${recap.id}`;
    setBusy(busyKey);
    setMessage({
      type: 'working',
      text: publish
        ? `Publishing ${recap.week_key}â¦`
        : `Saving ${recap.week_key}â¦`
    });

    try {
      let result = await recapRequest({
        action: 'save',
        recapId: recap.id,
        headline: recap.headline,
        recapText: recap.recap_text
      });

      if (publish) {
        result = await recapRequest({
          action: 'publish',
          recapId: recap.id
        });
      }

      setRecaps(result.recaps || []);
      setMessage({
        type: 'success',
        text: publish
          ? `${recap.week_key} is now published on the Weekly page.`
          : `${recap.week_key} draft saved.`
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error?.message || 'The recap could not be saved'
      });
    } finally {
      setBusy('');
    }
  }

  async function withdrawRecap(recap) {
    if (!window.confirm(
      `Withdraw ${recap.week_key} from the Weekly page?`
    )) {
      return;
    }

    setBusy(`withdraw-${recap.id}`);
    setMessage({
      type: 'working',
      text: `Withdrawing ${recap.week_key}â¦`
    });

    try {
      const result = await recapRequest({
        action: 'withdraw',
        recapId: recap.id
      });

      setRecaps(result.recaps || []);
      setMessage({
        type: 'success',
        text: `${recap.week_key} returned to draft status.`
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error?.message || 'The recap could not be withdrawn'
      });
    } finally {
      setBusy('');
    }
  }

  return (
    <section className="weeklyRecapAdmin">
      <div className="sectionTitle weeklyRecapAdminTitle">
        <div>
          <h2>Weekly Recaps</h2>
          <span className="muted">
            Review and publish locked weekly results
          </span>
        </div>

        <button
          className="button secondary"
          type="button"
          onClick={generateRecaps}
          disabled={Boolean(busy)}
        >
          {busy === 'generate'
            ? 'Generatingâ¦'
            : 'Generate Missing Drafts'}
        </button>
      </div>

      {message ? (
        <div className={`notice recapAdminMessage ${message.type}`}>
          {message.text}
        </div>
      ) : null}

      {loading ? (
        <div className="card liveEmpty">
          Loading weekly recapsâ¦
        </div>
      ) : null}

      {!loading && !recaps.length ? (
        <div className="card liveEmpty">
          <b>No recap drafts yet.</b>
          <br />
          Generate drafts after a fantasy week has been finalized.
        </div>
      ) : null}

      <div className="weeklyRecapAdminList">
        {recaps.map(recap => {
                    const facts = recapFacts(recap);
          const winner = facts.winner;
          const mover = facts.biggestMover;
          const published = recap.status === 'published';

          return (
            <article className="card weeklyRecapAdminCard" key={recap.id}>
              <div className="weeklyRecapAdminCardTop">
                <div>
                  <h3>{recap.week_key}</h3>
                  <span className="muted">
                    Generated from the finalized weekly snapshot
                  </span>
                </div>

                <span className={`pill recapStatus ${recap.status}`}>
                  {published ? 'Published' : 'Draft'}
                </span>
              </div>

                            <div className="weeklyRecapFacts">
                <div>
                  <small>Winner</small>
                  <b>{winner?.rosterName || '—'}</b>
                  <span>
                    {winner?.weeklyPoints ?? '—'} pts
                    {' · '}
                    {winner?.weeklyPointDifferential >= 0 ? '+' : ''}
                    {winner?.weeklyPointDifferential ?? 0} diff
                  </span>
                </div>

                <div>
                  <small>Biggest Mover</small>
                  <b>{mover?.rosterName || 'No movement'}</b>
                  <span>
                    {mover
                      ? `▲ ${mover.movement} to No. ${mover.currentRank}`
                      : 'Opening week'}
                  </span>
                </div>
              </div>

              <label className="recapEditorField">
                <span>Headline</span>
                <input
                  className="field"
                  value={recap.headline || ''}
                  maxLength={120}
                  disabled={published}
                  onChange={event => editRecap(
                    recap.id,
                    'headline',
                    event.target.value
                  )}
                />
              </label>

              <label className="recapEditorField">
                <span>Recap</span>
                <textarea
                  className="field recapEditorText"
                  value={recap.recap_text || ''}
                  maxLength={3000}
                  disabled={published}
                  onChange={event => editRecap(
                    recap.id,
                    'recap_text',
                    event.target.value
                  )}
                />
              </label>

              <details className="recapStandingsPreview">
                <summary>Locked standings changes</summary>

                <div className="recapStandingsRows">
                  {(facts.standings || []).map(row => (
                    <div key={row.ownerId}>
                      <b>No. {row.currentRank} {row.rosterName}</b>
                      <span>
                        {row.previousRank == null
                          ? 'Opening rank'
                          : row.movement > 0
                            ? `â² ${row.movement}`
                            : row.movement < 0
                              ? `â¼ ${Math.abs(row.movement)}`
                              : 'â'}
                        {' Â· '}{row.weeklyPoints} weekly pts
                        {' Â· '}{signed(row.weeklyPointDifferential)} diff
                      </span>
                    </div>
                  ))}
                </div>
              </details>

              <div className="weeklyRecapAdminActions">
                {published ? (
                  <button
                    className="button secondary"
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => withdrawRecap(recap)}
                  >
                    {busy === `withdraw-${recap.id}`
                      ? 'Withdrawingâ¦'
                      : 'Withdraw'}
                  </button>
                ) : (
                  <>
                    <button
                      className="button secondary"
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => saveRecap(recap)}
                    >
                      {busy === `save-${recap.id}`
                        ? 'Savingâ¦'
                        : 'Save Draft'}
                    </button>

                    <button
                      className="button"
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => saveRecap(recap, true)}
                    >
                      {busy === `publish-${recap.id}`
                        ? 'Publishingâ¦'
                        : 'Save & Publish'}
                    </button>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
