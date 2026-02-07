import { Router } from "./lib/router.js";
import { renderSearchPage } from "./pages/search.js";
import { renderPlantDetailPage } from "./pages/plant-detail.js";
import { renderConditionPage } from "./pages/condition.js";
import { renderTraditionsPage, renderTraditionDetailPage } from "./pages/traditions.js";
import { renderExplorerPage } from "./pages/explorer.js";

const router = new Router([
  { pattern: "/", handler: () => renderSearchPage() },
  { pattern: "/explorer", handler: () => renderExplorerPage() },
  { pattern: "/traditions", handler: () => renderTraditionsPage() },
  { pattern: "/tradition/:slug", handler: (p) => renderTraditionDetailPage(p.slug) },
  { pattern: "/plant/:slug", handler: (p) => renderPlantDetailPage(p.slug) },
  { pattern: "/condition/:slug", handler: (p) => renderConditionPage(p.slug) },
]);

// Update active nav link on navigation
router.on("navigate", (path) => {
  document.querySelectorAll<HTMLAnchorElement>(".nav-links a[data-route]").forEach((link) => {
    const route = link.getAttribute("data-route") || link.getAttribute("href");
    const isActive = path === route || (route !== "/" && path.startsWith(route!));
    link.classList.toggle("active", isActive);
  });
});

router.init();
