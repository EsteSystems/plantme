import { getSubstance } from "../lib/api.js";
import { createPlantCard } from "../components/plant-card.js";
import { renderCitedText, createReferenceList } from "../lib/citations.js";

export function renderSubstancePage(slug: string): () => void {
  const app = document.getElementById("app")!;
  app.innerHTML = `<div class="loading">Loading substance details...</div>`;

  getSubstance(slug)
    .then((substance) => {
      app.innerHTML = "";

      const header = document.createElement("div");
      header.className = "page-header";

      const title = document.createElement("h1");
      title.textContent = substance.name;
      header.appendChild(title);

      if (substance.description) {
        const desc = document.createElement("p");
        desc.className = "page-header__desc";
        desc.appendChild(renderCitedText(substance.description, substance.refs));
        header.appendChild(desc);
      }

      app.appendChild(header);

      if (substance.refs && substance.refs.length > 0) {
        app.appendChild(createReferenceList(substance.refs));
      }

      if (substance.plants.length > 0) {
        const section = document.createElement("section");
        section.className = "detail-section";

        const heading = document.createElement("h2");
        heading.textContent = `Found in ${substance.plants.length} plant${substance.plants.length === 1 ? "" : "s"}`;
        section.appendChild(heading);

        const grid = document.createElement("div");
        grid.className = "plant-grid";
        for (const plant of substance.plants) {
          grid.appendChild(createPlantCard(plant));
        }
        section.appendChild(grid);
        app.appendChild(section);
      }
    })
    .catch(() => {
      app.innerHTML = `<div class="error">Substance not found.</div>`;
    });

  return () => {};
}
