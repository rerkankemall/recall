export type ParsedBook = { title: string; highlights: string[] };
export type ParsedBookmark = { title: string; url: string };

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// The "Netscape Bookmark File Format" — the standard HTML export format
// shared by Chrome, Firefox, Edge, and Safari, so this one parser covers
// bookmark/reading-list exports from any of them.
export function parseBookmarksHtml(raw: string): ParsedBookmark[] {
  const bookmarks: ParsedBookmark[] = [];
  const re = /<A[^>]*\sHREF="([^"]+)"[^>]*>(.*?)<\/A>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) !== null) {
    const url = match[1].trim();
    if (!/^https?:\/\//i.test(url)) continue; // skip javascript:, place: (Firefox internal), etc.
    const title = decodeHtmlEntities(match[2].replace(/<[^>]+>/g, '').trim()) || url;
    bookmarks.push({ title, url });
  }
  return bookmarks;
}

// Kindle's "My Clippings.txt" — entries separated by a line of "=========="
// Each entry: title line, a "- Your Highlight/Note/Bookmark on ..." meta line,
// a blank line, then the highlighted text (or nothing, for bookmarks).
export function parseKindleClippings(raw: string): ParsedBook[] {
  const text = raw.replace(/^﻿/, '');
  const blocks = text
    .split(/\r?\n={5,}\r?\n?/)
    .map((b) => b.trim())
    .filter(Boolean);

  const books = new Map<string, string[]>();

  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map((l) => l.trim());
    if (lines.length < 2) continue;

    const title = lines[0] || 'Untitled import';
    const metaLine = lines[1] || '';
    if (!/your highlight/i.test(metaLine)) continue; // skip notes/bookmarks

    const blankIdx = lines.findIndex((l, i) => i > 1 && l === '');
    const contentLines = blankIdx >= 0 ? lines.slice(blankIdx + 1) : lines.slice(2);
    const contentText = contentLines.join(' ').trim();
    if (!contentText) continue;

    if (!books.has(title)) books.set(title, []);
    books.get(title)!.push(contentText);
  }

  return Array.from(books.entries()).map(([title, highlights]) => ({ title, highlights }));
}

function parseCSVRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// Readwise's CSV export. Column names are matched case-insensitively rather
// than by fixed position, since Readwise has changed the exact column set
// over time.
export function parseReadwiseCSV(raw: string): ParsedBook[] {
  const text = raw.replace(/^﻿/, '');
  const rows = parseCSVRows(text);
  if (rows.length === 0) return [];

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const highlightIdx = header.findIndex((h) => h === 'highlight');
  const titleIdx = header.findIndex((h) => h.includes('book title') || h === 'title');

  if (highlightIdx === -1 || titleIdx === -1) {
    throw new Error('Could not find "Highlight" and "Book Title" columns in this CSV');
  }

  const books = new Map<string, string[]>();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const highlight = (r[highlightIdx] || '').trim();
    const title = (r[titleIdx] || '').trim() || 'Untitled import';
    if (!highlight) continue;
    if (!books.has(title)) books.set(title, []);
    books.get(title)!.push(highlight);
  }

  return Array.from(books.entries()).map(([title, highlights]) => ({ title, highlights }));
}
