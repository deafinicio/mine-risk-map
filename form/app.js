const raionSelect = document.getElementById("raion");
const hromadaSelect = document.getElementById("hromada");
const settlementSelect = document.getElementById("settlement");
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

  const total = Number(document.getElementById("participants_total").value || 0);
  const u18 = Number(document.getElementById("participants_u18").value || 0);
  const plus18 = Number(document.getElementById("participants_18plus").value || 0);

  if (u18 + plus18 > total) {
    event.preventDefault();
    setStatus(
      "Помилка: сума учасників до 18 і 18+ не може бути більшою за загальну кількість.",
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

    submitButton.disabled = false;
    isSubmitting = false;
  }, 1500);
});

loadLocations();
