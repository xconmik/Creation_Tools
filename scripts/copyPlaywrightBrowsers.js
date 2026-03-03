const fs = require('fs');
const path = require('path');

function copyChromiumBrowsers() {
  const localAppData = process.env.LOCALAPPDATA;

  if (!localAppData) {
    throw new Error('LOCALAPPDATA is not available. This script is intended for Windows builds.');
  }

  const sourceRoot = path.join(localAppData, 'ms-playwright');
  const destinationRoot = path.resolve(process.cwd(), 'dist', 'ms-playwright');

  if (!fs.existsSync(sourceRoot)) {
    throw new Error(
      `Playwright browser cache not found at ${sourceRoot}. Run "npx playwright install chromium" first.`
    );
  }

  fs.mkdirSync(destinationRoot, { recursive: true });

  const browserFolders = fs
    .readdirSync(sourceRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('chromium-'));

  if (browserFolders.length === 0) {
    throw new Error('No Chromium folders found in Playwright cache. Run "npx playwright install chromium" first.');
  }

  browserFolders.forEach((browserFolder) => {
    const sourcePath = path.join(sourceRoot, browserFolder.name);
    const destinationPath = path.join(destinationRoot, browserFolder.name);
    fs.cpSync(sourcePath, destinationPath, { recursive: true, force: true });
  });

  console.log(`Copied ${browserFolders.length} Chromium browser folder(s) to ${destinationRoot}`);
}

try {
  copyChromiumBrowsers();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
