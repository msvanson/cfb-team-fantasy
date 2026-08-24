import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE = 'cfb_admin_session';

function tokenFor(secret) {
  return createHmac('sha256', secret).update('cfb-team-fantasy-admin-v1').digest('hex');
}

export function verifyAdminPassword(candidate) {
  const expected = process.env.CFB_ADMIN_SECRET || '';
  if (!expected || !candidate) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function isAdminAuthenticated() {
  const secret = process.env.CFB_ADMIN_SECRET || '';
  if (!secret) return false;
  const jar = await cookies();
  const actual = jar.get(COOKIE)?.value || '';
  const expected = tokenFor(secret);
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function setAdminCookie() {
  const secret = process.env.CFB_ADMIN_SECRET;
  if (!secret) throw new Error('CFB_ADMIN_SECRET is not configured');
  const jar = await cookies();
  jar.set(COOKIE, tokenFor(secret), {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearAdminCookie() {
  const jar = await cookies();
  jar.set(COOKIE, '', { httpOnly:true, secure:true, sameSite:'strict', path:'/', maxAge:0 });
}
