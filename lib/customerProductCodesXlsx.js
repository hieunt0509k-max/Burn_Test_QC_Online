const ExcelJS = require('exceljs');
const path = require('path');
const { prepare } = require('../database/database');

const TEMPLATE_PATH = path.join(__dirname, '..', 'assets', 'po-sku.xlsx');
const TEMPLATE_ROWS_PER_PAGE = 11;
const LABEL_ROWS_PER_PAGE = 6;

function safeFilePart(value) {
  return String(value || 'san-pham').replace(/[\\/:*?"<>|]/g, '_').trim() || 'san-pham';
}

function setDownloadHeaders(res, filename) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
}

async function buildCustomerProductCodesWorkbook(products) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(TEMPLATE_PATH);
  const sheet = workbook.getWorksheet('IN PO-SKU');
  if (!sheet) throw new Error('File mẫu PO-SKU không có sheet IN PO-SKU');

  const pageCount = Math.max(1, Math.ceil(products.length / LABEL_ROWS_PER_PAGE));
  for (let page = 1; page < pageCount; page++) {
    const rowOffset = page * TEMPLATE_ROWS_PER_PAGE;
    for (let rowNumber = 1; rowNumber <= TEMPLATE_ROWS_PER_PAGE; rowNumber++) {
      const sourceRow = sheet.getRow(rowNumber);
      const targetRow = sheet.getRow(rowOffset + rowNumber);
      targetRow.height = sourceRow.height;
      for (let columnNumber = 1; columnNumber <= 4; columnNumber++) {
        const sourceCell = sourceRow.getCell(columnNumber);
        const targetCell = targetRow.getCell(columnNumber);
        targetCell.value = sourceCell.value;
        targetCell.style = structuredClone(sourceCell.style);
      }
    }
  }

  products.forEach((product, index) => {
    const pageIndex = Math.floor(index / LABEL_ROWS_PER_PAGE);
    const labelIndex = index % LABEL_ROWS_PER_PAGE;
    const rowNumber = pageIndex * TEMPLATE_ROWS_PER_PAGE + labelIndex * 2 + 1;
    sheet.getCell(rowNumber, 2).value = product.customer_po_code || '';
    sheet.getCell(rowNumber, 4).value = product.customer_code || '';
  });

  for (let page = 1; page < pageCount; page++) {
    sheet.getRow(page * TEMPLATE_ROWS_PER_PAGE).addPageBreak();
  }
  sheet.pageSetup.fitToPage = true;
  sheet.pageSetup.fitToWidth = 1;
  sheet.pageSetup.fitToHeight = 0;
  sheet.pageSetup.printArea = `A1:D${pageCount * TEMPLATE_ROWS_PER_PAGE}`;

  workbook.creator = 'Burn Test QC';
  workbook.created = new Date();
  return workbook;
}

async function writeCustomerProductCodes(res, products, filename) {
  if (!products.length) throw new Error('Không tìm thấy sản phẩm có mã để in');
  const workbook = await buildCustomerProductCodesWorkbook(products);
  setDownloadHeaders(res, filename);
  await workbook.xlsx.write(res);
  res.end();
}

async function generateCustomerProductCodesXlsxForIds(res, ids) {
  const uniqueIds = [...new Set((ids || []).map(Number).filter(id => Number.isInteger(id) && id > 0))];
  if (!uniqueIds.length) throw new Error('Chưa chọn sản phẩm để in mã');
  const products = prepare(`SELECT p.id, p.customer_po_code, p.customer_code, po.po_number
    FROM products p
    JOIN purchase_orders po ON po.id = p.order_id
    WHERE p.id IN (${uniqueIds.map(() => '?').join(',')})
    ORDER BY po.po_number COLLATE NOCASE, p.product_code COLLATE NOCASE`).all(...uniqueIds);
  const filename = `${safeFilePart(products[0]?.po_number || 'selected')}_Ma_PO_Khach_SKU.xlsx`;
  await writeCustomerProductCodes(res, products, filename);
}

async function generateCustomerProductCodesXlsxForPoIds(res, poIds) {
  const uniqueIds = [...new Set((poIds || []).map(Number).filter(id => Number.isInteger(id) && id > 0))];
  if (!uniqueIds.length) throw new Error('PO không hợp lệ');
  const products = prepare(`SELECT p.id, p.customer_po_code, p.customer_code, po.po_number
    FROM products p
    JOIN purchase_orders po ON po.id = p.order_id
    WHERE p.order_id IN (${uniqueIds.map(() => '?').join(',')})
    ORDER BY po.po_number COLLATE NOCASE, p.product_code COLLATE NOCASE`).all(...uniqueIds);
  const filename = `${safeFilePart(uniqueIds.length === 1 ? products[0]?.po_number : 'multi_po')}_Ma_PO_Khach_SKU.xlsx`;
  await writeCustomerProductCodes(res, products, filename);
}

module.exports = {
  generateCustomerProductCodesXlsxForIds,
  generateCustomerProductCodesXlsxForPoIds
};
