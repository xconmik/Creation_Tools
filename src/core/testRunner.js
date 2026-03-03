const { getProxyForIndex, getRotatingValue } = require('../proxy/proxyHandler');
const { generateRandomEmail } = require('../utils/emailGenerator');
const { buildTargetUrlForEmail } = require('../utils/targetUrlGenerator');
const { runRegistrationFormTest } = require('../automation/formAutomation');
const { exportResultsToExcel } = require('../exporters/excelExporter');

async function runTestsWithConfig(config, options = {}) {
  const { onLog, onProgress, outputFileName = 'results.xlsx' } = options;
  const results = [];

  const log = (message) => {
    if (typeof onLog === 'function') {
      onLog(message);
    }
  };

  const projectName = config.projectName || 'default-project';
  const allowedCountries = Array.isArray(config.allowedCountries) ? config.allowedCountries : [];
  const strictGeoMode = config.strictGeoMode === true;
  const geoLookupAttempts = Math.max(1, Number(config.geoLookupAttempts) || 1);
  log(`Starting project "${projectName}" with ${config.testSubmissions} submission(s) for: ${config.targetUrl}`);
  if (allowedCountries.length > 0) {
    log(`Allowed egress countries: ${allowedCountries.join(', ')}`);
    log(`Geo mode: ${strictGeoMode ? 'strict' : 'relaxed'} (${geoLookupAttempts} lookup attempt(s))`);
  }

  for (let index = 0; index < config.testSubmissions; index += 1) {
    const email = generateRandomEmail(config.emailDomains);
    const headerIp = getRotatingValue(config.headerIps, index);
    const targetUrlForTest = buildTargetUrlForEmail(config.targetUrl, email);
    const timestamp = new Date().toISOString();
    const testNumber = index + 1;

    log(`Running submission ${testNumber}/${config.testSubmissions} with email: ${email}`);
    log(`Generated link: ${targetUrlForTest}`);

    const proxyAttempts = Array.isArray(config.proxies) && config.proxies.length > 0
      ? Math.min(config.proxies.length, 8)
      : 1;

    let executionResult;
    for (let proxyAttempt = 0; proxyAttempt < proxyAttempts; proxyAttempt += 1) {
      const proxy = getProxyForIndex(config.proxies, index + proxyAttempt);

      if (proxy && proxyAttempts > 1) {
        log(`Submission ${testNumber}: trying proxy ${proxyAttempt + 1}/${proxyAttempts} -> ${proxy.raw}`);
      }

      executionResult = await runRegistrationFormTest({
        targetUrl: targetUrlForTest,
        formConfig: config.registrationForm,
        headless: config.headless,
        allowedCountries,
        strictGeoMode,
        geoLookupAttempts,
        email,
        proxy,
        headerIp,
        onStep: (message) => log(`Submission ${testNumber}: ${message}`)
      });

      if (executionResult.status === 'success') {
        break;
      }

      const geoMismatchOrUnknown = /not in allowed list|unable to determine egress country/i.test(executionResult.error || '');
      const shouldRetryWithAnotherProxy = proxyAttempt < proxyAttempts - 1 && geoMismatchOrUnknown;

      if (!shouldRetryWithAnotherProxy) {
        break;
      }

      log(`Submission ${testNumber}: strict geo check failed; rotating to next proxy...`);
    }

    const resultRow = {
      email,
      website: targetUrlForTest,
      proxyUsed: executionResult.proxyUsed,
      headerIpUsed: executionResult.headerIpUsed,
      egressIp: executionResult.egressIp || 'Unknown',
      egressCountry: executionResult.egressCountry || 'Unknown',
      egressCountryCode: executionResult.egressCountryCode || 'Unknown',
      status: executionResult.status,
      timestamp
    };

    results.push(resultRow);

    if (executionResult.error) {
      log(`Submission ${testNumber} failed: ${executionResult.error}`);
    }

    if (typeof onProgress === 'function') {
      onProgress({
        current: testNumber,
        total: config.testSubmissions,
        row: resultRow
      });
    }
  }

  const outputPath = await exportResultsToExcel(results, outputFileName);
  log(`Project run completed. Results exported to: ${outputPath}`);

  return {
    results,
    outputPath
  };
}

module.exports = {
  runTestsWithConfig
};
