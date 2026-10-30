/* global document, window */

(function () {
  const messages = JSON.parse(
    document.getElementById("DocMessages").textContent,
  );
  const input = document.getElementById("ClassFilter");
  const navigation = document.getElementById("ClassList");
  const results = document.createElement("div");
  results.id = "SceneGISSearchResults";
  input.closest(".search-wrapper").after(results);
  const symbols = Array.from(
    navigation.querySelectorAll("li[data-name]"),
    (item) => ({
      name: item.dataset.name,
      url: item.querySelector("a").getAttribute("href"),
    }),
  );
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
    const terms = value.split(/\s+/);
    const matches = symbols.filter((symbol) =>
      terms.every((term) => symbol.name.toLowerCase().includes(term)),
    );
    status.textContent = messages.results
      .replace("{shown}", Math.min(matches.length, 80))
      .replace("{total}", matches.length);
    const list = document.createElement("ul");
    for (const symbol of matches.slice(0, 80)) {
      const item = document.createElement("li");
      const link = document.createElement("a");
      const url = new URL(symbol.url, window.location.href);
      url.searchParams.set("search", input.value);
      link.href = url.href;
      link.textContent = symbol.name;
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
  search();
})();
