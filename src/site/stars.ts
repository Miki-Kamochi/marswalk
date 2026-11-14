/** A still field of pixel stars behind the reading pages, like the home screen's sky. */
export function drawStars(): void {
  const cv = document.createElement("canvas");
  cv.className = "stars";
  cv.setAttribute("aria-hidden", "true");
  document.body.prepend(cv);
  const paint = () => {
    // drawn at a third of the screen resolution and scaled up with crisp pixels
    const px = 3;
    cv.width = Math.ceil(innerWidth / px);
    cv.height = Math.ceil(innerHeight / px);
    const c = cv.getContext("2d")!;
    c.clearRect(0, 0, cv.width, cv.height);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const n = Math.round((cv.width * cv.height) / 1500);
    for (let i = 0; i < n; i++) {
      const big = rnd() < 0.04;
      c.fillStyle = `rgba(236, 228, 218, ${big ? 0.85 : 0.3 + rnd() * 0.35})`;
      c.fillRect(Math.floor(rnd() * cv.width), Math.floor(rnd() * cv.height), big ? 2 : 1, big ? 2 : 1);
    }
  };
  paint();
  addEventListener("resize", paint);
}
