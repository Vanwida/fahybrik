// Paragraph-aware chunker. Splits a document into ~500-token chunks with
// ~100-token overlap. We don't depend on a real tokenizer — we approximate
// by characters (4 chars/token). This is good enough for embedding budgets;
// the goal is recall, not exact-token accounting.

import {
  APPROX_CHARS_PER_TOKEN,
  CHUNK_OVERLAP_TOKENS,
  CHUNK_TARGET_TOKENS,
} from './schema';

export interface ChunkOptions {
  target_tokens?: number;
  overlap_tokens?: number;
}

const TARGET_CHARS_DEFAULT = CHUNK_TARGET_TOKENS * APPROX_CHARS_PER_TOKEN;
const OVERLAP_CHARS_DEFAULT = CHUNK_OVERLAP_TOKENS * APPROX_CHARS_PER_TOKEN;

export function chunkDocument(raw: string, opts: ChunkOptions = {}): string[] {
  const target_chars = (opts.target_tokens ?? CHUNK_TARGET_TOKENS) * APPROX_CHARS_PER_TOKEN;
  const overlap_chars = (opts.overlap_tokens ?? CHUNK_OVERLAP_TOKENS) * APPROX_CHARS_PER_TOKEN;

  const normalized = normalize(raw);
  if (!normalized) return [];

  const paragraphs = splitParagraphs(normalized);

  const chunks: string[] = [];
  let buffer = '';

  for (const paragraph of paragraphs) {
    if (paragraph.length > target_chars) {
      // Paragraph alone exceeds budget — flush buffer, then split paragraph
      // by sentence boundary.
      if (buffer) {
        chunks.push(buffer);
        buffer = tail(buffer, overlap_chars);
      }
      for (const piece of splitOversizedParagraph(paragraph, target_chars)) {
        const candidate = buffer ? `${buffer}\n\n${piece}` : piece;
        if (candidate.length <= target_chars) {
          buffer = candidate;
        } else {
          if (buffer) chunks.push(buffer);
          buffer = tail(buffer, overlap_chars);
          buffer = buffer ? `${buffer}\n\n${piece}` : piece;
        }
      }
      continue;
    }

    const candidate = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
    if (candidate.length <= target_chars) {
      buffer = candidate;
    } else {
      chunks.push(buffer);
      const overlap = tail(buffer, overlap_chars);
      buffer = overlap ? `${overlap}\n\n${paragraph}` : paragraph;
    }
  }

  if (buffer.trim()) chunks.push(buffer);

  return chunks
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

function normalize(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/ /g, ' ')
    .replace(/[\t ]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function splitOversizedParagraph(paragraph: string, target_chars: number): string[] {
  const sentences = paragraph.match(/[^.!?\n]+[.!?]+["')\]]?|[^.!?\n]+$/g) ?? [paragraph];
  const out: string[] = [];
  let buf = '';
  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;
    if (s.length > target_chars) {
      if (buf) {
        out.push(buf);
        buf = '';
      }
      // Hard chop sentences longer than budget (rare — usually code blocks).
      for (let i = 0; i < s.length; i += target_chars) {
        out.push(s.slice(i, i + target_chars));
      }
      continue;
    }
    const candidate = buf ? `${buf} ${s}` : s;
    if (candidate.length <= target_chars) {
      buf = candidate;
    } else {
      if (buf) out.push(buf);
      buf = s;
    }
  }
  if (buf) out.push(buf);
  return out;
}

function tail(text: string, max_chars: number): string {
  if (max_chars <= 0 || text.length <= max_chars) return text;
  // Prefer cutting at a paragraph boundary to keep semantic chunks intact.
  const slice = text.slice(text.length - max_chars);
  const para_break = slice.indexOf('\n\n');
  if (para_break >= 0 && para_break < slice.length - 1) {
    return slice.slice(para_break + 2).trim();
  }
  // Fall back to sentence boundary.
  const sentence_break = slice.search(/[.!?]\s+/);
  if (sentence_break >= 0) {
    return slice.slice(sentence_break + 2).trim();
  }
  return slice.trim();
}

export const CHUNK_TARGET_CHARS = TARGET_CHARS_DEFAULT;
export const CHUNK_OVERLAP_CHARS = OVERLAP_CHARS_DEFAULT;
