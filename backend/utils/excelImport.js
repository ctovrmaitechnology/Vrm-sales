const xlsx = require('xlsx');

function sendTemplate(res, { filename, sheetName, columns, assignedUserName, source }) {
  const workbook = xlsx.utils.book_new();
  const defaultRow = columns.map((column) => {
    const key = column.trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (key === 'assigned_user_name') return assignedUserName || '';
    if (key === 'source') return source || '';
    return '';
  });
  const dataSheet = xlsx.utils.aoa_to_sheet([columns, defaultRow]);
  const instructionsSheet = xlsx.utils.aoa_to_sheet([
    ['Field', 'Value'],
    ['Source', source || ''],
    ['Assigned User', assignedUserName || ''],
    ['Selected user', assignedUserName || ''],
    ['Selected source', source || ''],
    ['Instructions', 'Add one contact per row. The first data row has the selected user and source prefilled; copy those cells down for additional rows.'],
    ['Per-row assignment', 'Change Assigned User Name on a row to assign it to another active user.'],
    ['Source field', 'Source can be specified per row, or kept as the prefilled source.'],
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

  const sheet = workbook.Sheets[sheetName];
  const formattedRows = xlsx.utils.sheet_to_json(sheet, {
    defval: '',
    raw: false,
  });
  const rawRows = xlsx.utils.sheet_to_json(sheet, {
    defval: '',
    raw: true,
  });

  return formattedRows.map((row, index) => {
    const rawRow = rawRows[index] || {};
    for (const key of Object.keys(row)) {
      const normalizedKey = key.trim().toLowerCase().replace(/[\s-]+/g, '_');
      if (
        ['phone', 'phone_number', 'whatsapp_number'].includes(normalizedKey) &&
        typeof rawRow[key] === 'number' &&
        Number.isFinite(rawRow[key])
      ) {
        row[key] = String(rawRow[key]);
      }
    }
    return row;
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

function expandScientificNotation(value) {
  const text = String(value || '').trim();
  const match = text.match(/^([+-]?)(\d+)(?:\.(\d*))?[eE]([+-]?\d+)$/);
  if (!match) return text;

  const exponent = Number(match[4]);
  if (!Number.isInteger(exponent) || Math.abs(exponent) > 30) return text;

  const sign = match[1];
  const integer = match[2];
  const fraction = match[3] || '';
  const digits = integer + fraction;
  const decimalPosition = integer.length + exponent;

  if (decimalPosition <= 0) {
    return `${sign}0.${'0'.repeat(-decimalPosition)}${digits}`;
  }
  if (decimalPosition >= digits.length) {
    return `${sign}${digits}${'0'.repeat(decimalPosition - digits.length)}`;
  }
  return `${sign}${digits.slice(0, decimalPosition)}.${digits.slice(decimalPosition)}`;
}

function getImportPhoneText(row, ...keys) {
  const key = keys.find((candidate) => row[candidate] !== undefined);
  if (key === undefined || row[key] === null) return '';
  return expandScientificNotation(row[key]);
}

function normalizeImportEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeImportPhone(value) {
  const digits = expandScientificNotation(value).replace(/\D/g, '');
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
  getImportPhoneText,
  expandScientificNotation,
  normalizeImportEmail,
  normalizeImportPhone,
  createDuplicateTracker,
  startImportProgress,
  writeImportProgress,
  finishImportProgress,
  failImportProgress,
};
