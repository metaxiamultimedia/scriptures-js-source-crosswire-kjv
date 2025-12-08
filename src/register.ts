/**
 * Lazy registration entry point.
 *
 * Import this to register the source without loading all data upfront.
 */

import { registerSource } from '@metaxia/scriptures-core';
import { sourceInfo, loadVerse, loadChapter, loadCache, listBooks } from './source.js';

registerSource({
  edition: sourceInfo.edition,
  metadata: sourceInfo.metadata,
  loadVerse,
  loadChapter,
  loadCache,
  listBooks,
});
