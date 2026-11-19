const menuButton = document.querySelector("#menu-button");
const navigation = document.querySelector("#site-nav");
const compact = window.matchMedia("(max-width: 720px)");

function setMenu(expanded) {
  menuButton.setAttribute("aria-expanded", String(expanded));
  navigation.toggleAttribute("data-expanded", expanded);
}

menuButton.addEventListener("click", () => {
  setMenu(menuButton.getAttribute("aria-expanded") !== "true");
});

navigation.addEventListener("click", event => {
  if (compact.matches && event.target.closest("a")) setMenu(false);
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && navigation.hasAttribute("data-expanded")) {
    setMenu(false);
    menuButton.focus();
  }
});

compact.addEventListener("change", () => setMenu(false));
