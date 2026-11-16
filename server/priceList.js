// --- Cjenik usluga / Service price list ---
//
// Single source of truth for the machine-readable price list required by:
//
//   Odluka o objavi cjenika proizvoda i usluga kao mjera izravne kontrole cijena
//   (NN 101/2026), as amended by NN 110/2026 — in force 17 November 2026
//
//   Odluka o isticanju dodatne cijene kao mjera izravne kontrole cijena
//   (NN 101/2026), as amended by NN 110/2026 — in force 17 November 2026
//
// Point IV of the first decision lists exactly what a service provider must publish for
// each service: the name, the retail price together with whether it was applied during a
// special form of sale (and that sale's name), and the anchor price.
//
// `sidrena` is the price that applied on 10 September 2026 — the reference date fixed by
// point II of the second decision. It is NOT today's price and must not be edited when a
// price changes; it stays as it was on that date, for ever.
//
// `sidrenaOd` is the date the anchor price is stated as of. It defaults to the statutory
// reference date, 10.9.2026. Services introduced after that date had no price then, so on
// the owner's instruction (16 November 2026) they carry their current price as the anchor,
// stated as of the day it was set rather than as of 10.9.2026. The CSV has no date column
// — point IV does not provide one — so the date shows on the website instead, which is
// what the anchor price is for.
//
// Source: cjenik_adventure_kingdom.xlsx supplied 16 November 2026, which replaced the
// 12 November version in full. Transcribed verbatim apart from one stray space inside
// "( 2. dijete)".

// The statutory reference date for the anchor price (Odluka NN 101/2026, point II).
const SIDRENA_REFERENCE = '10.9.2026.';

// The date the five services introduced after the reference date had their anchor set.
const SIDRENA_NEW_SERVICES = '16.11.2026.';

// Identifies the outlet in the published file name (point VI).
//
// `oblik` is the outlet-type token. The collection systems recognise a fixed set of
// categories -- supermarket, hipermarket, diskont, cash&carry -- and everything else,
// including service activities, falls under "ostalo". Adventure Kingdom's registered
// activity is NKD 93.21.0 (zabavni i tematski parkovi / igraonica), so it is a service
// provider, not a goods trader. A descriptive token like "usluzni-objekt" reads well to a
// human but risks being rejected as an unknown category by an automated reader, so the
// official "ostalo" is used instead. (Accountant's guidance, 16 November 2026.)
const OUTLET = {
  oblik: 'ostalo',
  naziv: 'Adventure Kingdom',
  adresa: 'Šetalište dr. Franje Tuđmana 4a, 20207 Srebreno',
  oznaka: 'AK1',
};

// `posebniOblik` names a special form of sale (sezonsko sniženje, akcija, rasprodaja…)
// when the current price is a promotional one. null means the regular price applies.
const SERVICES = [
  // --- Igraonica (satni boravak) ---
  { naziv: 'Igranje + zaštitna oprema 1 sat', cijena: 10.0, sidrena: 10.0, posebniOblik: null },
  { naziv: 'Igranje + zaštitna oprema 2 sata', cijena: 18.0, sidrena: 18.0, posebniOblik: null },
  { naziv: 'Igranje + zaštitna oprema 3 sata', cijena: 26.0, sidrena: 26.0, posebniOblik: null },
  { naziv: 'Igranje 1 sat', cijena: 8.0, sidrena: 8.0, posebniOblik: null },
  { naziv: 'Igranje 2 sata', cijena: 16.0, sidrena: 16.0, posebniOblik: null },
  { naziv: 'Igranje 3 sata', cijena: 24.0, sidrena: 24.0, posebniOblik: null },
  { naziv: 'Mališani igranje 1 sat', cijena: 6.0, sidrena: 6.0, posebniOblik: null },
  { naziv: 'Mališani igranje 2 sata', cijena: 12.0, sidrena: 12.0, posebniOblik: null },
  { naziv: 'Mališani igranje 3 sata', cijena: 18.0, sidrena: 18.0, posebniOblik: null },
  { naziv: 'Mališani igranje 1 sat + zaštitna oprema', cijena: 8.0, sidrena: 8.0, posebniOblik: null },
  { naziv: 'Mališani igranje 2 sata + zaštitna oprema', cijena: 14.0, sidrena: 14.0, posebniOblik: null },
  { naziv: 'Mališani igranje 3 sata + zaštitna oprema', cijena: 20.0, sidrena: 20.0, posebniOblik: null },
  { naziv: 'Osvježenje uz igru', cijena: 1.0, sidrena: 1.0, posebniOblik: null },
  { naziv: 'Dodatna zaštitna oprema', cijena: 2.0, sidrena: 2.0, posebniOblik: null },
  { naziv: 'Mjesečni paket "Lavići"', cijena: 300.0, sidrena: 300.0, posebniOblik: null },

  // --- Rođendanske proslave ---
  { naziv: 'Lion rođendanski paket', cijena: 290.0, sidrena: 290.0, posebniOblik: null },
  { naziv: 'Royal rođendanski paket', cijena: 440.0, sidrena: 440.0, posebniOblik: null },
  { naziv: 'Proširenje menija - pizza', cijena: 10.0, sidrena: 10.0, posebniOblik: null },
  { naziv: 'Proširenje menija - torta', cijena: 20.0, sidrena: 20.0, posebniOblik: null },
  { naziv: 'Dodatna zaštitna oprema za rođendan', cijena: 2.0, sidrena: 2.0, posebniOblik: null },
  { naziv: 'Proširenje menija - sok', cijena: 3.0, sidrena: 3.0, posebniOblik: null },
  { naziv: 'Kostimiranje', cijena: 20.0, sidrena: 20.0, posebniOblik: null },
  { naziv: 'Proširenje menija - nuggets', cijena: 9.0, sidrena: 9.0, posebniOblik: null },
  { naziv: 'Dodatni sat rođendana', cijena: 100.0, sidrena: 100.0, posebniOblik: null },
  { naziv: 'Proširenje menija - dječji šampanjac', cijena: 2.0, sidrena: 2.0, sidrenaOd: SIDRENA_NEW_SERVICES, posebniOblik: null },
  { naziv: 'Proširenje menija - pletenice', cijena: 3.0, sidrena: 3.0, sidrenaOd: SIDRENA_NEW_SERVICES, posebniOblik: null },
  { naziv: 'Proširenje menija - slikanje na platnu', cijena: 5.0, sidrena: 5.0, sidrenaOd: SIDRENA_NEW_SERVICES, posebniOblik: null },

  // --- Radionice ---
  { naziv: 'Standardna kreativna radionica', cijena: 15.0, sidrena: 15.0, sidrenaOd: SIDRENA_NEW_SERVICES, posebniOblik: null },
  { naziv: 'Premium kreativna radionica', cijena: 20.0, sidrena: 20.0, sidrenaOd: SIDRENA_NEW_SERVICES, posebniOblik: null },
  { naziv: 'Tjedni program, animacija', cijena: 250.0, sidrena: 250.0, posebniOblik: null },
  { naziv: 'Tjedni program, animacija, 1 dan', cijena: 50.0, sidrena: 50.0, posebniOblik: null },
  { naziv: 'Tjedni program, animacija, (2. dijete)', cijena: 175.0, sidrena: 175.0, posebniOblik: null },
];

/** Look up one service by its exact published name. Used to put the anchor price on the page. */
const byName = Object.fromEntries(SERVICES.map((s) => [s.naziv, s]));

module.exports = { OUTLET, SERVICES, byName, SIDRENA_REFERENCE, SIDRENA_NEW_SERVICES };
