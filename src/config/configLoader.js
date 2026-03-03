const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { getAppRoot } = require('../utils/runtimePaths');

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  return String(value).toLowerCase() === 'true';
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseCsv(value) {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function findFirstExistingPath(candidatePaths) {
  return candidatePaths.find((candidatePath) => fs.existsSync(candidatePath));
}

function readJsonConfig(baseDirs) {
  const configPathFromEnv = process.env.CONFIG_JSON_PATH || './config/config.json';
  const absoluteConfigPath = path.isAbsolute(configPathFromEnv)
    ? configPathFromEnv
    : findFirstExistingPath(baseDirs.map((baseDir) => path.resolve(baseDir, configPathFromEnv)));

  if (!absoluteConfigPath || !fs.existsSync(absoluteConfigPath)) {
    return {};
  }

  const jsonText = fs.readFileSync(absoluteConfigPath, 'utf-8');
  return JSON.parse(jsonText);
}

function validateConfig(config) {
  if (!config.targetUrl) {
    throw new Error('Missing target website URL. Set TARGET_URL or targetUrl in JSON config.');
  }

  if (!Array.isArray(config.emailDomains) || config.emailDomains.length === 0) {
    throw new Error('At least one email domain is required. Set EMAIL_DOMAINS or emailDomains in JSON config.');
  }

  if (!config.registrationForm || !config.registrationForm.emailSelector || !config.registrationForm.submitSelector) {
    throw new Error('registrationForm.emailSelector and registrationForm.submitSelector are required in config.');
  }
}

function loadConfig() {
  const appRoot = getAppRoot();
  const fallbackRoot = path.resolve(appRoot, '..');
  const candidateRoots = Array.from(new Set([appRoot, fallbackRoot]));

  const envPath = findFirstExistingPath(candidateRoots.map((root) => path.resolve(root, '.env')));

  if (envPath) {
    // Load .env values first so they can override JSON values later.
    dotenv.config({ path: envPath });
  }

  // Load optional JSON config and then apply environment overrides.
  const jsonConfig = readJsonConfig(candidateRoots);

  const config = {
    projectName: process.env.PROJECT_NAME || jsonConfig.projectName || 'default-project',
    targetUrl: process.env.TARGET_URL || jsonConfig.targetUrl,
    emailDomains: parseCsv(process.env.EMAIL_DOMAINS).length > 0 ? parseCsv(process.env.EMAIL_DOMAINS) : jsonConfig.emailDomains || [],
    proxies: parseCsv(process.env.PROXIES).length > 0 ? parseCsv(process.env.PROXIES) : jsonConfig.proxies || [],
    headerIps: parseCsv(process.env.HEADER_IPS).length > 0 ? parseCsv(process.env.HEADER_IPS) : jsonConfig.headerIps || [],
    allowedCountries:
      parseCsv(process.env.ALLOWED_COUNTRIES).length > 0
        ? parseCsv(process.env.ALLOWED_COUNTRIES).map((country) => country.toUpperCase())
        : (jsonConfig.allowedCountries || []).map((country) => String(country).trim().toUpperCase()).filter(Boolean),
    strictGeoMode: parseBoolean(process.env.STRICT_GEO_MODE, jsonConfig.strictGeoMode === true),
    geoLookupAttempts: parseNumber(process.env.GEO_LOOKUP_ATTEMPTS, jsonConfig.geoLookupAttempts || 3),
    testSubmissions: parseNumber(process.env.TEST_SUBMISSIONS, jsonConfig.testSubmissions || 1),
    headless: parseBoolean(process.env.HEADLESS, jsonConfig.headless !== undefined ? jsonConfig.headless : true),
    registrationForm: {
      firstNameSelector: process.env.FIRST_NAME_SELECTOR || jsonConfig.registrationForm?.firstNameSelector,
      firstNameValue: process.env.FIRST_NAME_VALUE || jsonConfig.registrationForm?.firstNameValue || 'QA',
      lastNameSelector: process.env.LAST_NAME_SELECTOR || jsonConfig.registrationForm?.lastNameSelector,
      lastNameValue: process.env.LAST_NAME_VALUE || jsonConfig.registrationForm?.lastNameValue || 'Automation',
      ageValue: process.env.AGE_VALUE || jsonConfig.registrationForm?.ageValue,
      locationValue: process.env.LOCATION_VALUE || jsonConfig.registrationForm?.locationValue,
      emailSelector: process.env.EMAIL_SELECTOR || jsonConfig.registrationForm?.emailSelector,
      passwordSelector: process.env.PASSWORD_SELECTOR || jsonConfig.registrationForm?.passwordSelector,
      passwordValue: process.env.PASSWORD_VALUE || jsonConfig.registrationForm?.passwordValue,
      browserExecutablePath: process.env.BROWSER_EXECUTABLE_PATH || jsonConfig.registrationForm?.browserExecutablePath,
      submitSelector: process.env.SUBMIT_SELECTOR || jsonConfig.registrationForm?.submitSelector,
      successSelector: process.env.SUCCESS_SELECTOR || jsonConfig.registrationForm?.successSelector,
      errorSelector: process.env.ERROR_SELECTOR || jsonConfig.registrationForm?.errorSelector
    }
  };

  validateConfig(config);
  return config;
}

module.exports = {
  loadConfig
};
