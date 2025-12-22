const calculateReadingTime = (contentBlocks) => {
  if (!Array.isArray(contentBlocks)) return 0;

  let totalWords = 0;
  let imageCount = 0;

  contentBlocks.forEach((block) => {
    if (!block || !block.type || !block.value) return;

    switch (block.type) {
      case "text":
      case "heading":
        if (typeof block.value === "string") {
          // считаем слова в строке
          totalWords += block.value.trim().split(/\s+/).length;
        }
        break;

      case "list":
        if (Array.isArray(block.value)) {
          block.value.forEach((item) => {
            if (typeof item === "string") {
              totalWords += item.trim().split(/\s+/).length;
            }
          });
        }
        break;

      case "image":
        imageCount++;
        break;

      // ссылки не считаем как слова и не учитываем дополнительно
      default:
        break;
    }
  });

  const wordsPerMinute = 200;
  const imageViewingSeconds = 5;

  const textReadingTimeSec = (totalWords / wordsPerMinute) * 60;
  const imageViewingTimeSec = imageCount * imageViewingSeconds;

  const totalTimeSec = textReadingTimeSec + imageViewingTimeSec;

  const readingTimeMinutes = Math.ceil(totalTimeSec / 60);

  return readingTimeMinutes;
};

module.exports = calculateReadingTime;