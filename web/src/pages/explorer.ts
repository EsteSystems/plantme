import { getSynergiesGraph } from "../lib/api.js";
import { createGraph, type GraphInstance } from "../components/graph.js";

export function renderExplorerPage(): () => void {
  const app = document.getElementById("app")!;
  app.innerHTML = `<div class="loading">Loading synergy graph...</div>`;

  let graphInstance: GraphInstance | null = null;

  getSynergiesGraph()
    .then((graphData) => {
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
      info.textContent = `${graphData.nodes.length} plants connected by ${graphData.edges.length} synergistic relationships. Drag to rearrange, scroll to zoom, click a plant to view details.`;
      sidebar.appendChild(info);

      // Legend
      const legend = document.createElement("div");
      legend.className = "graph-legend";

      const legendTitle = document.createElement("h3");
      legendTitle.textContent = "Legend";
      legend.appendChild(legendTitle);

      const colors: [string, string][] = [
        ["#4a7c59", "Plant"],
        ["#999", "Synergy link"],
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

      // Render graph after container is in the DOM
      requestAnimationFrame(() => {
        graphInstance = createGraph(graphContainer, graphData, {
          onNodeClick: (nodeId) => {
            // Navigate using router-compatible link click
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
    })
    .catch(() => {
      app.innerHTML = `<div class="error">Failed to load synergy graph.</div>`;
    });

  return () => {
    graphInstance?.destroy();
  };
}
