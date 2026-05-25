const { createCanvas } = require('canvas');
const fs = require('fs');

function generateIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  const radius = size * 0.2;
  ctx.fillStyle = '#064e3b';
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, radius);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.round(size * 0.35)}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('BOS', size / 2, size / 2);

  return canvas.toBuffer('image/png');
}

fs.writeFileSync('public/icons/icon-512.png', generateIcon(512));
fs.writeFileSync('public/icons/icon-192.png', generateIcon(192));
console.log('Icons generated: icon-192.png + icon-512.png');
