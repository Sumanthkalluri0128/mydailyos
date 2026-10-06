// Minimal dependency-free PDF writer (Courier text, A4, auto page breaks). Enough for a clean, printable intake report.
const esc = (s) => String(s).replace(/[^\x20-\x7e]/g, '?').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

function buildPdf(lines, { title = 'Report', fontSize = 9, margin = 40 } = {}) {
  const W = 595, H = 842, lead = fontSize + 3.5;
  const perPage = Math.floor((H - margin * 2) / lead);
  const pages = [];
  for (let i = 0; i < lines.length; i += perPage) pages.push(lines.slice(i, i + perPage));
  if (!pages.length) pages.push(['']);

  const objs = []; // 1-indexed
  const add = (body) => { objs.push(body); return objs.length; };
  const catalog = add(''), pagesRoot = add(''), font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>'), bold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>');
  const kids = [];
  pages.forEach((pl, pi) => {
    let s = `BT /F1 ${fontSize} Tf ${lead} TL ${margin} ${H - margin} Td\n`;
    pl.forEach((line, li) => {
      const head = typeof line === 'object' && line.bold;
      const text = typeof line === 'object' ? line.text : line;
      s += `${head ? `/F2 ${fontSize} Tf ` : ''}(${esc(text)}) Tj${head ? ` /F1 ${fontSize} Tf` : ''} T*\n`;
    });
    s += `ET\nBT /F1 7 Tf ${margin} 22 Td (${esc(title)}  -  page ${pi + 1} of ${pages.length}) Tj ET`;
    const content = add(`<< /Length ${Buffer.byteLength(s)} >>\nstream\n${s}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesRoot} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${font} 0 R /F2 ${bold} 0 R >> >> /Contents ${content} 0 R >>`));
  });
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesRoot} 0 R >>`;
  objs[pagesRoot - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;

  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((b, i) => { offsets.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${b}\nendobj\n`; });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

module.exports = { buildPdf };
