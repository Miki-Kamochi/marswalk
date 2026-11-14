/** Title screen and menu. The menu has its own address (#menu) so other pages can link back to it. */
import { initLang } from "./lang";

initLang();

const home = document.getElementById("home")!;
const menu = document.getElementById("menu")!;

function show() {
  const onMenu = location.hash === "#menu";
  home.hidden = onMenu;
  menu.hidden = !onMenu;
}

document.getElementById("startBtn")!.addEventListener("click", () => {
  location.hash = "#menu";
});
document.getElementById("backBtn")!.addEventListener("click", () => {
  history.replaceState(null, "", location.pathname);
  show();
});
addEventListener("hashchange", show);
show();
