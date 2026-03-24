/* API types matching backend Pydantic schemas */

export interface Series {
  id: string;
  title: string;
  title_original: string | null;
  source_language: string;
  target_language: string;
  reading_direction: string;
  cover_image_path: string | null;
  description: string | null;
  source_url: string | null;
  status: string;
  auto_download: boolean;
  auto_translate: boolean;
  created_at: string;
  updated_at: string;
  chapter_count: number;
}

export interface Chapter {
  id: string;
  series_id: string;
  chapter_number: number;
  title: string | null;
  page_count: number;
  status: string;
  error_message: string | null;
  summary: string | null;
  created_at: string;
  translated_at: string | null;
  translation_guide?: string | null;
}

export interface Page {
  id: string;
  chapter_id: string;
  page_number: number;
  original_path: string;
  cleaned_path: string | null;
  translated_path: string | null;
  width: number;
  height: number;
  status: string;
  created_at: string;
  text_regions?: TextRegion[];
}

export interface TextRegion {
  id: string;
  page_id: string;
  bbox_x: number;
  bbox_y: number;
  bbox_w: number;
  bbox_h: number;
  original_text: string;
  translated_text: string | null;
  region_type: string;
  speaker: string | null;
  ocr_confidence: number;
  translation_note: string | null;
  font_size: number | null;
  font_style: string | null;
  manually_reviewed: boolean;
}

export interface Character {
  id: string;
  series_id: string;
  name: string;
  name_original: string | null;
  aliases: string | null;
  description: string | null;
  personality_traits: string | null;
  speech_patterns: string | null;
  voice_profile: string | null;
  first_appearance_chapter: number | null;
  status: string;
  auto_generated: boolean;
  created_at: string;
}

export interface Relationship {
  id: string;
  series_id: string;
  character_a_id: string;
  character_b_id: string;
  relationship_type: string;
  description: string | null;
  started_chapter: number | null;
  ended_chapter: number | null;
  auto_generated: boolean;
}

export interface TermDecision {
  id: string;
  series_id: string;
  source_term: string;
  translated_term: string;
  alternatives: string | null;
  reasoning: string | null;
  category: string;
  confidence: number;
  use_count: number;
  last_used_chapter: number | null;
  is_override: boolean;
  created_at: string;
}

export interface PipelineProgress {
  chapter_id: string;
  stage: string;
  progress: number;
  message: string;
  current_page: number | null;
  total_pages: number | null;
}

export interface AppSettings {
  has_api_key: boolean;
  default_source_lang: string;
  default_target_lang: string;
  claude_model: string;
  compute_mode: "auto" | "cpu" | "gpu";
  gpu_available: boolean;
  using_gpu: boolean;
}

export interface Language {
  code: string;
  name: string;
}

// Composite type for infinite scroll reader
export interface ChapterWithPages {
  chapter: Chapter;
  pages: Page[];
}

// Reading progress tracking
export interface ReadingProgress {
  last_chapter_number: number;
  last_page_number: number;
}
