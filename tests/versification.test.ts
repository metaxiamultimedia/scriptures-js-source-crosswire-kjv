/**
 * Versification tests for @metaxia/scriptures-source-crosswire-kjv
 *
 * Verifies that the KJV data has correct verse counts per book
 * matching standard KJV versification.
 *
 * Total KJV: 31,102 verses (23,145 OT + 7,957 NT)
 */

import { describe, it, expect } from 'vitest';
import { readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, '..', 'data', 'crosswire-KJV');

/**
 * Expected KJV verse counts per book.
 */
const KJV_EXPECTED_COUNTS: Record<string, number> = {
  // Old Testament - 39 books, 23,145 verses
  Gen: 1533,
  Exod: 1213,
  Lev: 859,
  Num: 1288,
  Deut: 959,
  Josh: 658,
  Judg: 618,
  Ruth: 85,
  '1Sam': 810,
  '2Sam': 695,
  '1Kgs': 816,
  '2Kgs': 719,
  '1Chr': 942,
  '2Chr': 822,
  Ezra: 280,
  Neh: 406,
  Esth: 167,
  Job: 1070,
  Ps: 2461,
  Prov: 915,
  Eccl: 222,
  Song: 117,
  Isa: 1292,
  Jer: 1364,
  Lam: 154,
  Ezek: 1273,
  Dan: 357,
  Hos: 197,
  Joel: 73,
  Amos: 146,
  Obad: 21,
  Jonah: 48,
  Mic: 105,
  Nah: 47,
  Hab: 56,
  Zeph: 53,
  Hag: 38,
  Zech: 211,
  Mal: 55,
  // New Testament - 27 books, 7,957 verses
  Matt: 1071,
  Mark: 678,
  Luke: 1151,
  John: 879,
  Acts: 1007,
  Rom: 433,
  '1Cor': 437,
  '2Cor': 257,
  Gal: 149,
  Eph: 155,
  Phil: 104,
  Col: 95,
  '1Thess': 89,
  '2Thess': 47,
  '1Tim': 113,
  '2Tim': 83,
  Titus: 46,
  Phlm: 25,
  Heb: 303,
  Jas: 108,
  '1Pet': 105,
  '2Pet': 61,
  '1John': 105,
  '2John': 13,
  '3John': 14,
  Jude: 25,
  Rev: 404,
};

const KJV_OT_TOTAL = 23145;
const KJV_NT_TOTAL = 7957;
const KJV_TOTAL = 31102;

const OT_BOOKS = [
  'Gen', 'Exod', 'Lev', 'Num', 'Deut',
  'Josh', 'Judg', 'Ruth', '1Sam', '2Sam',
  '1Kgs', '2Kgs', '1Chr', '2Chr',
  'Ezra', 'Neh', 'Esth', 'Job', 'Ps',
  'Prov', 'Eccl', 'Song', 'Isa',
  'Jer', 'Lam', 'Ezek', 'Dan',
  'Hos', 'Joel', 'Amos', 'Obad', 'Jonah',
  'Mic', 'Nah', 'Hab', 'Zeph', 'Hag',
  'Zech', 'Mal',
];

const NT_BOOKS = [
  'Matt', 'Mark', 'Luke', 'John', 'Acts',
  'Rom', '1Cor', '2Cor', 'Gal', 'Eph',
  'Phil', 'Col', '1Thess', '2Thess',
  '1Tim', '2Tim', 'Titus', 'Phlm', 'Heb',
  'Jas', '1Pet', '2Pet', '1John', '2John', '3John',
  'Jude', 'Rev',
];

/**
 * Count verses in a book by traversing the chapter directories.
 */
async function countVersesInBook(bookDir: string): Promise<number> {
  const bookPath = join(DATA_DIR, bookDir);
  const chapters = await readdir(bookPath);

  let totalVerses = 0;
  for (const chapter of chapters) {
    const chapterPath = join(bookPath, chapter);
    const files = await readdir(chapterPath);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    totalVerses += jsonFiles.length;
  }
  return totalVerses;
}

describe('KJV Versification', () => {
  describe('Book Verse Counts', () => {
    // Generate a test for each book
    const allBooks = [...OT_BOOKS, ...NT_BOOKS];

    for (const book of allBooks) {
      it(`${book} should have ${KJV_EXPECTED_COUNTS[book]} verses`, async () => {
        const actualCount = await countVersesInBook(book);
        expect(actualCount).toBe(KJV_EXPECTED_COUNTS[book]);
      });
    }
  });

  describe('Testament Totals', () => {
    it('Old Testament should have 23,145 verses', async () => {
      let otTotal = 0;
      for (const book of OT_BOOKS) {
        otTotal += await countVersesInBook(book);
      }
      expect(otTotal).toBe(KJV_OT_TOTAL);
    });

    it('New Testament should have 7,957 verses', async () => {
      let ntTotal = 0;
      for (const book of NT_BOOKS) {
        ntTotal += await countVersesInBook(book);
      }
      expect(ntTotal).toBe(KJV_NT_TOTAL);
    });

    it('Total Bible should have 31,102 verses', async () => {
      const allBooks = [...OT_BOOKS, ...NT_BOOKS];
      let total = 0;
      for (const book of allBooks) {
        total += await countVersesInBook(book);
      }
      expect(total).toBe(KJV_TOTAL);
    });
  });

  describe('Book Count', () => {
    it('should have 39 OT books', () => {
      expect(OT_BOOKS.length).toBe(39);
    });

    it('should have 27 NT books', () => {
      expect(NT_BOOKS.length).toBe(27);
    });

    it('should have 66 books total', () => {
      expect(OT_BOOKS.length + NT_BOOKS.length).toBe(66);
    });

    it('all expected books should exist in data directory', async () => {
      const allBooks = [...OT_BOOKS, ...NT_BOOKS];
      const existingDirs = await readdir(DATA_DIR);

      for (const book of allBooks) {
        expect(existingDirs).toContain(book);
      }
    });
  });

  describe('Chapter Counts', () => {
    const EXPECTED_CHAPTERS: Record<string, number> = {
      Gen: 50,
      Exod: 40,
      Lev: 27,
      Num: 36,
      Deut: 34,
      Josh: 24,
      Judg: 21,
      Ruth: 4,
      '1Sam': 31,
      '2Sam': 24,
      '1Kgs': 22,
      '2Kgs': 25,
      '1Chr': 29,
      '2Chr': 36,
      Ezra: 10,
      Neh: 13,
      Esth: 10,
      Job: 42,
      Ps: 150,
      Prov: 31,
      Eccl: 12,
      Song: 8,
      Isa: 66,
      Jer: 52,
      Lam: 5,
      Ezek: 48,
      Dan: 12,
      Hos: 14,
      Joel: 3,
      Amos: 9,
      Obad: 1,
      Jonah: 4,
      Mic: 7,
      Nah: 3,
      Hab: 3,
      Zeph: 3,
      Hag: 2,
      Zech: 14,
      Mal: 4,
      Matt: 28,
      Mark: 16,
      Luke: 24,
      John: 21,
      Acts: 28,
      Rom: 16,
      '1Cor': 16,
      '2Cor': 13,
      Gal: 6,
      Eph: 6,
      Phil: 4,
      Col: 4,
      '1Thess': 5,
      '2Thess': 3,
      '1Tim': 6,
      '2Tim': 4,
      Titus: 3,
      Phlm: 1,
      Heb: 13,
      Jas: 5,
      '1Pet': 5,
      '2Pet': 3,
      '1John': 5,
      '2John': 1,
      '3John': 1,
      Jude: 1,
      Rev: 22,
    };

    for (const book of [...OT_BOOKS, ...NT_BOOKS]) {
      it(`${book} should have ${EXPECTED_CHAPTERS[book]} chapter(s)`, async () => {
        const bookPath = join(DATA_DIR, book);
        const chapters = await readdir(bookPath);
        expect(chapters.length).toBe(EXPECTED_CHAPTERS[book]);
      });
    }
  });
});
