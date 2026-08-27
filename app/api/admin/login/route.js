import { NextResponse } from 'next/server';
import { createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import {
  verifyAdminPassword,
  setAdminCookie
} from '../../../../lib/admin-auth';

const MAX_FAILED_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    }
  );
}

function requesterHash(req) {
  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  const secret = process.env.CFB_ADMIN_SECRET || '';

  return createHmac('sha256', secret)
    .update(ip)
    .digest('hex');
}

export async function POST(req) {
  const hash = requesterHash(req);
  const supabase = adminClient();

  const cutoff = new Date(
    Date.now() - WINDOW_MINUTES * 60 * 1000
  ).toISOString();

  const { count, error: countError } = await supabase
    .from('admin_login_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('requester_hash', hash)
    .eq('succeeded', false)
    .gte('created_at', cutoff);

  if (countError) {
    return NextResponse.json(
      { ok: false, error: 'Login temporarily unavailable' },
      { status: 503 }
    );
  }

  if ((count || 0) >= MAX_FAILED_ATTEMPTS) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Too many failed login attempts. Try again later.'
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(WINDOW_MINUTES * 60)
        }
      }
    );
  }

  const body = await req.json().catch(() => ({}));
  const password = body?.password;

  if (!verifyAdminPassword(password)) {
    await supabase
      .from('admin_login_attempts')
      .insert({
        requester_hash: hash,
        succeeded: false
      });

    return NextResponse.json(
      {
        ok: false,
        error: 'Invalid commissioner password'
      },
      { status: 401 }
    );
  }

  await supabase
    .from('admin_login_attempts')
    .delete()
    .eq('requester_hash', hash);

  await setAdminCookie();

  return NextResponse.json({ ok: true });
}
