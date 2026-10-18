const fs = require('fs');
const path = require('path');
const { prepare } = require('../database/database');

function getSettings() {
  const rows = prepare('SELECT key,value FROM app_settings').all();
  const s = {}; rows.forEach(r => s[r.key] = r.value || '');
  return s;
}
function getBrand() {
  const s = getSettings();
  const logo = s.report_logo_path && fs.existsSync(s.report_logo_path) ? s.report_logo_path : null;
  return {
    company: s.company_name || s.company || '',
    factory: s.factory_name || s.factory || '',
    address: s.address || '',
    title: s.report_title || 'BURN TEST QC REPORT',
    footer: s.report_footer || '',
    prepared: s.report_prepared || '',
    approved: s.report_approved || '',
    showChart: s.report_chart !== '0',
    showSignature: s.report_signature !== '0',
    showPhotos: s.report_photos !== '0',
    logo
  };
}
module.exports = { getSettings, getBrand };
