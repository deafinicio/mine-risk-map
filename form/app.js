const raionSelect = document.getElementById("raion");
const hromadaSelect = document.getElementById("hromada");
const settlementSelect = document.getElementById("settlement");
const directionSelect = document.getElementById("direction");

const eoreFields = document.getElementById("eore-fields");
const otherDirectionFields = document.getElementById("other-direction-fields");

const instructor1 = document.getElementById("instructor_1");
const instructor2 = document.getElementById("instructor_2");
const participantsTotal = document.getElementById("participants_total");
const participantsU18 = document.getElementById("participants_u18");
const participants18Plus = document.getElementById("participants_18plus");
const beneficiariesTotal = document.getElementById("beneficiaries_total");

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

function clearFieldValue(element) {
  if (!element) return;

  if (element.tagName === "SELECT") {
    element.selectedIndex = 0;
  } else {
    element.value = "";
  }
}

function setRequiredAndDisabled(element, { required, disabled }) {
  element.required = required;
  element.disabled = disabled;
}

function updateFormByDirection() {
  const direction = directionSelect.value;

  if (direction === "EORE") {
    eoreFields.classList.remove("hidden");
    otherDirectionFields.classList.add("hidden");

    setRequiredAndDisabled(instructor1, { required: true, disabled: false });
    setRequiredAndDisabled(instructor2, { required: false, disabled: false });
    setRequiredAndDisabled(participantsTotal, { required: true, disabled: false });
    setRequiredAndDisabled(participantsU18, { required: true, disabled: false });
    setRequiredAndDisabled(participants18Plus, { required: true, disabled: false });

    setRequiredAndDisabled(beneficiariesTotal, { required: false, disabled: true });
    clearFieldValue(beneficiariesTotal);
  } else if (direction) {
    eoreFields.classList.add("hidden");
    otherDirectionFields.classList.remove("hidden");

    setRequiredAndDisabled(instructor1, { required: false, disabled: true });
    setRequiredAndDisabled(instructor2, { required: false, disabled: true });
    setRequiredAndDisabled(participantsTotal, { required: false, disabled: true });
    setRequiredAndDisabled(participantsU18, { required: false, disabled: true });
    setRequiredAndDisabled(participants18Plus, { required: false, disabled: true });

    clearFieldValue(instructor1);
    clearFieldValue(instructor2);
    clearFieldValue(participantsTotal);
    clearFieldValue(participantsU18);
    clearFieldValue(participants18Plus);

    setRequiredAndDisabled(beneficiariesTotal, { required: true, disabled: false });
  } else {
    eoreFields.classList.add("hidden");
    otherDirectionFields.classList.add("hidden");

    setRequiredAndDisabled(instructor1, { required: false, disabled: true });
    setRequiredAndDisabled(instructor2, { required: false, disabled: true });
    setRequiredAndDisabled(participantsTotal, { required: false, disabled: true });
    setRequiredAndDisabled(participantsU18, { required: false, disabled: true });
    setRequiredAndDisabled(participants18Plus, { required: false, disabled: true });
    setRequiredAndDisabled(beneficiariesTotal, { required: false, disabled: true });

    clearFieldValue(instructor1);
    clearFieldValue(instructor2);
    clearFieldValue(participantsTotal);
    clearFieldValue(participantsU18);
    clearFieldValue(participants18Plus);
    clearFieldValue(beneficiariesTotal);
  }
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

directionSelect.addEventListener("change", updateFormByDirection);

form.addEventListener("submit", (event) => {
  if (isSubmitting) {
    event.preventDefault();
    return;
  }

  const direction = directionSelect.value;

  if (!direction) {
    event.preventDefault();
    setStatus("Оберіть напрямок.", "error");
    return;
  }

  if (direction === "EORE") {
    const total = Number(participantsTotal.value || 0);
    const u18 = Number(participantsU18.value || 0);
    const plus18 = Number(participants18Plus.value || 0);

    if (u18 + plus18 > total) {
      event.preventDefault();
      setStatus(
        "Помилка: сума учасників до 18 і 18+ не може бути більшою за загальну кількість.",
        "error"
      );
      return;
    }
  } else {
    const beneficiaries = Number(beneficiariesTotal.value || 0);

    if (beneficiaries < 0) {
      event.preventDefault();
      setStatus("Помилка: кількість бенефіціарів не може бути меншою за 0.", "error");
      return;
    }
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

    updateFormByDirection();

    submitButton.disabled = false;
    isSubmitting = false;
  }, 1500);
});

loadLocations();
updateFormByDirection();
