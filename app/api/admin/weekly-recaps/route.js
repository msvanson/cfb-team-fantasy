import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isAdminAuthenticated } from '../../../../lib/admin-auth';
import { adminRpc } from '../../../../lib/admin-rpc';
import { runTrackedAutomation } from '../../../../lib/automation-health';
import {
  generateMissingWeeklyRecaps
} from '../../../../lib/weekly-recaps';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  }
);

async function loadRecaps() {
  const { data, error } = await supabase
    .from('weekly_recaps')
    .select('*')
    .eq('season_id', 1)
    .order('source_finalized_at', {
      ascending: false
    });

  if (error) throw error;

  return data || [];
}

async function logAction(actionType, summary, details) {
  try {
    await adminRpc('admin_log_action', {
      p_action_type: actionType,
      p_summary: summary,
      p_details: details
    });
  } catch (error) {
    console.error('Weekly recap audit log failed', error);
  }
}

function validId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0
    ? id
    : null;
}

function cleanText(value, maximum) {
  return String(value || '')
    .trim()
    .slice(0, maximum);
}

export async function GET() {
  if (!await isAdminAuthenticated()) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    return NextResponse.json({
      ok: true,
      recaps: await loadRecaps()
    });
  } catch (error) {
    console.error('Could not load weekly recaps', error);

    return NextResponse.json(
      {
        ok: false,
        error: 'Weekly recaps could not be loaded'
      },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  if (!await isAdminAuthenticated()) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid request body' },
      { status: 400 }
    );
  }

  try {
        if (body.action === 'generate') {
      const result = await runTrackedAutomation({
        jobKey: 'weekly_recaps',
        triggerSource: 'manual',
        details: {
          requestedBy: 'commissioner'
        },
        task: async () => {
          const generated = await generateMissingWeeklyRecaps({
            seasonId: 1,
            supabase
          });
          const created = generated.filter(
            recap => recap.created
          );

          return {
            ok: true,
            created: created.length,
            generated,
            createdWeeks: created.map(
              recap => recap.weekKey
            ),
            checkedWeeks: generated.map(
              recap => recap.weekKey
            )
          };
        },
        summarize: generated => ({
          recordsUpdated: generated?.created ?? 0,
          details: {
            requestedBy: 'commissioner',
            createdWeeks: generated?.createdWeeks || [],
            checkedWeeks: generated?.checkedWeeks || []
          }
        })
      });

      await logAction(
        'weekly_recaps_generated',
        result.created
          ? `Generated ${result.created} weekly recap draft${result.created === 1 ? '' : 's'}`
          : 'Checked weekly recap drafts; none were missing',
        {
          createdWeeks: result.createdWeeks,
          checkedWeeks: result.checkedWeeks
        }
      );

      return NextResponse.json({
        ok: true,
        created: result.created,
        generated: result.generated,
        recaps: await loadRecaps()
      });
    }
    const recapId = validId(body.recapId);

    if (!recapId) {
      return NextResponse.json(
        { ok: false, error: 'A valid recap is required' },
        { status: 400 }
      );
    }

    const { data: current, error: currentError } =
      await supabase
        .from('weekly_recaps')
        .select('*')
        .eq('season_id', 1)
        .eq('id', recapId)
        .maybeSingle();

    if (currentError) throw currentError;

    if (!current) {
      return NextResponse.json(
        { ok: false, error: 'Weekly recap not found' },
        { status: 404 }
      );
    }

    if (body.action === 'save') {
      if (current.status !== 'draft') {
        return NextResponse.json(
          {
            ok: false,
            error: 'Withdraw this recap before editing it'
          },
          { status: 409 }
        );
      }

      const headline = cleanText(body.headline, 120);
      const recapText = cleanText(body.recapText, 3000);

      if (!headline || !recapText) {
        return NextResponse.json(
          {
            ok: false,
            error: 'Headline and recap text are required'
          },
          { status: 400 }
        );
      }

      const { data: saved, error: saveError } =
        await supabase
          .from('weekly_recaps')
          .update({
            headline,
            recap_text: recapText,
            updated_at: new Date().toISOString()
          })
          .eq('season_id', 1)
          .eq('id', recapId)
          .eq('status', 'draft')
          .select('*')
          .single();

      if (saveError) throw saveError;

      await logAction(
        'weekly_recap_edited',
        `Edited ${saved.week_key} weekly recap`,
        { recapId }
      );

      return NextResponse.json({
        ok: true,
        recap: saved,
        recaps: await loadRecaps()
      });
    }

    if (body.action === 'publish') {
      if (current.status === 'published') {
        return NextResponse.json({
          ok: true,
          recap: current,
          recaps: await loadRecaps()
        });
      }

      const now = new Date().toISOString();
      const { data: published, error: publishError } =
        await supabase
          .from('weekly_recaps')
          .update({
            status: 'published',
            published_at: now,
            updated_at: now
          })
          .eq('season_id', 1)
          .eq('id', recapId)
          .eq('status', 'draft')
          .select('*')
          .single();

      if (publishError) throw publishError;

      await logAction(
        'weekly_recap_published',
        `Published ${published.week_key} weekly recap`,
        { recapId }
      );

      return NextResponse.json({
        ok: true,
        recap: published,
        recaps: await loadRecaps()
      });
    }

    if (body.action === 'withdraw') {
      if (current.status === 'draft') {
        return NextResponse.json({
          ok: true,
          recap: current,
          recaps: await loadRecaps()
        });
      }

      const { data: withdrawn, error: withdrawError } =
        await supabase
          .from('weekly_recaps')
          .update({
            status: 'draft',
            published_at: null,
            updated_at: new Date().toISOString()
          })
          .eq('season_id', 1)
          .eq('id', recapId)
          .eq('status', 'published')
          .select('*')
          .single();

      if (withdrawError) throw withdrawError;

      await logAction(
        'weekly_recap_withdrawn',
        `Withdrew ${withdrawn.week_key} weekly recap`,
        { recapId }
      );

      return NextResponse.json({
        ok: true,
        recap: withdrawn,
        recaps: await loadRecaps()
      });
    }

    return NextResponse.json(
      { ok: false, error: 'Unsupported recap action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Weekly recap action failed', error);

    return NextResponse.json(
      {
        ok: false,
        error: 'The weekly recap action failed'
      },
      { status: 500 }
    );
  }
}
