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
