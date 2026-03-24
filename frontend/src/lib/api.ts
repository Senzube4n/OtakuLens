/* Backend API client */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
const DATA_BASE = process.env.NEXT_PUBLIC_DATA_URL || "http://localhost:8000";

async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  // Ensure trailing slash to avoid 307 redirects
  const url = path.endsWith("/") || path.includes("?") ? `${API_BASE}${path}` : `${API_BASE}${path}/`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`API error ${res.status}: ${error}`);
  }
  return res.json();
}

// Series
export const listSeries = () => fetchAPI<import("./types").Series[]>("/series");
export const getSeries = (id: string) => fetchAPI<import("./types").Series>(`/series/${id}`);
export const createSeries = (data: {
  title: string;
  source_language?: string;
  target_language?: string;
  description?: string;
  source_url?: string;
}) => fetchAPI<import("./types").Series>("/series", { method: "POST", body: JSON.stringify(data) });
export const updateSeries = (id: string, data: Record<string, unknown>) =>
  fetchAPI<import("./types").Series>(`/series/${id}`, { method: "PATCH", body: JSON.stringify(data) });
export const deleteSeries = (id: string) =>
  fetchAPI<void>(`/series/${id}`, { method: "DELETE" });

// Chapters
export const listChapters = (seriesId: string) =>
  fetchAPI<import("./types").Chapter[]>(`/series/${seriesId}/chapters`);
export const getChapter = (id: string) =>
  fetchAPI<import("./types").Chapter>(`/chapters/${id}`);
export const retryChapter = (id: string) =>
  fetchAPI<import("./types").Chapter>(`/chapters/${id}/retry`, { method: "POST" });

export async function uploadChapter(
  seriesId: string,
  chapterNumber: number,
  files: File[],
  title?: string
): Promise<import("./types").Chapter> {
  const formData = new FormData();
  formData.append("chapter_number", String(chapterNumber));
  if (title) formData.append("title", title);
  files.forEach((f) => formData.append("files", f));

  const res = await fetch(`${API_BASE}/series/${seriesId}/chapters/upload/`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return res.json();
}

// Pages
export const listPages = (chapterId: string) =>
  fetchAPI<import("./types").Page[]>(`/chapters/${chapterId}/pages`);
export const getPage = (id: string) =>
  fetchAPI<import("./types").Page>(`/pages/${id}`);
export const getPageImageUrl = (pageId: string, variant: "original" | "cleaned" | "translated") =>
  `${API_BASE}/pages/${pageId}/image/${variant}`;

// Glossary
export const getGlossary = (seriesId: string) =>
  fetchAPI<import("./types").TermDecision[]>(`/series/${seriesId}/glossary`);
export const addTerm = (seriesId: string, data: { source_term: string; translated_term: string; category?: string }) =>
  fetchAPI<import("./types").TermDecision>(`/series/${seriesId}/glossary`, { method: "POST", body: JSON.stringify(data) });
export const updateTerm = (termId: string, data: { translated_term?: string; category?: string }) =>
  fetchAPI<import("./types").TermDecision>(`/glossary/${termId}`, { method: "PATCH", body: JSON.stringify(data) });
export const deleteTerm = (termId: string) =>
  fetchAPI<void>(`/glossary/${termId}`, { method: "DELETE" });

// Characters
export const getCharacters = (seriesId: string, maxChapter?: number) => {
  const params = maxChapter ? `?max_chapter=${maxChapter}` : "";
  return fetchAPI<import("./types").Character[]>(`/series/${seriesId}/characters${params}`);
};
export const getRelationships = (seriesId: string) =>
  fetchAPI<import("./types").Relationship[]>(`/series/${seriesId}/relationships`);

// Reading
export const getReadingProgress = (seriesId: string) =>
  fetchAPI<{ last_chapter_number: number; last_page_number: number } | null>(`/reading/${seriesId}/progress`);

// Debounced reading progress update
let _progressTimer: ReturnType<typeof setTimeout> | null = null;
export const updateReadingProgress = (seriesId: string, chapter: number, page?: number): Promise<unknown> => {
  return new Promise((resolve) => {
    if (_progressTimer) clearTimeout(_progressTimer);
    _progressTimer = setTimeout(async () => {
      try {
        const result = await fetchAPI(`/reading/${seriesId}/progress`, {
          method: "PUT",
          body: JSON.stringify({ chapter_number: chapter, page_number: page || 0 }),
        });
        resolve(result);
      } catch {
        resolve(null);
      }
    }, 2000);
  });
};

// List all chapters with their pages for infinite scroll
export async function listAllSeriesChapters(
  seriesId: string
): Promise<{ chapter: import("./types").Chapter; pages: import("./types").Page[] }[]> {
  const chapters = await listChapters(seriesId);
  const sorted = chapters
    .filter(ch => ch.status === "completed")
    .sort((a, b) => a.chapter_number - b.chapter_number);

  // Load all pages in parallel
  const results = await Promise.all(
    sorted.map(async (ch) => {
      try {
        const pages = await listPages(ch.id);
        return {
          chapter: ch,
          pages: pages.sort((a, b) => a.page_number - b.page_number),
        };
      } catch {
        return { chapter: ch, pages: [] };
      }
    })
  );

  return results.filter(r => r.pages.length > 0);
}

// Settings
export const getSettings = () => fetchAPI<import("./types").AppSettings>("/settings");
export const updateSettings = (data: { anthropic_api_key?: string; default_source_lang?: string; default_target_lang?: string; compute_mode?: string }) =>
  fetchAPI<import("./types").AppSettings>("/settings", { method: "PUT", body: JSON.stringify(data) });

// Languages
export const getLanguages = () =>
  fetchAPI<Record<string, import("./types").Language>>("/languages");

// Comments
export const listComments = (chapterId: string) =>
  fetchAPI<import("./types").Comment[]>(`/chapters/${chapterId}/comments`);

export const createComment = (chapterId: string, data: {
  page_number: number;
  y_offset: number;
  text: string;
  user_name?: string;
}) => fetchAPI<import("./types").Comment>(`/chapters/${chapterId}/comments`, {
  method: "POST",
  body: JSON.stringify(data),
});

export const reactToComment = (commentId: string, emoji: string) =>
  fetchAPI<import("./types").Comment>(`/comments/${commentId}/react`, {
    method: "POST",
    body: JSON.stringify({ emoji }),
  });

export const deleteComment = (commentId: string) =>
  fetchAPI<void>(`/comments/${commentId}`, { method: "DELETE" });

// Ratings
export const rateChapter = (chapterId: string, data: { score: number; user_name?: string }) =>
  fetchAPI<import("./types").RatingResponse>(`/chapters/${chapterId}/rate`, {
    method: "POST",
    body: JSON.stringify(data),
  });

export const getSeriesRatings = (seriesId: string) =>
  fetchAPI<import("./types").RatingResponse>(`/series/${seriesId}/ratings`);

// World entities & relationship map
export const getWorldEntities = (seriesId: string, maxChapter?: number) => {
  const params = maxChapter ? `?max_chapter=${maxChapter}` : "";
  return fetchAPI<import("./types").WorldEntity[]>(`/series/${seriesId}/world-entities${params}`);
};

export const getRelationshipMap = (seriesId: string, maxChapter?: number) => {
  const params = maxChapter ? `?max_chapter=${maxChapter}` : "";
  return fetchAPI<import("./types").RelationshipMapData>(`/series/${seriesId}/relationship-map${params}`);
};

// Image URL helper
export const imageUrl = (path: string) => `${DATA_BASE}/${path}`;
