// src/app/api/swaps/route.ts
import { NextRequest, NextResponse } from 'next/server';

const GRAPH_URL = 'https://gateway.thegraph.com/api/subgraphs/id/5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV';
const POOL_ADDRESS = '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640';

// Read API key from environment
const THEGRAPH_API_KEY = process.env.THEGRAPH_API_KEY;

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const fromSecParam = url.searchParams.get('fromSec');

    // fallback: last 10 minutes
    const nowSec = Math.floor(Date.now() / 1000);
    const fromSec = fromSecParam ? parseInt(fromSecParam) : nowSec - 10 * 60;

    if (!THEGRAPH_API_KEY) {
      return NextResponse.json(
        { error: 'Missing THEGRAPH_API_KEY in environment' },
        { status: 500 }
      );
    }

    // GraphQL query
    const query = `
      query Subgraphs {
        swaps(
          where: { pool: "${POOL_ADDRESS.toLowerCase()}", timestamp_gte: ${fromSec} }
          orderBy: timestamp
          orderDirection: asc
          first: 1000
        ) {
          timestamp
          sqrtPriceX96
        }
      }
    `;

    const res = await fetch(GRAPH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${THEGRAPH_API_KEY}`,
      },
      body: JSON.stringify({ query, operationName: 'Subgraphs', variables: {} }),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: 'GraphQL fetch failed', details: text },
        { status: 500 }
      );
    }

    const data = await res.json();

    // ⚠️ Ensure JSON-serializable output
    const swaps = (data?.data?.swaps || []).map((s: any) => ({
      timestamp: Number(s.timestamp),        // number in seconds
      sqrtPriceX96: String(s.sqrtPriceX96),  // string to prevent BigInt issues
    }));

    return NextResponse.json({ swaps });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Internal server error', details: String(err) },
      { status: 500 }
    );
  }
}
