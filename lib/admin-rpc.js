import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession:false } }
);

function secret() {
  const value = process.env.CFB_ADMIN_SECRET;
  if (!value) throw new Error('CFB_ADMIN_SECRET is not configured');
  return value;
}

export async function adminRpc(fn, args={}) {
  const { data, error } = await supabase.rpc(fn, { p_secret: secret(), ...args });
  if (error) throw error;
  return data;
}
