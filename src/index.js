const { loadConfig } = require('./config/configLoader');
const { runTestsWithConfig } = require('./core/testRunner');

async function run() {
  try {
    // Load and validate project configuration.
    const config = loadConfig();
    await runTestsWithConfig(config, {
      onLog: (message) => console.log(message),
      outputFileName: 'results.xlsx'
    });
  } catch (error) {
    console.error(`Fatal error: ${error.message}`);
    process.exitCode = 1;
  }
}

run();
