/**
 * Import script for CrossWire KJV OSIS XML data.
 *
 * Downloads the KJV OSIS XML from CrossWire GitLab and converts to JSON format.
 * Uses SAX-style event-based parsing to match the Python library approach.
 *
 * Usage: npx tsx scripts/import.ts
 */

import { mkdir, writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SaxesParser } from 'saxes';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

const KJV_OSIS_URL =
  'https://gitlab.com/crosswire-bible-society/kjv/-/raw/d490be7e34762deb2c76cb2c1306d4808e27890d/kjvfull.xml';

const SOURCE_DIR = join(ROOT_DIR, 'source');
const DATA_DIR = join(ROOT_DIR, 'data', 'crosswire-KJV');

interface WordEntry {
  position: number;
  text: string;
  lemma?: string | null;
  morph?: string | null;
  strongs?: string[];
  metadata?: Record<string, unknown>;
  gematria: Record<string, number>;
}

interface VerseData {
  text: string;
  words: WordEntry[];
  gematria: Record<string, number>;
  metadata?: {
    has_colophon?: boolean;
    colophon_word_range?: [number, number];
    colophon_type?: string;
  };
}

interface ParsedWord {
  position: number;
  text: string;
  lemma: string | null;
  morph: string | null;
  strongs: string[] | null;
  metadata: Record<string, unknown>;
}

interface ParsedVerse {
  book: string;
  chapter: number;
  number: number;
  text: string;
  words: ParsedWord[];
  colophonWords?: ParsedWord[];
}

interface ColophonData {
  book: string;
  words: ParsedWord[];
}

// English simple gematria (A=1, B=2, etc.)
function computeGematria(text: string): Record<string, number> {
  const result: Record<string, number> = { standard: 0, ordinal: 0, reduced: 0 };

  for (const char of text.toUpperCase()) {
    const code = char.charCodeAt(0);
    if (code >= 65 && code <= 90) { // A-Z
      const val = code - 64; // A=1, B=2, ..., Z=26
      result.standard += val;
      result.ordinal += val;
      result.reduced += val % 9 || 9;
    }
  }

  return result;
}

const STRONGS_RE = /(?:strongs?:)?([HGhg]?\d{3,5})/g;

function extractStrongs(value: string | null): string[] {
  if (!value) return [];
  const results: string[] = [];
  let match;
  STRONGS_RE.lastIndex = 0;

  while ((match = STRONGS_RE.exec(value)) !== null) {
    const token = match[1];
    let prefix = '';
    if (token[0] && 'HGhg'.includes(token[0])) {
      prefix = token[0].toUpperCase();
    }
    const digits = token.match(/\d{3,5}/);
    if (!digits) continue;
    // Default to Hebrew for this source (it's English KJV but has Hebrew/Greek refs)
    if (!prefix) prefix = 'H';
    results.push(`${prefix}${parseInt(digits[0], 10)}`);
  }

  return results;
}

async function downloadXml(): Promise<string> {
  await mkdir(SOURCE_DIR, { recursive: true });
  const xmlPath = join(SOURCE_DIR, 'kjvfull.xml');

  if (existsSync(xmlPath)) {
    console.log('  → Using cached XML file');
    return await readFile(xmlPath, 'utf-8');
  }

  console.log('  → Downloading KJV OSIS XML from CrossWire...');
  const response = await fetch(KJV_OSIS_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });

  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
  }

  const xml = await response.text();
  await writeFile(xmlPath, xml, 'utf-8');
  console.log('  ✓ Downloaded and cached XML');

  return xml;
}

function parseOsis(xml: string): ParsedVerse[] {
  const verses: ParsedVerse[] = [];
  const colophons: ColophonData[] = [];
  const parser = new SaxesParser();

  let current: { book: string; chapter: number; number: number } | null = null;
  let words: ParsedWord[] = [];
  let pos = 1;
  let noteDepth = 0;

  // Colophon tracking
  let inColophon = false;
  let colophonBook: string | null = null;
  let colophonWords: ParsedWord[] = [];
  let colophonPos = 1;

  // Track current element context for collecting text
  let inWord = false;
  let inTransChange = false;
  let wordText = '';
  let wordAttrs: Record<string, string> = {};
  let transChangeText = '';
  let transChangeAttrs: Record<string, string> = {};

  function processTailText(text: string): void {
    if (!text.trim() || !current || noteDepth > 0) return;

    const cleaned = text.replace(/\//g, '').trim();
    for (const piece of cleaned.split(/\s+/).filter(Boolean)) {
      // Check if it's just punctuation - attach to previous word
      if (/^[.,;:!?]+$/.test(piece) && words.length > 0) {
        words[words.length - 1].text += piece;
      } else {
        words.push({
          position: pos++,
          text: piece,
          lemma: null,
          morph: null,
          strongs: null,
          metadata: {},
        });
      }
    }
  }

  parser.on('opentag', (tag) => {
    const name = tag.name.replace(/^[^:]+:/, ''); // Remove namespace prefix

    if (name === 'div') {
      const divType = tag.attributes.type as string | undefined;
      const osisId = tag.attributes.osisID as string | undefined;
      if (divType === 'colophon' && osisId) {
        // Colophon osisID is like "Rom.c" - extract book name
        const bookMatch = osisId.match(/^(\w+)\./);
        if (bookMatch) {
          inColophon = true;
          colophonBook = bookMatch[1];
          colophonWords = [];
          colophonPos = 1;
        }
      }
    } else if (name === 'verse') {
      const osisId = tag.attributes.osisID as string | undefined;
      const sId = tag.attributes.sID as string | undefined;

      if (osisId && !current) {
        const parts = osisId.split('.');
        if (parts.length === 3) {
          const [book, chap, num] = parts;
          current = { book, chapter: parseInt(chap, 10), number: parseInt(num, 10) };
          words = [];
          pos = 1;
        }
      }
    } else if (name === 'w' && (current || inColophon) && noteDepth === 0) {
      inWord = true;
      wordText = '';
      wordAttrs = {};
      for (const [k, v] of Object.entries(tag.attributes)) {
        wordAttrs[k] = String(v);
      }
    } else if (name === 'transChange' && (current || inColophon) && noteDepth === 0) {
      inTransChange = true;
      transChangeText = '';
      transChangeAttrs = {};
      for (const [k, v] of Object.entries(tag.attributes)) {
        transChangeAttrs[k] = String(v);
      }
    } else if (name === 'note' && (current || inColophon)) {
      noteDepth++;
    }
  });

  parser.on('text', (text) => {
    if (noteDepth > 0) return;

    if (inWord) {
      wordText += text;
    } else if (inTransChange) {
      transChangeText += text;
    } else if (current) {
      // Text between elements (tail text from previous element)
      processTailText(text);
    }
  });

  parser.on('closetag', (tag) => {
    const name = tag.name.replace(/^[^:]+:/, '');

    if (name === 'div') {
      // Check if this is a colophon div closing
      if (inColophon && colophonBook && colophonWords.length > 0) {
        colophons.push({
          book: colophonBook,
          words: colophonWords,
        });
      }
      inColophon = false;
      colophonBook = null;
    } else if (name === 'verse') {
      const eId = tag.attributes.eID as string | undefined;
      const osisId = tag.attributes.osisID as string | undefined;
      const sId = tag.attributes.sID as string | undefined;

      // End of verse: either eID marker or closing simple verse tag
      if (current && (eId || (osisId && !sId))) {
        let text = words.map(w => w.text).join(' ');
        // Clean up punctuation spacing
        text = text.replace(/\s+([,.;:!?])/g, '$1');

        verses.push({
          book: current.book,
          chapter: current.chapter,
          number: current.number,
          text,
          words,
        });
        current = null;
      }
    } else if (name === 'w' && inWord && (current || inColophon) && noteDepth === 0) {
      inWord = false;
      const wText = wordText.replace(/\//g, '').trim();

      if (wText) {
        const lemma = wordAttrs.lemma || null;
        const morph = wordAttrs.morph || null;
        const strongs = lemma ? extractStrongs(lemma) : null;

        // Build metadata from remaining attributes
        const metadata: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(wordAttrs)) {
          if (k !== 'lemma' && k !== 'morph') {
            metadata[k] = v;
          }
        }

        // Add colophon flag if we're in a colophon
        if (inColophon) {
          metadata.colophon = true;
          metadata.colophon_type = 'subscription';
        }

        // Handle multi-word content (split on spaces)
        for (const piece of wText.split(/\s+/).filter(Boolean)) {
          const wordEntry: ParsedWord = {
            position: inColophon ? colophonPos++ : pos++,
            text: piece,
            lemma,
            morph,
            strongs: strongs && strongs.length > 0 ? strongs : null,
            metadata: Object.keys(metadata).length > 0 ? { ...metadata } : {},
          };

          if (inColophon) {
            colophonWords.push(wordEntry);
          } else {
            words.push(wordEntry);
          }
        }
      }
    } else if (name === 'transChange' && inTransChange && (current || inColophon) && noteDepth === 0) {
      inTransChange = false;
      const tcText = transChangeText.trim();

      if (tcText) {
        const metadata: Record<string, unknown> = Object.keys(transChangeAttrs).length > 0 ? { ...transChangeAttrs } : {};

        // Add colophon flag if we're in a colophon
        if (inColophon) {
          metadata.colophon = true;
          metadata.colophon_type = 'subscription';
        }

        const wordEntry: ParsedWord = {
          position: inColophon ? colophonPos++ : pos++,
          text: tcText,
          lemma: null,
          morph: null,
          strongs: null,
          metadata,
        };

        if (inColophon) {
          colophonWords.push(wordEntry);
        } else {
          words.push(wordEntry);
        }
      }
    } else if (name === 'note' && noteDepth > 0) {
      noteDepth--;
    } else if (name === 'seg' && current && noteDepth === 0) {
      // Handle segment info - attach to previous word if present
      const segType = tag.attributes.type as string | undefined;
      if (words.length > 0 && segType) {
        const lastWord = words[words.length - 1];
        if (!lastWord.metadata) {
          lastWord.metadata = {};
        }
        const segments = (lastWord.metadata.segments as Array<unknown>) || [];
        segments.push({ type: segType });
        lastWord.metadata.segments = segments;
      }
    }
  });

  parser.write(xml).close();

  // Attach colophons to the last verse of each book
  for (const colophon of colophons) {
    // Find the last verse of this book
    let lastVerse: ParsedVerse | undefined;
    for (let i = verses.length - 1; i >= 0; i--) {
      if (verses[i].book === colophon.book) {
        lastVerse = verses[i];
        break;
      }
    }

    if (lastVerse) {
      // Renumber colophon words to continue from last verse word position
      const startPos = lastVerse.words.length + 1;
      for (let i = 0; i < colophon.words.length; i++) {
        colophon.words[i].position = startPos + i;
      }
      lastVerse.colophonWords = colophon.words;
    }
  }

  return verses;
}

async function saveVerse(verse: ParsedVerse): Promise<void> {
  const verseDir = join(DATA_DIR, verse.book, String(verse.chapter));
  await mkdir(verseDir, { recursive: true });

  // Convert main verse words to WordEntry format
  const wordEntries: WordEntry[] = verse.words.map(w => ({
    position: w.position,
    text: w.text,
    lemma: w.lemma,
    morph: w.morph,
    strongs: w.strongs && w.strongs.length > 0 ? w.strongs : undefined,
    metadata: Object.keys(w.metadata || {}).length > 0 ? w.metadata : undefined,
    gematria: computeGematria(w.text),
  }));

  // Add colophon words if present
  let colophonStartPos: number | undefined;
  let colophonEndPos: number | undefined;

  if (verse.colophonWords && verse.colophonWords.length > 0) {
    colophonStartPos = verse.colophonWords[0].position;
    colophonEndPos = verse.colophonWords[verse.colophonWords.length - 1].position;

    for (const w of verse.colophonWords) {
      wordEntries.push({
        position: w.position,
        text: w.text,
        lemma: w.lemma,
        morph: w.morph,
        strongs: w.strongs && w.strongs.length > 0 ? w.strongs : undefined,
        metadata: Object.keys(w.metadata || {}).length > 0 ? w.metadata : undefined,
        gematria: computeGematria(w.text),
      });
    }
  }

  // Calculate total gematria - EXCLUDE colophon words
  const totals: Record<string, number> = {};
  for (const entry of wordEntries) {
    // Skip colophon words in gematria calculation
    if (entry.metadata?.colophon) continue;

    for (const [k, v] of Object.entries(entry.gematria)) {
      totals[k] = (totals[k] || 0) + v;
    }
  }

  const data: VerseData = {
    text: verse.text,
    words: wordEntries,
    gematria: totals,
  };

  // Add colophon metadata if present
  if (colophonStartPos !== undefined && colophonEndPos !== undefined) {
    data.metadata = {
      has_colophon: true,
      colophon_word_range: [colophonStartPos, colophonEndPos],
      colophon_type: 'subscription',
    };
  }

  const filePath = join(verseDir, `${verse.number}.json`);
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

async function saveMetadata(): Promise<void> {
  const metadata = {
    abbreviation: 'KJV',
    name: 'King James Version',
    language: 'English',
    license: 'Public Domain',
    source: 'CrossWire Bible Society',
    urls: ['https://crosswire.org/', 'https://gitlab.com/crosswire-bible-society/kjv'],
  };

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(
    join(DATA_DIR, 'metadata.json'),
    JSON.stringify(metadata, null, 2),
    'utf-8'
  );
}

async function main(): Promise<void> {
  console.log('CrossWire KJV Importer');
  console.log('======================\n');

  try {
    const xml = await downloadXml();

    console.log('  → Parsing OSIS XML...');
    const verses = parseOsis(xml);
    console.log(`  ✓ Found ${verses.length} verses`);

    if (verses.length === 0) {
      console.error('No verses found - check XML structure');
      process.exit(1);
    }

    console.log('  → Saving verses...');
    let count = 0;
    for (const verse of verses) {
      await saveVerse(verse);
      count++;
      if (count % 1000 === 0) {
        console.log(`    Saved ${count}/${verses.length} verses...`);
      }
    }

    await saveMetadata();

    console.log(`\n✓ Successfully imported ${verses.length} verses to ${DATA_DIR}`);
  } catch (error) {
    console.error('Import failed:', error);
    process.exit(1);
  }
}

main();
