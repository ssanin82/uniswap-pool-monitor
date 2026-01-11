'use client';

import React, { useState, useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const POOL_ADDRESS = '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640';
const RPC_URL = 'https://eth.llamarpc.com';

interface PricePoint {
  timestamp: string;
  price: number;
  time: number;
}

const PoolMonitor = () => {
  const [prices, setPrices] = useState<PricePoint[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [status, setStatus] = useState<string>('Initializing...');
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const sqrtPriceX96ToPrice = (sqrtPriceX96: bigint): number => {
    const Q96 = 2n ** 96n;
    const price = (sqrtPriceX96 * sqrtPriceX96 * (10n ** 12n)) / (Q96 * Q96);
    return Number(price) / 1e12;
  };

  useEffect(() => {
    let reconnectTimeout: NodeJS.Timeout;
    
    const connectWebSocket = () => {
      try {
        setStatus('Connecting to Ethereum network...');
        const ws = new WebSocket(RPC_URL.replace('https://', 'wss://'));
        wsRef.current = ws;

        ws.onopen = () => {
          setStatus('Connected. Subscribing to swap events...');
          setIsConnected(true);
          
          ws.send(JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_subscribe',
            params: ['logs', {
              address: POOL_ADDRESS,
              topics: [
                '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67'
              ]
            }]
          }));
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            if (data.method === 'eth_subscription' && data.params?.result) {
              const log = data.params.result;
              
              const dataHex = log.data.slice(2);
              const sqrtPriceHex = dataHex.slice(128, 128 + 40);
              const sqrtPriceX96 = BigInt('0x' + sqrtPriceHex);
              
              const price = sqrtPriceX96ToPrice(sqrtPriceX96);
              const timestamp = new Date().toLocaleTimeString();
              
              const newPoint: PricePoint = {
                timestamp,
                price,
                time: Date.now()
              };
              
              setCurrentPrice(price);
              setPrices(prev => {
                const updated = [...prev, newPoint];
                return updated.slice(-50);
              });
              
              setStatus(`Monitoring... Latest swap detected`);
            } else if (data.result) {
              setStatus('Subscribed. Waiting for swap events...');
            }
          } catch (error) {
            console.error('Error parsing message:', error);
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          setStatus('Connection error. Retrying...');
          setIsConnected(false);
        };

        ws.onclose = () => {
          setStatus('Disconnected. Reconnecting in 5s...');
          setIsConnected(false);
          reconnectTimeout = setTimeout(connectWebSocket, 5000);
        };

      } catch (error) {
        console.error('Connection error:', error);
        setStatus('Failed to connect. Retrying in 5s...');
        reconnectTimeout = setTimeout(connectWebSocket, 5000);
      }
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, []);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(price);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2 text-white">
            Uniswap V3 ETH/USDC Pool Monitor
          </h1>
          <p className="text-gray-400 font-mono text-sm">
            Pool: {POOL_ADDRESS}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <div className="text-gray-400 text-sm mb-1">Status</div>
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
              <div className="text-lg font-semibold">{status}</div>
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <div className="text-gray-400 text-sm mb-1">Current Price</div>
            <div className="text-2xl font-bold text-green-400">
              {currentPrice ? formatPrice(currentPrice) : 'Waiting...'}
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <div className="text-gray-400 text-sm mb-1">Swaps Detected</div>
            <div className="text-2xl font-bold text-blue-400">
              {prices.length}
            </div>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-xl font-semibold mb-4">Price Chart (Last 50 Swaps)</h2>
          {prices.length > 0 ? (
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={prices}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis 
                  dataKey="timestamp" 
                  stroke="#9CA3AF"
                  tick={{ fill: '#9CA3AF' }}
                />
                <YAxis 
                  stroke="#9CA3AF"
                  tick={{ fill: '#9CA3AF' }}
                  domain={['auto', 'auto']}
                  tickFormatter={(value) => `$${value.toFixed(0)}`}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1F2937', 
                    border: '1px solid #374151',
                    borderRadius: '0.5rem',
                    color: '#F3F4F6'
                  }}
                  formatter={(value: number) => [formatPrice(value), 'Price']}
                />
                <Line 
                  type="monotone" 
                  dataKey="price" 
                  stroke="#10B981" 
                  strokeWidth={2}
                  dot={{ fill: '#10B981', r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-96 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <div className="text-6xl mb-4">📊</div>
                <div>Waiting for swap events...</div>
                <div className="text-sm mt-2">Chart will update automatically when swaps are detected</div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 text-center text-gray-500 text-sm">
          <p>Real-time monitoring of swap events on Ethereum mainnet</p>
          <p className="mt-1">Price calculated from sqrtPriceX96 format</p>
        </div>
      </div>
    </div>
  );
};

export default PoolMonitor;
