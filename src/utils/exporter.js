const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

// Generates Excel buffer
const exportExcel = async (title, headers, rows) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(title);

  // Styling header row
  worksheet.addRow(headers);
  const headerRow = worksheet.getRow(1);
  headerRow.font = { name: 'Arial', family: 4, size: 11, bold: true, color: { argb: 'FFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: '4F46E5' } // Premium violet color
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  
  // Adding rows
  rows.forEach(row => {
    worksheet.addRow(row);
  });

  // Adjust column widths automatically
  worksheet.columns.forEach(column => {
    let maxLen = 0;
    column.eachCell({ includeEmpty: true }, (cell) => {
      const len = cell.value ? cell.value.toString().length : 0;
      if (len > maxLen) maxLen = len;
    });
    column.width = Math.max(maxLen + 4, 12);
  });

  return await workbook.xlsx.writeBuffer();
};

// Generates CSV string
const exportCSV = (headers, rows) => {
  const headLine = headers.map(h => `"${h.replace(/"/g, '""')}"`).join(',');
  const rowLines = rows.map(row => 
    row.map(val => {
      const str = val === null || val === undefined ? '' : val.toString();
      return `"${str.replace(/"/g, '""')}"`;
    }).join(',')
  );
  return [headLine, ...rowLines].join('\n');
};

// Generates PDF buffer
const exportPDF = (title, headers, rows) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', err => reject(err));

    // Header Title
    doc.fillColor('#1E1B4B').fontSize(20).text(title, { align: 'center' });
    doc.moveDown(0.5);
    doc.strokeColor('#E2E8F0').lineWidth(1).moveTo(40, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(1.5);

    // Simple Table Grid
    let currentY = doc.y;
    const colWidth = 510 / headers.length;

    // Draw headers
    doc.fillColor('#4F46E5').fontSize(10);
    headers.forEach((header, index) => {
      doc.text(header, 40 + index * colWidth, currentY, { width: colWidth - 5, align: 'left', bold: true });
    });
    doc.moveDown(0.5);
    
    doc.strokeColor('#CBD5E1').lineWidth(0.5).moveTo(40, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.5);

    // Draw rows
    doc.fillColor('#334155').fontSize(9);
    rows.forEach(row => {
      currentY = doc.y;
      
      // Check if page overflow is imminent
      if (currentY > 750) {
        doc.addPage();
        currentY = 40;
      }

      row.forEach((val, index) => {
        const text = val === null || val === undefined ? '-' : val.toString();
        doc.text(text, 40 + index * colWidth, currentY, { width: colWidth - 5, align: 'left' });
      });

      doc.moveDown(0.5);
      doc.strokeColor('#F1F5F9').lineWidth(0.5).moveTo(40, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.4);
    });

    doc.end();
  });
};

module.exports = {
  exportExcel,
  exportCSV,
  exportPDF
};
