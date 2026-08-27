import { NextResponse } from 'next/server';
import { isAdminAuthenticated } from '../../../../lib/admin-auth';
import { runProjectionImport } from '../../../../lib/projections';

export async function POST() {
  if (!await isAdminAuthenticated()) {
    return NextResponse.json
