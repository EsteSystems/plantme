export function createSearchBar(onSearch: (query: string) => void): HTMLElement {
  const form = document.createElement("form");
  form.className = "search-bar";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "search-bar__input";
  input.placeholder = "Search plants, conditions, traditions...";
  input.autocomplete = "off";

  const button = document.createElement("button");
  button.type = "submit";
  button.className = "search-bar__button";
  button.textContent = "Search";

  form.append(input, button);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (q) onSearch(q);
  });

  return form;
}

export function getSearchBarInput(bar: HTMLElement): HTMLInputElement {
  return bar.querySelector("input")!;
}
