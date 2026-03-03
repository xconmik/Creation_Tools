const fs = require('fs');
const path = require('path');

function resolveProjectRoot() {
  return path.resolve(__dirname, '..');
}

function resolveAppControlPath() {
  return path.join(resolveProjectRoot(), 'config', 'app-control.json');
}

function normalizeMode(rawMode) {
  const mode = String(rawMode || '').trim().toLowerCase();
  if (mode === 'enable' || mode === 'enabled') {
    return 'enabled';
  }

  if (mode === 'disable' || mode === 'disabled') {
    return 'disabled';
  }

  return null;
}

function buildState(mode) {
  const isEnabled = mode === 'enabled';

  return {
    mode,
    note: isEnabled ? 'Up to date' : 'Need to upgrade',
    updatedAt: new Date().toISOString()
  };
}

function main() {
  const inputMode = process.argv[2];
  const mode = normalizeMode(inputMode);

  if (!mode) {
    console.error('Usage: node scripts/setDesktopAccess.js <enable|disable>');
    process.exitCode = 1;
    return;
  }

  const appControlPath = resolveAppControlPath();
  fs.mkdirSync(path.dirname(appControlPath), { recursive: true });

  const state = buildState(mode);
  fs.writeFileSync(appControlPath, `${JSON.stringify(state, null, 2)}\n`, 'utf-8');

  console.log(`Desktop app mode set to: ${mode}`);
  console.log(`Note: ${state.note}`);
  console.log(`Config path: ${appControlPath}`);
}

main();
