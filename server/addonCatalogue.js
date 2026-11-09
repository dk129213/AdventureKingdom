// --- Add-on catalogue ---
// The single list of add-ons a customer can choose when booking a party.
//
// Everything reads from here: the booking form renders it, the server prices against it,
// and the dashboards and emails resolve names from it. Adding an add-on means adding an
// entry here and a matching block on the booking form — no database change is needed,
// because add-ons are stored as rows, not as columns.
//
// pricingMode:
//   'unit'      — the customer picks a quantity (e.g. 2 pizzas)
//   'per_child' — charged for every child at the party; quantity comes from num_children
//   'flat'      — one per party; quantity is always 1

const ADDONS = [
  {
    id: 'addon_pizza',
    nameHr: 'Dodatna pizza',
    nameEn: 'Extra pizza',
    price: 10.00,
    pricingMode: 'unit',
  },
  {
    id: 'addon_cake',
    nameHr: 'Dodatna Ledo torta',
    nameEn: 'Extra Ledo cake',
    price: 20.00,
    pricingMode: 'unit',
  },
  {
    id: 'addon_mascot',
    nameHr: 'Maskota',
    nameEn: 'Mascot',
    price: 20.00,
    pricingMode: 'flat',
  },
  {
    id: 'addon_pinata',
    nameHr: 'Pinjata u obliku maskote',
    nameEn: 'Mascot-shaped piñata',
    price: 20.00,
    pricingMode: 'flat',
  },
  {
    id: 'addon_extra_hour',
    // Not an extension of the birthday room: the room is handed over on schedule and the
    // children carry on playing in the playground for the extra hour. The coordinator
    // explains the timing to the parent, so no slot or opening hours change.
    nameHr: 'Dodatni sat igre u igraonici',
    nameEn: 'Extra hour of play in the playground',
    price: 100.00,
    pricingMode: 'flat',
  },
  {
    id: 'addon_cotton_candy',
    nameHr: 'Šećerna vata i dječji šampanjac',
    nameEn: "Cotton candy and kids' champagne",
    price: 2.00,
    pricingMode: 'per_child',
  },
  {
    id: 'addon_canvas',
    nameHr: 'Slikanje na platnu',
    nameEn: 'Canvas painting',
    price: 5.00,
    pricingMode: 'per_child',
  },
  {
    id: 'addon_braids',
    nameHr: 'Pletenice s mašnom',
    nameEn: 'Braids with a bow',
    price: 20.00,
    pricingMode: 'flat',
  },
];

// Add-ons no longer sold but still present on historical bookings. They are deliberately
// absent from ADDONS so nobody can book them, but still need a readable name.
const RETIRED_ADDONS = {
  // Customer-facing names only -- an edited old booking can re-send its confirmation email,
  // and "(retired)" is internal jargon. The admin form marks retired add-ons itself.
  addon_extra_child: { nameHr: 'Dodatna djeca', nameEn: 'Additional children' },
};

const addonsById = Object.fromEntries(ADDONS.map((a) => [a.id, a]));

module.exports = { ADDONS, RETIRED_ADDONS, addonsById };
