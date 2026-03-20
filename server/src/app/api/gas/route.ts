import { NextRequest, NextResponse } from 'next/server';
import { getBalance } from '../../../../../src/core/gas';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || 'test-user';

    const balance = getBalance(userId);

    return NextResponse.json({ balance });
  } catch (err: any) {
    console.error('Error fetching gas balance:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
