import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';

// Find the most recent uploaded file
const baseDir = './storage/uploads';
const files = fs.readdirSync(baseDir).map(f => ({
  name: f,
  time: fs.statSync(path.join(baseDir, f)).mtime.getTime()
})).sort((a: any, b: any) => b.time - a.time);

console.log('Most recent uploaded file:', files[0]?.name);
if (files[0]) {
  const wb = XLSX.readFile(path.join(baseDir, files[0].name));
  const sheetName = wb.SheetNames.find(n => n.toLowerCase().includes('all_tickets') || n.toLowerCase().includes('all tickets')) || wb.SheetNames[0];
  console.log('Reading sheet:', sheetName);
  const data = XLSX.utils.sheet_to_json(wb.Sheets[sheetName!], { raw: false, defval: '' }) as any[];
  console.log('Total rows in sheet:', data.length);

  // Find duplicate case numbers
  const seen: Record<string, number> = {};
  for (const row of data) {
    const cn = String(row['Case Number'] || '').trim();
    if (!cn) continue;
    seen[cn] = (seen[cn] || 0) + 1;
  }
  const dupes = Object.entries(seen).filter(([_, count]) => count > 1);
  console.log('Duplicate case numbers in the Excel file:');
  console.log(JSON.stringify(dupes, null, 2));

  if (dupes.length === 0) {
    console.log('No duplicates found - the 3 missing rows must have empty Case Numbers');
    const empty = data.filter(row => !String(row['Case Number'] || '').trim());
    console.log('Rows with empty Case Numbers:', empty.length);
  }
}
