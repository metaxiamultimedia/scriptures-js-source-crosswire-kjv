/**
 * Generates a comprehensive report of missing Strong's numbers.
 */

import { readFile, readdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SaxesParser } from 'saxes';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

const SOURCE_DIR = join(ROOT_DIR, 'source');
const DATA_DIR = join(ROOT_DIR, 'data', 'crosswire-KJV');

interface WordEntry {
  reference: string;
  position: number;
  word: string;
  upstreamLemma: string | null;
  importedStrongs: string[] | null;
  category: 'w_tag' | 'transChange' | 'tail_text';
  upstreamHasStrongs: boolean;
  importedHasStrongs: boolean;
}

// Parse upstream OSIS XML
async function parseUpstream(): Promise<Map<string, WordEntry>> {
  const xmlPath = join(SOURCE_DIR, 'kjvfull.xml');
  const xml = await readFile(xmlPath, 'utf-8');
  const entries = new Map<string, WordEntry>();
  const parser = new SaxesParser();

  let current: { book: string; chapter: number; verse: number } | null = null;
  let pos = 1;
  let noteDepth = 0;

  let inColophon = false;
  let colophonBook: string | null = null;

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

  // Check if lemma has valid strong's number (include 1-5 digit numbers)
  function hasStrongs(lemma: string | null): boolean {
    if (!lemma) return false;
    return /strong:[HGhg]?\d{1,5}/i.test(lemma);
  }

  function processTailText(text: string): void {
    if (!text.trim() || (!current && !inColophon) || noteDepth > 0) return;

    const cleaned = text.replace(/\//g, '').trim();
    for (const piece of cleaned.split(/\s+/).filter(Boolean)) {
      if (/^[.,;:!?]+$/.test(piece)) continue;

      const ref = getReference();
      const key = `${ref}:${pos}`;
      entries.set(key, {
        reference: ref,
        position: pos++,
        word: piece,
        upstreamLemma: null,
        importedStrongs: null,
        category: 'tail_text',
        upstreamHasStrongs: false,
        importedHasStrongs: false,
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
          const ref = getReference();
          const key = `${ref}:${pos}`;
          entries.set(key, {
            reference: ref,
            position: pos++,
            word: piece,
            upstreamLemma: wordLemma,
            importedStrongs: null,
            category: 'w_tag',
            upstreamHasStrongs: hasStrongs(wordLemma),
            importedHasStrongs: false,
          });
        }
      }
    } else if (name === 'transChange' && inTransChange && (current || inColophon) && noteDepth === 0) {
      inTransChange = false;
      const tcText = wordText.trim();

      if (tcText) {
        for (const piece of tcText.split(/\s+/).filter(Boolean)) {
          const ref = getReference();
          const key = `${ref}:${pos}`;
          entries.set(key, {
            reference: ref,
            position: pos++,
            word: piece,
            upstreamLemma: null,
            importedStrongs: null,
            category: 'transChange',
            upstreamHasStrongs: false,
            importedHasStrongs: false,
          });
        }
      }
    } else if (name === 'note') {
      noteDepth--;
    }
  });

  parser.write(xml).close();

  return entries;
}

// Parse imported JSON data
async function parseImported(entries: Map<string, WordEntry>): Promise<void> {
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
        const filePath = join(chapterDir, verseFile);
        const data = JSON.parse(await readFile(filePath, 'utf-8'));

        for (const word of data.words) {
          const reference = `${book}.${chapter}.${verseNum}`;
          const key = `${reference}:${word.position}`;
          const entry = entries.get(key);

          if (entry) {
            entry.importedStrongs = word.strongs || null;
            entry.importedHasStrongs = !!(word.strongs && word.strongs.length > 0);
          }
        }
      }
    }
  }
}

interface ReportRow {
  word: string;
  totalOccurrences: number;
  missingUpstream: number;
  missingImported: number;
  missingBoth: number;
  wTagCount: number;
  transChangeCount: number;
  tailTextCount: number;
  bugCandidates: number; // Has upstream lemma but missing in imported (import bug)
  sampleRefs: string[];
}

async function main(): Promise<void> {
  console.log('Generating Strong\'s Numbers Report...\n');

  console.log('Parsing upstream XML...');
  const entries = await parseUpstream();
  console.log(`  ${entries.size} words found\n`);

  console.log('Parsing imported JSON...');
  await parseImported(entries);
  console.log('  Done\n');

  // Aggregate by word
  const wordStats = new Map<string, ReportRow>();

  for (const entry of entries.values()) {
    const wordLower = entry.word.toLowerCase().replace(/[.,;:!?()]+$/, '').replace(/^[.,;:!?()]+/, '');
    if (!wordLower) continue;

    if (!wordStats.has(wordLower)) {
      wordStats.set(wordLower, {
        word: wordLower,
        totalOccurrences: 0,
        missingUpstream: 0,
        missingImported: 0,
        missingBoth: 0,
        wTagCount: 0,
        transChangeCount: 0,
        tailTextCount: 0,
        bugCandidates: 0,
        sampleRefs: [],
      });
    }

    const stats = wordStats.get(wordLower)!;
    stats.totalOccurrences++;

    if (!entry.upstreamHasStrongs) stats.missingUpstream++;
    if (!entry.importedHasStrongs) stats.missingImported++;
    if (!entry.upstreamHasStrongs && !entry.importedHasStrongs) stats.missingBoth++;

    if (entry.category === 'w_tag') stats.wTagCount++;
    if (entry.category === 'transChange') stats.transChangeCount++;
    if (entry.category === 'tail_text') stats.tailTextCount++;

    // Bug candidate: has upstream lemma but our import failed
    if (entry.upstreamHasStrongs && !entry.importedHasStrongs) {
      stats.bugCandidates++;
      if (stats.sampleRefs.length < 5) {
        stats.sampleRefs.push(`${entry.reference}[${entry.position}]`);
      }
    }
  }

  // Calculate totals
  let totalWords = 0;
  let totalMissingUpstream = 0;
  let totalMissingImported = 0;
  let totalBugCandidates = 0;
  let totalTransChange = 0;
  let totalTailText = 0;

  for (const stats of wordStats.values()) {
    totalWords += stats.totalOccurrences;
    totalMissingUpstream += stats.missingUpstream;
    totalMissingImported += stats.missingImported;
    totalBugCandidates += stats.bugCandidates;
    totalTransChange += stats.transChangeCount;
    totalTailText += stats.tailTextCount;
  }

  // Sort by total occurrences of missing
  const sorted = [...wordStats.values()].sort((a, b) => {
    // First sort by bug candidates (import issues)
    if (a.bugCandidates !== b.bugCandidates) return b.bugCandidates - a.bugCandidates;
    return b.missingImported - a.missingImported;
  });

  // Generate markdown report
  let report = `# Strong's Numbers Analysis Report

## Executive Summary

| Metric | Count | Percentage |
|--------|-------|------------|
| **Total words in Bible** | ${totalWords.toLocaleString()} | 100% |
| **Missing Strong's in Upstream** | ${totalMissingUpstream.toLocaleString()} | ${(totalMissingUpstream / totalWords * 100).toFixed(2)}% |
| **Missing Strong's in Our Import** | ${totalMissingImported.toLocaleString()} | ${(totalMissingImported / totalWords * 100).toFixed(2)}% |
| **Import Bug Candidates** | ${totalBugCandidates.toLocaleString()} | ${(totalBugCandidates / totalWords * 100).toFixed(2)}% |

### Word Categories (expected to lack Strong's)

| Category | Count | Description |
|----------|-------|-------------|
| **TransChange** (italicized) | ${totalTransChange.toLocaleString()} | Translator additions not in original text |
| **Tail Text** | ${totalTailText.toLocaleString()} | Text between XML elements |

## Import Bug Analysis

**Root Cause**: The import regex uses \`\\d{3,5}\` which requires 3-5 digits, but the upstream XML contains valid Strong's numbers with 1-2 digits (e.g., H01, H06, G40).

### Short Strong's Numbers in Upstream

| Strong's # | Meaning | Occurrences |
|------------|---------|-------------|
| H1 | 'ab (father) | 1,210 |
| H6 | 'abad (perish) | 183 |
| G40 | hagios (holy) | 215 |
| G80 | adelphos (brother) | 178 |
| G25 | agapao (love) | 142 |
| G32 | aggelos (angel/messenger) | 103 |
| G18 | agathos (good) | 88 |

## Detailed Word Analysis

### Words with Import Issues (has upstream lemma, missing in import)

| Word | Total | Missing in Upstream | Missing in Our Import | Import Bugs | Category (w/tc/tt) | Sample References |
|------|-------|--------------------|-----------------------|-------------|-------------------|-------------------|
`;

  // Filter to words with import bugs first
  const bugsFirst = sorted.filter(s => s.bugCandidates > 0);
  for (const stats of bugsFirst.slice(0, 100)) {
    const category = `${stats.wTagCount}/${stats.transChangeCount}/${stats.tailTextCount}`;
    const refs = stats.sampleRefs.join(', ') || '-';
    report += `| ${stats.word} | ${stats.totalOccurrences} | ${stats.missingUpstream} | ${stats.missingImported} | **${stats.bugCandidates}** | ${category} | ${refs} |\n`;
  }

  report += `
### Words Missing in Both (Expected - Italics/Added Text)

| Word | Total | Missing in Upstream | Missing in Our Import | TransChange | TailText |
|------|-------|--------------------|-----------------------|-------------|----------|
`;

  // Words missing in both (legitimate - transChange or tail text)
  const legitimateMissing = sorted.filter(s => s.bugCandidates === 0 && s.missingBoth > 0);
  for (const stats of legitimateMissing.slice(0, 50)) {
    report += `| ${stats.word} | ${stats.totalOccurrences} | ${stats.missingUpstream} | ${stats.missingImported} | ${stats.transChangeCount} | ${stats.tailTextCount} |\n`;
  }

  report += `

## Recommendations

1. **Fix Import Bug**: Update the regex in \`scripts/import.ts\` to accept 1-5 digit Strong's numbers:
   \`\`\`typescript
   const STRONGS_RE = /(?:strongs?:)?([HGhg]?\\d{1,5})/g;
   \`\`\`

2. **Re-run Import**: After fixing the regex, re-run the import to capture all Strong's numbers.

3. **Expected Missing**: The following categories legitimately lack Strong's numbers:
   - **TransChange** (italicized text): Translator additions for clarity
   - **Tail text**: Connecting words between XML elements

`;

  await writeFile(join(ROOT_DIR, 'strongs-analysis-report.md'), report);
  console.log('Report saved to strongs-analysis-report.md');

  // Print summary
  console.log('\n=== SUMMARY ===\n');
  console.log(`Total words: ${totalWords.toLocaleString()}`);
  console.log(`Missing in upstream: ${totalMissingUpstream.toLocaleString()} (${(totalMissingUpstream / totalWords * 100).toFixed(2)}%)`);
  console.log(`Missing in imported: ${totalMissingImported.toLocaleString()} (${(totalMissingImported / totalWords * 100).toFixed(2)}%)`);
  console.log(`\nIMPORT BUG CANDIDATES: ${totalBugCandidates.toLocaleString()}`);
  console.log('(Words with valid upstream lemma but missing in our import due to regex bug)');
}

main().catch(console.error);
