// A square Canvas 2D design shared by the interface and exported PNG files.
export function drawLogo(ctx: CanvasRenderingContext2D, dark = false) {
  const size = ctx.canvas.width;
  ctx.save(); ctx.scale(size / 256, size / 256);
  const bg = dark ? '#192a23' : '#edf2e6', ink = dark ? '#e5edcf' : '#344b38', accent = dark ? '#bdd788' : '#7f9859';
  ctx.clearRect(0, 0, 256, 256); ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(0, 0, 256, 256, 52); ctx.fill();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 7;
  ctx.strokeStyle = accent; ctx.beginPath(); ctx.roundRect(87, 39, 77, 91, 12); ctx.stroke();
  ctx.fillStyle = bg; ctx.fillRect(139, 26, 39, 48);
  ctx.strokeStyle = ink; ctx.beginPath(); ctx.moveTo(141, 39); ctx.lineTo(164, 62); ctx.lineTo(141, 62); ctx.lineTo(141, 39); ctx.stroke();
  ctx.strokeStyle = accent; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(106, 81); ctx.lineTo(136, 81); ctx.moveTo(106, 96); ctx.lineTo(124, 96); ctx.stroke();
  ctx.strokeStyle = ink; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(145, 113); ctx.lineTo(154, 122); ctx.lineTo(174, 101); ctx.stroke();
  ctx.fillStyle = ink; ctx.font = 'bold 52px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText('JOSU', 128, 202);
  ctx.fillStyle = accent; ctx.beginPath(); ctx.roundRect(104, 218, 48, 4, 2); ctx.fill(); ctx.restore();
}
