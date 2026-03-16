const raionSelect = document.getElementById("raion");
const hromadaSelect = document.getElementById("hromada");
const settlementSelect = document.getElementById("settlement");
const form = document.getElementById("mre-form");
const statusBox = document.getElementById("form-status");

let locationsData = {};

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

async function loadLocations() {
  try {
    const response = await fetch("./locations.json");
    if (!response.ok) {
      throw new Error("Не вдалося завантажити locations.json");
    }

    locationsData = await response.json();

    const raions = Object.keys(locationsData).sort((a, b) =>
      a.localeCompare(b, "uk")
    );

    populateSelect(raionSelect, raions, "Оберіть район");
    raionSelect.disabled = false;

    setStatus("Довідник локацій завантажено.", "success");
  } catch (error) {
    console.error(error);
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

  const hromadas = Object.keys(locationsData[selectedRaion]).sort((a, b) =>
    a.localeCompare(b, "uk")
  );

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

  const settlements = [...locationsData[selectedRaion][selectedHromada]].sort(
    (a, b) => a.localeCompare(b, "uk")
  );

  populateSelect(settlementSelect, settlements, "Оберіть населений пункт");
  settlementSelect.disabled = false;
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const data = Object.fromEntries(formData.entries());

  console.log("Поки що тестове надсилання. Дані форми:", data);

  setStatus("Тест успішний: форма зібрала дані. Поки що без відправки.", "success");
});

loadLocations();
