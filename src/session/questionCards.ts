import { t } from "../i18n";
import { Language, OpenCodeFormField } from "../types";
import { createIcon } from "../ui/icons";
import { ChatForm, ChatToolCall } from "./chatState";

export interface QuestionPrompt {
  question: string;
  header: string;
  options: Array<{ label: string; description?: string }>;
}

function questionHeader(text: string): HTMLElement {
  const header = document.createElement("div");
  header.className = "chat-question-header";
  header.textContent = text;
  return header;
}

function questionOption(
  label: string,
  description: string,
  selected: boolean,
): HTMLElement {
  const row = document.createElement("div");
  row.className = `chat-question-option${selected ? " selected" : ""}`;
  row.dataset.selected = String(selected);
  const check = document.createElement("span");
  check.className = "chat-question-check";
  if (selected) check.appendChild(createIcon("check", 13));
  const text = document.createElement("div");
  text.className = "chat-question-option-text";
  const labelEl = document.createElement("span");
  labelEl.className = "chat-question-option-label";
  labelEl.textContent = label;
  text.appendChild(labelEl);
  if (description) {
    const descriptionEl = document.createElement("span");
    descriptionEl.className = "chat-question-option-description";
    descriptionEl.textContent = description;
    text.appendChild(descriptionEl);
  }
  row.append(check, text);
  return row;
}

function renderSelectedOptions(
  labels: string[],
  options: Array<{ label: string; description?: string }>,
): HTMLElement {
  const list = document.createElement("div");
  list.className = "chat-question-options";
  const selected = new Set(labels);
  const rendered = new Set<string>();
  for (const option of options) {
    rendered.add(option.label);
    list.appendChild(
      questionOption(
        option.label,
        option.description ?? "",
        selected.has(option.label),
      ),
    );
  }
  for (const label of labels) {
    if (!rendered.has(label)) {
      list.appendChild(questionOption(label, "", true));
    }
  }
  return list;
}

function optionLabel(field: OpenCodeFormField, value: string): string {
  return (
    field.options?.find((option) => option.value === value)?.label ?? value
  );
}

export function renderAnsweredForm(
  form: ChatForm,
  language: Language,
): HTMLElement | null {
  if (!form.answer) return null;
  const list = document.createElement("div");
  list.className = "chat-question-list";
  list.dataset.testid = `form-answer-${form.id}`;
  for (const field of form.fields) {
    if (field.hidden || field.type === "external") continue;
    const value = form.answer[field.key];
    if (value === undefined || value === null) continue;
    const item = document.createElement("div");
    item.className = "chat-question-item";
    item.appendChild(questionHeader(field.title || field.key));
    if (field.description) {
      const description = document.createElement("div");
      description.className = "chat-question-description";
      description.textContent = field.description;
      item.appendChild(description);
    }
    if (field.type === "boolean") {
      item.appendChild(
        renderSelectedOptions(
          [
            value
              ? t(language, "chatFormYes")
              : t(language, "chatFormNo"),
          ],
          [
            { label: t(language, "chatFormYes") },
            { label: t(language, "chatFormNo") },
          ],
        ),
      );
    } else if (field.options && field.options.length > 0) {
      const labels = Array.isArray(value)
        ? value.map((entry) => optionLabel(field, String(entry)))
        : [optionLabel(field, String(value))];
      item.appendChild(
        renderSelectedOptions(
          labels,
          field.options.map((option) => ({
            label: option.label,
            description: option.description,
          })),
        ),
      );
    } else {
      const answer = document.createElement("div");
      answer.className = "chat-question-answer";
      answer.textContent = Array.isArray(value)
        ? value.join(", ")
        : String(value);
      item.appendChild(answer);
    }
    list.appendChild(item);
  }
  return list.childElementCount > 0 ? list : null;
}

export function questionPrompts(tool: ChatToolCall): QuestionPrompt[] | null {
  if (tool.name !== "question") return null;
  const input = tool.input;
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const rawQuestions = (input as Record<string, unknown>).questions;
  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
    return null;
  }
  return rawQuestions.map((raw) => {
    const data =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {};
    const options = Array.isArray(data.options)
      ? data.options.flatMap((option) => {
          if (!option || typeof option !== "object") return [];
          const optionData = option as Record<string, unknown>;
          if (typeof optionData.label !== "string") return [];
          return [
            {
              label: optionData.label,
              description:
                typeof optionData.description === "string"
                  ? optionData.description
                  : undefined,
            },
          ];
        })
      : [];
    return {
      question: typeof data.question === "string" ? data.question : "",
      header: typeof data.header === "string" ? data.header : "",
      options,
    };
  });
}

export function renderQuestionTool(
  tool: ChatToolCall,
  prompts: QuestionPrompt[],
): HTMLElement {
  const list = document.createElement("div");
  list.className = "chat-question-list";
  list.dataset.testid = `tool-question-${tool.id}`;
  prompts.forEach((prompt, index) => {
    const item = document.createElement("div");
    item.className = "chat-question-item";
    if (prompt.header) item.appendChild(questionHeader(prompt.header));
    if (prompt.question) {
      const question = document.createElement("div");
      question.className = "chat-question-text";
      question.textContent = prompt.question;
      item.appendChild(question);
    }
    const answers = tool.answers[index] ?? [];
    if (prompt.options.length > 0) {
      item.appendChild(renderSelectedOptions(answers, prompt.options));
    } else if (answers.length > 0) {
      const answer = document.createElement("div");
      answer.className = "chat-question-answer";
      answer.textContent = answers.join(", ");
      item.appendChild(answer);
    }
    list.appendChild(item);
  });
  return list;
}
