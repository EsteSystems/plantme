import { getSynergiesGraph, getTraditions, getPlants, getSystems } from "../lib/api.js";
import { createGraph, type GraphInstance } from "../components/graph.js";
import type { GraphData } from "../lib/types.js";

export function renderExplorerPage(): () => void {
  const app = document.getElementById("app")!;
  app.innerHTML = `<div class="loading">Loading synergy graph...</div>`;

  let graphInstance: GraphInstance | null = null;
  let fullGraphData: GraphData | null = null;

  // Fetch graph + filter data in parallel
  Promise.all([getSynergiesGraph(), getTraditions(), getSystems()])
    .then(([graphData, traditions, systems]) => {
      fullGraphData = graphData;
      app.innerHTML = "";

      const layout = document.createElement("div");
      layout.className = "explorer-layout";

      // Sidebar
      const sidebar = document.createElement("aside");
      sidebar.className = "explorer-sidebar";

      const sidebarTitle = document.createElement("h2");
      sidebarTitle.textContent = "Plant Synergies";
      sidebar.appendChild(sidebarTitle);

      const info = document.createElement("p");
      info.textContent = `${graphData.nodes.length} plants connected by ${graphData.edges.length} synergistic relationships.`;
      sidebar.appendChild(info);

      const hint = document.createElement("p");
      hint.textContent = "Drag to rearrange, scroll to zoom, click a plant to view details.";
      hint.style.marginTop = "0.25rem";
      sidebar.appendChild(hint);

      // Tradition filter
      const traditionFilter = createFilterGroup("Tradition", traditions.map((t) => ({
        value: t.slug,
        label: `${t.name} (${t.plant_count})`,
      })));
      sidebar.appendChild(traditionFilter.element);

      // Body system filter
      const systemFilter = createFilterGroup("Body System", systems.map((s) => ({
        value: s.slug,
        label: `${s.name} (${s.condition_count})`,
      })));
      sidebar.appendChild(systemFilter.element);

      // Reset button
      const resetBtn = document.createElement("button");
      resetBtn.className = "filter-reset";
      resetBtn.textContent = "Reset Filters";
      resetBtn.addEventListener("click", () => {
        traditionFilter.reset();
        systemFilter.reset();
        graphInstance?.filterNodes(null);
        info.textContent = `${graphData.nodes.length} plants connected by ${graphData.edges.length} synergistic relationships.`;
      });
      sidebar.appendChild(resetBtn);

      // Legend
      const legend = document.createElement("div");
      legend.className = "graph-legend";

      const legendTitle = document.createElement("h3");
      legendTitle.textContent = "Legend";
      legend.appendChild(legendTitle);

      const colors: [string, string][] = [
        ["#4a7c59", "Plant (active)"],
        ["rgba(74,124,89,0.08)", "Plant (filtered out)"],
        ["#bbb", "Synergy link"],
      ];
      for (const [color, label] of colors) {
        const item = document.createElement("div");
        item.className = "graph-legend__item";

        const dot = document.createElement("span");
        dot.className = "graph-legend__dot";
        dot.style.background = color;

        const text = document.createElement("span");
        text.textContent = label;

        item.append(dot, text);
        legend.appendChild(item);
      }
      sidebar.appendChild(legend);

      // Graph container
      const graphContainer = document.createElement("div");
      graphContainer.className = "explorer-graph";

      layout.append(sidebar, graphContainer);
      app.appendChild(layout);

      // Render graph
      requestAnimationFrame(() => {
        graphInstance = createGraph(graphContainer, graphData, {
          onNodeClick: (nodeId) => {
            const a = document.createElement("a");
            a.href = `/plant/${nodeId}`;
            a.setAttribute("data-route", "");
            a.style.display = "none";
            document.body.appendChild(a);
            a.click();
            a.remove();
          },
        });
      });

      // Filter handler
      async function applyFilters() {
        const selectedTradition = traditionFilter.getSelected();
        const selectedSystem = systemFilter.getSelected();

        if (!selectedTradition && !selectedSystem) {
          graphInstance?.filterNodes(null);
          info.textContent = `${graphData.nodes.length} plants connected by ${graphData.edges.length} synergistic relationships.`;
          return;
        }

        // Fetch filtered plant slugs from API
        const slugSets: Set<string>[] = [];

        if (selectedTradition) {
          const plants = await getPlants({ tradition: selectedTradition });
          slugSets.push(new Set(plants.map((p) => p.slug)));
        }
        if (selectedSystem) {
          const plants = await getPlants({ system: selectedSystem });
          slugSets.push(new Set(plants.map((p) => p.slug)));
        }

        // Intersect all slug sets
        let visible: Set<string>;
        if (slugSets.length === 1) {
          visible = slugSets[0];
        } else {
          visible = new Set([...slugSets[0]].filter((s) => slugSets[1].has(s)));
        }

        // Only keep slugs that are actually in the graph
        const graphNodeIds = new Set(graphData.nodes.map((n) => n.id));
        const filtered = new Set([...visible].filter((s) => graphNodeIds.has(s)));

        graphInstance?.filterNodes(filtered);
        info.textContent = `Showing ${filtered.size} of ${graphData.nodes.length} plants.`;
      }

      traditionFilter.onChange(applyFilters);
      systemFilter.onChange(applyFilters);
    })
    .catch(() => {
      app.innerHTML = `<div class="error">Failed to load synergy graph.</div>`;
    });

  return () => {
    graphInstance?.destroy();
  };
}

interface FilterGroup {
  element: HTMLElement;
  getSelected: () => string | null;
  reset: () => void;
  onChange: (cb: () => void) => void;
}

function createFilterGroup(
  label: string,
  options: { value: string; label: string }[]
): FilterGroup {
  const container = document.createElement("div");
  container.className = "filter-group";

  const heading = document.createElement("h3");
  heading.className = "filter-group__label";
  heading.textContent = label;
  container.appendChild(heading);

  const select = document.createElement("select");
  select.className = "filter-group__select";

  const defaultOpt = document.createElement("option");
  defaultOpt.value = "";
  defaultOpt.textContent = `All ${label}s`;
  select.appendChild(defaultOpt);

  for (const opt of options) {
    const option = document.createElement("option");
    option.value = opt.value;
    option.textContent = opt.label;
    select.appendChild(option);
  }

  container.appendChild(select);

  return {
    element: container,
    getSelected: () => select.value || null,
    reset: () => { select.value = ""; },
    onChange: (cb) => { select.addEventListener("change", cb); },
  };
}
