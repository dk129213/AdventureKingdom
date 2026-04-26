/* =============================================
   Adventure Kingdom - Reservation Form Logic
   ============================================= */

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('reservationForm');
  if (!form) return;

  const dateInput = document.getElementById('partyDate');
  const emailInput = document.getElementById('parentEmail');
  const submitBtn = document.getElementById('submitBtn');
  const formMessage = document.getElementById('formMessage');

  // --- Set date constraints: tomorrow to +6 months ---
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const maxDate = new Date(today);
  maxDate.setMonth(maxDate.getMonth() + 6);

  if (dateInput) {
    dateInput.min = formatDate(tomorrow);
    dateInput.max = formatDate(maxDate);
  }

  // --- Pre-fill email from localStorage (if cookie consent given) ---
  if (emailInput) {
    const savedEmail = localStorage.getItem('ak_customer_email');
    if (savedEmail && localStorage.getItem('ak_consent') === 'true') {
      emailInput.value = savedEmail;
    }
  }

  // --- Package → Room visibility logic ---
  const themeSelection = document.getElementById('themeSelection');
  const royalNotice = document.getElementById('royalNotice');
  const pkgLion = document.getElementById('pkgLion');
  const pkgRoyal = document.getElementById('pkgRoyal');

  function updateRoomVisibility() {
    const childrenInput = form.querySelector('input[name="num_children"]');
    if (pkgRoyal && pkgRoyal.checked) {
      // Royal Party includes both rooms — hide room chooser, show notice
      if (themeSelection) themeSelection.style.display = 'none';
      if (royalNotice) royalNotice.style.display = '';
      if (childrenInput) childrenInput.max = '50';
    } else if (pkgLion && pkgLion.checked) {
      // Lion paket — show room chooser, hide notice
      if (themeSelection) themeSelection.style.display = '';
      if (royalNotice) royalNotice.style.display = 'none';
      if (childrenInput) childrenInput.max = '25';
    } else {
      // No package selected yet — show room chooser
      if (themeSelection) themeSelection.style.display = '';
      if (royalNotice) royalNotice.style.display = 'none';
      if (childrenInput) childrenInput.max = '25';
    }
  }

  if (pkgLion) pkgLion.addEventListener('change', () => {
    updateRoomVisibility();
    // Re-check slot availability when package changes
    if (currentAvailability) updateSlotDisplay(currentAvailability);
  });
  if (pkgRoyal) pkgRoyal.addEventListener('change', () => {
    updateRoomVisibility();
    if (currentAvailability) updateSlotDisplay(currentAvailability);
  });
  updateRoomVisibility();

  // --- Fetch availability when date changes ---
  let currentAvailability = null;

  if (dateInput) {
    dateInput.addEventListener('change', async () => {
      const date = dateInput.value;
      if (!date) return;

      currentAvailability = null;
      resetSlotStyles();

      try {
        const res = await fetch(`/api/availability?date=${date}`);
        const data = await res.json();

        if (!res.ok) {
          showAvailabilityError(data.error);
          return;
        }

        currentAvailability = data.availability;
        updateSlotDisplay(currentAvailability);
      } catch (err) {
        showAvailabilityError('Could not check availability.');
      }
    });
  }

  function updateSlotDisplay(availability) {
    const statusDiv = document.getElementById('availabilityStatus');
    if (!statusDiv) return;

    // Count available slots
    let available = 0;
    let total = 0;
    for (const slot of Object.keys(availability)) {
      for (const theme of Object.keys(availability[slot])) {
        total++;
        if (availability[slot][theme]) available++;
      }
    }

    const lang = document.documentElement.getAttribute('data-lang') || 'hr';
    if (available === 0) {
      statusDiv.innerHTML = `<p style="color:var(--red);font-weight:600;">${lang === 'hr' ? 'Nema dostupnih termina za ovaj datum.' : 'No available slots for this date.'}</p>`;
    } else {
      statusDiv.innerHTML = `<p style="color:#2E7D32;font-weight:600;">${lang === 'hr' ? `${available} od ${total} termina dostupno` : `${available} of ${total} slots available`}</p>`;
    }

    // Disable unavailable theme+slot combinations using CSS classes
    const themeRadios = form.querySelectorAll('input[name="theme"]');
    const slotRadios = form.querySelectorAll('input[name="time_slot"]');

    const isRoyalPkg = pkgRoyal && pkgRoyal.checked;

    slotRadios.forEach(radio => {
      const slotData = availability[radio.value];
      let slotAvailable;
      if (isRoyalPkg) {
        // Royal needs BOTH rooms free
        slotAvailable = slotData && slotData.forest && slotData.royal;
      } else {
        // Lion needs at least one room free
        slotAvailable = slotData && (slotData.forest || slotData.royal);
      }
      const label = radio.closest('.time-option');
      if (label) {
        label.classList.toggle('unavailable', !slotAvailable);
        radio.disabled = !slotAvailable;
        if (!slotAvailable && radio.checked) radio.checked = false;
        setUnavailableMessage(label, !slotAvailable);
      }
    });

    function updateThemeAvailability() {
      const selectedSlot = form.querySelector('input[name="time_slot"]:checked');
      if (!selectedSlot || !availability[selectedSlot.value]) return;
      const slotData = availability[selectedSlot.value];
      themeRadios.forEach(radio => {
        const card = radio.closest('.option-card');
        if (card) {
          const avail = slotData[radio.value];
          card.classList.toggle('unavailable', !avail);
          radio.disabled = !avail;
          if (!avail && radio.checked) radio.checked = false;
          setUnavailableMessage(card, !avail);
        }
      });
    }

    slotRadios.forEach(radio => {
      radio.addEventListener('change', updateThemeAvailability);
    });
  }

  function resetSlotStyles() {
    form.querySelectorAll('.time-option, .option-card').forEach(el => {
      el.classList.remove('unavailable');
      const radio = el.querySelector('input');
      if (radio) radio.disabled = false;
      setUnavailableMessage(el, false);
    });
    const statusDiv = document.getElementById('availabilityStatus');
    if (statusDiv) statusDiv.innerHTML = '';
  }

  // Show or hide a bilingual "Not available" message inside a slot/room card.
  function setUnavailableMessage(el, show) {
    const existing = el.querySelector('.unavailable-msg');
    if (show) {
      if (existing) return;
      const msg = document.createElement('span');
      msg.className = 'unavailable-msg';
      msg.innerHTML = '<span data-hr>Termin nije dostupan</span><span data-en>Not available</span>';
      el.appendChild(msg);
      // Apply current language visibility
      const lang = document.documentElement.getAttribute('data-lang') || 'hr';
      msg.querySelectorAll('[data-hr]').forEach(s => s.style.display = lang === 'hr' ? '' : 'none');
      msg.querySelectorAll('[data-en]').forEach(s => s.style.display = lang === 'en' ? '' : 'none');
    } else if (existing) {
      existing.remove();
    }
  }

  function showAvailabilityError(msg) {
    const statusDiv = document.getElementById('availabilityStatus');
    if (statusDiv) {
      statusDiv.innerHTML = `<p style="color:var(--red);font-weight:600;">${msg}</p>`;
    }
  }

  // --- Form submission ---
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const lang = document.documentElement.getAttribute('data-lang') || 'hr';

    // Collect form data
    const data = {
      parent_name: form.parent_name.value,
      parent_phone: form.parent_phone.value,
      parent_email: form.parent_email.value,
      child_name: form.child_name.value,
      child_age: form.child_age.value,
      party_date: form.party_date.value,
      theme: (form.package?.value === 'royal') ? 'both' : form.theme?.value,
      time_slot: form.time_slot?.value,
      num_children: form.num_children.value,
      num_adults: form.num_adults.value || '0',
      package: form.package?.value,
      addon_pizza: getQtyValue(0),
      addon_cake: getQtyValue(1),
      addon_extra_child: getQtyValue(2),
      notes: form.notes.value
    };

    // Client-side validation

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.parent_email)) {
      showMessage(lang === 'hr' ? 'Molimo unesite ispravnu e-mail adresu.' : 'Please enter a valid email address.', 'error');
      return;
    }

    // Phone validation — allow +, digits, spaces, dashes, min 8 digits
    const phoneDigits = data.parent_phone.replace(/\D/g, '');
    if (phoneDigits.length < 8 || phoneDigits.length > 15) {
      showMessage(lang === 'hr' ? 'Molimo unesite ispravan broj telefona (minimalno 8 znamenki).' : 'Please enter a valid phone number (at least 8 digits).', 'error');
      return;
    }

    const termsCheckbox = form.querySelector('.consent-check input[type="checkbox"]');
    if (!termsCheckbox || !termsCheckbox.checked) {
      showMessage(lang === 'hr' ? 'Morate prihvatiti uvjete rezervacije.' : 'You must accept the reservation terms and conditions.', 'error');
      return;
    }
    if (!data.package) {
      showMessage(lang === 'hr' ? 'Molimo odaberite paket.' : 'Please select a package.', 'error');
      return;
    }
    if (!data.theme) {
      showMessage(lang === 'hr' ? 'Molimo odaberite sobu.' : 'Please select a room.', 'error');
      return;
    }
    if (!data.time_slot) {
      showMessage(lang === 'hr' ? 'Molimo odaberite termin.' : 'Please select a time slot.', 'error');
      return;
    }
    // Max children limits: 25 per room (Lion), 50 for Royal (both rooms)
    // For Royal: num_children + addon_extra_child cannot exceed 50
    const maxChildren = data.package === 'royal' ? 50 : 25;
    const totalChildren = parseInt(data.num_children) + parseInt(data.addon_extra_child || 0);
    if (totalChildren > maxChildren) {
      showMessage(
        lang === 'hr'
          ? `Ukupan broj djece (${totalChildren}) prelazi maksimum od ${maxChildren} za ${data.package === 'royal' ? 'Royal Party' : 'Lion'} paket.`
          : `Total number of children (${totalChildren}) exceeds the maximum of ${maxChildren} for the ${data.package === 'royal' ? 'Royal Party' : 'Lion'} package.`,
        'error'
      );
      return;
    }

    // Disable submit
    submitBtn.disabled = true;
    submitBtn.style.opacity = '0.6';

    try {
      // Get CSRF token first
      const csrfRes = await fetch('/api/csrf-token');
      const csrfData = await csrfRes.json();

      const res = await fetch('/api/reservations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfData.token
        },
        body: JSON.stringify(data)
      });

      const result = await res.json();

      if (res.ok && result.success) {
        // Save email to localStorage if consent given
        if (localStorage.getItem('ak_consent') === 'true') {
          localStorage.setItem('ak_customer_email', data.parent_email);
        }

        showMessage(
          lang === 'hr'
            ? `Hvala! Vaša rezervacija je poslana. Procijenjeni iznos: ${result.estimated_total}\u20AC. Kontaktirat ćemo vas u roku 48 sati.`
            : `Thank you! Your reservation has been submitted. Estimated total: ${result.estimated_total}\u20AC. We will contact you within 48 hours.`,
          'success'
        );

        form.reset();
        resetSlotStyles();
      } else {
        showMessage(result.error || (lang === 'hr' ? 'Greška pri slanju.' : 'Submission error.'), 'error');
      }
    } catch (err) {
      showMessage(lang === 'hr' ? 'Greška u mreži. Pokušajte ponovno.' : 'Network error. Please try again.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.style.opacity = '';
    }
  });

  function getQtyValue(index) {
    const qtyValues = form.querySelectorAll('.qty-value');
    return qtyValues[index] ? parseInt(qtyValues[index].textContent) || 0 : 0;
  }

  function showMessage(text, type) {
    if (!formMessage) return;
    formMessage.style.display = 'block';
    formMessage.textContent = text;
    formMessage.className = type === 'success' ? 'form-message success' : 'form-message error';
    formMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function formatDate(d) {
    return d.toISOString().split('T')[0];
  }
});
