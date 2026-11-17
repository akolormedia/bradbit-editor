import { t, TranslationKey } from "../i18n";
import {
  ByokProvider,
  ByokProviderKind,
  ByokTestResult,
  Language,
} from "../types";
import {
  BYOK_PRESETS,
  byokDraft,
  byokPreset,
  ByokDraft,
  ByokValidationError,
  validateByokDraft,
} from "./byok";

export interface ConnectModelDraft extends ByokDraft {
  key: string;
}

export interface ConnectModelOptions {
  language: Language;
  providers: ByokProvider[];
  initialKind?: ByokProviderKind;
  onClose: () => void;
  onTest: (draft: ConnectModelDraft) => Promise<ByokTestResult>;
  onSave: (draft: ConnectModelDraft) => Promise<void>;
  onOpenKeyPage: (url: string) => void;
}

export type ApiKeyError = "empty" | "too-long" | "invalid";

export function validateApiKey(key: string): ApiKeyError | null {
  const value = key.trim();
  if (!value) return "empty";
  if (value.length > 16_384) return "too-long";
  if (Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  })) {
    return "invalid";
  }
  return null;
}

function metadataErrorKey(error: ByokValidationError) {
  switch (error) {
    case "id":
      return "settingsByokErrorId" as const;
    case "name":
      return "settingsByokErrorName" as const;
    case "baseUrl":
      return "settingsByokErrorBaseUrl" as const;
    case "model":
      return "settingsByokErrorModel" as const;
    case "duplicate":
      return "settingsByokErrorDuplicate" as const;
  }
}

/**
 * Guided BYOK flow: choose a provider, open its key page, paste the key, test
 * the connection and only then save it to the Keychain. The key never lives in
 * settings or project files.
 */
export class ConnectModelPanel {
  public readonly element: HTMLElement;

  private readonly options: ConnectModelOptions;
  private kind: ByokProviderKind;
  private keyDraft = "";
  private idDraft = "";
  private nameDraft = "";
  private baseUrlDraft = "";
  private modelDraft = "";

  private testing = false;
  private saving = false;
  private testResult: ByokTestResult | null = null;
  private errorKey: TranslationKey | null = null;
  private errorText = "";

  private kindSelect!: HTMLSelectElement;
  private keyInput!: HTMLInputElement;
  private keyLink!: HTMLButtonElement;
  private configuredBadge!: HTMLSpanElement;
  private customFields!: HTMLElement;
  private idInput!: HTMLInputElement;
  private nameInput!: HTMLInputElement;
  private baseUrlInput!: HTMLInputElement;
  private modelInput!: HTMLInputElement;
  private resultEl!: HTMLElement;
  private errorEl!: HTMLElement;
  private testBtn!: HTMLButtonElement;
  private saveBtn!: HTMLButtonElement;
  private saveUntestedBtn!: HTMLButtonElement;

  constructor(options: ConnectModelOptions) {
    this.options = options;
    this.kind = options.initialKind ?? "deepseek";
    this.element = document.createElement("div");
    this.element.className = "connect-model";
    this.element.dataset.testid = "connect-model";
    this.build();
    this.update();
  }

  private build(): void {
    const language = this.options.language;

    const subtitle = document.createElement("p");
    subtitle.className = "connect-model-subtitle";
    subtitle.textContent = t(language, "connectModelSubtitle");

    const steps = document.createElement("p");
    steps.className = "connect-model-steps";
    steps.textContent = t(language, "connectModelSteps");

    const providerField = document.createElement("label");
    providerField.className = "connect-model-field";
    const providerLabel = document.createElement("span");
    providerLabel.className = "form-label";
    providerLabel.textContent = t(language, "connectModelProvider");
    this.kindSelect = document.createElement("select");
    this.kindSelect.className = "select-input";
    this.kindSelect.dataset.testid = "connect-model-kind";
    for (const preset of BYOK_PRESETS) {
      const option = document.createElement("option");
      option.value = preset.kind;
      option.textContent = preset.name;
      this.kindSelect.appendChild(option);
    }
    const custom = document.createElement("option");
    custom.value = "custom";
    custom.textContent = t(language, "connectModelCustom");
    this.kindSelect.appendChild(custom);
    this.kindSelect.value = this.kind;
    this.kindSelect.onchange = () => {
      this.kind = this.kindSelect.value as ByokProviderKind;
      this.keyDraft = "";
      this.keyInput.value = "";
      this.resetTest();
      this.update();
    };
    providerField.append(providerLabel, this.kindSelect);

    const linkRow = document.createElement("div");
    linkRow.className = "connect-model-link-row";
    this.configuredBadge = document.createElement("span");
    this.configuredBadge.className = "connect-model-configured";
    this.configuredBadge.textContent = t(language, "connectModelConfigured");
    this.keyLink = document.createElement("button");
    this.keyLink.type = "button";
    this.keyLink.className = "versions-link-btn";
    this.keyLink.dataset.testid = "connect-model-key-link";
    this.keyLink.textContent = t(language, "connectModelGetKey");
    this.keyLink.onclick = () => {
      const preset = byokPreset(this.kind);
      if (preset) this.options.onOpenKeyPage(preset.keyUrl);
    };
    linkRow.append(this.configuredBadge, this.keyLink);

    const keyField = document.createElement("label");
    keyField.className = "connect-model-field";
    const keyLabel = document.createElement("span");
    keyLabel.className = "form-label";
    keyLabel.textContent = t(language, "connectModelKey");
    this.keyInput = document.createElement("input");
    this.keyInput.type = "password";
    this.keyInput.className = "text-input";
    this.keyInput.dataset.testid = "connect-model-key";
    this.keyInput.autocomplete = "off";
    this.keyInput.spellcheck = false;
    this.keyInput.oninput = () => {
      this.keyDraft = this.keyInput.value;
      this.resetTest();
      this.update();
    };
    keyField.append(keyLabel, this.keyInput);

    const keyHint = document.createElement("p");
    keyHint.className = "connect-model-hint";
    keyHint.textContent = t(language, "connectModelKeyHint");

    this.customFields = document.createElement("div");
    this.customFields.className = "connect-model-custom";
    this.customFields.dataset.testid = "connect-model-custom";
    const customField = (
      labelKey:
        | "connectModelCustomName"
        | "connectModelCustomId"
        | "connectModelCustomBaseUrl"
        | "connectModelCustomModel",
      placeholder: string,
      testId: string,
    ) => {
      const label = document.createElement("label");
      label.className = "connect-model-field";
      const text = document.createElement("span");
      text.className = "form-label";
      text.textContent = t(language, labelKey);
      const input = document.createElement("input");
      input.className = "text-input";
      input.dataset.testid = testId;
      input.placeholder = placeholder;
      label.append(text, input);
      this.customFields.appendChild(label);
      return input;
    };
    this.nameInput = customField(
      "connectModelCustomName",
      t(language, "connectModelCustomNamePlaceholder"),
      "connect-model-name",
    );
    this.idInput = customField(
      "connectModelCustomId",
      "mi-proveedor",
      "connect-model-id",
    );
    this.baseUrlInput = customField(
      "connectModelCustomBaseUrl",
      "https://api.example.com/v1",
      "connect-model-base-url",
    );
    this.modelInput = customField(
      "connectModelCustomModel",
      "mi-modelo",
      "connect-model-model",
    );
    const bind = (
      input: HTMLInputElement,
      set: (value: string) => void,
    ) => {
      input.oninput = () => {
        set(input.value);
        this.resetTest();
        this.update();
      };
    };
    bind(this.nameInput, (value) => (this.nameDraft = value));
    bind(this.idInput, (value) => (this.idDraft = value));
    bind(this.baseUrlInput, (value) => (this.baseUrlDraft = value));
    bind(this.modelInput, (value) => (this.modelDraft = value));

    this.resultEl = document.createElement("div");
    this.resultEl.className = "connect-model-result";
    this.resultEl.dataset.testid = "connect-model-result";

    this.errorEl = document.createElement("p");
    this.errorEl.className = "connect-model-error";
    this.errorEl.dataset.testid = "connect-model-error";
    this.errorEl.hidden = true;

    this.testBtn = document.createElement("button");
    this.testBtn.type = "button";
    this.testBtn.className = "toolbar-btn primary";
    this.testBtn.dataset.testid = "connect-model-test";
    this.testBtn.onclick = () => void this.test();

    this.saveBtn = document.createElement("button");
    this.saveBtn.type = "button";
    this.saveBtn.className = "toolbar-btn";
    this.saveBtn.dataset.testid = "connect-model-save";
    this.saveBtn.onclick = () => void this.save(true);

    this.saveUntestedBtn = document.createElement("button");
    this.saveUntestedBtn.type = "button";
    this.saveUntestedBtn.className = "versions-link-btn connect-model-untested";
    this.saveUntestedBtn.dataset.testid = "connect-model-save-untested";
    this.saveUntestedBtn.textContent = t(language, "connectModelSaveWithoutTest");
    this.saveUntestedBtn.onclick = () => void this.save(false);

    const actions = document.createElement("div");
    actions.className = "connect-model-actions";
    actions.append(this.testBtn, this.saveBtn, this.saveUntestedBtn);

    const warning = document.createElement("p");
    warning.className = "connect-model-hint";
    warning.textContent = t(language, "connectModelUntestedWarning");

    this.element.append(
      subtitle,
      steps,
      providerField,
      linkRow,
      keyField,
      keyHint,
      this.customFields,
      this.resultEl,
      this.errorEl,
      actions,
      warning,
    );
  }

  private resetTest(): void {
    this.testResult = null;
    this.errorKey = null;
    this.errorText = "";
  }

  private draft(): ConnectModelDraft {
    const base = byokDraft(this.kind);
    if (!byokPreset(this.kind)) {
      base.id = this.idDraft;
      base.name = this.nameDraft;
      base.baseUrl = this.baseUrlDraft;
      base.model = this.modelDraft;
    }
    return { ...base, key: this.keyDraft };
  }

  private metadataError(draft: ConnectModelDraft): ByokValidationError | null {
    const existing = this.options.providers
      .map((provider) => provider.id)
      .filter((id) => {
        if (byokPreset(this.kind)) return id !== draft.id;
        const provider = this.options.providers.find((item) => item.id === id);
        return provider?.kind !== "custom";
      });
    return validateByokDraft(draft, existing);
  }

  private update(): void {
    const language = this.options.language;
    const preset = byokPreset(this.kind);
    const configured = this.options.providers.some(
      (provider) => provider.id === (preset?.kind ?? this.idDraft.trim()),
    );
    this.customFields.hidden = Boolean(preset);
    this.keyLink.hidden = !preset;
    this.configuredBadge.hidden = !configured;
    this.keyInput.placeholder = t(
      language,
      configured ? "connectModelKeyReplace" : "connectModelKeyPlaceholder",
    );
    this.saveUntestedBtn.hidden = this.testResult?.ok ?? false;

    this.testBtn.disabled = this.testing || this.saving;
    this.testBtn.classList.toggle("primary", !this.testResult?.ok);
    this.testBtn.textContent = t(
      language,
      this.testing ? "connectModelTesting" : "connectModelTest",
    );
    this.saveBtn.classList.toggle("primary", Boolean(this.testResult?.ok));
    this.saveBtn.disabled =
      this.testing || this.saving || !this.testResult?.ok;
    this.saveBtn.textContent = t(
      language,
      this.saving ? "connectModelSaving" : "connectModelSave",
    );
    this.saveUntestedBtn.disabled = this.testing || this.saving;

    this.errorEl.hidden = !this.errorKey && !this.errorText;
    if (this.errorKey) {
      this.errorEl.textContent = t(language, this.errorKey);
    } else if (this.errorText) {
      this.errorEl.textContent = this.errorText;
    }

    this.resultEl.className = "connect-model-result";
    this.resultEl.replaceChildren();
    if (this.testResult?.ok) {
      this.resultEl.classList.add("ok");
      this.resultEl.textContent =
        this.testResult.modelCount > 0
          ? t(language, "connectModelTestOkModels", {
              count: String(this.testResult.modelCount),
            })
          : t(language, "connectModelTestOk");
    } else if (this.testResult) {
      this.resultEl.classList.add("error");
      this.resultEl.textContent = this.testFailureText(this.testResult);
    }
  }

  private testFailureText(result: ByokTestResult): string {
    const language = this.options.language;
    if (result.status === 401 || result.status === 403) {
      return t(language, "connectModelInvalidKey");
    }
    if (result.status === 429) {
      return t(language, "connectModelRateLimited");
    }
    if (!result.status) {
      return t(language, "connectModelUnreachable");
    }
    return t(language, "connectModelTestFailed", {
      status: String(result.status),
    });
  }

  private validationError(draft: ConnectModelDraft): TranslationKey | null {
    const metadata = this.metadataError(draft);
    if (metadata) return metadataErrorKey(metadata);
    const key = validateApiKey(draft.key);
    if (key === "empty") return "connectModelKeyRequired";
    if (key === "too-long" || key === "invalid") return "connectModelKeyInvalid";
    return null;
  }

  private async test(): Promise<void> {
    const draft = this.draft();
    const error = this.validationError(draft);
    if (error) {
      this.errorKey = error;
      this.update();
      return;
    }
    this.testing = true;
    this.testResult = null;
    this.errorKey = null;
    this.errorText = "";
    this.update();
    try {
      this.testResult = await this.options.onTest(draft);
    } catch (err) {
      this.errorText = err instanceof Error ? err.message : String(err);
    } finally {
      this.testing = false;
      this.update();
    }
  }

  private async save(requireTest: boolean): Promise<void> {
    const draft = this.draft();
    const error = this.validationError(draft);
    if (error) {
      this.errorKey = error;
      this.update();
      return;
    }
    if (requireTest && !this.testResult?.ok) return;
    this.saving = true;
    this.errorKey = null;
    this.errorText = "";
    this.update();
    try {
      await this.options.onSave(draft);
    } catch (err) {
      this.errorText = err instanceof Error ? err.message : String(err);
    } finally {
      this.saving = false;
      this.update();
    }
  }
}
