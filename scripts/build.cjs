const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'public');
const files = [
  'index.html', 'about.html', 'contact.html', 'projects.html', 'services.html', 'technology.html',
  'css/style.css', 'images/kds-icon.png',
  'images/site-480.webp', 'images/site-960.webp', 'images/site-1672.webp',
  'michael/index.html', 'michael/styles.css', 'michael/script.js',
  'michael/service-worker.js', 'michael/manifest.webmanifest',
  'michael/assets/kds-logo-mark.png', 'michael/assets/qr-kds.png',
  'michael/assets/michael-kincaid.vcf', 'michael/assets/icon-192.png',
  'michael/assets/icon-512.png', 'michael/assets/apple-touch-icon.png',
  'michael/assets/favicon-32.png', 'michael/assets/social-card.png'
];

(async () => {
  // Delete only the fixed build folder inside this repository.
  if (path.dirname(output) !== root || path.basename(output) !== 'public') throw new Error('Invalid build output');
  await fs.rm(output, { recursive: true, force: true });
  for (const file of files) {
    const target = path.join(output, file);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(path.join(root, file), target);
  }
  console.log(`Built ${files.length} public files. Source archives and test tooling are excluded.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
