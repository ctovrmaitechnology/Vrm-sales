const xlsx = require('xlsx');

function sendTemplate(res, { filename, sheetName, columns, assignedUserName }) {
  const workbook = xlsx.utils.book_new();
  const defaultRow = columns.map((column) =>
    column.trim().toLowerCase().replace(/[\s-]+/g, '_') === 'assigned_user_name'
      ? assignedUserName
      : ''
  );
  const dataSheet = xlsx.utils.aoa_to_sheet([columns, defaultRow]);
  const instructionsSheet = xlsx.utils.aoa_to_sheet([
    ['Selected user', assignedUserName],
    ['Instructions', 'Add one contact per row. The first data row has the selected user prefilled; copy that cell down for additional rows.'],
    ['Per-row assignment', 'Change Assigned User Name on a row to assign it to another active user.'],
    ['Required field', 'Full Name'],
    ['Optional fields', 'Email, phone numbers, company, role, links, source, note, and address'],
  ]);
  xlsx.utils.book_append_sheet(workbook, dataSheet, sheetName);
  xlsx.utils.book_append_sheet(workbook, instructionsSheet, 'Instructions');
  const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}

function readImportRows(buffer) {
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('The workbook does not contain a worksheet.');

  return xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
    defval: '',
    raw: false,
  });
}

function normalizeImportRow(row) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.trim().toLowerCase().replace(/[\s-]+/g, '_'),
      value,
    ])
  );
}

function getImportText(row, ...keys) {
  const key = keys.find((candidate) => row[candidate] !== undefined);
  if (key === undefined || row[key] === null) return '';
  return String(row[key]).trim();
}

function normalizeImportEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeImportPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function createDuplicateTracker(records, emailField, phoneFields) {
  const emails = new Set();
  const phones = new Set();
  for (const record of records) {
    const email = normalizeImportEmail(record[emailField]);
    if (email) emails.add(email);
    for (const field of phoneFields) {
      const phone = normalizeImportPhone(record[field]);
      if (phone) phones.add(phone);
    }
  }

  return {
    find(emailValue, phoneValues) {
      const email = normalizeImportEmail(emailValue);
      if (email && emails.has(email)) return 'email';
      for (const value of phoneValues) {
        const phone = normalizeImportPhone(value);
        if (phone && phones.has(phone)) return 'phone';
      }
      return '';
    },
    remember(emailValue, phoneValues) {
      const email = normalizeImportEmail(emailValue);
      if (email) emails.add(email);
      for (const value of phoneValues) {
        const phone = normalizeImportPhone(value);
        if (phone) phones.add(phone);
      }
    },
  };
}

function startImportProgress(res, total) {
  res.status(200);
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  res.write(`${JSON.stringify({ type: 'start', total })}\n`);
}

function writeImportProgress(res, processed, total) {
  if (res.destroyed || res.writableEnded) return;
  res.write(`${JSON.stringify({ type: 'progress', processed, total })}\n`);
}

function finishImportProgress(res, result) {
  if (res.destroyed || res.writableEnded) return;
  res.write(`${JSON.stringify({ type: 'complete', result })}\n`);
  res.end();
}

function failImportProgress(res, error) {
  if (res.destroyed || res.writableEnded) return;
  if (res.headersSent) {
    res.write(`${JSON.stringify({ type: 'error', error })}\n`);
    res.end();
    return;
  }
  res.status(400).json({ error });
}

module.exports = {
  sendTemplate,
  readImportRows,
  normalizeImportRow,
  getImportText,
  normalizeImportEmail,
  normalizeImportPhone,
  createDuplicateTracker,
  startImportProgress,
  writeImportProgress,
  finishImportProgress,
  failImportProgress,
};
