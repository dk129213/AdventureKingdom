// --- Objava cjenika / Machine-readable price list publishing ---
//
// Implements Odluka o objavi cjenika proizvoda i usluga kao mjera izravne kontrole cijena
// (NN 101/2026, amended by NN 110/2026 — in force 17 November 2026):
//
//   II.  .csv or .xml, suitable for automatic processing. A service provider updates on
//        every change, by 08:00 on the day the change is published. Published price lists
//        stay available for 30 days from publication / from each change.
//   IV.  For each service: naziv usluge; maloprodajna cijena + whether it was applied
//        during a special form of sale, with that sale's name; sidrena cijena.
//   VI.  The file name includes the outlet type, the outlet address, the outlet label,
//        the storage number and a timestamp with the date and time the file was sent.
//   VII. Automated collection in real time must be possible.
//
// A new version is written only when the content actually changes, so restarts and
// redeploys do not spam the archive with identical files.

const fs = require('fs');
const path = require('path');
const { OUTLET, SERVICES } = require('./priceList');

const DIR = path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'cjenik');
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

const RETENTION_DAYS = 30;
const SEP = ';'; // Croatian convention: semicolon separator, decimal comma
const BOM = '﻿'; // so the file opens correctly in Excel for an inspector

const HEADER = [
  'naziv_usluge',
  'maloprodajna_cijena',
  'posebni_oblik_prodaje',
  'naziv_posebnog_oblika_prodaje',
  'sidrena_cijena',
];

/** ASCII slug — file names must survive any filesystem and any inspector's tooling. */
function slug(text) {
  const map = { š: 's', Š: 's', đ: 'd', Đ: 'd', č: 'c', Č: 'c', ć: 'c', Ć: 'c', ž: 'z', Ž: 'z' };
  return String(text)
    .replace(/[šŠđĐčČćĆžŽ]/g, (c) => map[c])
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** 1234.5 -> "1234,50" */
function money(value) {
  return Number(value).toFixed(2).replace('.', ',');
}

/** A CSV field: quote it only when it has to be quoted. */
function field(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** The price list as CSV text, exactly the columns point IV requires. */
function buildCsv() {
  const rows = [HEADER.join(SEP)];
  for (const s of SERVICES) {
    rows.push([
      field(s.naziv),
      field(money(s.cijena)),
      field(s.posebniOblik ? 'DA' : 'NE'),
      field(s.posebniOblik || ''),
      // Empty when the service did not exist on 10.9.2026 and so had no price that day.
      field(s.sidrena === null || s.sidrena === undefined ? '' : money(s.sidrena)),
    ].join(SEP));
  }
  return BOM + rows.join('\r\n') + '\r\n';
}

/** `usluzni-objekt_<adresa>_<oznaka>_<brojPohrane>_<YYYYMMDD-HHmm>.csv` (point VI). */
function fileNameFor(brojPohrane, when = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${when.getFullYear()}${p(when.getMonth() + 1)}${p(when.getDate())}`
    + `-${p(when.getHours())}${p(when.getMinutes())}`;
  return [slug(OUTLET.oblik), slug(OUTLET.adresa), slug(OUTLET.oznaka), brojPohrane, stamp].join('_') + '.csv';
}

const FILE_RE = /^([a-z0-9-]+)_([a-z0-9-]+)_([a-z0-9-]+)_(\d+)_(\d{8}-\d{4})\.csv$/;

/** Every published version, newest first. */
function listVersions() {
  return fs.readdirSync(DIR)
    .filter((f) => FILE_RE.test(f))
    .map((f) => {
      const m = f.match(FILE_RE);
      return { file: f, brojPohrane: parseInt(m[4], 10), stamp: m[5], mtime: fs.statSync(path.join(DIR, f)).mtimeMs };
    })
    .sort((a, b) => b.brojPohrane - a.brojPohrane);
}

function readVersion(file) {
  if (!FILE_RE.test(file)) return null; // nothing but our own files, ever
  const full = path.join(DIR, file);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, 'utf8');
}

/** Drop versions older than the 30 days point II requires them to stay available for. */
function prune() {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const versions = listVersions();
  for (const v of versions.slice(1)) {       // never delete the current one
    if (v.mtime < cutoff) {
      try { fs.unlinkSync(path.join(DIR, v.file)); } catch { /* already gone */ }
    }
  }
}

/**
 * Publish the current price list if it differs from the newest published version.
 * Returns the current version either way.
 */
function publishIfChanged() {
  const csv = buildCsv();
  const versions = listVersions();
  const newest = versions[0];

  if (newest && readVersion(newest.file) === csv) {
    prune();
    return newest;
  }

  const brojPohrane = newest ? newest.brojPohrane + 1 : 1;
  const file = fileNameFor(brojPohrane);
  fs.writeFileSync(path.join(DIR, file), csv, 'utf8');
  console.log(`Cjenik: published ${file} (${SERVICES.length} services).`);
  prune();
  return listVersions()[0];
}

function current() {
  const versions = listVersions();
  return versions[0] || publishIfChanged();
}

module.exports = {
  DIR, RETENTION_DAYS, OUTLET,
  buildCsv, fileNameFor, listVersions, readVersion, publishIfChanged, current, money, slug,
};
