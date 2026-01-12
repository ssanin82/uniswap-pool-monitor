'use client';

import React, { useState, useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const POOL_ADDRESS = '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640';
const RPC_URL = 'https://eth.llamarpc.com';
const CHART_TIME_WINDOW = 10 * 60 * 1000; // 10 minutes in milliseconds

interface PricePoint {
  timestamp: string;
  price: number;
  time: number;
}

interface SwapEvent {
  sender: string;
  recipient: string;
  amount0: string;
  amount1: string;
  sqrtPriceX96: string;
  liquidity: string;
  tick: string;
  blockNumber: string;
  transactionHash: string;
  price: number;
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

  const parseSwapEvent = (log: any): SwapEvent => {
    // Parse topics (indexed parameters)
    const sender = '0x' + log.topics[1].slice(26);
    const recipient = '0x' + log.topics[2].slice(26);
    
    // Parse data (non-indexed parameters)
    const dataHex = log.data.slice(2);
    
    // Each parameter is 32 bytes (64 hex chars)
    const amount0Hex = dataHex.slice(0, 64);
    const amount1Hex = dataHex.slice(64, 128);
    const sqrtPriceX96Hex = dataHex.slice(128, 192);
    const liquidityHex = dataHex.slice(192, 256);
    const tickHex = dataHex.slice(256, 320);
    
    // Convert to appropriate types, handling empty strings
    const amount0 = amount0Hex ? BigInt('0x' + amount0Hex) : 0n;
    const amount1 = amount1Hex ? BigInt('0x' + amount1Hex) : 0n;
    const sqrtPriceX96 = sqrtPriceX96Hex ? BigInt('0x' + sqrtPriceX96Hex) : 0n;
    const liquidity = liquidityHex ? BigInt('0x' + liquidityHex) : 0n;
    const tick = tickHex ? BigInt('0x' + tickHex) : 0n;
    
    const price = sqrtPriceX96ToPrice(sqrtPriceX96);
    
    return {
      sender,
      recipient,
      amount0: amount0.toString(),
      amount1: amount1.toString(),
      sqrtPriceX96: sqrtPriceX96.toString(),
      liquidity: liquidity.toString(),
      tick: tick.toString(),
      blockNumber: log.blockNumber || 'N/A',
      transactionHash: log.transactionHash || 'N/A',
      price
    };
  };

  useEffect(() => {
    let reconnectTimeout: NodeJS.Timeout;
    let cleanupInterval: NodeJS.Timeout;
    
    // Initialize chart with empty data points spanning 10 minutes
    const now = Date.now();
    const initialPoints: PricePoint[] = [];
    for (let i = CHART_TIME_WINDOW; i >= 0; i -= 30000) { // Every 30 seconds
      initialPoints.push({
        timestamp: new Date(now - i).toLocaleTimeString(),
        price: 0,
        time: now - i
      });
    }
    setPrices(initialPoints);
    
    // Cleanup old data points outside 10-minute window
    cleanupInterval = setInterval(() => {
      const currentTime = Date.now();
      setPrices(prev => {
        // Remove points older than 10 minutes
        const filtered = prev.filter(point => currentTime - point.time < CHART_TIME_WINDOW);
        
        // Add new empty point at current time if needed
        const lastPoint = filtered[filtered.length - 1];
        if (!lastPoint || currentTime - lastPoint.time > 30000) {
          filtered.push({
            timestamp: new Date(currentTime).toLocaleTimeString(),
            price: filtered.find(p => p.price > 0)?.price || 0,
            time: currentTime
          });
        }
        
        return filtered;
      });
    }, 30000); // Update every 30 seconds
    
    const connectWebSocket = () => {
      try {
        setStatus('Connecting to Ethereum network...');
        const ws = new WebSocket(RPC_URL.replace('https://', 'wss://'));
        wsRef.current = ws;

        ws.onopen = () => {
          setStatus('Connected. Subscribing to NEW swap events...');
          setIsConnected(true);
          
          // Subscribe to NEW logs only (no historical data)
          ws.send(JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_subscribe',
            params: ['logs', {
              address: POOL_ADDRESS,
              topics: [
                '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67' // Swap event signature
              ]
            }]
          }));
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            // Only process new subscription events
            if (data.method === 'eth_subscription' && data.params?.result) {
              const log = data.params.result;
              
              // Parse the swap event
              const swapEvent = parseSwapEvent(log);
              
              // Log all event details to console
              console.log('═══════════════════════════════════════════════════');
              console.log('🔄 NEW SWAP EVENT RECEIVED');
              console.log('═══════════════════════════════════════════════════');
              console.log('📍 Transaction Hash:', swapEvent.transactionHash);
              console.log('📦 Block Number:', swapEvent.blockNumber);
              console.log('👤 Sender:', swapEvent.sender);
              console.log('👤 Recipient:', swapEvent.recipient);
              console.log('💰 Amount0 (ETH):', swapEvent.amount0);
              console.log('💵 Amount1 (USDC):', swapEvent.amount1);
              console.log('📊 sqrtPriceX96:', swapEvent.sqrtPriceX96);
              console.log('💧 Liquidity:', swapEvent.liquidity);
              console.log('📈 Tick:', swapEvent.tick);
              console.log('💲 Calculated Price:', `$${swapEvent.price.toFixed(2)}`);
              console.log('⏰ Timestamp:', new Date().toISOString());
              console.log('═══════════════════════════════════════════════════');
              
              const timestamp = new Date().toLocaleTimeString();
              
              // Update state only when new event is received
              setCurrentPrice(swapEvent.price);
              setPrices(prev => {
                const currentTime = Date.now();
                
                // Update or add the new price point
                const updated = [...prev];
                
                // Find if there's a point within the last 30 seconds
                const lastPoint = updated[updated.length - 1];
                if (lastPoint && currentTime - lastPoint.time < 30000) {
                  // Update the last point
                  lastPoint.price = swapEvent.price;
                  lastPoint.timestamp = new Date(currentTime).toLocaleTimeString();
                } else {
                  // Add new point
                  updated.push({
                    timestamp: new Date(currentTime).toLocaleTimeString(),
                    price: swapEvent.price,
                    time: currentTime
                  });
                }
                
                // Keep only points within 10-minute window
                return updated.filter(point => currentTime - point.time < CHART_TIME_WINDOW);
              });
              
              setStatus(`Monitoring... Last swap: ${timestamp}`);
            } else if (data.result) {
              console.log('✅ Successfully subscribed to NEW Swap events');
              console.log('Subscription ID:', data.result);
              setStatus('Subscribed. Waiting for NEW swap events...');
            }
          } catch (error) {
            console.error('❌ Error parsing message:', error);
          }
        };

        ws.onerror = (error) => {
          console.error('❌ WebSocket error:', error);
          setStatus('Connection error. Retrying...');
          setIsConnected(false);
        };

        ws.onclose = () => {
          console.log('⚠️  WebSocket disconnected. Reconnecting...');
          setStatus('Disconnected. Reconnecting in 5s...');
          setIsConnected(false);
          reconnectTimeout = setTimeout(connectWebSocket, 5000);
        };

      } catch (error) {
        console.error('❌ Connection error:', error);
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
      if (cleanupInterval) {
        clearInterval(cleanupInterval);
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
          <p className="text-gray-500 text-xs mt-1">
            Monitoring NEW swap events only • Chart shows last 10 minutes
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
            <div className="text-gray-400 text-sm mb-1">Swaps (10min)</div>
            <div className="text-2xl font-bold text-blue-400">
              {prices.filter(p => p.price > 0).length}
            </div>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-xl font-semibold mb-4">Price Chart (Last 10 Minutes)</h2>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={prices}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis 
                dataKey="time"
                type="number"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(time) => new Date(time).toLocaleTimeString()}
                stroke="#9CA3AF"
                tick={{ fill: '#9CA3AF' }}
                interval="preserveStartEnd"
              />
              <YAxis 
                stroke="#9CA3AF"
                tick={{ fill: '#9CA3AF' }}
                domain={[(dataMin: number) => dataMin * 0.999, (dataMax: number) => dataMax * 1.001]}
                tickFormatter={(value) => value > 0 ? `$${value.toFixed(0)}` : ''}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1F2937', 
                  border: '1px solid #374151',
                  borderRadius: '0.5rem',
                  color: '#F3F4F6'
                }}
                labelFormatter={(time) => new Date(time).toLocaleTimeString()}
                formatter={(value: number) => value > 0 ? [formatPrice(value), 'Price'] : ['Waiting...', 'Price']}
              />
              <Line 
                type="monotone" 
                dataKey="price" 
                stroke="#10B981" 
                strokeWidth={2}
                dot={(props: any) => {
                  if (props.payload.price === 0) return null;
                  return <circle cx={props.cx} cy={props.cy} r={3} fill="#10B981" />;
                }}
                activeDot={{ r: 5 }}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-4 text-center text-gray-500 text-sm">
          <p>Real-time monitoring of NEW swap events on Ethereum mainnet</p>
          <p className="mt-1">All event details are logged to browser console • Chart maintains 10-minute rolling window</p>
        </div>
      </div>
    </div>
  );
};

export default PoolMonitor;
