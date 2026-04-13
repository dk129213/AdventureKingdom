const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_EMAIL,
    pass: process.env.SMTP_PASSWORD
  }
});

const SLOT_NAMES = {
  'morning': '9:00 - 11:00',
  'afternoon': '12:00 - 14:00',
  'late-afternoon': '15:00 - 17:00',
  'evening': '18:00 - 20:00'
};

const THEME_NAMES = { 'forest': 'Zacarana Suma / Enchanted Forest', 'royal': 'Kraljevska Soba / Royal Room' };
const PKG_NAMES = { 'lion': 'Lion Paket (290\u20AC)', 'royal': 'Royal Party Paket (440\u20AC)' };

// --- Send notification to owner when new reservation arrives ---
async function notifyOwner(reservation) {
  const r = reservation;
  try {
    await transporter.sendMail({
      from: `"Adventure Kingdom" <${process.env.SMTP_EMAIL}>`,
      to: process.env.NOTIFY_EMAIL,
      subject: `Nova rezervacija #${r.id} - ${r.child_name} (${r.party_date})`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#1A3A8F;color:white;padding:20px 24px;border-radius:12px 12px 0 0;">
            <h2 style="margin:0;color:#FFD700;">Nova Rezervacija!</h2>
            <p style="margin:4px 0 0;opacity:0.8;">Pristigao je novi zahtjev za rodendansku proslavu.</p>
          </div>
          <div style="background:#f9f9f9;padding:24px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 12px 12px;">
            <h3 style="color:#1A3A8F;margin-top:0;">Podaci o rezervaciji #${r.id}</h3>
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:8px 0;font-weight:bold;color:#555;width:40%;">Roditelj:</td><td style="padding:8px 0;">${r.parent_name}</td></tr>
              <tr><td style="padding:8px 0;font-weight:bold;color:#555;">Telefon:</td><td style="padding:8px 0;">${r.parent_phone}</td></tr>
              <tr><td style="padding:8px 0;font-weight:bold;color:#555;">Email:</td><td style="padding:8px 0;"><a href="mailto:${r.parent_email}">${r.parent_email}</a></td></tr>
              <tr><td colspan="2" style="border-top:1px solid #e0e0e0;padding:4px 0;"></td></tr>
              <tr><td style="padding:8px 0;font-weight:bold;color:#555;">Slavljenik:</td><td style="padding:8px 0;">${r.child_name} (${r.child_age} god.)</td></tr>
              <tr><td style="padding:8px 0;font-weight:bold;color:#555;">Datum:</td><td style="padding:8px 0;font-weight:bold;color:#1A3A8F;">${r.party_date}</td></tr>
              <tr><td style="padding:8px 0;font-weight:bold;color:#555;">Termin:</td><td style="padding:8px 0;">${SLOT_NAMES[r.time_slot] || r.time_slot}</td></tr>
              <tr><td style="padding:8px 0;font-weight:bold;color:#555;">Tema:</td><td style="padding:8px 0;">${THEME_NAMES[r.theme] || r.theme}</td></tr>
              <tr><td style="padding:8px 0;font-weight:bold;color:#555;">Paket:</td><td style="padding:8px 0;">${PKG_NAMES[r.package] || r.package}</td></tr>
              <tr><td colspan="2" style="border-top:1px solid #e0e0e0;padding:4px 0;"></td></tr>
              <tr><td style="padding:8px 0;font-weight:bold;color:#555;">Djeca:</td><td style="padding:8px 0;">${r.num_children}</td></tr>
              <tr><td style="padding:8px 0;font-weight:bold;color:#555;">Odrasli:</td><td style="padding:8px 0;">${r.num_adults}</td></tr>
              ${r.addon_pizza ? `<tr><td style="padding:8px 0;font-weight:bold;color:#555;">Dodatna pizza:</td><td style="padding:8px 0;">${r.addon_pizza}x (${r.addon_pizza * 10}\u20AC)</td></tr>` : ''}
              ${r.addon_cake ? `<tr><td style="padding:8px 0;font-weight:bold;color:#555;">Dodatna torta:</td><td style="padding:8px 0;">${r.addon_cake}x (${r.addon_cake * 20}\u20AC)</td></tr>` : ''}
              ${r.addon_extra_child ? `<tr><td style="padding:8px 0;font-weight:bold;color:#555;">Dodatna djeca:</td><td style="padding:8px 0;">${r.addon_extra_child}x (${r.addon_extra_child * 8}\u20AC)</td></tr>` : ''}
              <tr><td colspan="2" style="border-top:1px solid #e0e0e0;padding:4px 0;"></td></tr>
              <tr><td style="padding:8px 0;font-weight:bold;color:#555;">Procijenjeni iznos:</td><td style="padding:8px 0;font-size:18px;font-weight:bold;color:#27AE60;">${r.estimated_total}\u20AC</td></tr>
              ${r.notes ? `<tr><td style="padding:8px 0;font-weight:bold;color:#555;">Napomene:</td><td style="padding:8px 0;">${r.notes}</td></tr>` : ''}
            </table>
            <p style="margin-top:20px;color:#888;font-size:13px;">Potvrdite ili odbijte rezervaciju na staff panelu.</p>
          </div>
        </div>
      `
    });
    console.log(`Owner notification sent for reservation #${r.id}`);
  } catch (err) {
    console.error('Failed to send owner notification:', err.message);
  }
}

// --- Send auto-reply to customer ---
async function notifyCustomer(reservation) {
  const r = reservation;
  try {
    await transporter.sendMail({
      from: `"Adventure Kingdom" <${process.env.SMTP_EMAIL}>`,
      to: r.parent_email,
      subject: `Vasa rezervacija #${r.id} - Adventure Kingdom`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#1A3A8F;color:white;padding:24px;border-radius:12px 12px 0 0;text-align:center;">
            <h1 style="margin:0;color:#FFD700;font-size:24px;">Adventure Kingdom</h1>
            <p style="margin:8px 0 0;opacity:0.9;">Magicno kraljevstvo igre</p>
          </div>
          <div style="background:white;padding:28px;border:1px solid #e0e0e0;border-top:none;">
            <h2 style="color:#1A3A8F;margin-top:0;">Hvala vam, ${r.parent_name}!</h2>
            <p style="color:#555;line-height:1.6;">
              Zaprimili smo vas zahtjev za rezervaciju rodendanske proslave.
              Nas tim ce pregledati vas zahtjev i kontaktirati vas u roku od <strong>48 sati</strong>
              kako bi potvrdili dostupnost termina.
            </p>

            <div style="background:#FFF9E6;border:2px solid #FFD700;border-radius:8px;padding:20px;margin:20px 0;">
              <h3 style="color:#1A3A8F;margin-top:0;">Detalji vase rezervacije:</h3>
              <p style="margin:6px 0;color:#333;"><strong>Slavljenik:</strong> ${r.child_name} (${r.child_age} god.)</p>
              <p style="margin:6px 0;color:#333;"><strong>Datum:</strong> ${r.party_date}</p>
              <p style="margin:6px 0;color:#333;"><strong>Termin:</strong> ${SLOT_NAMES[r.time_slot] || r.time_slot}</p>
              <p style="margin:6px 0;color:#333;"><strong>Tema:</strong> ${THEME_NAMES[r.theme] || r.theme}</p>
              <p style="margin:6px 0;color:#333;"><strong>Paket:</strong> ${PKG_NAMES[r.package] || r.package}</p>
              <p style="margin:6px 0;color:#333;"><strong>Procijenjeni iznos:</strong> <span style="color:#27AE60;font-weight:bold;">${r.estimated_total}\u20AC</span></p>
              <p style="margin:6px 0;color:#888;font-size:13px;">Placanje se vrsi iskljucivo osobno na licu mjesta.</p>
            </div>

            <p style="color:#555;line-height:1.6;">
              Ako imate pitanja, slobodno nas kontaktirajte:
            </p>
            <p style="color:#333;">
              <strong>Telefon:</strong> +385 91 532 8953<br>
              <strong>Instagram:</strong> @adventure_kingdom
            </p>
          </div>
          <div style="background:#0A1229;padding:20px;border-radius:0 0 12px 12px;text-align:center;">
            <p style="color:#FFD700;margin:0;font-size:14px;font-weight:bold;">Adventure Kingdom</p>
            <p style="color:rgba(255,255,255,0.5);margin:4px 0 0;font-size:12px;">
              Setaliste dr. Franje Tudmana 4a, 20207 Srebreno
            </p>
          </div>
        </div>
      `
    });
    console.log(`Customer confirmation sent to ${r.parent_email}`);
  } catch (err) {
    console.error('Failed to send customer notification:', err.message);
  }
}

// --- Send status change email to customer (confirmed/rejected) — BILINGUAL ---
async function notifyStatusChange(reservation, newStatus, rejectionReason) {
  const r = reservation;

  const isConfirmed = newStatus === 'confirmed';
  const statusColorBg = isConfirmed ? '#27AE60' : '#E74C3C';
  const statusIcon = isConfirmed ? '&#x2705;' : '&#x274C;';

  const subject = isConfirmed
    ? `Rezervacija potvrdena! / Reservation confirmed! - Adventure Kingdom #${r.id}`
    : `Rezervacija odbijena / Reservation declined - Adventure Kingdom #${r.id}`;

  try {
    await transporter.sendMail({
      from: `"Adventure Kingdom" <${process.env.SMTP_EMAIL}>`,
      to: r.parent_email,
      subject,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#1A3A8F;color:white;padding:24px;border-radius:12px 12px 0 0;text-align:center;">
            <h1 style="margin:0;color:#FFD700;font-size:24px;">Adventure Kingdom</h1>
          </div>
          <div style="background:white;padding:28px;border:1px solid #e0e0e0;border-top:none;">

            <!-- CROATIAN -->
            <div style="margin-bottom:30px;padding-bottom:30px;border-bottom:2px solid #e0e0e0;">
              <div style="background:${statusColorBg};color:white;padding:12px 20px;border-radius:8px;text-align:center;margin-bottom:16px;">
                <h2 style="margin:0;font-size:18px;">${isConfirmed ? 'Vasa rezervacija je potvrdena!' : 'Vasa rezervacija je odbijena'}</h2>
              </div>

              <p style="color:#555;line-height:1.6;">
                Postovani/a ${r.parent_name},
              </p>
              ${isConfirmed ? `
                <p style="color:#555;line-height:1.6;">
                  Sa zadovoljstvom vam javljamo da je vasa rezervacija rodendanske proslave <strong>potvrdena</strong>!
                </p>
                <div style="background:#FFF9E6;border:2px solid #FFD700;border-radius:8px;padding:16px;margin:16px 0;">
                  <p style="margin:4px 0;color:#333;"><strong>Slavljenik:</strong> ${r.child_name} (${r.child_age} god.)</p>
                  <p style="margin:4px 0;color:#333;"><strong>Datum:</strong> ${r.party_date}</p>
                  <p style="margin:4px 0;color:#333;"><strong>Termin:</strong> ${SLOT_NAMES[r.time_slot] || r.time_slot}</p>
                  <p style="margin:4px 0;color:#333;"><strong>Paket:</strong> ${PKG_NAMES[r.package] || r.package}</p>
                  <p style="margin:4px 0;color:#333;"><strong>Procijenjeni iznos:</strong> <span style="color:#27AE60;font-weight:bold;">${r.estimated_total}\u20AC</span></p>
                </div>
                <p style="color:#555;line-height:1.6;">
                  Placanje se vrsi iskljucivo osobno na licu mjesta. Vidimo se!
                </p>
              ` : `
                <p style="color:#555;line-height:1.6;">
                  Nazalost, nismo u mogucnosti potvrditi vasu rezervaciju za <strong>${r.party_date}</strong>.
                </p>
                ${rejectionReason ? `<p style="color:#555;line-height:1.6;"><strong>Razlog:</strong> ${rejectionReason}</p>` : ''}
                <p style="color:#555;line-height:1.6;">
                  Slobodno nas kontaktirajte za odabir drugog termina.
                </p>
              `}
              <p style="color:#333;">
                <strong>Telefon:</strong> +385 91 532 8953<br>
                <strong>Instagram:</strong> @adventure_kingdom
              </p>
            </div>

            <!-- ENGLISH -->
            <div>
              <div style="background:${statusColorBg};color:white;padding:12px 20px;border-radius:8px;text-align:center;margin-bottom:16px;">
                <h2 style="margin:0;font-size:18px;">${isConfirmed ? 'Your reservation is confirmed!' : 'Your reservation has been declined'}</h2>
              </div>

              <p style="color:#555;line-height:1.6;">
                Dear ${r.parent_name},
              </p>
              ${isConfirmed ? `
                <p style="color:#555;line-height:1.6;">
                  We are happy to inform you that your birthday party reservation has been <strong>confirmed</strong>!
                </p>
                <div style="background:#FFF9E6;border:2px solid #FFD700;border-radius:8px;padding:16px;margin:16px 0;">
                  <p style="margin:4px 0;color:#333;"><strong>Birthday child:</strong> ${r.child_name} (age ${r.child_age})</p>
                  <p style="margin:4px 0;color:#333;"><strong>Date:</strong> ${r.party_date}</p>
                  <p style="margin:4px 0;color:#333;"><strong>Time slot:</strong> ${SLOT_NAMES[r.time_slot] || r.time_slot}</p>
                  <p style="margin:4px 0;color:#333;"><strong>Package:</strong> ${PKG_NAMES[r.package] || r.package}</p>
                  <p style="margin:4px 0;color:#333;"><strong>Estimated total:</strong> <span style="color:#27AE60;font-weight:bold;">${r.estimated_total}\u20AC</span></p>
                </div>
                <p style="color:#555;line-height:1.6;">
                  Payment is made exclusively in person on-site. See you there!
                </p>
              ` : `
                <p style="color:#555;line-height:1.6;">
                  Unfortunately, we are unable to confirm your reservation for <strong>${r.party_date}</strong>.
                </p>
                ${rejectionReason ? `<p style="color:#555;line-height:1.6;"><strong>Reason:</strong> ${rejectionReason}</p>` : ''}
                <p style="color:#555;line-height:1.6;">
                  Please feel free to contact us to choose a different date.
                </p>
              `}
              <p style="color:#333;">
                <strong>Phone:</strong> +385 91 532 8953<br>
                <strong>Instagram:</strong> @adventure_kingdom
              </p>
            </div>

          </div>
          <div style="background:#0A1229;padding:20px;border-radius:0 0 12px 12px;text-align:center;">
            <p style="color:#FFD700;margin:0;font-size:14px;font-weight:bold;">Adventure Kingdom</p>
            <p style="color:rgba(255,255,255,0.5);margin:4px 0 0;font-size:12px;">
              Setaliste dr. Franje Tudmana 4a, 20207 Srebreno
            </p>
          </div>
        </div>
      `
    });
    console.log(`Status change email (${newStatus}) sent to ${r.parent_email}`);
  } catch (err) {
    console.error('Failed to send status change email:', err.message);
  }
}

module.exports = { notifyOwner, notifyCustomer, notifyStatusChange };
