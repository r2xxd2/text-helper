import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

loadLocalEnv(path.join(__dirname, ".env"));

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const PROVIDERS_FILE = path.join(__dirname, "providers.json");

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/config", (_req, res) => {
  const config = readProviderConfig();
  res.json(toPublicConfig(config));
});

app.put("/api/providers/:id", (req, res) => {
  const config = readProviderConfig();
  const provider = config.providers.find((item) => item.id === req.params.id);

  if (!provider) {
    return res.status(404).json({ error: "Provider not found." });
  }

  const name = String(req.body?.name || "").trim();
  const apiKey = String(req.body?.apiKey || "").trim();
  const accountId = String(req.body?.accountId || "").trim();
  const activeModelId = String(req.body?.activeModelId || "").trim();
  const modelUpdates = Array.isArray(req.body?.models) ? req.body.models : [];

  if (!name) {
    return res.status(400).json({ error: "Provider name is required." });
  }

  provider.name = name;

  if (apiKey) {
    provider.apiKey = apiKey;
  }

  if (provider.accountIdRequired) {
    provider.accountId = accountId;
  }

  for (const update of modelUpdates) {
    const model = provider.models.find((item) => item.id === update?.id);

    if (!model) {
      continue;
    }

    const modelName = String(update.model || "").trim();

    model.label = "";
    model.model = modelName;
  }

  if (provider.models.some((model) => model.id === activeModelId)) {
    provider.activeModelId = activeModelId;
  }

  if (req.body?.selected === true) {
    config.activeProviderId = provider.id;
  }

  writeProviderConfig(config);
  res.json(toPublicConfig(config));
});

app.put("/api/presets", (req, res) => {
  const config = readProviderConfig();
  const updates = Array.isArray(req.body?.presets) ? req.body.presets : [];

  for (const update of updates) {
    const preset = config.presets.find((item) => item.id === update?.id);

    if (!preset) {
      continue;
    }

    const name = String(update.name || "").trim();
    const prompt = String(update.prompt || "").trim();

    if (!name) {
      return res.status(400).json({ error: "Every preset needs a name." });
    }

    if (!prompt) {
      return res.status(400).json({ error: "Every preset needs prompt text." });
    }

    preset.name = name;
    preset.prompt = prompt;
  }

  if (config.presets.some((preset) => preset.id === req.body?.activePresetId)) {
    config.activePresetId = req.body.activePresetId;
  }

  writeProviderConfig(config);
  res.json(toPublicConfig(config));
});

app.put("/api/active-preset", (req, res) => {
  const config = readProviderConfig();
  const preset = config.presets.find((item) => item.id === req.body?.presetId);

  if (!preset) {
    return res.status(404).json({ error: "Preset not found." });
  }

  config.activePresetId = preset.id;
  writeProviderConfig(config);
  res.json(toPublicConfig(config));
});

app.post("/api/rewrite", async (req, res) => {
  const text = String(req.body?.text || "").trim();

  if (!text) {
    return res.status(400).json({ error: "Paste text to rewrite first." });
  }

  const config = readProviderConfig();
  const provider = getActiveProvider(config);
  const preset = getActivePreset(config, req.body?.presetId);

  if (!provider) {
    return res.status(500).json({
      error: "Choose a provider in config before running a rewrite."
    });
  }

  if (!provider.apiKey) {
    return res.status(500).json({
      error: `Missing API key for ${provider.name}. Open config, edit the provider, and save its key.`
    });
  }

  const model = getActiveModel(provider);

  if (!model) {
    return res.status(500).json({
      error: `Choose a model for ${provider.name} in config before running a rewrite.`
    });
  }

  if (!model.model) {
    return res.status(500).json({
      error: `The selected model for ${provider.name} is empty. Open config, enter a model name, and save.`
    });
  }

  if (provider.accountIdRequired && !provider.accountId) {
    return res.status(500).json({
      error: `${provider.name} needs a Cloudflare Account ID. Open config, enter the Account ID, and save.`
    });
  }

  try {
    const response = await runRewrite(provider, model, text, preset.prompt);

    const data = await response.json().catch(() => null);
    const usage = buildUsageInfo(provider, model, response, data);

    if (!response.ok) {
      return res.status(response.status).json({
        error:
          data?.error?.message ||
          "The rewrite request failed. Check your API key, model, and network connection.",
        usage
      });
    }

    const rewritten = extractProviderText(provider, data);

    if (!rewritten) {
      return res.status(502).json({
        error: "The model returned an empty response. Try again with a shorter input."
      });
    }

    res.json({ rewritten, usage });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Could not reach the selected provider. Check your key, model, and network connection."
    });
  }
});

const server = app.listen(PORT, HOST, () => {
  console.log(`Rewrite tool running at http://${HOST}:${PORT}`);
});

server.on("error", (error) => {
  console.error(`Could not start the rewrite tool: ${error.message}`);
  process.exitCode = 1;
});

function extractResponseText(data) {
  if (typeof data?.output_text === "string") {
    return data.output_text.trim();
  }

  const chunks = [];
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string") {
        chunks.push(content.text);
      }
    }
  }

  return chunks.join("").trim();
}

function extractChatCompletionText(data) {
  return String(data?.choices?.[0]?.message?.content || "").trim();
}

function extractProviderText(provider, data) {
  return extractChatCompletionText(data);
}

function buildUsageInfo(provider, model, response, data) {
  return {
    provider: provider.name,
    model: model.model,
    tokens: extractTokenUsage(data),
    rateLimits: extractRateLimitHeaders(response.headers)
  };
}

function extractTokenUsage(data) {
  const usage = data?.usage || {};
  const meta = data?.meta || {};
  const metaTokens = meta.tokens || {};
  const billedUnits = meta.billed_units || data?.billed_units || {};

  const inputTokens = firstNumber(
    usage.prompt_tokens,
    usage.input_tokens,
    metaTokens.input_tokens
  );
  const outputTokens = firstNumber(
    usage.completion_tokens,
    usage.output_tokens,
    metaTokens.output_tokens
  );
  const totalTokens = firstNumber(
    usage.total_tokens,
    addOptionalNumbers(inputTokens, outputTokens)
  );
  const billedInputTokens = firstNumber(billedUnits.input_tokens);
  const billedOutputTokens = firstNumber(billedUnits.output_tokens);

  if (
    inputTokens === null &&
    outputTokens === null &&
    totalTokens === null &&
    billedInputTokens === null &&
    billedOutputTokens === null
  ) {
    return null;
  }

  return {
    input: inputTokens,
    output: outputTokens,
    total: totalTokens,
    billedInput: billedInputTokens,
    billedOutput: billedOutputTokens
  };
}

function extractRateLimitHeaders(headers) {
  const rateLimits = [];

  for (const [name, value] of headers.entries()) {
    const lowerName = name.toLowerCase();

    if (!lowerName.startsWith("x-ratelimit-") && !lowerName.startsWith("ratelimit-")) {
      continue;
    }

    rateLimits.push({
      name: lowerName,
      label: formatHeaderLabel(lowerName),
      value
    });
  }

  return rateLimits.sort((left, right) => left.label.localeCompare(right.label));
}

function formatHeaderLabel(name) {
  return name
    .replace(/^x-ratelimit-/, "")
    .replace(/^ratelimit-/, "")
    .split("-")
    .map((part) => part.toUpperCase())
    .join(" ");
}

function firstNumber(...values) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function addOptionalNumbers(left, right) {
  if (typeof left !== "number" || typeof right !== "number") {
    return null;
  }

  return left + right;
}

function runRewrite(provider, model, text, prompt) {
  const messages = [
    {
      role: "system",
      content:
        "You rewrite user-provided text. Return only the rewritten text. Do not add explanations, labels, markdown fences, or commentary unless the user's rewrite instruction explicitly asks for them."
    },
    {
      role: "user",
      content: [
        "Rewrite the text below using this instruction:",
        prompt || "Improve clarity, grammar, and flow while preserving the original meaning.",
        "",
        "Text:",
        text
      ].join("\n")
    }
  ];

  return fetch(`${resolveProviderBaseUrl(provider)}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: model.model,
      messages
    })
  });
}

function resolveProviderBaseUrl(provider) {
  if (!provider.accountId) {
    return provider.baseUrl;
  }

  return provider.baseUrl.replace("{accountId}", encodeURIComponent(provider.accountId));
}

function getActiveProvider(config) {
  return (
    config.providers.find((provider) => provider.id === config.activeProviderId) ||
    config.providers[0] ||
    null
  );
}

function getActiveModel(provider) {
  return (
    provider.models.find((model) => model.id === provider.activeModelId) ||
    provider.models[0] ||
    null
  );
}

function getActivePreset(config, presetId) {
  return (
    config.presets.find((preset) => preset.id === presetId) ||
    config.presets.find((preset) => preset.id === config.activePresetId) ||
    config.presets[0]
  );
}

function readProviderConfig() {
  const defaultConfig = getDefaultProviderConfig();

  if (!fs.existsSync(PROVIDERS_FILE)) {
    return defaultConfig;
  }

  try {
    const saved = JSON.parse(fs.readFileSync(PROVIDERS_FILE, "utf8"));
    return normalizeProviderConfig(saved, defaultConfig);
  } catch {
    return defaultConfig;
  }
}

function writeProviderConfig(config) {
  for (const provider of config.providers) {
    provider.selected = provider.id === config.activeProviderId;
    for (const model of provider.models) {
      model.selected = model.id === provider.activeModelId;
    }
  }

  for (const preset of config.presets) {
    preset.selected = preset.id === config.activePresetId;
  }

  fs.writeFileSync(PROVIDERS_FILE, `${JSON.stringify(config, null, 2)}\n`);
}

function normalizeProviderConfig(saved, defaultConfig) {
  const legacyProviders = Array.isArray(saved?.providers) ? saved.providers : [];
  const providersById = new Map(
    defaultConfig.providers.map((provider) => [provider.id, { ...provider }])
  );

  for (const provider of legacyProviders) {
    if (!provider?.id || !providersById.has(provider.id)) {
      continue;
    }

    const existing = providersById.get(provider.id);
    const savedModels = mapSavedModels(Array.isArray(provider.models) ? provider.models : []);
    const modelsById = new Map(existing.models.map((model) => [model.id, { ...model }]));

    for (const model of savedModels) {
      if (!model?.id || !modelsById.has(model.id)) {
        continue;
      }

      const existingModel = modelsById.get(model.id);
      modelsById.set(model.id, {
        ...existingModel,
        label: "",
        model: String(model.model || existingModel.model).trim() || existingModel.model,
        selected: Boolean(model.selected)
      });
    }

    providersById.set(provider.id, {
      ...existing,
      name: normalizeProviderName(provider.name, existing.name),
      apiKey: String(provider.apiKey || existing.apiKey || ""),
      ...(existing.accountIdRequired
        ? {
            accountId: String(provider.accountId || existing.accountId || "").trim()
          }
        : {}),
      activeModelId: existing.models.some(
        (model) => model.id === normalizeModelId(provider.activeModelId)
      )
        ? normalizeModelId(provider.activeModelId)
        : existing.activeModelId,
      models: [...modelsById.values()],
      selected: Boolean(provider.selected)
    });
  }

  migrateLegacyCerebrasModels(saved, legacyProviders, providersById);

  const providers = [...providersById.values()];
  const activeProviderId = providers.some(
    (provider) => provider.id === saved?.activeProviderId
  )
    ? saved.activeProviderId
    : defaultConfig.activeProviderId;
  const presetsById = new Map(
    defaultConfig.presets.map((preset) => [preset.id, { ...preset }])
  );

  for (const preset of saved?.presets || []) {
    if (!preset?.id || !presetsById.has(preset.id)) {
      continue;
    }

    const existing = presetsById.get(preset.id);
    presetsById.set(preset.id, {
      ...existing,
      name: String(preset.name || existing.name).trim() || existing.name,
      prompt: String(preset.prompt || existing.prompt).trim() || existing.prompt,
      selected: Boolean(preset.selected)
    });
  }

  const presets = [...presetsById.values()];
  const activePresetId = presets.some((preset) => preset.id === saved?.activePresetId)
    ? saved.activePresetId
    : defaultConfig.activePresetId;

  return {
    activeProviderId,
    activePresetId,
    providers,
    presets
  };
}

function mapSavedModels(models) {
  return models.map((model, index) => ({
    ...model,
    id: normalizeModelId(model.id, index)
  }));
}

function normalizeModelId(id, index = 0) {
  if (id === "gpt-oss") {
    return "model-1";
  }

  if (id === "glm") {
    return "model-2";
  }

  if (
    id === "model-1" ||
    id === "model-2" ||
    id === "model-3" ||
    id === "model-4" ||
    id === "model-5"
  ) {
    return id;
  }

  return `model-${Math.min(index + 1, 5)}`;
}

function normalizeProviderName(savedName, fallbackName) {
  const name = String(savedName || fallbackName).trim() || fallbackName;

  if (name === "Cerebras GPT OSS" || name === "Cerebras GLM") {
    return "Cerebras";
  }

  if (name === "Cloudflare Workers AI") {
    return "Cloudflare";
  }

  return name;
}

function toPublicConfig(config) {
  return {
    activeProviderId: config.activeProviderId,
    activePresetId: config.activePresetId,
    providers: config.providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      selected: provider.id === config.activeProviderId,
      hasApiKey: Boolean(provider.apiKey),
      accountId: provider.accountId,
      accountIdRequired: Boolean(provider.accountIdRequired),
      activeModelId: provider.activeModelId,
      models: provider.models.map((model) => ({
        id: model.id,
        label: "",
        model: model.model,
        selected: model.id === provider.activeModelId
      }))
    })),
    presets: config.presets.map((preset) => ({
      id: preset.id,
      name: preset.name,
      prompt: preset.prompt,
      selected: preset.id === config.activePresetId
    }))
  };
}

function getDefaultProviderConfig() {
  return {
    activeProviderId: "cerebras",
    activePresetId: "preset-1",
    providers: [
      {
        id: "cerebras",
        type: "openai-compatible",
        name: "Cerebras",
        baseUrl: "https://api.cerebras.ai/v1",
        apiKey: process.env.CEREBRAS_API_KEY || "",
        activeModelId: "model-1",
        models: [
          {
            id: "model-1",
            label: "",
            model: process.env.CEREBRAS_MODEL || "gpt-oss-120b"
          },
          {
            id: "model-2",
            label: "",
            model: process.env.CEREBRAS_GLM_MODEL || "zai-glm-4.7"
          },
          {
            id: "model-3",
            label: "",
            model: ""
          }
        ]
      },
      {
        id: "mistral",
        type: "openai-compatible",
        name: "Mistral",
        baseUrl: "https://api.mistral.ai/v1",
        apiKey: process.env.MISTRAL_API_KEY || "",
        activeModelId: "model-1",
        models: [
          {
            id: "model-1",
            label: "",
            model: ""
          },
          {
            id: "model-2",
            label: "",
            model: ""
          },
          {
            id: "model-3",
            label: "",
            model: ""
          }
        ]
      },
      {
        id: "cohere",
        type: "openai-compatible",
        name: "Cohere",
        baseUrl: "https://api.cohere.ai/compatibility/v1",
        apiKey: process.env.COHERE_API_KEY || "",
        activeModelId: "model-1",
        models: [
          {
            id: "model-1",
            label: "",
            model: ""
          },
          {
            id: "model-2",
            label: "",
            model: ""
          },
          {
            id: "model-3",
            label: "",
            model: ""
          }
        ]
      },
      {
        id: "groq",
        type: "openai-compatible",
        name: "Groq",
        baseUrl: "https://api.groq.com/openai/v1",
        apiKey: process.env.GROQ_API_KEY || "",
        activeModelId: "model-1",
        models: [
          {
            id: "model-1",
            label: "",
            model: ""
          },
          {
            id: "model-2",
            label: "",
            model: ""
          },
          {
            id: "model-3",
            label: "",
            model: ""
          }
        ]
      },
      {
        id: "cloudflare",
        type: "openai-compatible",
        name: "Cloudflare",
        baseUrl: "https://api.cloudflare.com/client/v4/accounts/{accountId}/ai/v1",
        apiKey: process.env.CLOUDFLARE_API_KEY || "",
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID || "",
        accountIdRequired: true,
        activeModelId: "model-1",
        models: [
          {
            id: "model-1",
            label: "",
            model: ""
          },
          {
            id: "model-2",
            label: "",
            model: ""
          },
          {
            id: "model-3",
            label: "",
            model: ""
          },
          {
            id: "model-4",
            label: "",
            model: ""
          },
          {
            id: "model-5",
            label: "",
            model: ""
          }
        ]
      }
    ],
    presets: [
      {
        id: "preset-1",
        name: "Fix grammar",
        prompt: "Fix grammar and spelling while preserving the original meaning."
      },
      {
        id: "preset-2",
        name: "Professional",
        prompt: "Rewrite in a clear, professional tone while preserving the original meaning."
      },
      {
        id: "preset-3",
        name: "Shorter",
        prompt: "Make the text shorter and easier to scan while preserving key details."
      },
      {
        id: "preset-4",
        name: "Friendlier",
        prompt: "Rewrite in a friendly, natural tone while preserving the original meaning."
      },
      {
        id: "preset-5",
        name: "Clearer",
        prompt: "Improve clarity, structure, and flow while preserving the original meaning."
      }
    ]
  };
}

function migrateLegacyCerebrasModels(saved, legacyProviders, providersById) {
  const provider = providersById.get("cerebras");

  if (!provider) {
    return;
  }

  const oldGpt = legacyProviders.find((item) => item.id === "cerebras");
  const oldGlm = legacyProviders.find((item) => item.id === "cerebras-glm");

  if (oldGpt?.apiKey || oldGlm?.apiKey) {
    provider.apiKey = oldGpt?.apiKey || oldGlm?.apiKey;
  }

  if (Array.isArray(oldGpt?.models) && !oldGlm) {
    return;
  }

  const gptModel = provider.models.find((model) => model.id === "model-1");
  const glmModel = provider.models.find((model) => model.id === "model-2");

  if (gptModel && oldGpt?.model) {
    gptModel.model = oldGpt.model;
  }

  if (glmModel && oldGlm?.model) {
    glmModel.model = oldGlm.model;
  }

  if (oldGlm?.selected || saved?.activeProviderId === "cerebras-glm") {
    provider.activeModelId = "model-2";
  } else if (oldGpt?.selected || saved?.activeProviderId === "cerebras") {
    provider.activeModelId = "model-1";
  }
}

function loadLocalEnv(envPath) {
  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
