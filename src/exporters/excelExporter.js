const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { getAppRoot } = require('../utils/runtimePaths');

async function exportResultsToExcel(results, outputFileName = 'results.xlsx') {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('QA Results');

  // Define worksheet columns requested for export.
  worksheet.columns = [
    { header: 'Email', key: 'email', width: 35 },
    { header: 'Website', key: 'website', width: 35 },
    { header: 'Proxy Used', key: 'proxyUsed', width: 25 },
    { header: 'Header IP Used', key: 'headerIpUsed', width: 20 },
    { header: 'Egress IP', key: 'egressIp', width: 20 },
    { header: 'Egress Country', key: 'egressCountry', width: 20 },
    { header: 'Egress Country Code', key: 'egressCountryCode', width: 20 },
    { header: 'Status', key: 'status', width: 15 },
    { header: 'Timestamp', key: 'timestamp', width: 28 }
  ];

  results.forEach((row) => {
    worksheet.addRow({
      email: row.email,
      website: row.website,
      proxyUsed: row.proxyUsed,
      headerIpUsed: row.headerIpUsed,
      egressIp: row.egressIp,
      egressCountry: row.egressCountry,
      egressCountryCode: row.egressCountryCode,
      status: row.status,
      timestamp: row.timestamp
    });
  });

  const outputPath = path.resolve(getAppRoot(), outputFileName);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  await workbook.xlsx.writeFile(outputPath);
  return outputPath;
}

module.exports = {
  exportResultsToExcel
};
