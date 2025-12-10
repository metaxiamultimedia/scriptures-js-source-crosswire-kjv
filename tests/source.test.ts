/**
 * Tests for @metaxia/scriptures-source-crosswire-kjv
 */

import { describe, it, expect } from 'vitest';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('colophon handling', () => {
  it('should include colophon words in Romans 16:27', async () => {
    // Romans has a colophon: "Written to the Romans from Corinthus..."
    const dataPath = join(__dirname, '..', 'data', 'crosswire-KJV', 'Rom', '16', '27.json');
    const data = JSON.parse(await readFile(dataPath, 'utf-8'));

    // Check that verse has colophon metadata
    expect(data.metadata).toBeDefined();
    expect(data.metadata.has_colophon).toBe(true);
    expect(data.metadata.colophon_type).toBe('subscription');
    expect(data.metadata.colophon_word_range).toBeDefined();
  });

  it('should flag colophon words with metadata.colophon = true', async () => {
    const dataPath = join(__dirname, '..', 'data', 'crosswire-KJV', 'Rom', '16', '27.json');
    const data = JSON.parse(await readFile(dataPath, 'utf-8'));

    // Find words flagged as colophon
    const colophonWords = data.words.filter(
      (word: { metadata?: { colophon?: boolean } }) => word.metadata?.colophon === true
    );

    // Should have colophon words (Romans colophon has ~12 words)
    expect(colophonWords.length).toBeGreaterThan(0);

    // First colophon word should be "Written"
    expect(colophonWords[0].text).toBe('Written');
  });

  it('should exclude colophon words from verse-level gematria', async () => {
    const dataPath = join(__dirname, '..', 'data', 'crosswire-KJV', 'Rom', '16', '27.json');
    const data = JSON.parse(await readFile(dataPath, 'utf-8'));

    // Calculate gematria for non-colophon words only
    const nonColophonWords = data.words.filter(
      (word: { metadata?: { colophon?: boolean } }) => !word.metadata?.colophon
    );
    const expectedGematria: Record<string, number> = {};
    for (const word of nonColophonWords) {
      for (const [k, v] of Object.entries(word.gematria as Record<string, number>)) {
        expectedGematria[k] = (expectedGematria[k] || 0) + v;
      }
    }

    // Verse gematria should match non-colophon total
    expect(data.gematria.standard).toBe(expectedGematria.standard);
  });
});

describe('gematria calculations', () => {
  it('should calculate ordinal gematria using alphabet position, not word position', async () => {
    // This test catches a bug where ordinal was calculated as position-in-word (1,2,3...)
    // instead of letter's alphabet position (A=1, B=2, ..., Z=26)
    //
    // For "God" (Gen 1:1):
    //   Correct: G=7, O=15, D=4 → ordinal = 26
    //   Buggy:   1 + 2 + 3 = 6
    const dataPath = join(__dirname, '..', 'data', 'crosswire-KJV', 'Gen', '1', '1.json');
    const data = JSON.parse(await readFile(dataPath, 'utf-8'));

    // Find the word "God"
    const godWord = data.words.find((w: { text: string }) => w.text === 'God');
    expect(godWord).toBeDefined();

    // Verify ordinal uses alphabet positions: G(7) + O(15) + D(4) = 26
    expect(godWord.gematria.ordinal).toBe(26);

    // Also verify standard (same as ordinal for English simple gematria)
    expect(godWord.gematria.standard).toBe(26);

    // Reduced: digitalRoot(26) = 2+6 = 8
    expect(godWord.gematria.reduced).toBe(8);
  });

  it('should calculate correct ordinal for longer words', async () => {
    // Test with "beginning" to ensure longer words are correct
    // B=2, E=5, G=7, I=9, N=14, N=14, I=9, N=14, G=7
    // Correct ordinal: 2+5+7+9+14+14+9+14+7 = 81
    // Buggy ordinal: 1+2+3+4+5+6+7+8+9 = 45
    const dataPath = join(__dirname, '..', 'data', 'crosswire-KJV', 'Gen', '1', '1.json');
    const data = JSON.parse(await readFile(dataPath, 'utf-8'));

    const beginningWord = data.words.find((w: { text: string }) => w.text === 'beginning');
    expect(beginningWord).toBeDefined();

    expect(beginningWord.gematria.ordinal).toBe(81);
  });
});
