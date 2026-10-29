/* global document, window */

(function () {
  const input = document.getElementById("ClassFilter");
  const navigation = document.getElementById("ClassList");
  const results = document.createElement("div");
  results.id = "SceneGISSearchResults";
  input.closest(".search-wrapper").after(results);
  const indexUrl = new URL("../api-index.json", document.currentScript.src);
  let symbols;
  let failure;
  const query = new URLSearchParams(window.location.search).get("search") ?? "";
  input.value = query;

  function search() {
    results.replaceChildren();
    const value = input.value.trim().toLowerCase();
    navigation.hidden = value.length > 0;
    if (!value) {
      return;
    }
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    results.append(status);
    if (!symbols) {
      status.textContent = failure
        ? "Search index could not be loaded."
        : "Loading search index…";
      return;
    }
    const terms = value.split(/\s+/);
    const matches = symbols.filter((symbol) =>
      terms.every((term) => symbol.displayName.toLowerCase().includes(term)),
    );
    status.textContent = `${Math.min(matches.length, 80)} of ${matches.length} symbols`;
    const list = document.createElement("ul");
    for (const symbol of matches.slice(0, 80)) {
      const item = document.createElement("li");
      const link = document.createElement("a");
      const url = new URL(symbol.url, indexUrl);
      url.searchParams.set("search", input.value);
      link.href = url.href;
      link.textContent = symbol.displayName;
      link.title = `${symbol.kind}: ${symbol.summary ?? symbol.name}`;
      item.append(link);
      list.append(item);
    }
    results.append(list);
  }

  input.addEventListener("input", search);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      results.querySelector("a")?.click();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.ctrlKey && event.key === "k") {
      event.preventDefault();
      input.focus();
      input.select();
    }
  });
  fetch(indexUrl)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Search index HTTP ${response.status}`);
      }
      return response.json();
    })
    .then((index) => {
      symbols = index.symbols;
      search();
    })
    .catch(() => {
      failure = true;
      search();
    });
  search();
})();
