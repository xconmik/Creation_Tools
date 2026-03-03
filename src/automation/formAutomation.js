const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { getAppRoot } = require('../utils/runtimePaths');
const {
  normalizeUrl,
  getNavigationCandidates,
  getRedirectAssessment
} = require('../utils/urlPipeline');

let cachedBundledChromiumPath;

async function navigateWithFallback(page, rawUrl) {
  const candidates = getNavigationCandidates(rawUrl);
  const errors = [];

  for (const candidateUrl of candidates) {
    try {
      await page.goto(candidateUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
      const redirectInfo = getRedirectAssessment(candidateUrl, page.url());

      if (redirectInfo.suspicious && candidateUrl !== candidates[candidates.length - 1]) {
        errors.push(`${candidateUrl} -> redirected to ${page.url()}`);
        continue;
      }

      return candidateUrl;
    } catch (error) {
      errors.push(`${candidateUrl} -> ${error.message}`);
    }
  }

  throw new Error(`All navigation attempts failed. ${errors.join(' | ')}`);
}

function normalizeSelectorAlias(selector, fallbackSelector) {
  if (!selector || typeof selector !== 'string') {
    return fallbackSelector;
  }

  const normalized = selector.trim().toLowerCase();
  if (!normalized) {
    return fallbackSelector;
  }

  if (normalized === 'email') {
    return "input[type='email'], input[name='email'], input[name*='[email]']";
  }

  if (normalized === 'password') {
    return "input[type='password'], input[name='password'], input[name*='[password]']";
  }

  if (normalized === 'submit') {
    return ".submit-btn, button[type='submit'], input[type='submit'], .login-form-submit";
  }

  return selector;
}

function findBundledChromiumExecutable() {
  if (cachedBundledChromiumPath !== undefined) {
    return cachedBundledChromiumPath;
  }

  const browsersRoot = path.join(getAppRoot(), 'ms-playwright');
  if (!fs.existsSync(browsersRoot)) {
    cachedBundledChromiumPath = null;
    return cachedBundledChromiumPath;
  }

  const chromiumFolders = fs
    .readdirSync(browsersRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('chromium-'))
    .map((entry) => path.join(browsersRoot, entry.name));

  for (const chromiumFolder of chromiumFolders) {
    const candidatePaths = [
      path.join(chromiumFolder, 'chrome-win', 'chrome.exe'),
      path.join(chromiumFolder, 'chrome-win64', 'chrome.exe'),
      path.join(chromiumFolder, 'chrome.exe')
    ];

    const foundPath = candidatePaths.find((candidatePath) => fs.existsSync(candidatePath));
    if (foundPath) {
      cachedBundledChromiumPath = foundPath;
      return cachedBundledChromiumPath;
    }
  }

  cachedBundledChromiumPath = null;
  return cachedBundledChromiumPath;
}

function resolveBrowserExecutablePath(rawPath) {
  if (typeof rawPath !== 'string') {
    return null;
  }

  const trimmed = rawPath.trim();
  if (!trimmed) {
    return null;
  }

  const resolvedPath = path.resolve(trimmed);
  if (!fs.existsSync(resolvedPath)) {
    return null;
  }

  const stats = fs.statSync(resolvedPath);
  if (stats.isFile()) {
    return resolvedPath;
  }

  if (!stats.isDirectory()) {
    return null;
  }

  const candidateExecutables = [
    'browser.exe',
    'chrome.exe',
    'msedge.exe',
    'opera.exe',
    'firefox.exe'
  ];

  for (const executableName of candidateExecutables) {
    const candidatePath = path.join(resolvedPath, executableName);
    if (fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  return null;
}

async function fillIfSelectorExists(page, selector, value) {
  if (!selector || value === undefined || value === null) {
    return;
  }

  const resolvedSelector = normalizeSelectorAlias(selector, selector);
  const field = page.locator(resolvedSelector).first();
  const fieldCount = await field.count();

  if (fieldCount > 0) {
    await field.fill(String(value));
  }
}

async function detectSubmissionStatus(page, formConfig) {
  if (formConfig.successSelector) {
    const successElement = page.locator(formConfig.successSelector).first();
    if ((await successElement.count()) > 0 && (await successElement.isVisible())) {
      return 'success';
    }
  }

  if (formConfig.errorSelector) {
    const errorElement = page.locator(formConfig.errorSelector).first();
    if ((await errorElement.count()) > 0 && (await errorElement.isVisible())) {
      return 'failure';
    }
  }

  const pageText = (await page.locator('body').innerText().catch(() => '')).toLowerCase();
  const currentUrl = page.url().toLowerCase();

  if (
    /successfully created your profile|congratulations|account activation|confirm email|you've successfully/i.test(pageText)
  ) {
    return 'success';
  }

  if (
    /email address or password.*incorrect|invalid.*password|try again|on virheellinen|kirjaudu sisään|log in|sign in/i.test(pageText)
  ) {
    return 'failure';
  }

  if (/\/login|signin|sign-in|kirjaudu/.test(currentUrl)) {
    return 'failure';
  }

  // Conservative fallback to avoid false positives.
  return 'failure';
}

async function clickIfVisible(page, selector, timeout = 5000) {
  const resolvedSelector = normalizeSelectorAlias(selector, selector);
  const candidate = page.locator(resolvedSelector).first();
  const count = await candidate.count();

  if (count === 0) {
    return false;
  }

  await candidate.click({ timeout });
  return true;
}

async function acceptCookieAndAgeGateIfPresent(page) {
  const acceptSelectors = [
    '.cookie-btn__accept',
    '.cookie-age-popup .cookie-btn__accept',
    '.cookie-policy-popup .cookie-btn__accept'
  ];

  for (const selector of acceptSelectors) {
    const button = page.locator(selector).first();
    const isVisible = await button.isVisible().catch(() => false);
    if ((await button.count()) > 0 && isVisible) {
      await button.click({ timeout: 5000 }).catch(() => undefined);
      await page.waitForTimeout(250);
    }
  }
}

async function isLikelyLoginPage(page) {
  const pageText = (await page.locator('body').innerText().catch(() => '')).toLowerCase();
  const currentUrl = page.url().toLowerCase();
  const hasPasswordField = (await page.locator("input[type='password']").count().catch(() => 0)) > 0;
  const hasEmailLikeField =
    (await page.locator("input[type='email'], input[name='email'], input[name*='user'], input[name*='login']").count().catch(() => 0)) > 0;
  const hasRegistrationForm = (await page.locator('form.reg-form').count().catch(() => 0)) > 0;

  return (
    /kirjaudu|log in|sign in|forgot password|unohtuiko salasana|already.*account|existing.*account/.test(pageText) ||
    (hasPasswordField && hasEmailLikeField && !hasRegistrationForm) ||
    /\/login|signin|sign-in|kirjaudu/.test(currentUrl)
  );
}

async function isLikelyRegistrationPage(page) {
  const pageText = (await page.locator('body').innerText().catch(() => '')).toLowerCase();
  const currentUrl = page.url().toLowerCase();
  const hasRegistrationForm = (await page.locator('form.reg-form').count().catch(() => 0)) > 0;
  const hasEmailLikeField =
    (await page.locator("input[type='email'], input[name='email'], input[name*='[email]']").count().catch(() => 0)) > 0;
  const hasPasswordField = (await page.locator("input[type='password'], input[name*='[password]']").count().catch(() => 0)) > 0;
  const hasRegistrationStepper =
    (await page.locator(".next-btn, .submit-btn, select[name='UserForm[age]'], select[name='UserForm[sexual_orientation]']").count().catch(() => 0)) > 0;

  return (
    hasRegistrationForm ||
    /\/register|signup|sign-up|rekister/.test(currentUrl) ||
    ((/register|sign up|create account|rekister[öo]idy/.test(pageText) || hasRegistrationStepper) &&
      (hasEmailLikeField || hasPasswordField))
  );
}

async function ensureRegistrationPage(page, rawTargetUrl) {
  if (await isLikelyRegistrationPage(page)) {
    return;
  }

  const registerNamePattern = /rekister[öo]idy|register|sign\s*up|join now|create account/i;

  const roleTriggers = [
    page.getByRole('button', { name: registerNamePattern }),
    page.getByRole('link', { name: registerNamePattern })
  ];

  for (const triggerGroup of roleTriggers) {
    const total = await triggerGroup.count().catch(() => 0);
    for (let index = 0; index < total; index += 1) {
      const trigger = triggerGroup.nth(index);
      if (await trigger.isVisible().catch(() => false)) {
        await trigger.click({ timeout: 5000 }).catch(() => undefined);
        await page.waitForTimeout(700);
        await acceptCookieAndAgeGateIfPresent(page);
        if (await isLikelyRegistrationPage(page)) {
          return;
        }
      }
    }
  }

  const cssTriggers = [
    '.register-btn',
    '.registration-btn',
    "button:has-text('REKISTERÖIDY')",
    "a:has-text('REKISTERÖIDY')",
    "button:has-text('Register')",
    "a:has-text('Register')",
    "button:has-text('Sign up')",
    "a:has-text('Sign up')"
  ];

  for (const selector of cssTriggers) {
    const trigger = page.locator(selector);
    const total = await trigger.count().catch(() => 0);
    for (let index = 0; index < total; index += 1) {
      const candidate = trigger.nth(index);
      if (await candidate.isVisible().catch(() => false)) {
        await candidate.click({ timeout: 5000 }).catch(() => undefined);
        await page.waitForTimeout(700);
        await acceptCookieAndAgeGateIfPresent(page);
        if (await isLikelyRegistrationPage(page)) {
          return;
        }
      }
    }
  }

  const normalizedUrl = normalizeUrl(rawTargetUrl);
  const parsed = new URL(normalizedUrl);
  const registerCandidates = [
    `${parsed.origin}/register${parsed.search || ''}`,
    `${parsed.origin}/register`,
    `${parsed.origin}/signup${parsed.search || ''}`,
    `${parsed.origin}/signup`,
    `${parsed.origin}/`
  ];

  for (const candidateUrl of registerCandidates) {
    await page.goto(candidateUrl, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => undefined);
    await acceptCookieAndAgeGateIfPresent(page);
    if (await isLikelyRegistrationPage(page)) {
      return;
    }
  }
}

async function fillSpecificRegistrationFlow(page, formConfig, email) {
  const registerForm = page.locator('form.reg-form').first();
  if ((await registerForm.count()) === 0) {
    return false;
  }

  const registrationSpecificIndicators = [
    "select[name='UserForm[age]']",
    "select[name='UserForm[sexual_orientation]']",
    "input[name='UserForm[location]']",
    '.next-btn'
  ];

  let hasRegistrationSpecificFields = false;
  for (const selector of registrationSpecificIndicators) {
    const field = registerForm.locator(selector).first();
    if ((await field.count()) > 0) {
      hasRegistrationSpecificFields = true;
      break;
    }
  }

  if (!hasRegistrationSpecificFields) {
    return false;
  }

  const ageSelect = registerForm.locator("select[name='UserForm[age]']").first();
  if ((await ageSelect.count()) > 0) {
    const availableValues = await ageSelect.locator('option').evaluateAll((options) =>
      options
        .map((option) => option.value)
        .filter((value) => value && value.trim() !== '')
    );

    if (formConfig.ageValue && availableValues.includes(String(formConfig.ageValue))) {
      await ageSelect.selectOption(String(formConfig.ageValue)).catch(() => undefined);
    } else if (availableValues.length > 0) {
      const randomAgeValue = availableValues[Math.floor(Math.random() * availableValues.length)];
      await ageSelect.selectOption(randomAgeValue).catch(() => undefined);
    }
  }

  const orientationSelect = registerForm.locator("select[name='UserForm[sexual_orientation]']").first();
  if ((await orientationSelect.count()) > 0) {
    await orientationSelect.selectOption({ index: 0 }).catch(() => undefined);
  }

  const locationInput = registerForm.locator("input[name='UserForm[location]']").first();
  if ((await locationInput.count()) > 0 && formConfig.locationValue) {
    await locationInput.fill(String(formConfig.locationValue)).catch(() => undefined);
  }

  for (let clickCount = 0; clickCount < 5; clickCount += 1) {
    const submitInForm = registerForm.locator('.submit-btn:visible').first();
    if ((await submitInForm.count()) > 0) {
      break;
    }

    const nextButton = registerForm.locator('.next-btn:visible').first();
    if ((await nextButton.count()) === 0) {
      break;
    }

    await nextButton.click({ timeout: 5000 }).catch(() => undefined);
    await page.waitForTimeout(250);
  }

  const emailInput = registerForm.locator("input[name='email'], input[type='email']").first();
  if ((await emailInput.count()) > 0) {
    await emailInput.fill(email).catch(() => undefined);
  }

  const passwordInput = registerForm.locator("input[name='UserForm[password]'], input[type='password']").first();
  if ((await passwordInput.count()) > 0 && formConfig.passwordValue) {
    await passwordInput.fill(String(formConfig.passwordValue)).catch(() => undefined);
  }

  return true;
}

async function submitForm(page, formConfig) {
  const errors = [];

  if (formConfig.submitSelector) {
    try {
      const clicked = await clickIfVisible(page, formConfig.submitSelector, 15000);
      if (clicked) {
        return `selector:${formConfig.submitSelector}`;
      }

      errors.push(`Configured submit selector not found: ${formConfig.submitSelector}`);
    } catch (error) {
      errors.push(`Configured submit selector failed (${formConfig.submitSelector}): ${error.message}`);
    }
  }

  try {
    const buttonByTypeClicked = await clickIfVisible(page, "button[type='submit'], input[type='submit']", 8000);
    if (buttonByTypeClicked) {
      return "selector:button[type='submit']";
    }
  } catch (error) {
    errors.push(`Submit button by type failed: ${error.message}`);
  }

  try {
    const actionButton = page.getByRole('button', { name: /submit|register|sign up|sign-up|log in|login/i }).first();
    if ((await actionButton.count()) > 0) {
      await actionButton.click({ timeout: 8000 });
      return 'role:button';
    }
  } catch (error) {
    errors.push(`Submit button by role/name failed: ${error.message}`);
  }

  try {
    if (formConfig.passwordSelector) {
      const passwordField = page.locator(formConfig.passwordSelector).first();
      if ((await passwordField.count()) > 0) {
        await passwordField.press('Enter', { timeout: 5000 });
        return `enter:${formConfig.passwordSelector}`;
      }
    }

    if (formConfig.emailSelector) {
      const emailField = page.locator(formConfig.emailSelector).first();
      if ((await emailField.count()) > 0) {
        await emailField.press('Enter', { timeout: 5000 });
        return `enter:${formConfig.emailSelector}`;
      }
    }
  } catch (error) {
    errors.push(`Press Enter fallback failed: ${error.message}`);
  }

  throw new Error(
    [
      'Unable to submit form with configured selector or fallback strategies.',
      ...errors
    ].join(' ')
  );
}

function shouldRetryWithoutProxy(errorMessage, hadProxy) {
  if (!hadProxy || typeof errorMessage !== 'string') {
    return false;
  }

  return /ERR_TIMED_OUT|ERR_PROXY|ERR_TUNNEL|ERR_CONNECTION|All navigation attempts failed/i.test(errorMessage);
}

function notifyStep(onStep, message) {
  if (typeof onStep === 'function') {
    onStep(message);
  }
}

async function detectEgressIdentity(page, { attempts = 1, onStep } = {}) {
  const providers = [
    {
      url: 'https://ipapi.co/json/',
      parse: (payload) => ({
        ip: payload?.ip,
        countryName: payload?.country_name || payload?.country,
        countryCode: payload?.country_code,
        source: 'ipapi.co'
      })
    },
    {
      url: 'https://ifconfig.co/json',
      parse: (payload) => ({
        ip: payload?.ip,
        countryName: payload?.country,
        countryCode: payload?.country_iso,
        source: 'ifconfig.co'
      })
    },
    {
      url: 'https://ipwho.is/',
      parse: (payload) => ({
        ip: payload?.ip,
        countryName: payload?.country,
        countryCode: payload?.country_code,
        source: 'ipwho.is'
      })
    },
    {
      url: 'https://ipinfo.io/json',
      parse: (payload) => ({
        ip: payload?.ip,
        countryName: null,
        countryCode: payload?.country,
        source: 'ipinfo.io'
      })
    },
    {
      url: 'https://api.myip.com/',
      parse: (payload) => ({
        ip: payload?.ip,
        countryName: payload?.country,
        countryCode: null,
        source: 'api.myip.com'
      })
    },
    {
      url: 'https://api.ipify.org?format=json',
      parse: (payload) => ({
        ip: payload?.ip,
        countryName: null,
        countryCode: null,
        source: 'api.ipify.org'
      })
    }
  ];

  const maxAttempts = Math.max(1, Number(attempts) || 1);
  let bestEffortIdentity = null;
  const sourcesTried = new Set();

  for (let attemptIndex = 0; attemptIndex < maxAttempts; attemptIndex += 1) {
    for (const provider of providers) {
      try {
        const response = await page.request.get(provider.url, {
          timeout: 8000,
          failOnStatusCode: false
        });

        if (!response.ok()) {
          continue;
        }

        const payload = await response.json();
        const parsed = provider.parse(payload);
        const ip = typeof parsed.ip === 'string' ? parsed.ip.trim() : '';
        const countryName = typeof parsed.countryName === 'string' ? parsed.countryName.trim() : '';
        const countryCode = typeof parsed.countryCode === 'string' ? parsed.countryCode.trim().toUpperCase() : '';

        if (!ip) {
          continue;
        }

        sourcesTried.add(parsed.source);

        if (!bestEffortIdentity) {
          bestEffortIdentity = {
            ip,
            country: countryName || countryCode || 'Unknown',
            countryCode: countryCode || 'Unknown',
            source: parsed.source
          };
        }

        if (/^[A-Z]{2}$/.test(countryCode)) {
          return {
            ip,
            country: countryName || countryCode,
            countryCode,
            source: parsed.source
          };
        }
      } catch {
        // Try next provider.
      }
    }

    if (attemptIndex < maxAttempts - 1) {
      notifyStep(onStep, `Egress country unresolved. Retrying geo lookup (${attemptIndex + 2}/${maxAttempts})...`);
      await page.waitForTimeout(500);
    }
  }

  if (bestEffortIdentity) {
    return {
      ...bestEffortIdentity,
      source: Array.from(sourcesTried).join(', ') || bestEffortIdentity.source
    };
  }

  return {
    ip: 'Unknown',
    country: 'Unknown',
    countryCode: 'Unknown',
    source: 'unavailable'
  };
}

function normalizeAllowedCountries(allowedCountries) {
  if (!Array.isArray(allowedCountries)) {
    return [];
  }

  return allowedCountries
    .map((country) => String(country).trim().toUpperCase())
    .filter((country) => /^[A-Z]{2}$/.test(country));
}

function getConfiguredPasswordValue(formConfig) {
  if (!formConfig || formConfig.passwordValue === undefined || formConfig.passwordValue === null) {
    return '';
  }

  return String(formConfig.passwordValue);
}

async function ensurePasswordRequirement(page, formConfig) {
  const passwordFieldCount = await page
    .locator("input[type='password'], input[name*='[password]'], input[name='password']")
    .count()
    .catch(() => 0);

  if (passwordFieldCount === 0) {
    return;
  }

  const passwordValue = getConfiguredPasswordValue(formConfig);
  if (!passwordValue) {
    throw new Error('Password field detected, but Password Value is empty. Set Password Value (for example: 123123).');
  }
}

async function executeRegistrationAttempt({
  targetUrl,
  formConfig,
  headless,
  email,
  proxy,
  proxyLabel,
  allowedCountries,
  strictGeoMode,
  geoLookupAttempts,
  onStep
}) {
  let browser;

  try {
    const launchOptions = {
      headless,
      proxy: proxy
        ? {
            server: proxy.server,
            username: proxy.username,
            password: proxy.password
          }
        : undefined
    };

    const configuredExecutablePath = resolveBrowserExecutablePath(formConfig.browserExecutablePath);
    const detectedBundledPath = findBundledChromiumExecutable();
    const executablePathToUse = configuredExecutablePath || detectedBundledPath;

    if (executablePathToUse) {
      launchOptions.executablePath = executablePathToUse;
    }

    if (headless && configuredExecutablePath) {
      launchOptions.headless = false;
      launchOptions.args = [...(launchOptions.args || []), '--headless=new'];
    }

    notifyStep(onStep, 'Launching browser...');
    browser = await chromium.launch(launchOptions);

    const contextOptions = {};
    if (formConfig.headerIp) {
      contextOptions.extraHTTPHeaders = {
        'X-Forwarded-For': formConfig.headerIp,
        'X-Real-IP': formConfig.headerIp
      };
    }

    notifyStep(onStep, 'Creating browser context...');
    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();

    const egressIdentity = await detectEgressIdentity(page, {
      attempts: geoLookupAttempts,
      onStep
    });
    notifyStep(
      onStep,
      `Egress identity: IP ${egressIdentity.ip}, country ${egressIdentity.country} (${egressIdentity.countryCode}) (source: ${egressIdentity.source})`
    );

    const normalizedAllowedCountries = normalizeAllowedCountries(allowedCountries);
    const hasKnownCountryCode =
      typeof egressIdentity.countryCode === 'string' &&
      /^[A-Z]{2}$/.test(egressIdentity.countryCode);

    if (
      normalizedAllowedCountries.length > 0 &&
      hasKnownCountryCode &&
      !normalizedAllowedCountries.includes(egressIdentity.countryCode)
    ) {
      await context.close();
      return {
        status: 'failure',
        proxyUsed: proxyLabel,
        headerIpUsed: formConfig.headerIp || 'N/A',
        egressIp: egressIdentity.ip,
        egressCountry: egressIdentity.country,
        egressCountryCode: egressIdentity.countryCode,
        error: `Egress country ${egressIdentity.countryCode} is not in allowed list (${normalizedAllowedCountries.join(', ')}).`
      };
    }

    if (normalizedAllowedCountries.length > 0 && !hasKnownCountryCode && strictGeoMode) {
      await context.close();
      return {
        status: 'failure',
        proxyUsed: proxyLabel,
        headerIpUsed: formConfig.headerIp || 'N/A',
        egressIp: egressIdentity.ip,
        egressCountry: egressIdentity.country,
        egressCountryCode: egressIdentity.countryCode,
        error: `Strict geo mode: unable to determine egress country after ${Math.max(1, Number(geoLookupAttempts) || 1)} lookup attempt(s).`
      };
    }

    if (normalizedAllowedCountries.length > 0 && !hasKnownCountryCode && !strictGeoMode) {
      notifyStep(
        onStep,
        `Egress country could not be detected; skipping country filter (${normalizedAllowedCountries.join(', ')}).`
      );
    }

    notifyStep(onStep, 'Navigating to generated URL...');
    await navigateWithFallback(page, targetUrl);
    notifyStep(onStep, `Navigation loaded: ${page.url()}`);

    await acceptCookieAndAgeGateIfPresent(page);
    notifyStep(onStep, 'Handled cookie/age gate checks.');

    await ensureRegistrationPage(page, targetUrl);
    await acceptCookieAndAgeGateIfPresent(page);
    notifyStep(onStep, `Registration page check completed: ${page.url()}`);

    const stillOnLoginPage = await isLikelyLoginPage(page);
    const onRegistrationPage = await isLikelyRegistrationPage(page);
    if (stillOnLoginPage && !onRegistrationPage) {
      throw new Error('Detected login page instead of registration page after all fallbacks. Verify target URL/affiliate link and locale-specific register path.');
    }

    await ensurePasswordRequirement(page, formConfig);

    const handledSpecificFlow = await fillSpecificRegistrationFlow(page, formConfig, email);
    notifyStep(onStep, handledSpecificFlow ? 'Applied specific registration flow.' : 'Using generic field fill flow.');

    const passwordValue = getConfiguredPasswordValue(formConfig);

    await fillIfSelectorExists(page, formConfig.firstNameSelector, formConfig.firstNameValue);
    await fillIfSelectorExists(page, formConfig.lastNameSelector, formConfig.lastNameValue);
    await fillIfSelectorExists(page, formConfig.emailSelector, email);
    await fillIfSelectorExists(page, formConfig.passwordSelector, passwordValue);

    if (!handledSpecificFlow) {
      await fillIfSelectorExists(page, "input[name='email']", email);
      await fillIfSelectorExists(page, "input[type='email']", email);
      await fillIfSelectorExists(page, "input[name*='[password]']", passwordValue);
      await fillIfSelectorExists(page, "input[type='password']", passwordValue);
    }

    notifyStep(onStep, 'Submitting form...');
    const submitMethod = await submitForm(page, formConfig);
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => undefined);
    notifyStep(onStep, 'Post-submit wait completed.');

    const status = await detectSubmissionStatus(page, formConfig);
    notifyStep(onStep, `Detected status: ${status}`);

    await context.close();
    return {
      status,
      proxyUsed: proxyLabel,
      headerIpUsed: formConfig.headerIp || 'N/A',
      egressIp: egressIdentity.ip,
      egressCountry: egressIdentity.country,
      egressCountryCode: egressIdentity.countryCode,
      error: null,
      submitMethod
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

async function runRegistrationFormTest({
  targetUrl,
  formConfig,
  headless,
  allowedCountries,
  strictGeoMode,
  geoLookupAttempts,
  email,
  proxy,
  headerIp,
  onStep
}) {
  const proxyLabel = proxy?.raw || 'N/A';
  const runFormConfig = {
    ...formConfig,
    headerIp: headerIp || null
  };
  const maxAttemptDurationMs = 120000;

  const withTimeout = (promise) =>
    Promise.race([
      promise,
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Submission timed out after ${Math.round(maxAttemptDurationMs / 1000)} seconds.`));
        }, maxAttemptDurationMs);
      })
    ]);

  try {
    return await withTimeout(executeRegistrationAttempt({
      targetUrl,
      formConfig: runFormConfig,
      headless,
      email,
      proxy,
      proxyLabel,
      allowedCountries,
      strictGeoMode,
      geoLookupAttempts,
      onStep
    }));
  } catch (error) {
    const proxyFallbackApplicable = shouldRetryWithoutProxy(error?.message, Boolean(proxy));

    if (proxyFallbackApplicable) {
      try {
        notifyStep(onStep, 'Retrying without proxy due to proxy/network error...');
        const fallbackResult = await withTimeout(executeRegistrationAttempt({
          targetUrl,
          formConfig: runFormConfig,
          headless,
          email,
          proxy: null,
          proxyLabel: `N/A (fallback from ${proxyLabel})`,
          allowedCountries,
          strictGeoMode,
          geoLookupAttempts,
          onStep
        }));

        return fallbackResult;
      } catch (fallbackError) {
        error = fallbackError;
      }
    }

    const missingBrowserHint =
      typeof error?.message === 'string' && error.message.includes("Executable doesn't exist")
        ? ' Playwright Chromium is missing. Run "npx playwright install chromium" or package browser files with "npm run build:win:standalone".'
        : '';

    return {
      status: 'failure',
      proxyUsed: proxyLabel,
      headerIpUsed: runFormConfig.headerIp || 'N/A',
      egressIp: 'Unknown',
      egressCountry: 'Unknown',
      egressCountryCode: 'Unknown',
      error: `${error.message}${missingBrowserHint}`
    };
  }
}

module.exports = {
  runRegistrationFormTest
};
