import { getTraditions, getTradition } from "../lib/api.js";
import { createPlantCard } from "../components/plant-card.js";

export function renderTraditionsPage(): () => void {
  const app = document.getElementById("app")!;
  app.innerHTML = `<div class="loading">Loading traditions...</div>`;

  getTraditions()
    .then((traditions) => {
      app.innerHTML = "";

      const header = document.createElement("div");
      header.className = "page-header";

      const title = document.createElement("h1");
      title.textContent = "Healing Traditions";

      const desc = document.createElement("p");
      desc.className = "page-header__desc";
      desc.textContent =
        "Explore plant medicine across five major healing traditions spanning thousands of years.";

      header.append(title, desc);
      app.appendChild(header);

      const grid = document.createElement("div");
      grid.className = "traditions-grid";

      for (const tradition of traditions) {
        const card = document.createElement("a");
        card.className = "tradition-card";
        card.href = `/tradition/${tradition.slug}`;
        card.setAttribute("data-route", "");

        const cardTitle = document.createElement("h2");
        cardTitle.textContent = tradition.name;

        const cardDesc = document.createElement("p");
        cardDesc.textContent = tradition.description || "";

        const count = document.createElement("p");
        count.className = "tradition-card__count";
        count.textContent = `${tradition.plant_count} plants`;

        card.append(cardTitle, cardDesc, count);
        grid.appendChild(card);
      }

      app.appendChild(grid);
    })
    .catch(() => {
      app.innerHTML = `<div class="error">Failed to load traditions.</div>`;
    });

  return () => {};
}

export function renderTraditionDetailPage(slug: string): () => void {
  const app = document.getElementById("app")!;
  app.innerHTML = `<div class="loading">Loading tradition...</div>`;

  getTradition(slug)
    .then((tradition) => {
      app.innerHTML = "";

      const header = document.createElement("div");
      header.className = "page-header";

      const backLink = document.createElement("p");
      backLink.className = "page-header__meta";
      const back = document.createElement("a");
      back.href = "/traditions";
      back.setAttribute("data-route", "");
      back.textContent = "All Traditions";
      backLink.appendChild(back);

      const title = document.createElement("h1");
      title.textContent = tradition.name;

      header.append(backLink, title);

      if (tradition.description) {
        const desc = document.createElement("p");
        desc.className = "page-header__desc";
        desc.textContent = tradition.description;
        header.appendChild(desc);
      }

      app.appendChild(header);

      // Plants
      if (tradition.plants.length > 0) {
        const section = document.createElement("section");

        const heading = document.createElement("h2");
        heading.textContent = `Plants in ${tradition.name}`;
        heading.style.marginBottom = "0.75rem";
        section.appendChild(heading);

        const grid = document.createElement("div");
        grid.className = "plant-grid";

        for (const plant of tradition.plants) {
          grid.appendChild(
            createPlantCard({
              slug: plant.slug,
              name: plant.name,
              scientific: plant.scientific,
              description: plant.description,
            })
          );
        }

        section.appendChild(grid);
        app.appendChild(section);
      }
    })
    .catch(() => {
      app.innerHTML = `<div class="error">Tradition not found.</div>`;
    });

  return () => {};
}
