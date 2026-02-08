/**
 * Citation rendering utilities.
 * Converts [N] markers in text to interactive superscript links,
 * and builds a reference list with clickable DOI/PubMed URLs.
 *
 * Uses DOM API exclusively — no innerHTML, no XSS risk.
 */

import type { Reference } from "./types.js";

/**
 * Renders text containing [N] citation markers into a DocumentFragment.
 * Plain text becomes text nodes; [N] markers become <sup><a> links.
 */
export function renderCitedText(
  text: string,
  refs: Reference[] | null
): DocumentFragment {
  const fragment = document.createDocumentFragment();
  if (!refs || refs.length === 0) {
    fragment.appendChild(document.createTextNode(text));
    return fragment;
  }

  const refMap = new Map<number, Reference>();
  for (const ref of refs) refMap.set(ref.id, ref);

  const regex = /\[(\d+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      fragment.appendChild(
        document.createTextNode(text.slice(lastIndex, match.index))
      );
    }

    const refId = parseInt(match[1], 10);
    const ref = refMap.get(refId);

    if (ref) {
      const sup = document.createElement("sup");
      sup.className = "citation";
      const link = document.createElement("a");
      link.href = ref.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.className = "citation__link";
      link.textContent = `[${refId}]`;
      link.title = `${ref.authors} (${ref.year})`;
      sup.appendChild(link);
      fragment.appendChild(sup);
    } else {
      fragment.appendChild(document.createTextNode(match[0]));
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
  }

  return fragment;
}

/**
 * Creates a reference list element.
 */
export function createReferenceList(refs: Reference[]): HTMLElement {
  const section = document.createElement("div");
  section.className = "reference-list";

  const heading = document.createElement("h4");
  heading.className = "reference-list__heading";
  heading.textContent = "References";
  section.appendChild(heading);

  const ol = document.createElement("ol");
  ol.className = "reference-list__items";

  for (const ref of refs) {
    const li = document.createElement("li");
    li.className = "reference-list__item";

    const citation = document.createElement("span");
    citation.textContent = `${ref.authors} "${ref.title}" ${ref.journal} (${ref.year}). `;

    const link = document.createElement("a");
    link.href = ref.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "reference-list__link";
    link.textContent = ref.url.startsWith("https://doi.org/")
      ? `doi:${ref.url.replace("https://doi.org/", "")}`
      : ref.url.includes("pubmed")
        ? "PubMed"
        : "Link";

    li.appendChild(citation);
    li.appendChild(link);
    ol.appendChild(li);
  }

  section.appendChild(ol);
  return section;
}
