import ReconnectingWebSocket from 'reconnecting-websocket';

export const socket = new ReconnectingWebSocket(
  'ws://127.0.0.1:8000/ws',
  [],
  {
    maxRetries: Infinity,
    reconnectionDelayGrowFactor: 2,
    maxReconnectionDelay: 30_000,
    minReconnectionDelay: 1_000,
    connectionTimeout: 4_000,
    debug: false,
  }
);

