import { NextResponse } from 'next/server';

export async function GET() {
  console.log('TEST API called');
  return NextResponse.json({ ok: true });
}