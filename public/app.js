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
  const activeModel = activeProvider?.models.find((model) => model.selected);
  activeProviderLabel.textContent = activeProvider
    ? `Using ${activeProvider.name}${activeModel ? ` / ${activeModel.model}` : ""}`
    : "No provider selected";

  for (const provider of appConfig.providers) {
    const item = document.createElement("div");
    item.className = "provider-section";
    item.dataset.providerId = provider.id;

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
    const selectedModel = provider.models.find((model) => model.selected);
    details.textContent = `${selectedModel?.model || "No model"} - ${
      provider.hasApiKey ? "key saved" : "missing key"
    }`;

    meta.append(name, details);
    choice.append(checkbox, meta);

    const apiKeyInput = document.createElement("input");
    apiKeyInput.className = "text-input provider-api-key";
    apiKeyInput.type = "password";
    apiKeyInput.autocomplete = "off";
    apiKeyInput.placeholder = provider.hasApiKey
      ? "API key saved - leave blank to keep it"
      : "Paste API key";

    const models = document.createElement("details");
    models.className = "model-dropdown";

    const summary = document.createElement("summary");
    summary.textContent = selectedModel
      ? `Model: ${selectedModel.model}`
      : "Select model";

    const modelList = document.createElement("div");
    modelList.className = "model-list";

    for (const model of provider.models) {
      const modelRow = document.createElement("label");
      modelRow.className = "model-choice";

      const modelCheckbox = document.createElement("input");
      modelCheckbox.type = "checkbox";
      modelCheckbox.checked = model.selected;
      modelCheckbox.addEventListener("change", () =>
        saveProviderSection(provider.id, {
          selected: true,
          activeModelId: model.id,
          apiKey: apiKeyInput.value.trim(),
          models: collectProviderModels(item)
        })
      );

      const modelInput = document.createElement("input");
      modelInput.className = "text-input model-name-input";
      modelInput.type = "text";
      modelInput.value = model.model;
      modelInput.autocomplete = "off";
      modelInput.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      modelInput.addEventListener("keydown", (event) => {
        event.stopPropagation();
      });

      modelRow.append(modelCheckbox, modelInput);
      modelList.append(modelRow);
    }

    models.append(summary, modelList);

    const saveButton = document.createElement("button");
    saveButton.className = "button button-secondary provider-save";
    saveButton.type = "button";
    saveButton.textContent = "Save provider";
    saveButton.addEventListener("click", () =>
      saveProviderSection(provider.id, {
        selected: provider.selected,
        apiKey: apiKeyInput.value.trim(),
        models: collectProviderModels(item)
      })
    );

    item.append(choice, apiKeyInput, models, saveButton);
    providerList.append(item);
  }

  if (!activeProvider) {
    configStatus.textContent = "Select and configure a provider.";
  } else if (!activeProvider.hasApiKey) {
    configStatus.textContent = `${activeProvider.name} is selected, but its API key is missing.`;
  } else {
    configStatus.textContent = `Ready. ${activeProvider.name} model: ${activeModel?.model || "none"}`;
  }
}

async function selectProvider(providerId) {
  try {
    await saveProviderSection(providerId, { selected: true });
  } catch (error) {
    setMessage(error.message || "Could not select provider.", "error");
  }
}

async function saveProviderSection(providerId, overrides = {}) {
  const provider = appConfig.providers.find((item) => item.id === providerId);
  if (!provider) {
    return;
  }

  const payload = {
    name: provider.name,
    selected: overrides.selected ?? provider.selected,
    activeModelId: overrides.activeModelId || provider.activeModelId,
    apiKey: overrides.apiKey || "",
    models:
      overrides.models ||
      provider.models.map((model) => ({
        id: model.id,
        label: "",
        model: model.model
      }))
  };

  await updateProvider(provider.id, payload);
  setMessage("Provider configuration saved.", "success");
}

function collectProviderModels(providerSection) {
  const providerId = providerSection.dataset.providerId;
  const provider = appConfig.providers.find((item) => item.id === providerId);

  return [...providerSection.querySelectorAll(".model-choice")].map((choice, index) => {
    const model = provider.models[index];

    return {
      id: model.id,
      label: "",
      model: choice.querySelector(".model-name-input").value.trim()
    };
  });
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
