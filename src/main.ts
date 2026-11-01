import { startGame } from './ui/game';

const canvas = document.getElementById('game') as HTMLCanvasElement | null;
if (canvas) startGame(canvas);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
