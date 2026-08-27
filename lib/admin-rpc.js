import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured');
}

if (!serviceRoleKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
}

const supabase = createClient(
  supabaseUrl,
  serviceRoleKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  }
);

function secret() {
  const value = process.env.CFB_ADMIN_SECRET;

  if (!value) {
    throw new Error('CFB_ADMIN_SECRET is not configured');
  }

  return value;
}

export async function adminRpc(fn, args = {}) {
  const { data, error } = await supabase.rpc(fn, {
    p_secret: secret(),
    ...args
  });

  if (error) throw error;

  return data;
}
