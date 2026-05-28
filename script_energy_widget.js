const W = 2030;
const H = 950;

const C = {
  bg: "#e9e6d8",
  card: "#ffffff",
  text: "#4b5468",
  muted: "#4b546899",
  orange: "#ef7d17",
  blue: "#6ba8a3",
  purple: "#9494b2",
  green: "#61E294",
  darkGreen: "#009494",
  line: "#4b546844",
};

const now = new Date();

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

function url(gas = false) {
  return [
    "https://api.energyzero.nl/v1/energyprices?",
    `fromDate=${encodeURIComponent(dayStart.toISOString())}&`,
    `tillDate=${encodeURIComponent(dayEnd.toISOString())}&`,
    "interval=4&",
    `usageType=${gas ? "3" : "1"}&`,
    "inclBtw=true",
  ].join("");
}

function money(v) {
  return Number.isFinite(v) ? v.toLocaleString(...nf) : "—";
}

function text(ctx, value, x, y, w, h, font, color = C.text, align = "left") {
  ctx.setTextColor(new Color(color));
  ctx.setFont(font);

  if (align === "center") ctx.setTextAlignedCenter();
  else if (align === "right") ctx.setTextAlignedRight();
  else ctx.setTextAlignedLeft();

  ctx.drawTextInRect(String(value), new Rect(x, y, w, h));
}

function rect(ctx, x, y, w, h, color) {
  ctx.setFillColor(new Color(color));
  ctx.fillRect(new Rect(x, y, w, h));
}

async function load(gas = false) {
  const res = await new Request(url(gas)).loadJSON();

  return (res.Prices || [])
    .filter((x) => Number.isFinite(x.price))
    .sort((a, b) => new Date(a.readingDate) - new Date(b.readingDate));
}

function colorFor(price, normalized, avg, high) {
  if (price < -0.17) return C.darkGreen;
  if (price <= 0) return C.green;
  if (normalized < avg) return C.blue;
  if (normalized > high) return C.orange;
  return C.purple;
}

function findCurrentRow(rows) {
  return (
    rows.find((row) => {
      const start = new Date(row.readingDate);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      return now >= start && now < end;
    }) ?? rows[rows.length - 1]
  );
}

async function main() {
  const [priceRows, gasRows] = await Promise.all([load(false), load(true)]);

  if (!priceRows.length) throw new Error("Geen stroomprijzen gevonden");

  const prices = priceRows.map((x) => x.price);
  const currentRow = findCurrentRow(priceRows);
  const currentPrice = currentRow.price;
  const currentHourLabel = new Date(currentRow.readingDate).getHours();

  const gasRow = gasRows[gasRows.length - 1];
  const gasPrice = gasRow?.price ?? NaN;

  const min = Math.min(...prices);
  let max = Math.max(...prices);
  const realMax = max;

  if (max === min) max = min + 0.01;

  const normalized = prices.map((p) => (p - min) / (max - min));
  const avg = normalized.reduce((a, b) => a + b, 0) / normalized.length;
  const high = (1 + avg) / 2;

  const ctx = new DrawContext();
  ctx.size = new Size(W, H);
  ctx.opaque = false;

  rect(ctx, 0, 0, W, H, C.bg);
  rect(ctx, 70, 60, W - 140, H - 120, C.card);

  text(ctx, day, 130, 110, 600, 80, Font.heavySystemFont(68), C.text);
  text(
    ctx,
    "EnergyZero prijzen vandaag",
    130,
    190,
    800,
    55,
    Font.mediumSystemFont(38),
    C.muted,
  );

  text(ctx, "NU", 130, 300, 160, 70, Font.heavySystemFont(60), C.orange);
  text(
    ctx,
    `${currentHourLabel}:00`,
    130,
    372,
    220,
    60,
    Font.boldSystemFont(46),
    C.text,
  );
  text(
    ctx,
    money(currentPrice),
    330,
    292,
    520,
    120,
    Font.heavySystemFont(92),
    C.text,
  );

  text(ctx, "Laagste", 980, 300, 220, 45, Font.mediumSystemFont(34), C.muted);
  text(ctx, money(min), 980, 345, 260, 65, Font.boldSystemFont(48), C.blue);

  text(ctx, "Hoogste", 1270, 300, 220, 45, Font.mediumSystemFont(34), C.muted);
  text(
    ctx,
    money(realMax),
    1270,
    345,
    260,
    65,
    Font.boldSystemFont(48),
    C.orange,
  );

  text(ctx, "Gas", 1560, 300, 160, 45, Font.mediumSystemFont(34), C.muted);
  text(
    ctx,
    money(gasPrice),
    1560,
    345,
    300,
    65,
    Font.boldSystemFont(48),
    C.text,
  );

  const gx = 130;
  const gy = 500;
  const gw = W - 260;
  const gh = 270;

  const gap = 10;
  const barW = (gw - gap * (priceRows.length - 1)) / priceRows.length;

  const avgY = gy + gh * (1 - avg);
  rect(ctx, gx, avgY, gw, 6, C.line);

  priceRows.forEach((row, i) => {
    const price = row.price;
    const rowStart = new Date(row.readingDate);
    const rowHour = rowStart.getHours();
    const active = row === currentRow;

    const n = normalized[i];
    const h = Math.max(gh * n, 12);
    const x = gx + i * (barW + gap);
    const y = gy + gh - h;

    let color = colorFor(price, n, avg, high);

    if (rowStart < now && !active) color += "55";

    if (active) {
      rect(ctx, x - 8, gy - 34, barW + 16, gh + 46, "#ef7d1722");
      rect(ctx, x - 4, y - 8, barW + 8, h + 8, C.orange);
      text(
        ctx,
        "NU",
        x - 20,
        gy - 88,
        barW + 40,
        46,
        Font.heavySystemFont(34),
        C.orange,
        "center",
      );
    } else {
      rect(ctx, x, y, barW, h, color);
    }

    const showLabel = active || rowHour % 3 === 0 || rowHour === 23;

    if (showLabel) {
      text(
        ctx,
        String(rowHour),
        x - 10,
        gy + gh + 28,
        barW + 20,
        48,
        active ? Font.heavySystemFont(44) : Font.boldSystemFont(34),
        active ? C.orange : C.text,
        "center",
      );
    }
  });

  text(
    ctx,
    "groen = gratis/negatief",
    130,
    835,
    420,
    45,
    Font.mediumSystemFont(32),
    C.muted,
  );
  text(
    ctx,
    "blauw = goedkoop",
    560,
    835,
    330,
    45,
    Font.mediumSystemFont(32),
    C.muted,
  );
  text(
    ctx,
    "oranje = duur",
    900,
    835,
    300,
    45,
    Font.mediumSystemFont(32),
    C.muted,
  );

  const widget = new ListWidget();
  widget.backgroundColor = new Color(C.bg);
  widget.backgroundImage = ctx.getImage();

  if (config.runsInWidget) {
    Script.setWidget(widget);
  } else {
    await widget.presentMedium();
  }

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
