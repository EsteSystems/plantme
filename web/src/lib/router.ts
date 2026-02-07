type RouteParams = Record<string, string>;
type RouteHandler = (params: RouteParams) => (() => void) | void;

interface Route {
  pattern: string;
  handler: RouteHandler;
}

interface MatchResult {
  handler: RouteHandler;
  params: RouteParams;
}

export class Router {
  private routes: Route[];
  private cleanup: (() => void) | null = null;
  private onNavigateCallbacks: ((path: string) => void)[] = [];

  constructor(routes: Route[]) {
    this.routes = routes;
  }

  on(event: "navigate", callback: (path: string) => void): void {
    if (event === "navigate") {
      this.onNavigateCallbacks.push(callback);
    }
  }

  navigate(path: string): void {
    history.pushState(null, "", path);
    this.resolve(path);
  }

  init(): void {
    // Handle browser back/forward
    window.addEventListener("popstate", () => {
      this.resolve(window.location.pathname);
    });

    // Intercept clicks on [data-route] links
    document.addEventListener("click", (e) => {
      const target = (e.target as HTMLElement).closest("a[data-route]") as HTMLAnchorElement | null;
      if (target) {
        e.preventDefault();
        const href = target.getAttribute("href");
        if (href && href !== window.location.pathname) {
          this.navigate(href);
        }
      }
    });

    // Resolve initial URL
    this.resolve(window.location.pathname);
  }

  private resolve(path: string): void {
    // Run cleanup for previous page
    if (this.cleanup) {
      this.cleanup();
      this.cleanup = null;
    }

    const match = this.match(path);
    if (match) {
      const result = match.handler(match.params);
      if (typeof result === "function") {
        this.cleanup = result;
      }
    } else {
      this.renderNotFound();
    }

    this.onNavigateCallbacks.forEach((cb) => cb(path));
  }

  private match(path: string): MatchResult | null {
    for (const route of this.routes) {
      const params = matchPattern(route.pattern, path);
      if (params !== null) {
        return { handler: route.handler, params };
      }
    }
    return null;
  }

  private renderNotFound(): void {
    const app = document.getElementById("app");
    if (app) {
      app.innerHTML = `
        <div class="error-page">
          <h1>Page not found</h1>
          <p>The page you're looking for doesn't exist.</p>
          <a href="/" data-route>Back to search</a>
        </div>
      `;
    }
  }
}

function matchPattern(pattern: string, path: string): RouteParams | null {
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = path.split("/").filter(Boolean);

  // Exact length match (no wildcards)
  if (patternParts.length !== pathParts.length) return null;

  const params: RouteParams = {};

  for (let i = 0; i < patternParts.length; i++) {
    const pp = patternParts[i];
    if (pp.startsWith(":")) {
      params[pp.slice(1)] = decodeURIComponent(pathParts[i]);
    } else if (pp !== pathParts[i]) {
      return null;
    }
  }

  return params;
}
