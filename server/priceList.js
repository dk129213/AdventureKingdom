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
// `sidrena: null` means the service did not exist on 10 September 2026, so no price
// applied to it then and there is no anchor price to state. The CSV leaves that field
// empty and the website says the service is new. Confirm this reading with the accountant.

// Identifies the outlet in the published file name (point VI).
const OUTLET = {
  oblik: 'usluzni-objekt',
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
  // NOTE: the supplied spreadsheet gives 24,00 € here. Every other ladder steps by the
  // hourly rate (6/12/…), which would make this 18,00 €. Left exactly as supplied —
  // published prices are binding, so this needs confirming before 17 November.
  { naziv: 'Mališani igranje 3 sata', cijena: 24.0, sidrena: 24.0, posebniOblik: null },
  { naziv: 'Mališani igranje 1 sat + zaštitna oprema', cijena: 8.0, sidrena: 8.0, posebniOblik: null },
  { naziv: 'Mališani igranje 2 sata + zaštitna oprema', cijena: 14.0, sidrena: 14.0, posebniOblik: null },
  { naziv: 'Mališani igranje 3 sata + zaštitna oprema', cijena: 20.0, sidrena: 20.0, posebniOblik: null },
  { naziv: 'Osvježenje uz igru', cijena: 1.0, sidrena: 1.0, posebniOblik: null },
  { naziv: 'Dodatna zaštitna oprema', cijena: 2.0, sidrena: 2.0, posebniOblik: null },
  { naziv: 'Mjesečni paket "Lavići"', cijena: 300.0, sidrena: 300.0, posebniOblik: null },

  // --- Rođendanske proslave ---
  { naziv: 'Lion rođendanski paket', cijena: 290.0, sidrena: 290.0, posebniOblik: null },
  { naziv: 'Royal rođendanski paket', cijena: 440.0, sidrena: 440.0, posebniOblik: null },
  { naziv: 'Proširenja menija - pizza', cijena: 10.0, sidrena: 10.0, posebniOblik: null },
  { naziv: 'Proširenja menija - torta', cijena: 20.0, sidrena: 20.0, posebniOblik: null },
  { naziv: 'Proširenja menija - sok', cijena: 3.0, sidrena: 3.0, posebniOblik: null },
  { naziv: 'Proširenja menija - nuggets', cijena: 9.0, sidrena: 9.0, posebniOblik: null },
  { naziv: 'Zaštitna oprema za rođendan', cijena: 2.0, sidrena: 2.0, posebniOblik: null },
  { naziv: 'Kostimiranje', cijena: 20.0, sidrena: 20.0, posebniOblik: null },
  { naziv: 'Dodatni sat rođendana', cijena: 100.0, sidrena: 100.0, posebniOblik: null },

  // --- Dodaci uvedeni nakon 10.9.2026. (nemaju sidrenu cijenu) ---
  // These six are bookable on the website but are absent from the supplied spreadsheet
  // because they were introduced after the 10 September 2026 reference date.
  { naziv: 'Maskota', cijena: 20.0, sidrena: null, posebniOblik: null },
  { naziv: 'Pinjata u obliku maskote', cijena: 20.0, sidrena: null, posebniOblik: null },
  { naziv: 'Šećerna vata i dječji šampanjac (po djetetu)', cijena: 2.0, sidrena: null, posebniOblik: null },
  { naziv: 'Slikanje na platnu (po djetetu)', cijena: 5.0, sidrena: null, posebniOblik: null },
  { naziv: 'Pletenice s mašnom', cijena: 20.0, sidrena: null, posebniOblik: null },
];

/** Look up one service by its exact published name. Used to put the anchor price on the page. */
const byName = Object.fromEntries(SERVICES.map((s) => [s.naziv, s]));

module.exports = { OUTLET, SERVICES, byName };
