interface TagItem {
  label: string;
  href: string;
}

export function createTagList(items: TagItem[]): HTMLElement {
  const container = document.createElement("div");
  container.className = "tag-list";

  for (const item of items) {
    const tag = document.createElement("a");
    tag.className = "tag";
    tag.href = item.href;
    tag.setAttribute("data-route", "");
    tag.textContent = item.label;
    container.appendChild(tag);
  }

  return container;
}
