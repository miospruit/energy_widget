const W = 950;
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
  red: "#e85d5d",
  yellow: "#f2b84b",
  darkGreen: "#009494",
};

const now = new Date();
const nf = ["nl-NL", { style: "currency", currency: "EUR" }];

const today = [now.getFullYear(), now.getMonth(), now.getDate()];
const start = encodeURIComponent(new Date(...today).toISOString());
const end = encodeURIComponent(
  new Date(...today, 23, 59, 59, 999).toISOString(),
);

function url() {
  return [
    "https://api.energyzero.nl/v1/energyprices?",
    `fromDate=${start}&`,
    `tillDate=${end}&`,
    "interval=4&",
    "usageType=1&",
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

function circle(ctx, x, y, size, color) {
  ctx.setFillColor(new Color(color));
  ctx.fillEllipse(new Rect(x, y, size, size));
}

function normalizeRows(res) {
  const allIn = res.all_in_with_vat || res.allInWithVat;

  if (Array.isArray(allIn) && allIn.length) {
    return allIn
      .map((x) => ({
        readingDate: x.start || x.readingDate || x.from || x.date,
        endDate: x.end,
        price: Number(x.price?.value ?? x.price),
      }))
      .filter((x) => x.readingDate && Number.isFinite(x.price))
      .sort((a, b) => new Date(a.readingDate) - new Date(b.readingDate));
  }

  return (res.Prices || [])
    .map((x) => ({
      readingDate: x.readingDate,
      endDate: x.endDate,
      price: Number(x.price),
    }))
    .filter((x) => x.readingDate && Number.isFinite(x.price))
    .sort((a, b) => new Date(a.readingDate) - new Date(b.readingDate));
}

async function load() {
  const res = await new Request(url()).loadJSON();
  return normalizeRows(res);
}

function findCurrentIndex(rows) {
  const index = rows.findIndex((row) => {
    const start = new Date(row.readingDate);
    const end = row.endDate
      ? new Date(row.endDate)
      : new Date(start.getTime() + 60 * 60 * 1000);

    return now >= start && now < end;
  });

  return index >= 0 ? index : rows.length - 1;
}

function hoursUntil(date) {
  const ms = new Date(date) - now;
  return Math.max(0, Math.ceil(ms / (60 * 60 * 1000)));
}

function statusFor(rows, currentIndex) {
  const current = rows[currentIndex];
  const currentPrice = current.price;

  const prices = rows.map((x) => x.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;

  const remaining = rows.slice(currentIndex + 1);
  const cheaperSoon = remaining.find((x) => x.price < currentPrice - 0.005);
  const moreExpensiveSoon = remaining.find(
    (x) => x.price > currentPrice + 0.005,
  );

  if (currentPrice <= min + 0.005) {
    return {
      color: C.green,
      title: "Goedkoop nu",
      subtitle: "Laagste moment vandaag",
    };
  }

  if (cheaperSoon) {
    const h = hoursUntil(cheaperSoon.readingDate);
    return {
      color: C.yellow,
      title: `Goedkoper over ${h} uur`,
      subtitle: `${money(cheaperSoon.price)} verwacht`,
    };
  }

  if (currentPrice >= avg || currentPrice >= max - 0.005) {
    return {
      color: C.red,
      title: "Duur nu",
      subtitle: "Wachten loont niet meer vandaag",
    };
  }

  if (moreExpensiveSoon) {
    const h = hoursUntil(moreExpensiveSoon.readingDate);
    return {
      color: C.green,
      title: "Goed moment",
      subtitle: `Duurder over ${h} uur`,
    };
  }

  return {
    color: C.blue,
    title: "Prima prijs",
    subtitle: "Geen grote daling verwacht",
  };
}

async function main() {
  const rows = await load();
  if (!rows.length) throw new Error("Geen stroomprijzen gevonden");

  const currentIndex = findCurrentIndex(rows);
  const currentRow = rows[currentIndex];
  const currentPrice = currentRow.price;
  const hour = new Date(currentRow.readingDate).getHours();

  const status = statusFor(rows, currentIndex);

  const ctx = new DrawContext();
  ctx.size = new Size(W, H);
  ctx.opaque = false;

  rect(ctx, 0, 0, W, H, C.bg);
  rect(ctx, 70, 70, W - 140, H - 140, C.card);

  text(ctx, "NU", 0, 145, W, 70, Font.heavySystemFont(58), C.orange, "center");
  text(
    ctx,
    `${hour}:00`,
    0,
    215,
    W,
    55,
    Font.boldSystemFont(42),
    C.muted,
    "center",
  );

  text(
    ctx,
    money(currentPrice),
    70,
    330,
    W - 140,
    140,
    Font.heavySystemFont(112),
    C.text,
    "center",
  );

  circle(ctx, W / 2 - 42, 540, 84, status.color);

  text(
    ctx,
    status.title,
    100,
    660,
    W - 200,
    75,
    Font.heavySystemFont(54),
    C.text,
    "center",
  );

  text(
    ctx,
    status.subtitle,
    110,
    735,
    W - 220,
    60,
    Font.mediumSystemFont(36),
    C.muted,
    "center",
  );

  const widget = new ListWidget();
  widget.backgroundColor = new Color(C.bg);
  widget.backgroundImage = ctx.getImage();

  if (config.runsInWidget) {
    Script.setWidget(widget);
  } else {
    await widget.presentSmall();
  }

  Script.complete();
}

main().catch(async (e) => {
  const widget = new ListWidget();
  widget.backgroundColor = new Color("#331111");
  widget.addText("Failed to load").textColor = new Color("#ff8888");
  widget.addText(String(e)).textColor = new Color("#ffffff88");

  if (config.runsInWidget) Script.setWidget(widget);
  else await widget.presentSmall();

  Script.complete();
});
