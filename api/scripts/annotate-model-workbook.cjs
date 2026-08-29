const fs = require('node:fs');
const path = require('node:path');
const ExcelJS = require('exceljs');

const apiDir = path.resolve(__dirname, '..');
const workspaceDir = path.resolve(apiDir, '..');
const documentDir = path.join(workspaceDir, 'document');
const workbookPath = path.join(documentDir, 'DCTD-UTC-V1-database-model-review.xlsx');
const changeLogPath = path.join(documentDir, '11-model-change-log.json');

const redFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
const redFont = { color: { argb: 'FF9C0006' }, bold: true };
const redBorder = {
  top: { style: 'thin', color: { argb: 'FFE06666' } },
  left: { style: 'thin', color: { argb: 'FFE06666' } },
  bottom: { style: 'thin', color: { argb: 'FFE06666' } },
  right: { style: 'thin', color: { argb: 'FFE06666' } },
};

function applyRedStyle(cell) {
  const baseStyle = structuredClone(cell.style ?? {});
  cell.style = {
    ...baseStyle,
    fill: structuredClone(redFill),
    font: { ...(baseStyle.font ?? {}), ...structuredClone(redFont) },
    border: structuredClone(redBorder),
  };
}

function displayValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && 'text' in value) return String(value.text);
  return String(value);
}

function headerMap(worksheet) {
  const headers = new Map();
  worksheet.getRow(1).eachCell((cell, columnNumber) => {
    headers.set(displayValue(cell.value).trim(), columnNumber);
  });
  return headers;
}

function matchesRow(row, headers, match) {
  return Object.entries(match).every(([header, expected]) => {
    const column = headers.get(header);
    if (!column) throw new Error(`Missing header "${header}" in sheet "${row.worksheet.name}"`);
    const actual = displayValue(row.getCell(column).value).trim();
    const accepted = Array.isArray(expected) ? expected : [expected];
    return accepted.map(String).includes(actual);
  });
}

function noteFor(change) {
  return [
    `${change.id} · ${change.date} · ${change.scope}`,
    change.summary,
    `Sources: ${change.sources.join(', ')}`,
  ].join('\n');
}

function markTarget(workbook, change, target) {
  const worksheet = workbook.getWorksheet(target.sheet);
  if (!worksheet) throw new Error(`Missing target sheet "${target.sheet}" for ${change.id}`);
  const headers = headerMap(worksheet);
  const rows = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1 && matchesRow(row, headers, target.match)) rows.push(row);
  });
  if (rows.length === 0) {
    throw new Error(`No row matched ${JSON.stringify(target.match)} in "${target.sheet}" for ${change.id}`);
  }
  const columns = target.columns === '*'
    ? [...headers.keys()]
    : target.columns;
  const updates = target.set ?? {};
  for (const header of columns) {
    if (!headers.has(header)) throw new Error(`Missing changed column "${header}" in "${target.sheet}" for ${change.id}`);
  }
  for (const header of Object.keys(updates)) {
    if (!headers.has(header)) throw new Error(`Missing update column "${header}" in "${target.sheet}" for ${change.id}`);
    if (!columns.includes(header)) throw new Error(`Updated column "${header}" must also be listed in columns for ${change.id}`);
  }
  for (const row of rows) {
    for (const header of columns) {
      const cell = row.getCell(headers.get(header));
      if (Object.hasOwn(updates, header)) cell.value = updates[header];
      applyRedStyle(cell);
      cell.note = noteFor(change);
    }
  }
  return rows.length * columns.length;
}

function rebuildChangeLog(workbook, changes) {
  const existing = workbook.getWorksheet('Change Log');
  if (existing) workbook.removeWorksheet(existing.id);
  const worksheet = workbook.addWorksheet('Change Log', { views: [{ state: 'frozen', ySplit: 1 }] });
  worksheet.columns = [
    { header: 'Change ID', key: 'id', width: 24 },
    { header: 'Ngày', key: 'date', width: 14 },
    { header: 'Scope', key: 'scope', width: 16 },
    { header: 'Tóm tắt / Note', key: 'summary', width: 70 },
    { header: 'Nguồn trace', key: 'sources', width: 85 },
    { header: 'Workbook targets', key: 'targets', width: 70 },
  ];
  worksheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };
  worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
  for (const change of changes) {
    const row = worksheet.addRow({
      id: change.id,
      date: change.date,
      scope: change.scope,
      summary: change.summary,
      sources: change.sources.join('\n'),
      targets: change.targets.map((target) => `${target.sheet}: ${JSON.stringify(target.match)} → ${target.columns === '*' ? '*' : target.columns.join(', ')}`).join('\n') || 'API-only; no table cell',
    });
    row.eachCell((cell) => {
      applyRedStyle(cell);
      cell.alignment = { vertical: 'top', wrapText: true };
      cell.note = noteFor(change);
    });
  }
  worksheet.autoFilter = { from: 'A1', to: 'F1' };
}

async function main() {
  if (!fs.existsSync(workbookPath)) throw new Error(`Workbook not found: ${workbookPath}`);
  const payload = JSON.parse(fs.readFileSync(changeLogPath, 'utf8'));
  if (payload.version !== 1 || !Array.isArray(payload.changes)) {
    throw new Error('11-model-change-log.json must contain version=1 and a changes array');
  }
  const ids = new Set();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(workbookPath);
  let markedCells = 0;
  for (const change of payload.changes) {
    if (!change.id || ids.has(change.id)) throw new Error(`Missing or duplicate change ID: ${change.id}`);
    ids.add(change.id);
    if (!change.date || !change.scope || !change.summary || !Array.isArray(change.sources) || change.sources.length === 0) {
      throw new Error(`Incomplete trace metadata for ${change.id}`);
    }
    if (!Array.isArray(change.targets)) throw new Error(`targets must be an array for ${change.id}`);
    for (const target of change.targets) markedCells += markTarget(workbook, change, target);
  }
  rebuildChangeLog(workbook, payload.changes);
  const temporaryPath = `${workbookPath}.tmp`;
  await workbook.xlsx.writeFile(temporaryPath);
  fs.renameSync(temporaryPath, workbookPath);

  const verification = new ExcelJS.Workbook();
  await verification.xlsx.readFile(workbookPath);
  const logSheet = verification.getWorksheet('Change Log');
  if (!logSheet || logSheet.rowCount !== payload.changes.length + 1) {
    throw new Error('Workbook verification failed: Change Log row count mismatch');
  }
  process.stdout.write(`Workbook annotated: changes=${payload.changes.length}; markedCells=${markedCells}; changeLogRows=${logSheet.rowCount - 1}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
