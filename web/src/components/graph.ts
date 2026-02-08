import * as d3 from "d3";
import type { GraphData, GraphNode, GraphEdge } from "../lib/types.js";

// Extend GraphNode for d3 simulation
interface SimNode extends GraphNode {
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

type SimEdge = GraphEdge & {
  source: SimNode;
  target: SimNode;
};

export interface GraphOptions {
  onNodeClick?: (nodeId: string) => void;
}

export interface GraphInstance {
  destroy: () => void;
  /** Dim nodes not in the set. Pass null to reset. */
  filterNodes: (visibleIds: Set<string> | null) => void;
}

const NODE_COLORS: Record<string, string> = {
  plant: "#4a7c59",
  condition: "#8b7355",
  tradition: "#6b5b95",
  substance: "#d4a373",
};

export function createGraph(
  container: HTMLElement,
  data: GraphData,
  options: GraphOptions = {}
): GraphInstance {
  const rect = container.getBoundingClientRect();
  const width = rect.width || 800;
  const height = rect.height || 600;

  const nodes: SimNode[] = data.nodes.map((n) => ({ ...n }));
  const edges: SimEdge[] = data.edges.map((e) => ({ ...e })) as SimEdge[];

  // SVG
  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", "100%")
    .attr("height", "100%")
    .attr("viewBox", `0 0 ${width} ${height}`);

  const g = svg.append("g");

  // Zoom
  const zoom = d3
    .zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.2, 6])
    .on("zoom", (event) => {
      g.attr("transform", event.transform);
    });
  svg.call(zoom);

  // Tooltip
  const tooltip = document.createElement("div");
  tooltip.className = "graph-tooltip";
  tooltip.style.display = "none";
  container.appendChild(tooltip);

  // Simulation
  const simulation = d3
    .forceSimulation<SimNode>(nodes)
    .force(
      "link",
      d3
        .forceLink<SimNode, SimEdge>(edges)
        .id((d) => d.id)
        .distance(120)
    )
    .force("charge", d3.forceManyBody().strength(-250))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force(
      "collision",
      d3.forceCollide<SimNode>().radius((d) => nodeRadius(d) + 4)
    );

  // Edges
  const link = g
    .append("g")
    .selectAll<SVGLineElement, SimEdge>("line")
    .data(edges)
    .join("line")
    .attr("stroke", "#bbb")
    .attr("stroke-opacity", 0.6)
    .attr("stroke-width", (d) => Math.max(1, d.weight));

  // Nodes
  const node = g
    .append("g")
    .selectAll<SVGCircleElement, SimNode>("circle")
    .data(nodes)
    .join("circle")
    .attr("r", (d) => nodeRadius(d))
    .attr("fill", (d) => NODE_COLORS[d.type] || "#999")
    .attr("stroke", "#fff")
    .attr("stroke-width", 1.5)
    .style("cursor", "pointer");

  // Labels
  const label = g
    .append("g")
    .selectAll<SVGTextElement, SimNode>("text")
    .data(nodes)
    .join("text")
    .attr("class", "graph-label")
    .attr("dx", (d) => nodeRadius(d) + 4)
    .attr("dy", 4)
    .text((d) => d.label);

  // Drag
  const drag = d3
    .drag<SVGCircleElement, SimNode>()
    .on("start", (event, d) => {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    })
    .on("drag", (event, d) => {
      d.fx = event.x;
      d.fy = event.y;
    })
    .on("end", (event, d) => {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    });

  node.call(drag);

  // Hover: highlight neighbors
  node
    .on("mouseover", (event, d) => {
      const connected = new Set<string>();
      connected.add(d.id);
      edges.forEach((e) => {
        const src = typeof e.source === "object" ? e.source.id : e.source;
        const tgt = typeof e.target === "object" ? e.target.id : e.target;
        if (src === d.id) connected.add(tgt);
        if (tgt === d.id) connected.add(src);
      });

      node.attr("opacity", (n) => (connected.has(n.id) ? 1 : 0.15));
      link.attr("opacity", (e) => {
        const src = typeof e.source === "object" ? e.source.id : e.source;
        const tgt = typeof e.target === "object" ? e.target.id : e.target;
        return src === d.id || tgt === d.id ? 1 : 0.05;
      });
      label.attr("opacity", (n) => (connected.has(n.id) ? 1 : 0.15));

      // Tooltip
      tooltip.style.display = "block";
      tooltip.innerHTML = `<div>${d.label}</div>` +
        (d.meta?.scientific ? `<div class="graph-tooltip__scientific">${d.meta.scientific}</div>` : "");
    })
    .on("mousemove", (event) => {
      const r = container.getBoundingClientRect();
      tooltip.style.left = event.clientX - r.left + 12 + "px";
      tooltip.style.top = event.clientY - r.top - 10 + "px";
    })
    .on("mouseout", () => {
      node.attr("opacity", 1);
      link.attr("opacity", 0.6);
      label.attr("opacity", 1);
      tooltip.style.display = "none";
    });

  // Click
  node.on("click", (_event, d) => {
    options.onNodeClick?.(d.id);
  });

  // Fit graph to viewport after simulation stabilises
  function zoomToFit() {
    if (nodes.length === 0) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of nodes) {
      if (n.x == null || n.y == null) continue;
      const r = nodeRadius(n);
      if (n.x - r < x0) x0 = n.x - r;
      if (n.y - r < y0) y0 = n.y - r;
      if (n.x + r > x1) x1 = n.x + r;
      if (n.y + r > y1) y1 = n.y + r;
    }
    const bw = x1 - x0;
    const bh = y1 - y0;
    if (bw <= 0 || bh <= 0) return;
    const padding = 40;
    const scale = Math.min(
      (width - padding * 2) / bw,
      (height - padding * 2) / bh,
      1.5 // don't zoom in too much for small graphs
    );
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const tx = width / 2 - cx * scale;
    const ty = height / 2 - cy * scale;
    svg
      .transition()
      .duration(750)
      .call(
        zoom.transform,
        d3.zoomIdentity.translate(tx, ty).scale(scale)
      );
  }

  // Tick
  simulation.on("tick", () => {
    link
      .attr("x1", (d) => d.source.x!)
      .attr("y1", (d) => d.source.y!)
      .attr("x2", (d) => d.target.x!)
      .attr("y2", (d) => d.target.y!);

    node.attr("cx", (d) => d.x!).attr("cy", (d) => d.y!);

    label.attr("x", (d) => d.x!).attr("y", (d) => d.y!);
  });

  // Zoom to fit once simulation cools down
  simulation.on("end", zoomToFit);

  function filterNodes(visibleIds: Set<string> | null) {
    if (!visibleIds) {
      // Reset: show all
      node.attr("opacity", 1);
      link.attr("opacity", 0.6);
      label.attr("opacity", 1);
      return;
    }
    node.attr("opacity", (n) => (visibleIds.has(n.id) ? 1 : 0.08));
    label.attr("opacity", (n) => (visibleIds.has(n.id) ? 1 : 0.08));
    link.attr("opacity", (e) => {
      const src = typeof e.source === "object" ? e.source.id : e.source;
      const tgt = typeof e.target === "object" ? e.target.id : e.target;
      return visibleIds.has(src as string) && visibleIds.has(tgt as string) ? 0.6 : 0.03;
    });
  }

  return {
    destroy: () => {
      simulation.stop();
      tooltip.remove();
      svg.remove();
    },
    filterNodes,
  };
}

function nodeRadius(d: SimNode): number {
  return Math.max(5, Math.min(20, d.size * 3 + 4));
}
