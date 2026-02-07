import { search } from "../lib/api.js";
import type { SearchResult } from "../lib/types.js";
import { createSearchBar, getSearchBarInput } from "../components/search-bar.js";

const TYPE_LABELS: Record<string, string> = {
  plant: "Plants",
  condition: "Conditions",
  substance: "Substances",
  tradition: "Traditions",
};

const TYPE_ROUTES: Record<string, string> = {
  plant: "/plant",
  condition: "/condition",
  substance: "/substance",
  tradition: "/tradition",
};

export function renderSearchPage(): () => void {
  const app = document.getElementById("app")!;
  app.innerHTML = "";

  // Hero
  const hero = document.createElement("div");
  hero.className = "search-hero";
  hero.innerHTML = `
    <h1>Nature's Pharmacy Explorer</h1>
    <p>Search 146 medicinal plants across 5 healing traditions</p>
  `;

  // Search bar
  const searchBar = createSearchBar(handleSearch);
  const resultsContainer = document.createElement("div");

  app.append(hero, searchBar, resultsContainer);

  // Focus input
  getSearchBarInput(searchBar).focus();

  async function handleSearch(query: string) {
    resultsContainer.innerHTML = `<div class="loading">Searching...</div>`;

    try {
      const results = await search(query);
      renderResults(results);
    } catch {
      resultsContainer.innerHTML = `<div class="error">Search failed. Please try again.</div>`;
    }
  }

  function renderResults(results: SearchResult[]) {
    resultsContainer.innerHTML = "";

    if (results.length === 0) {
      resultsContainer.innerHTML = `<div class="empty">No results found. Try a different query.</div>`;
      return;
    }

    // Group by entity type
    const grouped: Record<string, SearchResult[]> = {};
    for (const r of results) {
      if (!grouped[r.entity_type]) grouped[r.entity_type] = [];
      grouped[r.entity_type].push(r);
    }

    // Render each group
    for (const [type, items] of Object.entries(grouped)) {
      const section = document.createElement("section");
      section.className = "search-results__section";

      const heading = document.createElement("h2");
      heading.textContent = TYPE_LABELS[type] || type;
      section.appendChild(heading);

      const grid = document.createElement("div");
      grid.className = "search-results__grid";

      for (const item of items) {
        const route = TYPE_ROUTES[item.entity_type] || "/plant";
        const card = document.createElement("a");
        card.className = "result-card";
        card.href = `${route}/${item.entity_slug}`;
        card.setAttribute("data-route", "");

        const typeBadge = document.createElement("span");
        typeBadge.className = "result-card__type";
        typeBadge.textContent = item.entity_type;

        const title = document.createElement("h3");
        title.textContent = item.name;

        const excerpt = document.createElement("p");
        excerpt.innerHTML = item.excerpt;

        card.append(typeBadge, title, excerpt);
        grid.appendChild(card);
      }

      section.appendChild(grid);
      resultsContainer.appendChild(section);
    }
  }

  return () => {};
}
