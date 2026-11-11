// Icônes et écran de démarrage Android, depuis icons/icon-512.png (sans ImageMagick)
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const ICON = process.argv[2], R = process.argv[3];
const BG = { r: 14, g: 17, b: 22, alpha: 1 };
(async () => {
  const sizes = { mdpi: [48, 108], hdpi: [72, 162], xhdpi: [96, 216], xxhdpi: [144, 324], xxxhdpi: [192, 432] };
  for (const [n, [s, f]] of Object.entries(sizes)) {
    const d = path.join(R, 'mipmap-' + n); fs.mkdirSync(d, { recursive: true });
    await sharp(ICON).resize(s, s).png().toFile(path.join(d, 'ic_launcher.png'));
    const mask = Buffer.from('<svg width="' + s + '" height="' + s + '"><circle cx="' + s / 2 + '" cy="' + s / 2 + '" r="' + s / 2 + '"/></svg>');
    await sharp(ICON).resize(s, s).composite([{ input: mask, blend: 'dest-in' }]).png().toFile(path.join(d, 'ic_launcher_round.png'));
    await sharp(ICON).resize(f, f).png().toFile(path.join(d, 'ic_launcher_foreground.png'));
  }
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
  for (const p of walk(R).filter((p) => path.basename(p) === 'splash.png')) {
    const m = await sharp(p).metadata(); const w = m.width, h = m.height, i = Math.round(Math.min(w, h) * 0.3);
    const logo = await sharp(ICON).resize(i, i).png().toBuffer();
    const out = await sharp({ create: { width: w, height: h, channels: 4, background: BG } }).composite([{ input: logo, gravity: 'center' }]).png().toBuffer();
    fs.writeFileSync(p, out);
  }
  console.log('icônes ok');
})().catch((e) => { console.error(e); process.exit(1); });
