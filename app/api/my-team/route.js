import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

export async function GET(req) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';

  if (!token) {
    return NextResponse.json(
      { ok: false, error: 'Sign in required' },
      { status: 401 }
    );
  }

  const s = sb();

  const {
    data: { user },
    error: userError
  } = await s.auth.getUser(token);

  if (userError || !user) {
    return NextResponse.json(
      { ok: false, error: 'Sign in required' },
      { status: 401 }
    );
  }

  const { data: profile, error: profileError } = await s
    .from('user_profiles')
    .select('owner_id,username,role,owners(name)')
    .eq('user_id', user.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Account profile temporarily unavailable'
      },
      { status: 500 }
    );
  }

  if (!profile?.owner_id) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Your account has not been assigned to a league team yet.',
        profile
      },
      { status: 403 }
    );
  }

  const oid = Number(profile.owner_id);

  const [
    teamsResult,
    standingResult,
    projectionsResult,
    ownerProjectionResult,
    previousResult,
    h2hResult,
    h2gResult
  ] = await Promise.all([
    s
      .from('team_directory')
      .select('*')
      .eq('season_id', 1)
      .eq('owner_id', oid)
      .eq('is_owned', true),

    s
      .from('owner_standings_with_movement')
      .select('*')
      .eq('season_id', 1)
      .eq('owner_id', oid)
      .maybeSingle(),

    s
      .from('latest_team_projections')
      .select('*')
      .eq('season_id', 1),

    s
      .from('owner_projection_totals')
      .select('*')
      .eq('season_id', 1)
      .eq('owner_id', oid)
      .maybeSingle(),

    s
      .from('owner_previous_teams')
      .select('*')
      .eq('season_id', 1)
      .eq('owner_id', oid)
      .order('released_at', { ascending: false }),

    s
      .from('owner_head_to_head_records')
      .select('*')
      .eq('season_id', 1)
      .eq('owner_a_id', oid)
      .order('owner_b_name'),

    s
      .from('owner_head_to_head_games')
      .select('*')
      .eq('season_id', 1)
      .eq('owner_a_id', oid)
      .order('start_time', { ascending: false })
  ]);

  const hasDataError = [
    teamsResult,
    standingResult,
    projectionsResult,
    ownerProjectionResult,
    previousResult,
    h2hResult,
    h2gResult
  ].some(result => result.error);

  if (hasDataError) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Team data temporarily unavailable'
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    profile,
    teams: teamsResult.data || [],
    standing: standingResult.data || null,
    projections: projectionsResult.data || [],
    ownerProjection: ownerProjectionResult.data || null,
    previous: previousResult.data || [],
    h2h: h2hResult.data || [],
    h2g: h2gResult.data || []
  });
}
