'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Interface } from 'ethers';

/* ================= CONFIG ================= */

const POOL_ADDRESS = '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640';
const RPC_WS = 'wss://eth.llamarpc.com';

const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const SWAP_TOPIC =
  '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67';

/* ================= ABI ================= */

const SWAP_ABI = [
  'event Swap(address indexed sender,address indexed recipient,int256 amount0,int256 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick)',
];

const iface = new Interface(SWAP_ABI);

/* ================= TYPES ================= */

interface PricePoint {
  time: number; // epoch ms
  price: number;
}

interface SwapEvent {
  price: number;
}

/* ================= COMPONENT ================= */

export default function PoolMonitor() {
  const wsRef = useRef<WebSocket | null>(null);

  const [prices, setPrices] = useState<PricePoint[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);

  /* ================= PRICE MATH ================= */

const sqrtPriceX96ToPrice = (x: bigint): number => {
  const Q96 = 2n ** 96n;

  // scale up to preserve precision
  const numerator = Q96 * Q96 * 10n ** 18n;
  const denominator = x * x;

  const priceX18 = numerator / denominator; // still BigInt

  // USDC per ETH
  return Number(priceX18) / 1e6;
};

  /* ================= PARSER ================= */

  const parseSwap = (log: any): SwapEvent | null => {
    if (
      log.address?.toLowerCase() !== POOL_ADDRESS.toLowerCase() ||
      log.topics?.length !== 3 ||
      log.topics[0] !== SWAP_TOPIC ||
      log.data?.length !== 322
    ) {
      return null;
    }

    const parsed = iface.parseLog({
      topics: log.topics,
      data: log.data,
    });

    console.log('🧾 SWAP RAW:', {
      amount0: parsed.args.amount0.toString(),
      amount1: parsed.args.amount1.toString(),
      sqrtPriceX96: parsed.args.sqrtPriceX96.toString(),
      liquidity: parsed.args.liquidity.toString(),
      tick: parsed.args.tick.toString(),
    });

    const price = sqrtPriceX96ToPrice(
      BigInt(parsed.args.sqrtPriceX96.toString())
    );

    return { price };
  };

  /* ================= WS ================= */

  useEffect(() => {
    const ws = new WebSocket(RPC_WS);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      ws.send(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_subscribe',
          params: ['logs', { address: POOL_ADDRESS, topics: [SWAP_TOPIC] }],
        })
      );
    };

    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.method !== 'eth_subscription') return;

      const swap = parseSwap(msg.params.result);
      if (!swap) return;

      const now = Date.now();
      setCurrentPrice(swap.price);

      setPrices((prev) =>
        [...prev, { time: now, price: swap.price }].filter(
          (p) => now - p.time <= WINDOW_MS
        )
      );
    };

    ws.onclose = () => setConnected(false);

    return () => ws.close();
  }, []);

  /* ================= UI ================= */

  const now = Date.now();

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0f172a',
        color: '#e5e7eb',
        padding: 24,
      }}
    >
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>
        Uniswap V3 ETH / USDC
      </h1>

      <p style={{ marginTop: 8, color: connected ? '#22c55e' : '#ef4444' }}>
        {connected ? 'Connected' : 'Disconnected'}
      </p>

      <p style={{ marginTop: 8, fontSize: 22 }}>
        {currentPrice ? `$${currentPrice.toFixed(2)}` : 'Waiting for swaps…'}
      </p>

      <div
        style={{
          marginTop: 24,
          background: '#020617',
          borderRadius: 12,
          padding: 16,
        }}
      >
        <ResponsiveContainer width="100%" height={420}>
          <LineChart data={prices}>
            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />

            <XAxis
              type="number"
              dataKey="time"
              domain={[now - WINDOW_MS, now]}
              tickFormatter={(t) =>
                new Date(t).toLocaleTimeString()
              }
              stroke="#94a3b8"
            />

            <YAxis
              stroke="#94a3b8"
              domain={['auto', 'auto']}
              tickFormatter={(v) => `$${v.toFixed(0)}`}
            />

            <Tooltip
              contentStyle={{
                background: '#020617',
                border: '1px solid #1e293b',
                borderRadius: 8,
                color: '#e5e7eb',
              }}
              labelFormatter={(t) =>
                new Date(Number(t)).toLocaleTimeString()
              }
              formatter={(v: number) => `$${v.toFixed(2)}`}
            />

            <Line
              type="monotone"
              dataKey="price"
              stroke="#22c55e"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
