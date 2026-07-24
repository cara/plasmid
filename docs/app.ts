/**
 * GitHub Pages demo for @carabennemsi/plasmid.
 *
 * Two entry points into the same renderer: a gallery of Sleeping Beauty
 * vectors shipped as GenBank files under ./samples, and a paste/drop box for
 * the visitor's own sequence. Everything is client-side — the samples are the
 * only network requests the page makes.
 */
import {
  featureColor,
  parsePlasmid,
  renderPlasmidSVG,
  type InputFormat,
  type PlasmidRecord,
} from '../src/index';

interface SampleVector {
  file: string;
  name: string;
  family: string;
  bp: number;
  description: string;
}

interface SampleManifest {
  source: {
    title: string;
    thesis: string;
    doi: string;
    doiUrl: string;
    note: string;
  };
  vectors: SampleVector[];
}

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node as T;
};

const gallery = el<HTMLDivElement>('gallery');
const stageTitle = el<HTMLHeadingElement>('stage-title');
const mapBox = el<HTMLDivElement>('map');
const metaBox = el<HTMLDivElement>('meta');
const downloads = el<HTMLDivElement>('downloads');
const dropzone = el<HTMLDivElement>('dropzone');
const input = el<HTMLTextAreaElement>('dna-input');
const formatSel = el<HTMLSelectElement>('format');
const topologySel = el<HTMLSelectElement>('topology');
const fileInput = el<HTMLInputElement>('file');
const errorOut = el<HTMLSpanElement>('render-error');

let manifest: SampleManifest | null = null;
/** Attribution shown next to a map, when it came from the thesis sample set. */
let currentAttribution: string | null = null;
let currentSVG = '';
let currentName = 'plasmid';

// ---------------------------------------------------------------- rendering

function draw(record: PlasmidRecord, attribution: string | null): void {
  currentAttribution = attribution;
  currentName = record.name || 'plasmid';
  currentSVG = renderPlasmidSVG(record, { size: 760 });

  stageTitle.textContent = currentName;
  // Safe against a hostile pasted GenBank file: renderPlasmidSVG runs every
  // record-derived string through its XML escaper (&, <, >, ") and quotes all
  // attributes, so a crafted feature label cannot open a tag or smuggle in an
  // onload= handler.
  mapBox.innerHTML = currentSVG;
  renderMeta(record);
  renderDownloads();
  mapBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderMeta(record: PlasmidRecord): void {
  const features = record.features ?? [];
  const rows = features
    .slice()
    .sort((a, b) => a.start - b.start)
    .map((f) => {
      const { fill, border } = featureColor(f.name, f.type);
      const strand = f.strand === -1 ? '←' : f.strand === 1 ? '→' : '';
      return `<li>
        <span class="swatch" style="background:${fill};border:1px solid ${border}"></span>
        <span class="f-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</span>
        <span class="f-pos">${f.start}–${f.end} ${strand}</span>
      </li>`;
    })
    .join('');

  metaBox.innerHTML = `
    <dl>
      <dt>Length</dt><dd>${record.sequence.length.toLocaleString('en-US')} bp</dd>
      <dt>Topology</dt><dd>${record.circular === false ? 'Linear' : 'Circular'}</dd>
      <dt>Features</dt><dd>${features.length}</dd>
    </dl>
    <h3>Annotations</h3>
    <ul class="featurelist">${rows || '<li>No annotated features.</li>'}</ul>
    ${currentAttribution ? `<p class="attribution">${currentAttribution}</p>` : ''}
  `;
}

function renderDownloads(): void {
  downloads.innerHTML = '';
  const svgBtn = button('Download SVG', () => downloadBlob(currentSVG, 'image/svg+xml', `${currentName}.svg`));
  const pngBtn = button('Download PNG', () => downloadPNG());
  downloads.append(svgBtn, pngBtn);
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function downloadBlob(data: BlobPart, type: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Rasterise the SVG through a canvas — no rasteriser dependency needed. */
function downloadPNG(): void {
  const svgUrl = URL.createObjectURL(new Blob([currentSVG], { type: 'image/svg+xml' }));
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || 760;
    canvas.height = img.naturalHeight || 760;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) downloadBlob(blob, 'image/png', `${currentName}.png`);
      });
    }
    URL.revokeObjectURL(svgUrl);
  };
  img.onerror = () => URL.revokeObjectURL(svgUrl);
  img.src = svgUrl;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
  );
}

// ------------------------------------------------------------------ samples

async function loadSamples(): Promise<void> {
  const res = await fetch('./samples/index.json');
  if (!res.ok) throw new Error(`sample manifest: HTTP ${res.status}`);
  manifest = (await res.json()) as SampleManifest;

  for (const vector of manifest.vectors) {
    const card = document.createElement('button');
    card.className = 'card';
    card.type = 'button';
    card.innerHTML = `
      <span class="c-name">${escapeHtml(vector.name)}</span>
      <span class="c-meta">
        <span class="c-tag">${escapeHtml(vector.family)}</span>
        <span>${vector.bp.toLocaleString('en-US')} bp</span>
      </span>
      <span class="c-desc">${escapeHtml(vector.description)}</span>
    `;
    card.addEventListener('click', () => void showSample(vector, card));
    gallery.append(card);
  }
}

async function showSample(vector: SampleVector, card: HTMLElement): Promise<void> {
  for (const other of gallery.querySelectorAll('.card')) other.classList.remove('is-active');
  card.classList.add('is-active');

  const res = await fetch(`./samples/${vector.file}`);
  if (!res.ok) {
    mapBox.innerHTML = `<div class="placeholder">Could not load ${escapeHtml(vector.file)} (HTTP ${res.status}).</div>`;
    return;
  }
  const genbank = await res.text();
  const record = parsePlasmid(genbank, 'genbank');
  record.name = vector.name;

  const doi = escapeHtml(manifest?.source.doiUrl ?? 'https://doi.org/10.25972/OPUS-24979');
  draw(
    record,
    `Sequence from the dissertation <a href="${doi}">DOI:10.25972/OPUS-24979</a>, ` +
      `© Severin Fink. ${escapeHtml(manifest?.source.note ?? '')}`
  );

  // Mirror the sample into the editor so it doubles as a worked example.
  input.value = genbank;
  formatSel.value = 'genbank';
  topologySel.value = record.circular === false ? 'linear' : 'circular';
}

// --------------------------------------------------------- render-your-own

function renderFromInput(): void {
  errorOut.textContent = '';
  const text = input.value.trim();
  if (!text) {
    errorOut.textContent = 'Paste a sequence first.';
    return;
  }
  try {
    // "auto" is a UI-only choice — parsePlasmid sniffs the format when the
    // argument is omitted, and treats any unrecognised value as raw.
    const fmt = formatSel.value === 'auto' ? undefined : (formatSel.value as InputFormat);
    const record = parsePlasmid(text, fmt);
    // GenBank carries its own topology in the LOCUS line; only FASTA and raw
    // input need the dropdown to decide.
    if (fmt !== 'genbank') record.circular = topologySel.value === 'circular';
    if (record.sequence.replace(/[^ACGTacgt]/g, '').length === 0) {
      errorOut.textContent = 'No nucleotide sequence found in the input.';
      return;
    }
    draw(record, null);
    for (const card of gallery.querySelectorAll('.card')) card.classList.remove('is-active');
  } catch (err) {
    errorOut.textContent = err instanceof Error ? err.message : String(err);
  }
}

function wireRenderControls(): void {
  el<HTMLButtonElement>('render-btn').addEventListener('click', renderFromInput);

  el<HTMLButtonElement>('sample-btn').addEventListener('click', () => {
    const first = manifest?.vectors[3] ?? manifest?.vectors[0];
    const card = gallery.querySelectorAll<HTMLElement>('.card')[first ? manifest!.vectors.indexOf(first) : 0];
    if (first && card) void showSample(first, card);
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    file.text().then((text) => {
      input.value = text;
      formatSel.value = 'auto';
      renderFromInput();
    });
  });

  for (const type of ['dragenter', 'dragover'] as const) {
    dropzone.addEventListener(type, (e) => {
      e.preventDefault();
      dropzone.classList.add('is-dragover');
    });
  }
  for (const type of ['dragleave', 'drop'] as const) {
    dropzone.addEventListener(type, () => dropzone.classList.remove('is-dragover'));
  }
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    file.text().then((text) => {
      input.value = text;
      formatSel.value = 'auto';
      renderFromInput();
    });
  });
}

wireRenderControls();
loadSamples().catch((err) => {
  gallery.innerHTML = `<p class="hint">Could not load the sample vectors: ${escapeHtml(String(err))}</p>`;
});
