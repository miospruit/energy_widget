const W = 2030;
const H = 950;

const BRAND = {
  orange: "#ef7d17",
  darkBlue: "#4b5468",
  white: "#ffffff",
  grey: "#7f7466",
  sand: "#e9e6d8",
  seaBlue: "#6ba8a3",
  lightBlue: "#def2f0",
  purple: "#9494b2",
  pink: "#e2ccc3",
  danger: "#ef7d17",
  free: "#6ba8a3",
  negative: "#4b5468",
};

const THEME = {
  bg: BRAND.sand,
  panel: BRAND.white,
  text: BRAND.darkBlue,
  muted: "#4b546899",
  avg: "#4b546855",
  cheap: BRAND.seaBlue,
  normal: BRAND.purple,
  expensive: BRAND.orange,
  free: BRAND.free,
  negative: BRAND.negative,
  pastAlpha: "55",
};

const now = new Date();
const hour = now.getHours();
const day = now.toLocaleDateString("nl-NL", { weekday: "long" }).toUpperCase();

const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const dayEnd = new Date(
  now.getFullYear(),
  now.getMonth(),
  now.getDate(),
  23,
  59,
  59,
  999,
);

const nf = ["nl-NL", { style: "currency", currency: "EUR" }];

function energyUrl(type) {
  const params = [
    `fromDate=${encodeURIComponent(dayStart.toISOString())}`,
    `tillDate=${encodeURIComponent(dayEnd.toISOString())}`,
    "interval=4",
    `usageType=${type}`,
    "inclBtw=true",
  ];

  return `https://api.energyzero.nl/v1/energyprices?${params.join("&")}`;
}

async function loadPrices(type) {
  const res = await new Request(energyUrl(type)).loadJSON();
  return (res.Prices || []).sort(
    (a, b) => new Date(a.readingDate) - new Date(b.readingDate),
  );
}

function money(value) {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString(...nf);
}

function roundedRect(ctx, x, y, w, h, r, color) {
  const path = new Path();
  path.move(new Point(x + r, y));
  path.addLine(new Point(x + w - r, y));
  path.addQuadCurve(new Point(x + w, y), new Point(x + w, y + r));
  path.addLine(new Point(x + w, y + h - r));
  path.addQuadCurve(new Point(x + w, y + h), new Point(x + w - r, y + h));
  path.addLine(new Point(x + r, y + h));
  path.addQuadCurve(new Point(x, y + h), new Point(x, y + h - r));
  path.addLine(new Point(x, y + r));
  path.addQuadCurve(new Point(x, y), new Point(x + r, y));

  ctx.setFillColor(new Color(color));
  ctx.addPath(path);
  ctx.fillPath();
}

function drawText(ctx, text, rect, font, color, align = "left") {
  ctx.setFont(font);
  ctx.setTextColor(new Color(color));

  if (align === "right") ctx.setTextAlignedRight();
  else if (align === "center") ctx.setTextAlignedCenter();
  else ctx.setTextAlignedLeft();

  ctx.drawTextInRect(text, rect);
}

function barColor(price, normalized, avg, high) {
  if (price < -0.17) return THEME.negative;
  if (price <= 0) return THEME.free;
  if (normalized < avg) return THEME.cheap;
  if (normalized > high) return THEME.expensive;
  return THEME.normal;
}

async function main() {
  const [elecRows, gasRows] = await Promise.all([loadPrices(1), loadPrices(3)]);

  const prices = elecRows.map((row) => row.price).filter(Number.isFinite);

  const latestGas = gasRows.reverse().find((row) => Number.isFinite(row.price));
  const gasPrice = latestGas?.price ?? NaN;
  const gasToday = latestGas
    ? new Date(latestGas.readingDate) >=
      new Date(now.getFullYear(), now.getMonth(), now.getDate(), 6)
    : false;

  if (!prices.length) throw new Error("No electricity prices found");

  const min = Math.min(...prices);
  let max = Math.max(...prices);
  if (max - min === 0) max = min + 0.01;

  const normalized = prices.map((p) => (p - min) / (max - min));
  const avg = normalized.reduce((a, b) => a + b, 0) / normalized.length;
  const high = (1 + avg) / 2;

  const ctx = new DrawContext();
  ctx.size = new Size(W, H);
  ctx.opaque = false;

  ctx.setFillColor(new Color(THEME.bg));
  ctx.fillRect(new Rect(0, 0, W, H));

  roundedRect(ctx, 70, 60, W - 140, H - 120, 60, THEME.panel);

  drawText(
    ctx,
    day,
    new Rect(130, 115, 900, 90),
    Font.heavySystemFont(70),
    THEME.text,
  );
  drawText(
    ctx,
    "EnergyZero dagprijzen",
    new Rect(130, 200, 900, 60),
    Font.mediumSystemFont(42),
    THEME.muted,
  );

  drawText(
    ctx,
    "⚡",
    new Rect(130, 310, 80, 80),
    Font.regularSystemFont(64),
    BRAND.orange,
  );
  drawText(
    ctx,
    `${money(min)} – ${money(Math.max(...prices))}`,
    new Rect(230, 318, 700, 70),
    Font.boldSystemFont(52),
    THEME.text,
  );

  drawText(
    ctx,
    "🔥",
    new Rect(980, 310, 80, 80),
    Font.regularSystemFont(64),
    BRAND.orange,
  );
  drawText(
    ctx,
    money(gasPrice),
    new Rect(1080, 318, 450, 70),
    Font.boldSystemFont(52),
    gasToday ? THEME.text : "#ef7d1777",
  );

  const graph = { x: 130, y: 440, w: W - 260, h: 330 };
  const gap = 12;
  const barW = (graph.w - gap * (normalized.length - 1)) / normalized.length;

  normalized.forEach((n, i) => {
    const barH = Math.max(graph.h * n, 12);
    const x = graph.x + i * (barW + gap);
    const y = graph.y + graph.h - barH;

    let color = barColor(prices[i], n, avg, high);
    if (i < hour) color += THEME.pastAlpha;

    roundedRect(ctx, x, y, barW, barH, 10, color);

    const active = i === hour;
    drawText(
      ctx,
      String(i),
      new Rect(x, graph.y + graph.h + 22, barW, 50),
      active ? Font.heavySystemFont(42) : Font.semiboldSystemFont(34),
      active ? BRAND.orange : THEME.muted,
      "center",
    );
  });

  const avgY = graph.y + graph.h * (1 - avg);
  const avgPath = new Path();
  avgPath.move(new Point(graph.x, avgY));
  avgPath.addLine(new Point(graph.x + graph.w, avgY));
  ctx.addPath(avgPath);
  ctx.setStrokeColor(new Color(THEME.avg));
  ctx.setLineWidth(8);
  ctx.strokePath();

  drawText(
    ctx,
    "goedkoop",
    new Rect(130, 810, 260, 45),
    Font.mediumSystemFont(34),
    THEME.cheap,
  );
  drawText(
    ctx,
    "normaal",
    new Rect(390, 810, 260, 45),
    Font.mediumSystemFont(34),
    THEME.normal,
  );
  drawText(
    ctx,
    "duur",
    new Rect(650, 810, 260, 45),
    Font.mediumSystemFont(34),
    THEME.expensive,
  );
  drawText(
    ctx,
    "≤ €0",
    new Rect(910, 810, 260, 45),
    Font.mediumSystemFont(34),
    THEME.free,
  );

  const widget = new ListWidget();
  widget.backgroundColor = new Color(THEME.bg);
  widget.backgroundImage = ctx.getImage();

  if (config.runsInWidget) Script.setWidget(widget);
  else await widget.presentMedium();

  Script.complete();
}

main().catch(async (e) => {
  const widget = new ListWidget();
  widget.backgroundColor = new Color("#331111");
  widget.addText("Failed to load").textColor = new Color("#ff8888");
  widget.addText(String(e)).textColor = new Color("#ffffff88");

  if (config.runsInWidget) Script.setWidget(widget);
  else await widget.presentMedium();

  Script.complete();
});
