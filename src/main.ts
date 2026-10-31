const canvas = document.getElementById('game') as HTMLCanvasElement | null;
if (canvas) {
  canvas.width = 480;
  canvas.height = 640;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    ctx.font = '32px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('寶石地城', canvas.width / 2, canvas.height / 2);
  }
}
