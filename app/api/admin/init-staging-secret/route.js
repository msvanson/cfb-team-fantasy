import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { isAdminAuthenticated } from '../../../../../lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!await isAdminAuthenticated()) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const adminSecret = process.env.CFB_ADMIN_SECRET;

  if (!url || !serviceKey || !adminSecret) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Staging secret initialization is not configured'
      },
      { status: 500 }
    );
  }

  const supabase = createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  const secretHash = createHash('sha256')
    .update(adminSecret)
    .digest('hex');

  const { error } = await supabase
    .from('integration_secrets')
    .upsert(
      {
        name: 'commissioner_admin',
        secret_hash: secretHash
      },
      {
        onConflict: 'name'
      }
    );

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Unable to initialize staging admin secret'
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
