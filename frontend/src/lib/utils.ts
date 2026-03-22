import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export const STAGE_LABELS: Record<string, string> = {
  pending: "Pending",
  ocr: "OCR — Detecting Text",
  analyzing: "Analyzing — Building Translation Guide",
  translating: "Translating",
  inpainting: "Removing Original Text",
  typesetting: "Typesetting — Rendering Translation",
  completed: "Completed",
  failed: "Failed",
};

export const STAGE_ORDER = ["ocr", "analyzing", "translating", "inpainting", "typesetting", "completed"];
