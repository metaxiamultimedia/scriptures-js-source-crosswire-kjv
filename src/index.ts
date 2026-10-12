/**
 * @metaxia/scriptures-source-crosswire-kjv
 *
 * King James Version data for @metaxia/scriptures.
 * Auto-registers with the scriptures library when imported.
 */

import { registerSource } from '@metaxia/scriptures-core';
import { sourceInfo, loadVerse, loadChapter, loadCache, listBooks } from './source.js';

// Auto-register on import
registerSource({
  edition: sourceInfo.edition,
  metadata: sourceInfo.metadata,
  loadVerse,
  loadChapter,
  loadCache,
  listBooks,
});

// Export source info for direct access
export { sourceInfo, loadVerse, loadChapter, loadCache, listBooks };
export { metadata } from './source.js';
