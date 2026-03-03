const path = require('path');

function getAppRoot() {
  // In pkg builds, use the executable directory so external config files are discoverable.
  if (process.pkg) {
    return path.dirname(process.execPath);
  }

  return process.cwd();
}

module.exports = {
  getAppRoot
};
