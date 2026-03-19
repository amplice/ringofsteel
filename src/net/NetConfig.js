export function getDefaultMultiplayerWsUrl() {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_MULTIPLAYER_WS_URL) {
    return import.meta.env.VITE_MULTIPLAYER_WS_URL;
  }

  if (typeof window === 'undefined') {
    return 'ws://127.0.0.1:3010/ws';
  }

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';

  if (import.meta.env?.DEV) {
    return `${protocol}://${window.location.hostname}:3010/ws`;
  }

  if (window.location.port) {
    return `${protocol}://${window.location.host}/ws`;
  }

  return `${protocol}://${window.location.hostname}/ws`;
}
