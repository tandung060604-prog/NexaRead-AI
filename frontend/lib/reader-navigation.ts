import type { Virtualizer } from "@tanstack/react-virtual";

import type { ContentBlock } from "./documents-api";

type ReaderVirtualizer = Virtualizer<HTMLDivElement, Element>;

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

export async function navigateToBlock(
  blockId: string,
  blocks: ContentBlock[],
  virtualizer: ReaderVirtualizer,
): Promise<ContentBlock | null> {
  const index = blocks.findIndex((block) => block.id === blockId);
  if (index < 0) return null;

  virtualizer.scrollToIndex(index, { align: "center" });
  let element: HTMLElement | null = null;
  for (let attempt = 0; attempt < 8 && element === null; attempt += 1) {
    await nextFrame();
    element = document.getElementById(`block-${blockId}`);
  }
  if (element) {
    element.querySelector<HTMLElement>("[tabindex='-1']")?.focus({ preventScroll: true });
    element.classList.add("reader-navigation-flash");
    window.setTimeout(() => element?.classList.remove("reader-navigation-flash"), 1200);
  }
  return blocks[index];
}
