import { startGame } from './ui/game';

const canvas = document.getElementById('game') as HTMLCanvasElement | null;
if (canvas) startGame(canvas);
