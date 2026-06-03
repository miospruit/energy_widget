const W = 950;
const H = 950;

const C = {
  bg: "#e9e6d8",
  card: "#e9e6d8",
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
const todayStart = new Date(...today);
const tomorrowStart = new Date(today[0], today[1], today[2] + 1);

function apiDate(date) {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();

  return `${dd}-${mm}-${yyyy}`;
}

function url() {
  const params = [
    `date=${apiDate(todayStart)}`,
    "interval=INTERVAL_QUARTER",
    "energy_type=ENERGY_TYPE_ELECTRICITY",
  ];

  return [
    "https://public.api.energyzero.nl/v1/prices?",
    params.join("&"),
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

function isTodayRow(row) {
  const start = new Date(row.readingDate);
  return start >= todayStart && start < tomorrowStart;
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
      .filter(isTodayRow)
      .sort((a, b) => new Date(a.readingDate) - new Date(b.readingDate));
  }

  return (res.Prices || [])
    .map((x) => ({
      readingDate: x.readingDate,
      endDate: x.endDate,
      price: Number(x.price),
    }))
    .filter((x) => x.readingDate && Number.isFinite(x.price))
    .filter(isTodayRow)
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
      : new Date(start.getTime() + 15 * 60 * 1000);

    return now >= start && now < end;
  });

  return index >= 0 ? index : rows.length - 1;
}

function minutesUntil(date) {
  const ms = new Date(date) - now;
  return Math.max(0, Math.ceil(ms / (60 * 1000)));
}

function timeLabel(date) {
  const d = new Date(date);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");

  return `${hh}:${mm}`;
}

function changeTitle(label, date) {
  const minutes = minutesUntil(date);

  if (minutes < 60) return `${label} over ${minutes}m`;

  return `${label} over ${Math.ceil(minutes / 60)}u`;
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
      subtitle: "Laagste vandaag",
    };
  }

  if (cheaperSoon) {
    return {
      color: C.yellow,
      title: changeTitle("Goedkoper", cheaperSoon.readingDate),
      subtitle: `${money(cheaperSoon.price)} om ${timeLabel(cheaperSoon.readingDate)}`,
    };
  }

  if (currentPrice >= avg || currentPrice >= max - 0.005) {
    return {
      color: C.red,
      title: "Duur nu",
      subtitle: "Wachten loont niet",
    };
  }

  if (moreExpensiveSoon) {
    return {
      color: C.green,
      title: changeTitle("Duurder", moreExpensiveSoon.readingDate),
      subtitle: `${money(moreExpensiveSoon.price)} om ${timeLabel(moreExpensiveSoon.readingDate)}`,
    };
  }

  return {
    color: C.blue,
    title: "Prima prijs",
    subtitle: "Geen daling verwacht",
  };
}

async function main() {
  const rows = await load();
  if (!rows.length) throw new Error("Geen stroomprijzen gevonden");

  const currentIndex = findCurrentIndex(rows);
  const currentRow = rows[currentIndex];
  const currentPrice = currentRow.price;

  const status = statusFor(rows, currentIndex);

  const ctx = new DrawContext();
  ctx.size = new Size(W, H);
  ctx.opaque = false;

  rect(ctx, 0, 0, W, H, C.bg);
  rect(ctx, 70, 70, W - 140, H - 140, C.card);

  text(ctx, "NU", 0, 120, W, 82, Font.heavySystemFont(72), C.orange, "center");
  text(
    ctx,
    timeLabel(currentRow.readingDate),
    0,
    205,
    W,
    64,
    Font.boldSystemFont(50),
    C.text,
    "center",
  );

  text(
    ctx,
    money(currentPrice),
    50,
    315,
    W - 100,
    160,
    Font.heavySystemFont(132),
    C.text,
    "center",
  );

  circle(ctx, W / 2 - 58, 530, 116, status.color);

  text(
    ctx,
    status.title,
    60,
    670,
    W - 120,
    90,
    Font.heavySystemFont(66),
    C.text,
    "center",
  );

  text(
    ctx,
    status.subtitle,
    70,
    760,
    W - 140,
    70,
    Font.boldSystemFont(44),
    C.text,
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
