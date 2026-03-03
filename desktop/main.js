const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { runTestsWithConfig } = require('../src/core/testRunner');

let mainWindow;
let runInProgress = false;

function getProjectRoot() {
  return path.resolve(__dirname, '..');
}

function getUserConfigPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function getLegacyUserConfigPath() {
  return path.join(app.getPath('appData'), 'playwright-registration-qa', 'config.json');
}

function parseJsonSafe(rawText) {
  const withoutBom = rawText.replace(/^\uFEFF/, '');
  return JSON.parse(withoutBom);
}

function readJsonFileIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    return parseJsonSafe(fs.readFileSync(filePath, 'utf-8'));
  } catch (error) {
    const brokenPath = `${filePath}.broken-${Date.now()}`;

    try {
      fs.renameSync(filePath, brokenPath);
    } catch {
      // Ignore rename failures and continue with fallback config.
    }

    return null;
  }
}

function getDefaultConfig() {
  const userConfigPath = getUserConfigPath();
  const userConfig = readJsonFileIfExists(userConfigPath);

  if (userConfig) {
    return userConfig;
  }

  const legacyUserConfigPath = getLegacyUserConfigPath();
  const legacyUserConfig = readJsonFileIfExists(legacyUserConfigPath);

  if (legacyUserConfig) {
    return legacyUserConfig;
  }

  const projectRoot = getProjectRoot();
  const configFilePath = path.join(projectRoot, 'config', 'config.json');
  const configExamplePath = path.join(projectRoot, 'config', 'config.json.example');

  const projectConfig = readJsonFileIfExists(configFilePath);
  if (projectConfig) {
    return projectConfig;
  }

  const exampleConfig = readJsonFileIfExists(configExamplePath);
  if (exampleConfig) {
    return exampleConfig;
  }

  return {
    projectName: 'default-project',
    targetUrl: '',
    emailDomains: [],
    proxies: [],
    headerIps: [],
    allowedCountries: [],
    strictGeoMode: false,
    geoLookupAttempts: 3,
    testSubmissions: 1,
    headless: true,
    registrationForm: {
      firstNameSelector: '',
      firstNameValue: 'QA',
      lastNameSelector: '',
      lastNameValue: 'Automation',
      emailSelector: '',
      passwordSelector: '',
      passwordValue: '',
      browserExecutablePath: '',
      submitSelector: '',
      successSelector: '',
      errorSelector: ''
    }
  };
}

function toSafeProjectSlug(projectName) {
  const raw = typeof projectName === 'string' ? projectName.trim() : '';
  const normalized = raw || 'default-project';
  return normalized
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'default-project';
}

function validateUiConfig(config) {
  if (!config?.projectName || !String(config.projectName).trim()) {
    throw new Error('Project name is required.');
  }

  if (!config?.targetUrl) {
    throw new Error('Target website URL is required.');
  }

  if (!Array.isArray(config.emailDomains) || config.emailDomains.length === 0) {
    throw new Error('At least one email domain is required.');
  }

  if (!config.registrationForm?.emailSelector) {
    throw new Error('Email selector is required.');
  }

  if (!config.registrationForm?.submitSelector) {
    throw new Error('Submit selector is required.');
  }

  if (config.allowedCountries !== undefined && !Array.isArray(config.allowedCountries)) {
    throw new Error('Allowed countries must be an array of ISO country codes.');
  }

  if (Array.isArray(config.allowedCountries)) {
    for (const country of config.allowedCountries) {
      if (!/^[A-Za-z]{2}$/.test(String(country || '').trim())) {
        throw new Error('Allowed countries must contain 2-letter ISO codes (example: US, AU, PH).');
      }
    }
  }

  const geoLookupAttempts = Number(config.geoLookupAttempts);
  if (!Number.isFinite(geoLookupAttempts) || geoLookupAttempts < 1 || geoLookupAttempts > 10) {
    throw new Error('Geo lookup attempts must be a number between 1 and 10.');
  }

  if (config.registrationForm?.passwordSelector && !String(config.registrationForm.passwordValue || '')) {
    throw new Error('Password value is required when Password Selector is set.');
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 780,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

function normalizeCountryCode(countryCode) {
  return String(countryCode || '').trim().toUpperCase();
}

function shuffleArray(values) {
  const clone = [...values];
  for (let index = clone.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [clone[index], clone[swapIndex]] = [clone[swapIndex], clone[index]];
  }

  return clone;
}

function toProxyUrl(protocol, host, port) {
  if (!protocol || !host || !port) {
    return null;
  }

  const normalizedProtocol = String(protocol).toLowerCase();
  const mappedProtocol = normalizedProtocol === 'https' ? 'http' : normalizedProtocol;
  if (!['http', 'socks5'].includes(mappedProtocol)) {
    return null;
  }

  return `${mappedProtocol}://${host}:${port}`;
}

async function fetchCountryProxies(countryCode) {
  const normalizedCountry = normalizeCountryCode(countryCode);
  if (!/^[A-Z]{2}$/.test(normalizedCountry)) {
    throw new Error('Country must be a 2-letter ISO code (example: US, AU, PH).');
  }

  const collected = new Set();

  try {
    const geoNodeUrl = `https://proxylist.geonode.com/api/proxy-list?limit=150&page=1&sort_by=lastChecked&sort_type=desc&country=${normalizedCountry}`;
    const geoNodeResponse = await fetch(geoNodeUrl, { method: 'GET' });
    if (geoNodeResponse.ok) {
      const payload = await geoNodeResponse.json();
      const rows = Array.isArray(payload?.data) ? payload.data : [];

      for (const row of rows) {
        const host = row?.ip;
        const port = row?.port;
        const protocols = Array.isArray(row?.protocols) ? row.protocols : [];

        for (const protocol of protocols) {
          const proxyUrl = toProxyUrl(protocol, host, port);
          if (proxyUrl) {
            collected.add(proxyUrl);
          }
        }
      }
    }
  } catch {
    // Continue with next provider.
  }

  const proxyScrapeProtocols = ['http', 'socks5'];
  for (const protocol of proxyScrapeProtocols) {
    try {
      const proxyScrapeUrl =
        `https://api.proxyscrape.com/v3/free-proxy-list/get?request=displayproxies&country=${normalizedCountry}` +
        `&protocol=${protocol}&proxy_format=protocolipport&format=text&timeout=8000`;

      const proxyScrapeResponse = await fetch(proxyScrapeUrl, { method: 'GET' });
      if (!proxyScrapeResponse.ok) {
        continue;
      }

      const text = await proxyScrapeResponse.text();
      const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 250);

      for (const line of lines) {
        if (/^(http|socks4|socks5):\/\//i.test(line)) {
          collected.add(line.toLowerCase());
        }
      }
    } catch {
      // Continue with next protocol/provider.
    }
  }

  const randomized = shuffleArray(Array.from(collected));
  return randomized.slice(0, 20);
}

ipcMain.handle('qa:get-initial-config', async () => {
  return getDefaultConfig();
});

ipcMain.handle('qa:save-config', async (_event, config) => {
  const configPath = getUserConfigPath();
  const configDirPath = path.dirname(configPath);

  fs.mkdirSync(configDirPath, { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
  return configPath;
});

ipcMain.handle('qa:open-results-folder', async () => {
  const resultsFolder = app.getPath('userData');
  const error = await shell.openPath(resultsFolder);

  if (error) {
    throw new Error(error);
  }

  return resultsFolder;
});

ipcMain.handle('qa:get-country-proxies', async (_event, countryCode) => {
  const proxies = await fetchCountryProxies(countryCode);
  if (proxies.length === 0) {
    throw new Error(`No public proxies found for ${normalizeCountryCode(countryCode)} right now.`);
  }

  return proxies;
});

ipcMain.handle('qa:run-tests', async (_event, config) => {
  if (runInProgress) {
    throw new Error('A test run is already in progress.');
  }

  validateUiConfig(config);
  runInProgress = true;

  try {
    const projectSlug = toSafeProjectSlug(config.projectName);
    const outputPath = path.join(app.getPath('userData'), `${projectSlug}-results.xlsx`);

    const execution = await runTestsWithConfig(config, {
      outputFileName: outputPath,
      onLog: (message) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('qa:log', message);
        }
      },
      onProgress: (data) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('qa:progress', data);
        }
      }
    });

    return {
      success: true,
      outputPath: execution.outputPath,
      total: execution.results.length
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  } finally {
    runInProgress = false;
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
