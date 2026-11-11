const ExcelJS = require('exceljs');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');

const TEMPLATE_PATH = path.join(__dirname, '..', 'assets', 'MAU_BURN_TEST_REPORT.xlsx');
const LOG_START_ROW = 18;
const LOG_END_ROW = 69;
const LOG_GROUP_START_COLUMNS = [3, 9, 15];
const RESULT_LABELS = {
  PASS: 'Pass / Thông qua',
  FAIL: 'Failed / Thất bại'
};
const FIRST_PHOTO_AREAS = [
  { tl: { col: 6, row: 69 }, br: { col: 8, row: 73 } },
  { tl: { col: 12, row: 69 }, br: { col: 14, row: 73 } },
  { tl: { col: 18, row: 69 }, br: { col: 20, row: 73 } }
];
const EXTRA_PHOTO_ROW_START = 75;
const EXTRA_PHOTO_ROW_END = 79;

function valueOrBlank(value) {
  return value === null || value === undefined ? '' : value;
}

function dateLabel(value) {
  if (!value) return '';
  const text = String(value);
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : text;
}

function testDateTimeLabel(dateTime, fallbackDate, fallbackTime) {
  const text = String(dateTime || '');
  const dateTimeMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/);
  const date = dateTimeMatch
    ? `${dateTimeMatch[3]}/${dateTimeMatch[2]}/${dateTimeMatch[1]}`
    : dateLabel(fallbackDate).replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1');
  const timeSource = dateTimeMatch && dateTimeMatch[4] !== undefined
    ? `${dateTimeMatch[4]}:${dateTimeMatch[5]}`
    : String(fallbackTime || '');
  const timeMatch = timeSource.match(/^(\d{1,2}):(\d{2})/);
  if (!date || !timeMatch) return '';
  return `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]} - ${date}`;
}

function parseHour(label) {
  const text = String(label || '').trim();
  const colonTime = text.match(/^(\d{1,2}):(\d{2})$/);
  if (colonTime) return Number(colonTime[1]) + Number(colonTime[2]) / 60;
  const match = text.match(/(\d+(?:[.,]\d+)?)\s*(?:h|hr|hrs|hour|hours)?/i);
  return match ? Number(match[1].replace(',', '.')) : null;
}

function findFallbackRow(rowEntries) {
  for (let row = LOG_START_ROW; row <= LOG_END_ROW; row++) {
    if (!rowEntries.has(row)) return row;
  }
  return null;
}

function writeLog(sheet, row, groupIndex, log) {
  const column = LOG_GROUP_START_COLUMNS[groupIndex];
  sheet.getCell(row, column).value = valueOrBlank(log.wick_status);
  sheet.getCell(row, column + 1).value = valueOrBlank(log.flame_status);
  sheet.getCell(row, column + 2).value = valueOrBlank(log.wick_height_mm);
  sheet.getCell(row, column + 3).value = valueOrBlank(log.vessel_condition);

  const temperature = Number(log.temperature_c);
  if (log.temperature_c !== null && log.temperature_c !== undefined &&
      log.temperature_c !== '' && Number.isFinite(temperature)) {
    sheet.getCell(row, column + 4).value = temperature;
    sheet.getCell(row, column + 5).value = Number((temperature * 9 / 5 + 32).toFixed(1));
  }

  if (log.note) sheet.getCell(row, column + 3).note = `Ghi chú: ${log.note}`;
}

function fillLogs(sheet, logs) {
  const rowEntries = new Map();

  for (const log of logs || []) {
    const hour = parseHour(log.time_label);
    const preferredRow = Number.isInteger(hour) && hour >= 1 && hour <= 52
      ? LOG_START_ROW + hour - 1
      : null;
    let row = preferredRow;
    let entries = row === null ? null : rowEntries.get(row);

    if (row === null || (entries && entries.length >= LOG_GROUP_START_COLUMNS.length)) {
      row = findFallbackRow(rowEntries);
      if (row === null) {
        throw new Error('Mẫu báo cáo chỉ hỗ trợ tối đa 52 mốc thời gian và 3 log cho mỗi mốc.');
      }
      entries = null;
    }

    if (!entries) {
      entries = [];
      rowEntries.set(row, entries);
      const displayedTime = Number.isInteger(hour) && hour >= 1 && hour <= 52
        ? hour
        : String(log.time_label || '');
      sheet.getCell(row, 2).value = displayedTime;
    }

    const groupIndex = entries.length;
    writeLog(sheet, row, groupIndex, log);
    entries.push(log);
  }

}

function columnWidthInPixels(sheet, column) {
  const width = sheet.getColumn(column + 1).width || 8.43;
  return Math.floor(width * 7 + 5);
}

function rowHeightInPixels(sheet, row) {
  const height = sheet.getRow(row + 1).height || sheet.properties.defaultRowHeight || 15;
  return height * 96 / 72;
}

function axisPositionInPixels(sheet, axis, coordinate) {
  const wholeCells = Math.floor(coordinate);
  const fraction = coordinate - wholeCells;
  const dimension = axis === 'column' ? columnWidthInPixels : rowHeightInPixels;
  let pixels = 0;
  for (let index = 0; index < wholeCells; index++) {
    pixels += dimension(sheet, index);
  }
  return pixels + fraction * dimension(sheet, wholeCells);
}

function photoBoxSize(sheet, area) {
  return {
    width: axisPositionInPixels(sheet, 'column', area.br.col) -
      axisPositionInPixels(sheet, 'column', area.tl.col),
    height: axisPositionInPixels(sheet, 'row', area.br.row) -
      axisPositionInPixels(sheet, 'row', area.tl.row)
  };
}

function photoSize(sheet, area) {
  const { width, height } = photoBoxSize(sheet, area);
  const firstPhotoBox = photoBoxSize(sheet, FIRST_PHOTO_AREAS[0]);
  const referenceWidth = Math.min(firstPhotoBox.width, firstPhotoBox.height * 4 / 3);
  const targetWidth = Math.min(referenceWidth, width, height * 4 / 3);
  const pixelWidth = Math.floor(targetWidth / 4) * 4;
  return { width: pixelWidth, height: pixelWidth * 3 / 4 };
}

async function addPhoto(workbook, sheet, photo, area) {
  let buffer;
  if (photo.file_path) {
    buffer = await fs.readFile(photo.file_path);
  } else if (photo.file_url) {
    const response = await fetch(photo.file_url);
    if (!response.ok) throw new Error(`Tải ảnh báo cáo thất bại (${response.status})`);
    buffer = Buffer.from(await response.arrayBuffer());
  } else {
    throw new Error('Ảnh báo cáo không có đường dẫn file hoặc URL.');
  }

  const size = photoSize(sheet, area);
  if (!size.width || !size.height) throw new Error('Không đủ diện tích để chèn ảnh vào mẫu báo cáo.');
  const png = await sharp(buffer).rotate()
    .resize(size.width, size.height, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    })
    .png()
    .toBuffer();
  const imageId = workbook.addImage({ buffer: png, extension: 'png' });
  sheet.addImage(imageId, {
    tl: { col: area.tl.col, row: area.tl.row },
    ext: size,
    editAs: 'oneCell'
  });
}

function sheetNameForProductCode(value, testId) {
  const code = String(value || `Test-${testId}`)
    .replace(/[\\/*?:[\]]/g, '_')
    .replace(/^'+|'+$/g, '')
    .slice(0, 31)
    .trim();
  return code || `Test-${testId}`;
}

function getPhotoAreas(photoCount) {
  const areas = FIRST_PHOTO_AREAS.slice(0, Math.min(photoCount, FIRST_PHOTO_AREAS.length));
  const extraCount = Math.max(0, photoCount - FIRST_PHOTO_AREAS.length);
  if (!extraCount) return areas;

  const slotWidth = 20 / extraCount;
  for (let index = 0; index < extraCount; index++) {
    const left = index * slotWidth;
    areas.push({
      tl: { col: left, row: EXTRA_PHOTO_ROW_START },
      br: { col: left + slotWidth, row: EXTRA_PHOTO_ROW_END }
    });
  }

  return areas;
}

async function buildBurnTestReportWorkbook(test, { includePhotos = true } = {}) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(TEMPLATE_PATH);
  const sheet = workbook.getWorksheet('MAU') || workbook.worksheets[0];
  if (!sheet) throw new Error('Mẫu báo cáo không có worksheet để ghi dữ liệu.');
  sheet.name = sheetNameForProductCode(test.Product_Code || test.product_code, test.Id || test.id);

  sheet.getCell('C5').value = valueOrBlank(test.po_number);
  sheet.getCell('N5').value = valueOrBlank(test.Product_Code || test.product_code);
  sheet.getCell('C6').value = valueOrBlank(test.customer_name);
  sheet.getCell('N6').value = valueOrBlank(test.Diameter ?? test.diameter_mm);
  sheet.getCell('S6').value = valueOrBlank(test.Height ?? test.height_mm);
  sheet.getCell('C7').value = valueOrBlank(test.Frag ?? test.fragrance);
  sheet.getCell('N7').value = valueOrBlank(test.Temperature ?? test.temperature_c);
  sheet.getCell('C8').value = valueOrBlank(test.Color ?? test.color);
  sheet.getCell('N8').value = testDateTimeLabel(
    test.Start || test.start_datetime,
    test.Test_date || test.test_date,
    test.Time || test.test_time
  );
  sheet.getCell('C9').value = valueOrBlank(test.Wick ?? test.wick);
  //sheet.getCell('N9').value = valueOrBlank(test.Tester ?? test.tester);
  const result = String(test.result || '').toUpperCase();
  sheet.getCell('N10').value = result === 'PENDING'
    ? ''
    : RESULT_LABELS[result] || valueOrBlank(test.result);

  sheet.getCell('N11').value = '';
  sheet.getCell('D70').value = valueOrBlank(test.Total_Burn_Time ?? test.total_burn_time);
  sheet.getCell('D72').value = '';
  sheet.getCell('C76').value = testDateTimeLabel(
    test.Start || test.start_datetime,
    test.Test_date || test.test_date,
    test.Time || test.test_time
  );
  sheet.getCell('R76').value = testDateTimeLabel(test.End || test.end_datetime);

  const logs = Array.isArray(test.logs) ? test.logs : [];
  const heights = logs
    .filter(log => log.wick_height_mm !== null && log.wick_height_mm !== undefined && log.wick_height_mm !== '')
    .map(log => Number(log.wick_height_mm))
    .filter(Number.isFinite);
  sheet.getCell('D71').value = heights.length
    ? Number((heights.reduce((sum, height) => sum + height, 0) / heights.length).toFixed(2))
    : '';
  fillLogs(sheet, logs);

  const photos = includePhotos && Array.isArray(test.photos) ? test.photos : [];
  const photoAreas = getPhotoAreas(photos.length);
  for (let index = 0; index < photos.length; index++) {
    await addPhoto(workbook, sheet, photos[index], photoAreas[index]);
  }

  return workbook;
}

async function generateBurnTestReportXlsx(res, test, options = {}) {
  const workbook = await buildBurnTestReportWorkbook(test, options);
  await workbook.xlsx.write(res);
  res.end();
}

function printCellValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (value.richText) return value.richText.map(run => run.text).join('');
  if (value.text !== undefined) return String(value.text);
  if (value.result !== undefined) return value.result;
  throw new Error('Báo cáo có kiểu dữ liệu ô chưa được hỗ trợ để in bằng Excel.');
}

function changedReportCells(workbook, templateSheet) {
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('Báo cáo không có worksheet để in.');
  const cells = [];
  const mergedChildren = new Set();
  for (const merge of Object.values(sheet._merges)) {
    const { top, left, bottom, right } = merge.model;
    for (let row = top; row <= bottom; row++) {
      for (let column = left; column <= right; column++) {
        if (row !== top || column !== left) mergedChildren.add(`${row}:${column}`);
      }
    }
  }

  for (let row = 1; row <= Math.max(sheet.rowCount, templateSheet.rowCount); row++) {
    for (let column = 1; column <= Math.max(sheet.columnCount, templateSheet.columnCount); column++) {
      if (mergedChildren.has(`${row}:${column}`)) continue;
      const cell = sheet.getCell(row, column);
      const templateValue = templateSheet.getCell(row, column).value;
      if (JSON.stringify(cell.value) === JSON.stringify(templateValue)) continue;
      cells.push({ address: cell.address, value: printCellValue(cell.value) });
    }
  }

  return { sheetName: sheet.name, cells };
}

async function stopExcelProcesses(processIds) {
  if (!processIds.length) return;
  const command = `foreach ($processId in @(${processIds.join(',')})) { Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue }`;
  await new Promise((resolve, reject) => {
    const childProcess = spawn('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      command
    ], {
      windowsHide: true,
      stdio: 'ignore'
    });
    childProcess.once('error', reject);
    childProcess.once('close', () => resolve());
  });
}

async function generateBurnTestReportsPdfAttempt(workbooks) {
  if (!Array.isArray(workbooks) || !workbooks.length) {
    throw new Error('Không có báo cáo để in.');
  }
  if (process.platform !== 'win32') {
    throw new Error('In báo cáo giống Excel yêu cầu Microsoft Excel trên máy chủ Windows.');
  }

  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'burn-test-print-'));
  let operationError;
  try {
    const templateWorkbook = new ExcelJS.Workbook();
    await templateWorkbook.xlsx.readFile(TEMPLATE_PATH);
    const templateSheet = templateWorkbook.getWorksheet('MAU') || templateWorkbook.worksheets[0];
    if (!templateSheet) throw new Error('Mẫu báo cáo không có worksheet để in.');
    const reports = workbooks.map(workbook => changedReportCells(workbook, templateSheet));
    const dataPath = path.join(temporaryDirectory, 'report-data.json');
    const pdfPath = path.join(temporaryDirectory, 'report.pdf');
    const combinedPath = path.join(temporaryDirectory, 'combined.xlsx');
    const processIdPath = path.join(temporaryDirectory, 'excel-process-id.txt');
    await fs.writeFile(dataPath, JSON.stringify(reports), 'utf8');
    await fs.copyFile(TEMPLATE_PATH, combinedPath);
    const script = `
$ErrorActionPreference = 'Stop'
$excel = $null
$combined = $null
$excelLauncher = $null
$ownsExcelInstance = $false
try {
  $reports = @([System.IO.File]::ReadAllText($env:BURN_TEST_REPORT_DATA, [System.Text.Encoding]::UTF8) | ConvertFrom-Json)
  $existingExcelProcessIds = @(Get-Process EXCEL -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
  Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class BurnTestExcelProcess { [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId); }'
  $excelPath = (Get-Item 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\excel.exe' -ErrorAction Stop).GetValue('')
  if (-not $excelPath -or -not (Test-Path -LiteralPath $excelPath)) {
    throw 'Microsoft Excel executable was not found.'
  }
  $excelLauncher = Start-Process -FilePath $excelPath -ArgumentList @('/x', ('"' + $env:BURN_TEST_REPORT_COMBINED + '"')) -PassThru
  [System.IO.File]::WriteAllText($env:BURN_TEST_REPORT_EXCEL_PID, [string]$excelLauncher.Id)
  for ($attempt = 0; $attempt -lt 50; $attempt++) {
    try {
      $combined = [Runtime.InteropServices.Marshal]::BindToMoniker($env:BURN_TEST_REPORT_COMBINED)
      if ($combined) {
        break
      }
    } catch {
      if ($attempt -eq 49) {
        throw 'Microsoft Excel did not open the isolated report workbook.'
      }
      Start-Sleep -Milliseconds 100
    }
  }
  if (-not $combined) {
    throw 'Microsoft Excel did not open the isolated report workbook.'
  }
  $excel = $combined.Application
  [uint32]$excelProcessId = 0
  [void][BurnTestExcelProcess]::GetWindowThreadProcessId([IntPtr]$excel.Hwnd, [ref]$excelProcessId)
  if ($excelProcessId -le 0) {
    throw 'Unable to identify the Microsoft Excel report process.'
  }
  if ($existingExcelProcessIds -contains [int]$excelProcessId) {
    $combined.Close($false)
    [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($combined)
    $combined = $null
    [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($excel)
    $excel = $null
    throw 'Microsoft Excel did not start an isolated report process.'
  }
  $ownsExcelInstance = $true
  $processIds = @([int]$excelLauncher.Id, [int]$excelProcessId) | Select-Object -Unique
  [System.IO.File]::WriteAllText($env:BURN_TEST_REPORT_EXCEL_PID, ($processIds -join ','))
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $sheet = $combined.Worksheets.Item(1)
  foreach ($cell in $reports[0].cells) {
    $target = $sheet.Range([string]$cell.address)
    if ($cell.value -is [string]) {
      $target.Value2 = "'" + [string]$cell.value
    } elseif ($cell.value -is [bool]) {
      $target.Value2 = [bool]$cell.value
    } else {
      $target.Value2 = [double]$cell.value
    }
    [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($target)
  }
  $sheet.Name = 'Print_1'
  [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($sheet)
  $sheet = $null

  $combined.ExportAsFixedFormat(0, $env:BURN_TEST_REPORT_OUTPUT)
  if (-not (Test-Path -LiteralPath $env:BURN_TEST_REPORT_OUTPUT)) {
    throw 'Excel did not create the report PDF.'
  }
} catch {
  [Console]::Error.WriteLine($_.Exception.ToString())
  exit 1
} finally {
  if ($combined) {
    $combined.Close($false)
    [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($combined)
  }
  if ($excel) {
    if ($ownsExcelInstance) {
      $excel.Quit()
    }
    [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($excel)
  }
  if ($excelLauncher -and -not $ownsExcelInstance) {
    Stop-Process -Id $excelLauncher.Id -Force -ErrorAction SilentlyContinue
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}`;
    const encodedScript = Buffer.from(script, 'utf16le').toString('base64');
    const processResult = await new Promise((resolve, reject) => {
      const childProcess = spawn('powershell.exe', [
        '-NoProfile',
        '-STA',
        '-EncodedCommand',
        encodedScript
      ], {
        windowsHide: true,
        env: {
          ...process.env,
          BURN_TEST_REPORT_DATA: dataPath,
          BURN_TEST_REPORT_TEMPLATE: TEMPLATE_PATH,
          BURN_TEST_REPORT_COMBINED: combinedPath,
          BURN_TEST_REPORT_OUTPUT: pdfPath,
          BURN_TEST_REPORT_EXCEL_PID: processIdPath
        },
        stdio: ['ignore', 'pipe', 'pipe']
      });
      let stdout = '';
      let stderr = '';
      childProcess.stdout.setEncoding('utf8');
      childProcess.stdout.on('data', chunk => { stdout += chunk; });
      childProcess.stderr.setEncoding('utf8');
      childProcess.stderr.on('data', chunk => { stderr += chunk; });
      childProcess.once('error', reject);
      childProcess.once('close', code => resolve({ code, stdout, stderr }));
    });

    let processIdText = null;
    try {
      processIdText = await fs.readFile(processIdPath, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const excelProcessIds = processIdText
      ? [...new Set(processIdText.split(',').map(Number).filter(processId =>
        Number.isSafeInteger(processId) && processId > 0))]
      : [];
    let pdfError = processResult.code === 0
      ? null
      : new Error(processResult.stderr.trim() || `Excel PDF export exited with code ${processResult.code}.`);
    try {
      if (!pdfError) {
        let previousSize = -1;
        let stableReads = 0;
        for (let attempt = 0; attempt < 100; attempt++) {
          try {
            const stats = await fs.stat(pdfPath);
            stableReads = stats.size > 0 && stats.size === previousSize ? stableReads + 1 : 0;
            previousSize = stats.size;
            if (stableReads >= 2) break;
          } catch (error) {
            if (error.code !== 'ENOENT') throw error;
          }
          await new Promise(resolve => setTimeout(resolve, 100));
          if (attempt === 99) {
            const details = [processResult.stderr, processResult.stdout]
              .map(output => output.trim())
              .filter(Boolean)
              .join(' ')
              .slice(0, 1500);
            throw new Error(`Excel did not create the report PDF${details ? ` (${details})` : ''}.`);
          }
        }
      }
    } catch (error) {
      pdfError = error;
    }

    try {
      await stopExcelProcesses(excelProcessIds);
    } catch (error) {
      if (!pdfError) throw error;
    }
    for (const excelProcessId of excelProcessIds) {
      try {
        for (let attempt = 0; attempt < 50; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 100));
          try {
            process.kill(excelProcessId, 0);
          } catch (error) {
            if (error.code === 'ESRCH') break;
            throw error;
          }
          if (attempt === 49) throw new Error('Microsoft Excel did not close after exporting the report.');
        }
      } catch (error) {
        if (error.code !== 'ESRCH' && !pdfError) throw error;
      }
    }
    if (pdfError) throw pdfError;

    const pdf = await fs.readFile(pdfPath);
    if (pdf.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new Error('Excel did not create a valid report PDF.');
    }
    return pdf;
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    try {
      await fs.rm(temporaryDirectory, { recursive: true, force: true });
    } catch (cleanupError) {
      if (!operationError) throw cleanupError;
    }
  }
}

async function generateBurnTestReportsPdf(workbooks) {
  if (!Array.isArray(workbooks) || !workbooks.length) {
    throw new Error('Không có báo cáo để in.');
  }
  const mergedPdf = await PDFDocument.create();
  for (const workbook of workbooks) {
    let reportPdf;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        reportPdf = await generateBurnTestReportsPdfAttempt([workbook]);
        break;
      } catch (error) {
        if (attempt === 2 || !/0x800A03EC|did not create the report PDF|isolated Excel automation process|isolated report process|Unable to identify the Microsoft Excel report process/i.test(error.message)) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    const sourcePdf = await PDFDocument.load(reportPdf);
    const pages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
    pages.forEach(page => mergedPdf.addPage(page));
  }
  if (mergedPdf.getPageCount() < workbooks.length) {
    throw new Error('The printable PDF is missing one or more selected reports.');
  }
  return Buffer.from(await mergedPdf.save());
}

module.exports = {
  buildBurnTestReportWorkbook,
  generateBurnTestReportXlsx,
  generateBurnTestReportsPdf
};
