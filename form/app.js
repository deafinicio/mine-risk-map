const raionSelect = document.getElementById("raion");
const hromadaSelect = document.getElementById("hromada");
const settlementSelect = document.getElementById("settlement");

const participantsTotal = document.getElementById("participants_total");
const participantsU18 = document.getElementById("participants_u18");
const participants18Plus = document.getElementById("participants_18plus");
const sessionDate = document.getElementById("session_date");

const form = document.getElementById("mre-form");
const statusBox = document.getElementById("form-status");
const submitButton = form.querySelector('button[type="submit"]');

let locationsData = {};
let isSubmitting = false;

function setStatus(message, type = "info") {
  statusBox.textContent = message;
  statusBox.className = `status ${type}`;
}

function resetSelect(select, placeholder) {
  select.innerHTML = "";

  const option = document.createElement("option");
  option.value = "";
  option.textContent = placeholder;
  select.appendChild(option);
}

function populateSelect(select, items, placeholder) {
  resetSelect(select, placeholder);

  items.forEach((item) => {
    const option = document.createElement("option");
    option.value = item;
    option.textContent = item;
    select.appendChild(option);
  });
}

function sortUk(items) {
  return [...items].sort((a, b) => a.localeCompare(b, "uk"));
}

// Невід'ємне ціле число з поля вводу; порожнє/некоректне значення -> 0
function toNonNegativeInt(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function recalcParticipantsTotal() {
  const u18 = toNonNegativeInt(participantsU18.value);
  const plus18 = toNonNegativeInt(participants18Plus.value);
  participantsTotal.value = u18 + plus18;
}

participantsU18.addEventListener("input", recalcParticipantsTotal);
participants18Plus.addEventListener("input", recalcParticipantsTotal);

// Клік будь-де по полю дати відкриває календар, а не лише по маленькій іконці
sessionDate.addEventListener("click", () => {
  if (typeof sessionDate.showPicker === "function") {
    try {
      sessionDate.showPicker();
    } catch (error) {
      // деякі браузери можуть відмовити показати пікер programmatically — ігноруємо
    }
  }
});

async function loadLocations() {
  try {
    const response = await fetch("./locations.json");

    if (!response.ok) {
      throw new Error("Не вдалося завантажити locations.json");
    }

    locationsData = await response.json();

    const raions = sortUk(Object.keys(locationsData));

    populateSelect(raionSelect, raions, "Оберіть район");
    raionSelect.disabled = false;

    setStatus("Довідник локацій завантажено.", "success");
  } catch (error) {
    console.error("Помилка завантаження довідника:", error);
    setStatus("Помилка завантаження довідника локацій.", "error");
  }
}

raionSelect.addEventListener("change", () => {
  const selectedRaion = raionSelect.value;

  resetSelect(hromadaSelect, "Спочатку оберіть район");
  resetSelect(settlementSelect, "Спочатку оберіть громаду");

  hromadaSelect.disabled = true;
  settlementSelect.disabled = true;

  if (!selectedRaion || !locationsData[selectedRaion]) {
    return;
  }

  const hromadas = sortUk(Object.keys(locationsData[selectedRaion]));

  populateSelect(hromadaSelect, hromadas, "Оберіть громаду");
  hromadaSelect.disabled = false;
});

hromadaSelect.addEventListener("change", () => {
  const selectedRaion = raionSelect.value;
  const selectedHromada = hromadaSelect.value;

  resetSelect(settlementSelect, "Спочатку оберіть громаду");
  settlementSelect.disabled = true;

  if (
    !selectedRaion ||
    !selectedHromada ||
    !locationsData[selectedRaion] ||
    !locationsData[selectedRaion][selectedHromada]
  ) {
    return;
  }

  const settlements = sortUk(locationsData[selectedRaion][selectedHromada]);

  populateSelect(settlementSelect, settlements, "Оберіть населений пункт");
  settlementSelect.disabled = false;
});

form.addEventListener("submit", (event) => {
  if (isSubmitting) {
    event.preventDefault();
    return;
  }

  // Санітизація перед відправкою: чистимо від'ємні/нечислові значення
  // і перераховуємо загальну кількість, щоб у Google Sheets завжди йшла коректна сума.
  const u18 = toNonNegativeInt(participantsU18.value);
  const plus18 = toNonNegativeInt(participants18Plus.value);

  participantsU18.value = u18;
  participants18Plus.value = plus18;
  participantsTotal.value = u18 + plus18;

  const total = u18 + plus18;

  if (total <= 0) {
    event.preventDefault();
    setStatus(
      "Вкажи кількість учасників: заповни «До 18» і/або «18+» — загальна кількість має бути більшою за 0.",
      "error"
    );
    return;
  }

  isSubmitting = true;
  submitButton.disabled = true;
  setStatus("Надсилання даних...", "info");

  setTimeout(() => {
    setStatus("Дані надіслано. Перевір таблицю Google Sheets.", "success");
    form.reset();

    resetSelect(hromadaSelect, "Спочатку оберіть район");
    resetSelect(settlementSelect, "Спочатку оберіть громаду");

    hromadaSelect.disabled = true;
    settlementSelect.disabled = true;

    participantsTotal.value = "";

    submitButton.disabled = false;
    isSubmitting = false;
  }, 1500);
});

loadLocations();
