import { getPlant } from "../lib/api.js";
import type { PlantDetail } from "../lib/types.js";
import { createPlantCard } from "../components/plant-card.js";
import { createTagList } from "../components/tag-list.js";
import { PLANT_ILLUSTRATIONS } from "../lib/illustrations.js";
import { renderCitedText, createReferenceList } from "../lib/citations.js";

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
      for (const syn of plant.synergies) {
        const card = document.createElement("div");
        card.className = "synergy-card";

        const header = document.createElement("div");
        header.className = "synergy-card__header";
        const link = document.createElement("a");
        link.href = `/plant/${syn.slug}`;
        link.setAttribute("data-route", "");
        link.className = "synergy-card__name";
        link.textContent = syn.name;
        header.appendChild(link);
        if (syn.tradition) {
          const trad = document.createElement("span");
          trad.className = "synergy-card__tradition";
          trad.textContent = syn.tradition;
          header.appendChild(trad);
        }
        card.appendChild(header);

        if (syn.effect) {
          const effect = document.createElement("p");
          effect.className = "synergy-card__effect";
          effect.textContent = syn.effect;
          card.appendChild(effect);
        }

        if (syn.mechanism) {
          const mech = document.createElement("div");
          mech.className = "synergy-card__mechanism";
          const mechLabel = document.createElement("span");
          mechLabel.className = "synergy-card__mechanism-label";
          mechLabel.textContent = "Biochemistry: ";
          const mechText = document.createElement("span");
          mechText.appendChild(renderCitedText(syn.mechanism, syn.refs));
          mech.appendChild(mechLabel);
          mech.appendChild(mechText);
          card.appendChild(mech);

          if (syn.refs && syn.refs.length > 0) {
            card.appendChild(createReferenceList(syn.refs));
          }
        }

        section.appendChild(card);
      }
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
    if (caution.detail) {
      text.appendChild(document.createTextNode(`${caution.name}: `));
      text.appendChild(renderCitedText(caution.detail, caution.refs));
    } else {
      text.textContent = caution.name;
    }

    li.appendChild(text);
    list.appendChild(li);
  }

  section.appendChild(list);
  return section;
}
