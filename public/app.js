const configButton = document.querySelector("#configButton");
const configPanel = document.querySelector("#configPanel");
const configStatus = document.querySelector("#configStatus");
const presetList = document.querySelector("#presetList");
const presetConfigList = document.querySelector("#presetConfigList");
const savePresetsButton = document.querySelector("#savePresetsButton");
const inputText = document.querySelector("#inputText");
const outputText = document.querySelector("#outputText");
const message = document.querySelector("#message");
const runButton = document.querySelector("#runButton");
const providerList = document.querySelector("#providerList");
const activeProviderLabel = document.querySelector("#activeProviderLabel");
const providerDialog = document.querySelector("#providerDialog");
const providerForm = document.querySelector("#providerForm");
const providerDialogMessage = document.querySelector("#providerDialogMessage");
const providerIdInput = document.querySelector("#providerIdInput");
const providerNameInput = document.querySelector("#providerNameInput");
const providerModelInput = document.querySelector("#providerModelInput");
const providerApiKeyInput = document.querySelector("#providerApiKeyInput");
const providerSelectedInput = document.querySelector("#providerSelectedInput");

let appConfig = {
  activeProviderId: "",
  activePresetId: "",
  providers: [],
  presets: []
};

document.querySelector("#cleanupButton").addEventListener("click", () => {
  inputText.value = "";
  outputText.value = "";
  setMessage("Cleaned input and output.");
  inputText.focus();
});

document.querySelector("#clearInputButton").addEventListener("click", () => {
  inputText.value = "";
  setMessage("Input cleaned.");
  inputText.focus();
});

document.querySelector("#clearOutputButton").addEventListener("click", () => {
  outputText.value = "";
  setMessage("Output cleaned.");
});

document.querySelector("#copyInputButton").addEventListener("click", () => {
  copyText(inputText.value, "Input copied.");
});

document.querySelector("#copyOutputButton").addEventListener("click", () => {
  copyText(outputText.value, "Output copied.");
});

document.querySelector("#closeProviderDialog").addEventListener("click", () => {
  providerDialog.close();
});

document.querySelector("#cancelProviderButton").addEventListener("click", () => {
  providerDialog.close();
});

configButton.addEventListener("click", () => {
  configPanel.hidden = !configPanel.hidden;
  if (!configPanel.hidden) {
    const firstPresetName = presetConfigList.querySelector(".preset-name-input");
    firstPresetName?.focus();
  } else {
    inputText.focus();
  }
});

runButton.addEventListener("click", rewriteText);
providerForm.addEventListener("submit", saveProvider);
savePresetsButton.addEventListener("click", savePresets);

inputText.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    rewriteText();
  }
});

loadConfig();
inputText.focus();

async function loadConfig() {
  try {
    const response = await fetch("/api/config");
    appConfig = await response.json();
    renderPresets();
    renderPresetConfig();
    renderProviders();
  } catch {
    configStatus.textContent = "Could not load server config.";
  }
}

function renderPresets() {
  presetList.innerHTML = "";

  for (const preset of appConfig.presets) {
    const label = document.createElement("label");
    label.className = "preset-choice";

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "rewritePreset";
    radio.value = preset.id;
    radio.checked = preset.selected;
    radio.addEventListener("change", () => selectPreset(preset.id));

    const name = document.createElement("span");
    name.textContent = preset.name;

    label.append(radio, name);
    presetList.append(label);
  }
}

function renderPresetConfig() {
  presetConfigList.innerHTML = "";

  for (const preset of appConfig.presets) {
    const item = document.createElement("div");
    item.className = "preset-config-item";
    item.dataset.presetId = preset.id;

    const nameLabel = document.createElement("label");
    nameLabel.textContent = "Preset name";

    const nameInput = document.createElement("input");
    nameInput.className = "text-input preset-name-input";
    nameInput.type = "text";
    nameInput.value = preset.name;
    nameInput.autocomplete = "off";

    const promptLabel = document.createElement("label");
    promptLabel.textContent = "Prompt text";

    const promptInput = document.createElement("textarea");
    promptInput.className = "preset-prompt-input";
    promptInput.rows = 4;
    promptInput.value = preset.prompt;

    item.append(nameLabel, nameInput, promptLabel, promptInput);
    presetConfigList.append(item);
  }
}

async function selectPreset(presetId) {
  try {
    const response = await fetch("/api/active-preset", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ presetId })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "Could not select preset.");
    }

    appConfig = data;
    renderPresets();
    renderPresetConfig();
    renderProviders();
    setMessage("");
  } catch (error) {
    setMessage(error.message || "Could not select preset.", "error");
  }
}

async function savePresets() {
  const presets = [...presetConfigList.querySelectorAll(".preset-config-item")].map(
    (item) => ({
      id: item.dataset.presetId,
      name: item.querySelector(".preset-name-input").value.trim(),
      prompt: item.querySelector(".preset-prompt-input").value.trim()
    })
  );

  if (presets.some((preset) => !preset.name || !preset.prompt)) {
    setMessage("Every preset needs a name and prompt text.", "error");
    return;
  }

  savePresetsButton.disabled = true;
  savePresetsButton.textContent = "Saving";

  try {
    const response = await fetch("/api/presets", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        activePresetId: appConfig.activePresetId,
        presets
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "Could not save presets.");
    }

    appConfig = data;
    renderPresets();
    renderPresetConfig();
    renderProviders();
    setMessage("Presets saved.", "success");
  } catch (error) {
    setMessage(error.message || "Could not save presets.", "error");
  } finally {
    savePresetsButton.disabled = false;
    savePresetsButton.textContent = "Save presets";
  }
}

function renderProviders() {
  providerList.innerHTML = "";

  const activeProvider = appConfig.providers.find((provider) => provider.selected);
  activeProviderLabel.textContent = activeProvider
    ? `Using ${activeProvider.name}`
    : "No provider selected";

  for (const provider of appConfig.providers) {
    const item = document.createElement("div");
    item.className = "provider-item";

    const choice = document.createElement("label");
    choice.className = "provider-choice";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = provider.selected;
    checkbox.addEventListener("change", () => selectProvider(provider.id));

    const meta = document.createElement("span");
    meta.className = "provider-meta";

    const name = document.createElement("span");
    name.className = "provider-name";
    name.textContent = provider.name;

    const details = document.createElement("span");
    details.className = "provider-details";
    details.textContent = `${provider.model} - ${provider.hasApiKey ? "key saved" : "missing key"}`;

    meta.append(name, details);
    choice.append(checkbox, meta);

    const editButton = document.createElement("button");
    editButton.className = "button button-secondary provider-edit";
    editButton.type = "button";
    editButton.textContent = "edit";
    editButton.addEventListener("click", () => openProviderDialog(provider.id));

    item.append(choice, editButton);
    providerList.append(item);
  }

  if (!activeProvider) {
    configStatus.textContent = "Select and configure a provider.";
  } else if (!activeProvider.hasApiKey) {
    configStatus.textContent = `${activeProvider.name} is selected, but its API key is missing.`;
  } else {
    configStatus.textContent = `Ready. ${activeProvider.name} model: ${activeProvider.model}`;
  }
}

async function selectProvider(providerId) {
  const provider = appConfig.providers.find((item) => item.id === providerId);
  if (!provider) {
    return;
  }

  await updateProvider(provider.id, {
    name: provider.name,
    model: provider.model,
    selected: true
  });
}

function openProviderDialog(providerId) {
  const provider = appConfig.providers.find((item) => item.id === providerId);
  if (!provider) {
    return;
  }

  providerIdInput.value = provider.id;
  providerNameInput.value = provider.name;
  providerModelInput.value = provider.model;
  providerApiKeyInput.value = "";
  providerSelectedInput.checked = provider.selected;
  providerDialogMessage.textContent = provider.hasApiKey
    ? "An API key is saved. Enter a new one only if you want to replace it."
    : "No API key saved yet.";
  providerDialog.showModal();
  providerNameInput.focus();
}

async function saveProvider(event) {
  event.preventDefault();

  const providerId = providerIdInput.value;
  const payload = {
    name: providerNameInput.value.trim(),
    model: providerModelInput.value.trim(),
    apiKey: providerApiKeyInput.value.trim(),
    selected: providerSelectedInput.checked
  };

  if (!payload.name) {
    providerDialogMessage.textContent = "Provider name is required.";
    return;
  }

  if (!payload.model) {
    providerDialogMessage.textContent = "Model name is required.";
    return;
  }

  providerDialogMessage.textContent = "Saving...";

  try {
    await updateProvider(providerId, payload);
    providerDialog.close();
    setMessage("Provider configuration saved.", "success");
  } catch (error) {
    providerDialogMessage.textContent = error.message || "Could not save provider.";
  }
}

async function updateProvider(providerId, payload) {
  const response = await fetch(`/api/providers/${providerId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Could not save provider.");
  }

  appConfig = data;
  renderPresets();
  renderPresetConfig();
  renderProviders();
}

async function rewriteText() {
  const text = inputText.value.trim();
  const activePreset = appConfig.presets.find((preset) => preset.selected);

  if (!text) {
    setMessage("Paste text to rewrite first.", "error");
    inputText.focus();
    return;
  }

  runButton.disabled = true;
  runButton.textContent = "Running";
  outputText.value = "";
  setMessage("Rewriting...");

  try {
    const response = await fetch("/api/rewrite", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text,
        presetId: activePreset?.id || appConfig.activePresetId
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "Rewrite failed.");
    }

    outputText.value = data.rewritten || "";
    setMessage("Rewrite ready.", "success");
    outputText.focus();
  } catch (error) {
    setMessage(error.message || "Rewrite failed. Try again.", "error");
  } finally {
    runButton.disabled = false;
    runButton.textContent = "Run";
  }
}

async function copyText(text, successMessage) {
  if (!text.trim()) {
    setMessage("Nothing to copy.", "error");
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    setMessage(successMessage, "success");
  } catch {
    setMessage("Copy failed. Select the text and copy it manually.", "error");
  }
}

function setMessage(text, type = "") {
  message.textContent = text;
  message.className = `message ${type}`.trim();
}
