import { t } from "../i18n";
import { FolderPdfError, Language } from "../types";

export interface FolderPdfErrorCopy {
  message: string;
  hint: string;
  detail?: string;
}

/**
 * Turns a structured Rust error into copy that explains what happened and how
 * to fix it. The technical message is kept as a detail for unexpected I/O
 * failures, but mixed/empty folders get a writer-friendly explanation.
 */
export function folderPdfErrorCopy(
  error: FolderPdfError,
  language: Language,
): FolderPdfErrorCopy {
  switch (error.code) {
    case "mixed":
      return {
        message: t(language, "folderPdfErrorMixed", {
          folder: error.folder ?? "",
          markdown: String(error.markdown),
          fountain: String(error.fountain),
        }),
        hint: t(language, "folderPdfErrorMixedHint"),
      };
    case "empty":
      return {
        message: t(language, "folderPdfErrorEmpty", {
          folder: error.folder ?? "",
        }),
        hint: t(language, "folderPdfErrorEmptyHint"),
      };
    case "invalidPath":
      return {
        message: t(language, "folderPdfErrorInvalid"),
        hint: t(language, "folderPdfErrorInvalidHint"),
        detail: error.message,
      };
    case "io":
      return {
        message: t(language, "folderPdfErrorIo"),
        hint: t(language, "folderPdfErrorIoHint"),
        detail: error.message,
      };
  }
}
