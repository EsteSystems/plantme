import { PLANT_ILLUSTRATIONS } from "../lib/illustrations.js";

interface PlantCardData {
  slug: string;
  name: string;
  scientific?: string | null;
  description?: string | null;
  dosage?: string | null;
}

export function createPlantCard(plant: PlantCardData): HTMLElement {
  const card = document.createElement("a");
  card.className = "plant-card";
  card.href = `/plant/${plant.slug}`;
  card.setAttribute("data-route", "");

  const illustration = PLANT_ILLUSTRATIONS[plant.slug];
  if (illustration) {
    const thumb = document.createElement("img");
    thumb.src = illustration;
    thumb.alt = "";
    thumb.className = "plant-card__thumb";
    thumb.loading = "lazy";
    card.appendChild(thumb);
  }

  const name = document.createElement("div");
  name.className = "plant-card__name";
  name.textContent = plant.name;
  card.appendChild(name);

  if (plant.scientific) {
    const sci = document.createElement("div");
    sci.className = "plant-card__scientific";
    sci.textContent = plant.scientific;
    card.appendChild(sci);
  }

  if (plant.description) {
    const desc = document.createElement("div");
    desc.className = "plant-card__desc";
    desc.textContent = plant.description;
    card.appendChild(desc);
  }

  if (plant.dosage) {
    const dosage = document.createElement("div");
    dosage.className = "plant-card__dosage";
    dosage.textContent = plant.dosage;
    card.appendChild(dosage);
  }

  return card;
}
