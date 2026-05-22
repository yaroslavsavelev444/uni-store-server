// utils/calculateReadingTime.ts
import type { IContentBlock } from "../types/topicCommon.types.js";

/**
 * Вычисляет примерное время чтения статьи на основе контент-блоков.
 * @param contentBlocks - массив блоков контента (текст, списки, изображения)
 * @returns время в минутах (округлённое вверх)
 */
export default function calculateReadingTime(
  contentBlocks?: IContentBlock[],
): number {
  if (!Array.isArray(contentBlocks)) return 0;

  let totalWords = 0;
  let imageCount = 0;

  for (const block of contentBlocks) {
    if (!block?.type) continue;

    switch (block.type) {
      case "text":
      case "heading":
        if (typeof block.value === "string") {
          totalWords += block.value.trim().split(/\s+/).length;
        }
        break;

      case "list":
        if (Array.isArray(block.value)) {
          for (const item of block.value) {
            if (typeof item === "string") {
              totalWords += item.trim().split(/\s+/).length;
            }
          }
        }
        break;

      case "image":
        imageCount++;
        break;

      default:
        // ссылки и остальные типы не добавляют времени
        break;
    }
  }

  const WORDS_PER_MINUTE = 200;
  const IMAGE_VIEWING_SECONDS = 5;

  const textReadingTimeSec = (totalWords / WORDS_PER_MINUTE) * 60;
  const imageViewingTimeSec = imageCount * IMAGE_VIEWING_SECONDS;
  const totalTimeSec = textReadingTimeSec + imageViewingTimeSec;

  return Math.ceil(totalTimeSec / 60);
}
