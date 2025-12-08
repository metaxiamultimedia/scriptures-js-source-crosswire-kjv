# @metaxia/scriptures-source-crosswire-kjv

King James Version (English) data for [@metaxia/scriptures](https://github.com/metaxiamultimedia/scriptures-js).

## Source

[CrossWire Bible Society](https://crosswire.org/) OSIS XML

## Installation

```bash
npm install @metaxia/scriptures @metaxia/scriptures-source-crosswire-kjv
```

## Usage

### Auto-Registration

```typescript
// Import to auto-register with @metaxia/scriptures
import '@metaxia/scriptures-source-crosswire-kjv';

import { getVerse } from '@metaxia/scriptures';

const verse = await getVerse('Genesis', 1, 1, { edition: 'crosswire-KJV' });
console.log(verse.text);
// "In the beginning God created the heaven and the earth."
```

### Granular Imports

Import specific portions for smaller bundle sizes:

```typescript
// Single verse
import verse from '@metaxia/scriptures-source-crosswire-kjv/books/Genesis/1/1';

// Entire chapter
import chapter from '@metaxia/scriptures-source-crosswire-kjv/books/Genesis/1';

// Entire book
import genesis from '@metaxia/scriptures-source-crosswire-kjv/books/Genesis';

// Raw JSON data
import verseData from '@metaxia/scriptures-source-crosswire-kjv/data/Genesis/1/1.json';

// Edition metadata
import metadata from '@metaxia/scriptures-source-crosswire-kjv/metadata';
```

### Lazy Loading

```typescript
// Register without loading data
import '@metaxia/scriptures-source-crosswire-kjv/register';

import { getVerse } from '@metaxia/scriptures';

// Data loads on demand
const verse = await getVerse('Genesis', 1, 1, { edition: 'crosswire-KJV' });
```

## Contents

- **Edition**: crosswire-KJV
- **Language**: English
- **Books**: 66 (Genesis–Revelation)
- **Verses**: 31,102

## Data Format

Each verse is stored as a JSON file:

```json
{
  "id": "crosswire-KJV:Gen.1.1",
  "text": "In the beginning God created the heaven and the earth.",
  "words": [
    {
      "position": 1,
      "text": "In",
      "strong": "H7225"
    }
  ]
}
```

## License

Scripture text sourced from [CrossWire Bible Society](https://wiki.crosswire.org/CrossWire_KJV), used under their general public license.
