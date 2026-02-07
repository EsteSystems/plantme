import { getCondition } from "../lib/api.js";
import { createPlantCard } from "../components/plant-card.js";

export function renderConditionPage(slug: string): () => void {
  const app = document.getElementById("app")!;
  app.innerHTML = `<div class="loading">Loading condition...</div>`;

  getCondition(slug)
    .then((condition) => {
      app.innerHTML = "";

      // Header
      const header = document.createElement("div");
      header.className = "page-header";

      const meta = document.createElement("p");
      meta.className = "page-header__meta";
      const systemLink = document.createElement("a");
      systemLink.href = `/traditions`;
      systemLink.textContent = condition.system_name;
      meta.appendChild(systemLink);

      const title = document.createElement("h1");
      title.textContent = condition.name;

      header.append(meta, title);

      if (condition.description) {
        const desc = document.createElement("p");
        desc.className = "page-header__desc";
        desc.textContent = condition.description;
        header.appendChild(desc);
      }

      app.appendChild(header);

      // Plants
      if (condition.plants.length > 0) {
        const section = document.createElement("section");

        const heading = document.createElement("h2");
        heading.textContent = `Plants that treat ${condition.name}`;
        heading.style.marginBottom = "0.75rem";
        section.appendChild(heading);

        const grid = document.createElement("div");
        grid.className = "plant-grid";

        for (const plant of condition.plants) {
          grid.appendChild(
            createPlantCard({
              slug: plant.slug,
              name: plant.name,
              scientific: plant.scientific,
              description: plant.description,
              dosage: plant.dosage,
            })
          );
        }

        section.appendChild(grid);
        app.appendChild(section);
      } else {
        app.innerHTML += `<div class="empty">No plants documented for this condition.</div>`;
      }
    })
    .catch(() => {
      app.innerHTML = `<div class="error">Condition not found.</div>`;
    });

  return () => {};
}
