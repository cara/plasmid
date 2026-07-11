# @cara/plasmid

> Dependency-free plasmid map renderer — turn a DNA sequence or FASTA/GenBank file into a standalone circular-map SVG. Runs in Node and the browser.

`@cara/plasmid` takes a nucleotide sequence (or a parsed FASTA / GenBank record) and returns a complete, self-contained `<svg>…</svg>` string: a circular plasmid map with feature arrows, restriction cut sites, a base-pair ruler, and a centered name/length label. Everything is a pure function — no DOM, no canvas, no runtime dependencies — so the same code path works on a server (static pre-render) and in the browser.

## Features

- **Circular-map SVG in one call** — `renderPlasmidSVG(record)` returns a full standalone `<svg>` string you can write to disk, inline into HTML, or rasterize.
- **Zero runtime dependencies**, ESM-only, and isomorphic (Node + browser). No DOM required.
- **Parsers included** — FASTA, GenBank, and raw sequence, with automatic format detection.
- **Smart layout** — features are auto-assigned to non-overlapping lanes and drawn as arcs/arrows; wide features get curved on-arc labels, narrow ones get external leader labels.
- **Restriction analysis** — find sites on both strands (with origin wrap for circular molecules) and draw unique cutters from a built-in type-II enzyme panel.
- **Automatic annotation** — when a record has no features, a bundled common-feature panel (AmpR, KanR, common origins/promoters/primers) is exact-matched on both strands.
- **Deterministic colors** — well-known feature classes get conventional colors; everything else is hashed to a stable hue.

## Install

```sh
npm i @cara/plasmid
```

Requires Node ≥ 18 (or any modern browser). The package is ESM-only.

## Quick start (Node)

Parse a FASTA or GenBank string, render it, and write the SVG to disk:

```ts
import { readFileSync, writeFileSync } from 'node:fs';
import { parsePlasmid, renderPlasmidSVG } from '@cara/plasmid';

const text = readFileSync('pUC19.gb', 'utf8');
const record = parsePlasmid(text); // format auto-detected (GenBank / FASTA / raw)

const svg = renderPlasmidSVG(record);
writeFileSync('plasmid.svg', svg);
```

Or build a `PlasmidRecord` by hand:

```ts
import { writeFileSync } from 'node:fs';
import { renderPlasmidSVG, type PlasmidRecord } from '@cara/plasmid';

const record: PlasmidRecord = {
  name: 'my-plasmid',
  sequence: 'ATGCGT...ACGT', // your nucleotide sequence
  circular: true,
  features: [
    { name: 'AmpR', type: 'CDS', start: 100, end: 960, strand: 1 },
    { name: 'ori', type: 'rep_origin', start: 1200, end: 1788, strand: -1 },
    // A feature that wraps the origin has start > end:
    { name: 'cassette', type: 'misc_feature', start: 2600, end: 40, strand: 1 },
  ],
};

writeFileSync('plasmid.svg', renderPlasmidSVG(record));
```

With no `features` supplied and `detectFeatures` on (the default), the renderer auto-detects common features for you:

```ts
const svg = renderPlasmidSVG({ name: 'unknown', sequence });
```

## Rasterize to PNG

`@cara/plasmid` only produces SVG strings — it has no rendering dependency. To get a PNG, pipe the SVG through any SVG rasterizer of your choice. [`@resvg/resvg-js`](https://github.com/thx/resvg-js) is a good pure-Rust option (install it yourself; it is **not** a dependency of this package):

```ts
import { writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import { parsePlasmid, renderPlasmidSVG } from '@cara/plasmid';

const svg = renderPlasmidSVG(parsePlasmid(fastaText));
const png = new Resvg(svg).render().asPng();
writeFileSync('plasmid.png', png);
```

## Browser usage

`renderPlasmidSVG` returns a plain string, so inlining it is just an `innerHTML` assignment — no DOM APIs are touched inside the library:

```js
import { renderPlasmidSVG } from '@cara/plasmid';

const record = { name: 'my-plasmid', sequence };
document.querySelector('#map').innerHTML = renderPlasmidSVG(record);
```

## How it looks

The default output is an 800×800 SVG (`viewBox="0 0 800 800"`) containing:

- a circular backbone with a base-pair ruler and evenly spaced ticks,
- feature arrows/arcs colored by class, placed on auto-assigned lanes so they never overlap,
- on-arc curved labels for wide features and external leader-line labels for narrow ones,
- unique restriction cut sites (from the enzyme panel) marked around the circle,
- the plasmid name and length (in bp) centered in the middle.

## API reference

All exports are pure functions and data — importing the package has no side effects.

### `renderPlasmidSVG(record, opts?) => string`

```ts
function renderPlasmidSVG(record: PlasmidRecord, opts?: RenderOptions): string;
```

Renders `record` to a complete, standalone `<svg>…</svg>` string. Non-ACGT characters in `record.sequence` are ignored when computing length and drawing. If `record.features` is empty and `opts.detectFeatures` is on (default), common features are auto-detected first. See [`RenderOptions`](#renderoptions) for all knobs.

### `parsePlasmid(text, format?) => PlasmidRecord`

```ts
function parsePlasmid(text: string, format?: 'genbank' | 'fasta' | 'raw'): PlasmidRecord;
```

Parses `text` into a `PlasmidRecord`. When `format` is omitted the format is auto-detected via [`detectFormat`](#detectformattext--genbank--fasta--raw).

### `parseFasta(text) => PlasmidRecord`

Parses a FASTA record.

### `parseGenBank(text) => PlasmidRecord`

Parses a GenBank record, including its features and `DEFINITION`.

### `parseRaw(text, name?) => PlasmidRecord`

Wraps a bare nucleotide string in a `PlasmidRecord`, using the optional `name` as the display name.

### `detectFormat(text) => 'genbank' | 'fasta' | 'raw'`

Sniffs `text` and returns the detected input format. (The `'genbank' | 'fasta' | 'raw'` union is also exported as the `InputFormat` type.)

### `findSites(sequence, site, circular) => number[]`

```ts
function findSites(sequence: string, site: string, circular: boolean): number[];
```

Returns the 0-based start indices of every occurrence of `site` on **both** strands. When `circular` is true, matches that span the origin are included (the sequence is treated as a loop).

### `findCutters(sequence, circular, enzymes?, maxCutFrequency?) => { enzyme: string; positions: number[] }[]`

```ts
function findCutters(
  sequence: string,
  circular: boolean,
  enzymes?: EnzymeSpec[],
  maxCutFrequency?: number,
): { enzyme: string; positions: number[] }[];
```

Scans `sequence` for each enzyme's site (defaults to [`DEFAULT_ENZYMES`](#default_enzymes-enzymespec)) and returns the cut positions per enzyme. `maxCutFrequency` filters by cut count — e.g. `1` keeps only unique cutters, `0` disables the filter.

### `reverseComplement(seq) => string`

```ts
function reverseComplement(seq: string): string;
```

Returns the reverse complement of a nucleotide string.

### `DEFAULT_ENZYMES: EnzymeSpec[]`

A built-in panel of common type-II restriction enzymes (EcoRI, BamHI, HindIII, XhoI, NotI, …). Use it as-is, or pass your own array to `findCutters` / `RenderOptions.enzymes`.

### `detectCommonFeatures(sequence, circular?) => Feature[]`

```ts
function detectCommonFeatures(sequence: string, circular?: boolean): Feature[];
```

Exact-matches the bundled common-feature panel (AmpR, KanR, common origins/promoters/primers) against `sequence` on both strands and returns the hits as `Feature`s (with correct `strand` and origin-wrapping coordinates when `circular`).

### `COMMON_FEATURES`

The bundled common-feature panel data used by `detectCommonFeatures`.

### `featureColor(name, type?) => { fill: string; border: string }`

```ts
function featureColor(name: string, type?: string): { fill: string; border: string };
```

Returns the deterministic `fill`/`border` colors for a feature. Well-known classes get conventional colors; anything else is hashed to a stable hue, so the same feature always renders the same color.

## Types

### `Strand`

```ts
type Strand = 1 | -1 | 0;
```

`1` = forward (sense), `-1` = reverse, `0`/`undefined` = unstranded.

### `Feature`

```ts
interface Feature {
  name: string;      // label drawn on the map
  type?: string;     // feature class, e.g. "CDS", "promoter", "rep_origin"; drives color
  start: number;     // 1-based inclusive start
  end: number;       // 1-based inclusive end (may be < start — see below)
  strand?: Strand;
}
```

> **Coordinate convention.** `start` and `end` are **1-based and inclusive**, following the GenBank / SnapGene convention. A feature that **wraps the origin** of a circular molecule has **`start > end`** (it runs from `start` to the end of the sequence and continues from position 1 to `end`).

### `PlasmidRecord`

```ts
interface PlasmidRecord {
  name: string;        // display name, drawn in the center of the map
  sequence: string;    // raw nucleotide sequence; non-ACGT chars are ignored for rendering
  circular?: boolean;  // circular (plasmid) vs linear — default true
  features?: Feature[]; // known annotations; auto-detected when empty and detectFeatures is on
  definition?: string; // free-text description (e.g. GenBank DEFINITION); carried through, not drawn
}
```

### `EnzymeSpec`

```ts
interface EnzymeSpec {
  name: string; // e.g. "EcoRI"
  site: string; // recognition site on the sense strand, e.g. "GAATTC"
}
```

### `RenderOptions`

```ts
interface RenderOptions {
  size?: number;
  showCutters?: boolean;
  maxCutFrequency?: number;
  enzymes?: EnzymeSpec[];
  showFeatures?: boolean;
  showTicks?: boolean;
  detectFeatures?: boolean;
  title?: string;
}
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `size` | `number` | `800` | SVG viewport size (square); sets `viewBox="0 0 size size"`. |
| `showCutters` | `boolean` | `true` | Draw restriction cut sites. |
| `maxCutFrequency` | `number` | `1` | Only draw enzymes that cut exactly this many times (`1` = unique cutters read best). `0` = no filter. |
| `enzymes` | `EnzymeSpec[]` | `DEFAULT_ENZYMES` | Enzymes to scan for. |
| `showFeatures` | `boolean` | `true` | Draw feature arrows/arcs. |
| `showTicks` | `boolean` | `true` | Draw the base-pair tick ruler. |
| `detectFeatures` | `boolean` | `true` | When the record has no features, auto-detect the bundled common-feature panel. |
| `title` | `string` | `record.name` | Title override drawn in the center. |

## How detection works

- **Restriction sites** — for each enzyme site, the sequence is scanned on **both strands**. For circular molecules, matches that **span the origin** are found as well (the sequence is treated as a loop). Cut counts are then filtered by `maxCutFrequency` so, by default, only unique cutters are drawn.
- **Common features** — the bundled panel (AmpR, KanR, common origins/promoters/primers) is matched by **exact sequence** on both strands. Matches become `Feature`s with the correct strand and, on circular molecules, origin-wrapping coordinates (`start > end`).

Because everything is exact-match, detection is deterministic and reproducible: the same input always yields the same features, colors, and layout.

## License

MIT © cara
