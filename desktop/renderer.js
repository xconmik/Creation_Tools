const statusElement = document.getElementById('status');
const logsElement = document.getElementById('logs');
const runButton = document.getElementById('runBtn');
const saveConfigButton = document.getElementById('saveConfigBtn');
const openResultsButton = document.getElementById('openResultsBtn');
const allowedCountriesElement = document.getElementById('allowedCountries');
const proxiesElement = document.getElementById('proxies');

let lastProxyCountryRequest = '';

function getAvailableCountryCodes() {
  if (typeof Intl !== 'undefined' && typeof Intl.supportedValuesOf === 'function') {
    try {
      return Intl.supportedValuesOf('region');
    } catch {
      // Fallback below.
    }
  }

  return [
    'US', 'AU', 'PH', 'CA', 'GB', 'DE', 'FR', 'ES', 'IT', 'NL', 'SE', 'NO', 'DK', 'FI', 'JP', 'KR',
    'SG', 'HK', 'IN', 'ID', 'MY', 'TH', 'VN', 'BR', 'MX', 'AR', 'CL', 'CO', 'ZA', 'AE', 'SA'
  ];
}

function buildCountryOptions() {
  const displayNames = typeof Intl !== 'undefined' ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;

  return getAvailableCountryCodes()
    .filter((code) => typeof code === 'string' && /^[A-Z]{2}$/i.test(code))
    .map((code) => code.toUpperCase())
    .sort((a, b) => a.localeCompare(b))
    .map((code) => ({
      code,
      label: `${code} - ${displayNames?.of(code) || code}`
    }));
}

function populateCountryDropdown(selectedCountries = []) {
  if (!allowedCountriesElement) {
    return;
  }

  const selectedSet = new Set((selectedCountries || []).map((country) => String(country).trim().toUpperCase()).filter(Boolean));
  const options = buildCountryOptions();

  allowedCountriesElement.innerHTML = '';
  for (const optionData of options) {
    const option = document.createElement('option');
    option.value = optionData.code;
    option.textContent = optionData.label;
    option.selected = selectedSet.has(optionData.code);
    allowedCountriesElement.appendChild(option);
  }
}

function getSelectedCountries() {
  if (!allowedCountriesElement) {
    return [];
  }

  return Array.from(allowedCountriesElement.selectedOptions)
    .map((option) => option.value.trim().toUpperCase())
    .filter(Boolean);
}

async function populateRandomProxiesForCountrySelection() {
  const selectedCountries = getSelectedCountries();

  if (selectedCountries.length !== 1) {
    return;
  }

  const selectedCountry = selectedCountries[0];
  lastProxyCountryRequest = selectedCountry;
  statusElement.textContent = `Loading random ${selectedCountry} proxies...`;

  try {
    const proxies = await window.qaApp.getCountryProxies(selectedCountry);

    if (lastProxyCountryRequest !== selectedCountry) {
      return;
    }

    const limited = (proxies || []).slice(0, 8);
    proxiesElement.value = limited.join(', ');
    statusElement.textContent = `Loaded ${limited.length} random proxies for ${selectedCountry}.`;
    appendLog(`Loaded ${limited.length} random ${selectedCountry} proxies into Proxy IPs.`);
  } catch (error) {
    if (lastProxyCountryRequest !== selectedCountry) {
      return;
    }

    statusElement.textContent = `Proxy fetch failed for ${selectedCountry}: ${error.message}`;
    appendLog(`Proxy fetch failed for ${selectedCountry}: ${error.message}`);
  }
}

function appendLog(message) {
  logsElement.textContent += `${message}\n`;
  logsElement.scrollTop = logsElement.scrollHeight;
}

function parseCsv(value) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function setFormFromConfig(config) {
  document.getElementById('projectName').value = config.projectName || 'default-project';
  document.getElementById('targetUrl').value = config.targetUrl || '';
  document.getElementById('emailDomains').value = (config.emailDomains || []).join(',');
  document.getElementById('proxies').value = (config.proxies || []).join(',');
  document.getElementById('headerIps').value = (config.headerIps || []).join(',');
  document.getElementById('testSubmissions').value = Number(config.testSubmissions || 1);
  document.getElementById('headless').checked = config.headless !== false;
  populateCountryDropdown(config.allowedCountries || []);
  document.getElementById('strictGeoMode').checked = config.strictGeoMode === true;
  document.getElementById('geoLookupAttempts').value = Number(config.geoLookupAttempts || 3);
  document.getElementById('emailSelector').value = config.registrationForm?.emailSelector || '';
  document.getElementById('submitSelector').value = config.registrationForm?.submitSelector || '';
  document.getElementById('passwordSelector').value = config.registrationForm?.passwordSelector || '';
  document.getElementById('passwordValue').value = config.registrationForm?.passwordValue || '';
  document.getElementById('browserExecutablePath').value = config.registrationForm?.browserExecutablePath || '';
  document.getElementById('successSelector').value = config.registrationForm?.successSelector || '';
  document.getElementById('errorSelector').value = config.registrationForm?.errorSelector || '';
}

function getConfigFromForm() {
  return {
    projectName: document.getElementById('projectName').value.trim() || 'default-project',
    targetUrl: document.getElementById('targetUrl').value.trim(),
    emailDomains: parseCsv(document.getElementById('emailDomains').value),
    proxies: parseCsv(document.getElementById('proxies').value),
    headerIps: parseCsv(document.getElementById('headerIps').value),
    allowedCountries: getSelectedCountries(),
    strictGeoMode: document.getElementById('strictGeoMode').checked,
    geoLookupAttempts: Number(document.getElementById('geoLookupAttempts').value || 3),
    testSubmissions: Number(document.getElementById('testSubmissions').value || 1),
    headless: document.getElementById('headless').checked,
    registrationForm: {
      firstNameSelector: "input[name='firstName']",
      firstNameValue: 'QA',
      lastNameSelector: "input[name='lastName']",
      lastNameValue: 'Automation',
      emailSelector: document.getElementById('emailSelector').value.trim(),
      passwordSelector: document.getElementById('passwordSelector').value.trim(),
      passwordValue: document.getElementById('passwordValue').value.trim(),
      browserExecutablePath: document.getElementById('browserExecutablePath').value.trim(),
      submitSelector: document.getElementById('submitSelector').value.trim(),
      successSelector: document.getElementById('successSelector').value.trim(),
      errorSelector: document.getElementById('errorSelector').value.trim()
    }
  };
}

async function initialize() {
  const initialConfig = await window.qaApp.getInitialConfig();
  setFormFromConfig(initialConfig);

  allowedCountriesElement?.addEventListener('change', () => {
    populateRandomProxiesForCountrySelection().catch((error) => {
      statusElement.textContent = `Proxy auto-fill failed: ${error.message}`;
    });
  });

  window.qaApp.onLog((message) => {
    appendLog(message);
  });

  window.qaApp.onProgress((progress) => {
    statusElement.textContent = `Progress: ${progress.current}/${progress.total}`;
  });
}

saveConfigButton.addEventListener('click', async () => {
  const config = getConfigFromForm();
  try {
    const savedPath = await window.qaApp.saveConfig(config);
    statusElement.textContent = `Config saved to: ${savedPath}`;
  } catch (error) {
    statusElement.textContent = `Save failed: ${error.message}`;
  }
});

openResultsButton.addEventListener('click', async () => {
  try {
    const folderPath = await window.qaApp.openResultsFolder();
    statusElement.textContent = `Opened results folder: ${folderPath}`;
  } catch (error) {
    statusElement.textContent = `Failed to open results folder: ${error.message}`;
  }
});

runButton.addEventListener('click', async () => {
  logsElement.textContent = '';
  statusElement.textContent = 'Running automation...';
  runButton.disabled = true;

  try {
    const selectedCountries = getSelectedCountries();
    const hasConfiguredProxies = parseCsv(proxiesElement.value).length > 0;
    if (selectedCountries.length === 1 && !hasConfiguredProxies) {
      await populateRandomProxiesForCountrySelection();
    }

    const config = getConfigFromForm();
    const result = await window.qaApp.runTests(config);
    if (!result.success) {
      statusElement.textContent = `Automation failed: ${result.error}`;
      appendLog(`Automation failed: ${result.error}`);
      return;
    }

    statusElement.textContent = `Completed ${result.total} submissions. Output: ${result.outputPath}`;
    appendLog(`Completed ${result.total} submissions. Output saved to ${result.outputPath}`);
  } catch (error) {
    statusElement.textContent = `Automation failed: ${error.message}`;
    appendLog(`Automation failed: ${error.message}`);
  } finally {
    runButton.disabled = false;
  }
});

initialize().catch((error) => {
  statusElement.textContent = `Initialization failed: ${error.message}`;
});
