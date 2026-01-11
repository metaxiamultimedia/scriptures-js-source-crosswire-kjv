/**
 * Analysis script to find missing Strong's numbers in both upstream OSIS XML
 * and imported JSON data.
 */

import { readFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SaxesParser } from 'saxes';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

const SOURCE_DIR = join(ROOT_DIR, 'source');
const DATA_DIR = join(ROOT_DIR, 'data', 'crosswire-KJV');

interface MissingEntry {
  reference: string; // e.g., "Gen.1.1"
  position: number;
  word: string;
  missingInUpstream: boolean;
  missingInImported: boolean;
  upstreamLemma: string | null;
  importedStrongs: string[] | null;
  isTransChange: boolean;
  isTailText: boolean;
}

interface UpstreamWord {
  reference: string;
  position: number;
  text: string;
  lemma: string | null;
  isTransChange: boolean;
  isTailText: boolean;
}

interface ImportedWord {
  reference: string;
  position: number;
  text: string;
  strongs: string[] | null;
}

interface Stats {
  totalWordsUpstream: number;
  totalWordsImported: number;
  missingStrongsUpstream: number;
  missingStrongsImported: number;
  transChangeWords: number;
  tailTextWords: number;
}

// Parse upstream OSIS XML
async function parseUpstreamXml(): Promise<UpstreamWord[]> {
  const xmlPath = join(SOURCE_DIR, 'kjvfull.xml');
  if (!existsSync(xmlPath)) {
    throw new Error('Source XML not found. Run import first.');
  }

  const xml = await readFile(xmlPath, 'utf-8');
  const words: UpstreamWord[] = [];
  const parser = new SaxesParser();

  let current: { book: string; chapter: number; verse: number } | null = null;
  let pos = 1;
  let noteDepth = 0;

  // Colophon tracking
  let inColophon = false;
  let colophonBook: string | null = null;

  // Track current element context
  let inWord = false;
  let inTransChange = false;
  let wordText = '';
  let wordLemma: string | null = null;

  function getReference(): string {
    if (inColophon && colophonBook) {
      return `${colophonBook}.colophon`;
    }
    if (current) {
      return `${current.book}.${current.chapter}.${current.verse}`;
    }
    return 'unknown';
  }

  function processTailText(text: string): void {
    if (!text.trim() || (!current && !inColophon) || noteDepth > 0) return;

    const cleaned = text.replace(/\//g, '').trim();
    for (const piece of cleaned.split(/\s+/).filter(Boolean)) {
      // Skip pure punctuation
      if (/^[.,;:!?]+$/.test(piece)) continue;

      words.push({
        reference: getReference(),
        position: pos++,
        text: piece,
        lemma: null,
        isTransChange: false,
        isTailText: true,
      });
    }
  }

  parser.on('opentag', (tag) => {
    const name = tag.name.replace(/^[^:]+:/, '');

    if (name === 'div') {
      const divType = tag.attributes.type as string | undefined;
      const osisId = tag.attributes.osisID as string | undefined;
      if (divType === 'colophon' && osisId) {
        const bookMatch = osisId.match(/^(\w+)\./);
        if (bookMatch) {
          inColophon = true;
          colophonBook = bookMatch[1];
          pos = 1;
        }
      }
    } else if (name === 'verse') {
      const osisId = tag.attributes.osisID as string | undefined;
      const sId = tag.attributes.sID as string | undefined;

      if (osisId && !current) {
        const parts = osisId.split('.');
        if (parts.length === 3) {
          const [book, chap, num] = parts;
          current = { book, chapter: parseInt(chap, 10), verse: parseInt(num, 10) };
          pos = 1;
        }
      }
    } else if (name === 'w' && (current || inColophon) && noteDepth === 0) {
      inWord = true;
      wordText = '';
      wordLemma = (tag.attributes.lemma as string) || null;
    } else if (name === 'transChange' && (current || inColophon) && noteDepth === 0) {
      inTransChange = true;
      wordText = '';
    } else if (name === 'note') {
      noteDepth++;
    }
  });

  parser.on('text', (text) => {
    if (noteDepth > 0) return;

    if (inWord || inTransChange) {
      wordText += text;
    } else if (current || inColophon) {
      processTailText(text);
    }
  });

  parser.on('closetag', (tag) => {
    const name = tag.name.replace(/^[^:]+:/, '');

    if (name === 'div') {
      if (inColophon) {
        inColophon = false;
        colophonBook = null;
      }
    } else if (name === 'verse') {
      const eId = tag.attributes.eID as string | undefined;
      const osisId = tag.attributes.osisID as string | undefined;
      const sId = tag.attributes.sID as string | undefined;

      if (current && (eId || (osisId && !sId))) {
        current = null;
      }
    } else if (name === 'w' && inWord && (current || inColophon) && noteDepth === 0) {
      inWord = false;
      const wText = wordText.replace(/\//g, '').trim();

      if (wText) {
        for (const piece of wText.split(/\s+/).filter(Boolean)) {
          words.push({
            reference: getReference(),
            position: pos++,
            text: piece,
            lemma: wordLemma,
            isTransChange: false,
            isTailText: false,
          });
        }
      }
    } else if (name === 'transChange' && inTransChange && (current || inColophon) && noteDepth === 0) {
      inTransChange = false;
      const tcText = wordText.trim();

      if (tcText) {
        for (const piece of tcText.split(/\s+/).filter(Boolean)) {
          words.push({
            reference: getReference(),
            position: pos++,
            text: piece,
            lemma: null,
            isTransChange: true,
            isTailText: false,
          });
        }
      }
    } else if (name === 'note') {
      noteDepth--;
    }
  });

  parser.write(xml).close();

  return words;
}

// Parse imported JSON data
async function parseImportedData(): Promise<ImportedWord[]> {
  const words: ImportedWord[] = [];
  const books = await readdir(DATA_DIR);

  for (const book of books) {
    if (book === 'metadata.json') continue;

    const bookDir = join(DATA_DIR, book);
    const chapters = await readdir(bookDir);

    for (const chapter of chapters) {
      const chapterDir = join(bookDir, chapter);
      const verses = await readdir(chapterDir);

      for (const verseFile of verses) {
        if (!verseFile.endsWith('.json')) continue;

        const verseNum = verseFile.replace('.json', '');
        const reference = `${book}.${chapter}.${verseNum}`;

        const filePath = join(chapterDir, verseFile);
        const data = JSON.parse(await readFile(filePath, 'utf-8'));

        for (const word of data.words) {
          words.push({
            reference,
            position: word.position,
            text: word.text,
            strongs: word.strongs || null,
          });
        }
      }
    }
  }

  return words;
}

// Compare and analyze
function analyze(
  upstreamWords: UpstreamWord[],
  importedWords: ImportedWord[]
): { entries: MissingEntry[]; stats: Stats } {
  const entries: MissingEntry[] = [];

  // Create lookup maps
  const importedMap = new Map<string, ImportedWord>();
  for (const w of importedWords) {
    const key = `${w.reference}:${w.position}`;
    importedMap.set(key, w);
  }

  const upstreamMap = new Map<string, UpstreamWord>();
  for (const w of upstreamWords) {
    const key = `${w.reference}:${w.position}`;
    upstreamMap.set(key, w);
  }

  // Stats
  const stats: Stats = {
    totalWordsUpstream: upstreamWords.length,
    totalWordsImported: importedWords.length,
    missingStrongsUpstream: 0,
    missingStrongsImported: 0,
    transChangeWords: 0,
    tailTextWords: 0,
  };

  // Check upstream words
  for (const uw of upstreamWords) {
    const key = `${uw.reference}:${uw.position}`;
    const iw = importedMap.get(key);

    const upstreamMissing = !uw.lemma;
    const importedMissing = !iw?.strongs || iw.strongs.length === 0;

    if (uw.isTransChange) stats.transChangeWords++;
    if (uw.isTailText) stats.tailTextWords++;
    if (upstreamMissing) stats.missingStrongsUpstream++;
    if (importedMissing) stats.missingStrongsImported++;

    if (upstreamMissing || importedMissing) {
      entries.push({
        reference: uw.reference,
        position: uw.position,
        word: uw.text,
        missingInUpstream: upstreamMissing,
        missingInImported: importedMissing,
        upstreamLemma: uw.lemma,
        importedStrongs: iw?.strongs || null,
        isTransChange: uw.isTransChange,
        isTailText: uw.isTailText,
      });
    }
  }

  return { entries, stats };
}

// Group entries by word
function groupByWord(entries: MissingEntry[]): Map<string, {
  count: number;
  upstreamCount: number;
  importedCount: number;
  transChangeCount: number;
  tailTextCount: number;
  examples: string[];
}> {
  const groups = new Map<string, {
    count: number;
    upstreamCount: number;
    importedCount: number;
    transChangeCount: number;
    tailTextCount: number;
    examples: string[];
  }>();

  for (const entry of entries) {
    const wordLower = entry.word.toLowerCase().replace(/[.,;:!?]$/, '');

    if (!groups.has(wordLower)) {
      groups.set(wordLower, {
        count: 0,
        upstreamCount: 0,
        importedCount: 0,
        transChangeCount: 0,
        tailTextCount: 0,
        examples: [],
      });
    }

    const g = groups.get(wordLower)!;
    g.count++;
    if (entry.missingInUpstream) g.upstreamCount++;
    if (entry.missingInImported) g.importedCount++;
    if (entry.isTransChange) g.transChangeCount++;
    if (entry.isTailText) g.tailTextCount++;
    if (g.examples.length < 3) {
      g.examples.push(entry.reference);
    }
  }

  return groups;
}

async function main(): Promise<void> {
  console.log('Strong\'s Number Analysis');
  console.log('========================\n');

  console.log('Parsing upstream OSIS XML...');
  const upstreamWords = await parseUpstreamXml();
  console.log(`  Found ${upstreamWords.length} words in upstream\n`);

  console.log('Parsing imported JSON data...');
  const importedWords = await parseImportedData();
  console.log(`  Found ${importedWords.length} words in imported data\n`);

  console.log('Analyzing missing Strong\'s numbers...\n');
  const { entries, stats } = analyze(upstreamWords, importedWords);

  // Print stats
  console.log('=== SUMMARY STATISTICS ===\n');
  console.log(`Total words in upstream:     ${stats.totalWordsUpstream.toLocaleString()}`);
  console.log(`Total words in imported:     ${stats.totalWordsImported.toLocaleString()}`);
  console.log('');
  console.log(`Missing Strong's upstream:   ${stats.missingStrongsUpstream.toLocaleString()} (${(stats.missingStrongsUpstream / stats.totalWordsUpstream * 100).toFixed(2)}%)`);
  console.log(`Missing Strong's imported:   ${stats.missingStrongsImported.toLocaleString()} (${(stats.missingStrongsImported / stats.totalWordsImported * 100).toFixed(2)}%)`);
  console.log('');
  console.log(`TransChange words (italics): ${stats.transChangeWords.toLocaleString()}`);
  console.log(`Tail text words:             ${stats.tailTextWords.toLocaleString()}`);
  console.log('');

  // Group by word
  const groups = groupByWord(entries);
  const sortedGroups = [...groups.entries()].sort((a, b) => b[1].count - a[1].count);

  console.log('=== WORDS MISSING STRONG\'S NUMBERS ===\n');
  console.log('| Word | Total | Missing Upstream | Missing Imported | TransChange | TailText | Sample References |');
  console.log('|------|-------|------------------|------------------|-------------|----------|-------------------|');

  for (const [word, data] of sortedGroups.slice(0, 100)) {
    const examples = data.examples.join(', ');
    console.log(`| ${word.padEnd(20)} | ${String(data.count).padStart(5)} | ${String(data.upstreamCount).padStart(16)} | ${String(data.importedCount).padStart(16)} | ${String(data.transChangeCount).padStart(11)} | ${String(data.tailTextCount).padStart(8)} | ${examples} |`);
  }

  if (sortedGroups.length > 100) {
    console.log(`\n... and ${sortedGroups.length - 100} more unique words`);
  }

  // Breakdown by category
  console.log('\n=== BREAKDOWN BY CATEGORY ===\n');

  // Words only missing in upstream
  const onlyUpstream = entries.filter(e => e.missingInUpstream && !e.missingInImported);
  console.log(`Words missing ONLY in upstream: ${onlyUpstream.length}`);

  // Words only missing in imported
  const onlyImported = entries.filter(e => !e.missingInUpstream && e.missingInImported);
  console.log(`Words missing ONLY in imported: ${onlyImported.length}`);

  // Words missing in both
  const bothMissing = entries.filter(e => e.missingInUpstream && e.missingInImported);
  console.log(`Words missing in BOTH:          ${bothMissing.length}`);

  // TransChange breakdown
  const transChangeEntries = entries.filter(e => e.isTransChange);
  console.log(`\nTransChange (italicized) words: ${transChangeEntries.length}`);
  const transChangeGroups = groupByWord(transChangeEntries);
  const sortedTransChange = [...transChangeGroups.entries()].sort((a, b) => b[1].count - a[1].count);

  console.log('\nTop TransChange words missing Strong\'s:');
  for (const [word, data] of sortedTransChange.slice(0, 20)) {
    console.log(`  "${word}": ${data.count} occurrences`);
  }

  // Tail text breakdown
  const tailTextEntries = entries.filter(e => e.isTailText);
  console.log(`\nTail text words: ${tailTextEntries.length}`);
  const tailTextGroups = groupByWord(tailTextEntries);
  const sortedTailText = [...tailTextGroups.entries()].sort((a, b) => b[1].count - a[1].count);

  console.log('\nTop Tail text words missing Strong\'s:');
  for (const [word, data] of sortedTailText.slice(0, 20)) {
    console.log(`  "${word}": ${data.count} occurrences`);
  }

  // Regular words (not transChange or tailText) missing Strong's
  const regularMissing = entries.filter(e => !e.isTransChange && !e.isTailText);
  console.log(`\nRegular words (with <w> tags) missing Strong's: ${regularMissing.length}`);

  if (regularMissing.length > 0) {
    const regularGroups = groupByWord(regularMissing);
    const sortedRegular = [...regularGroups.entries()].sort((a, b) => b[1].count - a[1].count);

    console.log('\nTop regular words missing Strong\'s:');
    for (const [word, data] of sortedRegular.slice(0, 30)) {
      console.log(`  "${word}": ${data.count} occurrences (examples: ${data.examples.join(', ')})`);
    }
  }

  // Sample entries where upstream has lemma but our import doesn't have strongs
  const importBugCandidates = entries.filter(e => !e.missingInUpstream && e.missingInImported);
  if (importBugCandidates.length > 0) {
    console.log('\n=== POTENTIAL IMPORT ISSUES ===');
    console.log('Words where upstream has lemma but imported data is missing Strong\'s:\n');

    for (const entry of importBugCandidates.slice(0, 50)) {
      console.log(`  ${entry.reference}[${entry.position}] "${entry.word}" - upstream lemma: ${entry.upstreamLemma}`);
    }

    if (importBugCandidates.length > 50) {
      console.log(`  ... and ${importBugCandidates.length - 50} more`);
    }
  }
}

main().catch(console.error);
