import { getPlant } from "../lib/api.js";
import type { PlantDetail } from "../lib/types.js";
import { createPlantCard } from "../components/plant-card.js";
import { createTagList } from "../components/tag-list.js";
import { PLANT_ILLUSTRATIONS } from "../lib/illustrations.js";

export function renderPlantDetailPage(slug: string): () => void {
  const app = document.getElementById("app")!;
  app.innerHTML = `<div class="loading">Loading plant details...</div>`;

  getPlant(slug).then(renderPlant).catch(() => {
    app.innerHTML = `<div class="error">Plant not found.</div>`;
  });

  function renderPlant(plant: PlantDetail) {
    app.innerHTML = "";

    // Hero
    const hero = document.createElement("div");
    hero.className = "plant-hero";

    const imageUrl = plant.image_url || PLANT_ILLUSTRATIONS[slug];
    if (imageUrl) {
      const img = document.createElement("img");
      img.src = imageUrl;
      img.alt = `${plant.name} — Köhler's Medizinal-Pflanzen`;
      img.className = "plant-hero__image";
      hero.appendChild(img);
    }

    const heroContent = document.createElement("div");
    heroContent.className = "plant-hero__content";

    const title = document.createElement("h1");
    title.textContent = plant.name;
    heroContent.appendChild(title);

    if (plant.scientific) {
      const sci = document.createElement("p");
      sci.className = "plant-hero__scientific";
      sci.textContent = plant.scientific;
      heroContent.appendChild(sci);
    }

    if (plant.alt_names && plant.alt_names.length > 0) {
      heroContent.appendChild(
        createTagList(plant.alt_names.map((n) => ({ label: n, href: "#" })))
      );
    }

    hero.appendChild(heroContent);
    app.appendChild(hero);

    // Description
    if (plant.description) {
      app.appendChild(createSection("Overview", plant.description));
    }

    // Historical
    if (plant.historical) {
      app.appendChild(createSection("Historical Context", plant.historical));
    }

    // Conditions grouped by body system
    if (plant.conditions.length > 0) {
      app.appendChild(createConditionsSection(plant.conditions));
    }

    // Traditions
    if (plant.traditions.length > 0) {
      const section = createSectionShell("Traditions");
      section.appendChild(
        createTagList(
          plant.traditions.map((t) => ({ label: t.name, href: `/tradition/${t.slug}` }))
        )
      );
      app.appendChild(section);
    }

    // Preparations
    if (plant.preparations.length > 0) {
      app.appendChild(createPreparationsSection(plant.preparations));
    }

    // Substances
    if (plant.substances.length > 0) {
      const section = createSectionShell("Active Substances");
      section.appendChild(
        createTagList(
          plant.substances.map((s) => ({ label: s.name, href: `/substance/${s.slug}` }))
        )
      );
      app.appendChild(section);
    }

    // Synergies
    if (plant.synergies.length > 0) {
      const section = createSectionShell("Synergies");
      const grid = document.createElement("div");
      grid.className = "plant-grid";
      for (const syn of plant.synergies) {
        grid.appendChild(
          createPlantCard({
            slug: syn.slug,
            name: syn.name,
            scientific: syn.scientific,
            description: syn.effect,
          })
        );
      }
      section.appendChild(grid);
      app.appendChild(section);
    }

    // Cautions
    if (plant.cautions.length > 0) {
      app.appendChild(createCautionsSection(plant.cautions));
    }
  }

  return () => {};
}

function createSectionShell(title: string): HTMLElement {
  const section = document.createElement("section");
  section.className = "detail-section";
  const heading = document.createElement("h2");
  heading.textContent = title;
  section.appendChild(heading);
  return section;
}

function createSection(title: string, text: string): HTMLElement {
  const section = createSectionShell(title);
  const p = document.createElement("p");
  p.textContent = text;
  section.appendChild(p);
  return section;
}

function createConditionsSection(
  conditions: PlantDetail["conditions"]
): HTMLElement {
  const section = createSectionShell("Conditions Treated");

  // Group by body system
  const bySystem: Record<string, typeof conditions> = {};
  for (const c of conditions) {
    if (!bySystem[c.system]) bySystem[c.system] = [];
    bySystem[c.system].push(c);
  }

  for (const [system, items] of Object.entries(bySystem)) {
    const group = document.createElement("div");
    group.className = "condition-group";

    const h3 = document.createElement("h3");
    h3.textContent = system;
    group.appendChild(h3);

    const list = document.createElement("ul");
    for (const cond of items) {
      const li = document.createElement("li");
      const link = document.createElement("a");
      link.href = `/condition/${cond.slug}`;
      link.setAttribute("data-route", "");
      link.textContent = cond.name;
      li.appendChild(link);

      if (cond.dosage) {
        const dosage = document.createElement("span");
        dosage.className = "condition-group__dosage";
        dosage.textContent = ` — ${cond.dosage}`;
        li.appendChild(dosage);
      }

      list.appendChild(li);
    }
    group.appendChild(list);
    section.appendChild(group);
  }

  return section;
}

function createPreparationsSection(
  preparations: PlantDetail["preparations"]
): HTMLElement {
  const section = createSectionShell("Preparations");

  for (const prep of preparations) {
    const item = document.createElement("div");
    item.className = "preparation-item";

    const name = document.createElement("strong");
    name.textContent = prep.name;
    item.appendChild(name);

    if (prep.instructions) {
      const p = document.createElement("p");
      p.textContent = prep.instructions;
      item.appendChild(p);
    }

    section.appendChild(item);
  }

  return section;
}

function createCautionsSection(
  cautions: PlantDetail["cautions"]
): HTMLElement {
  const section = createSectionShell("Cautions");

  const list = document.createElement("ul");
  list.className = "caution-list";

  for (const caution of cautions) {
    const li = document.createElement("li");
    li.className = `caution caution--${caution.severity}`;

    const text = document.createElement("span");
    text.textContent = caution.detail
      ? `${caution.name}: ${caution.detail}`
      : caution.name;

    li.appendChild(text);
    list.appendChild(li);
  }

  section.appendChild(list);
  return section;
}
