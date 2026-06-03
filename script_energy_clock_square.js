const W = 950;
const H = 950;

const C = {
  bg: "#e9e6d8",
  card: "#e9e6d8",
  text: "#4b5468",
  muted: "#4b546899",
  line: "#4b546833",
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
const afterTomorrowStart = new Date(today[0], today[1], today[2] + 2);

function apiDate(date) {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();

  return `${dd}-${mm}-${yyyy}`;
}

function url(date) {
  const params = [
    `date=${apiDate(date)}`,
    "interval=INTERVAL_QUARTER",
    "energy_type=ENERGY_TYPE_ELECTRICITY",
  ];

  return [
    "https://public.api.energyzero.nl/v1/prices?",
    params.join("&"),
  ].join("");
}

function money(v) {
  return Number.isFinite(v) ? v.toLocaleString(...nf) : "-";
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

function ellipse(ctx, x, y, w, h, color) {
  ctx.setFillColor(new Color(color));
  ctx.fillEllipse(new Rect(x, y, w, h));
}

function strokedEllipse(ctx, x, y, w, h, color, width) {
  ctx.setStrokeColor(new Color(color));
  ctx.setLineWidth(width);
  ctx.strokeEllipse(new Rect(x, y, w, h));
}

function line(ctx, x1, y1, x2, y2, color, width) {
  const path = new Path();
  path.move(new Point(x1, y1));
  path.addLine(new Point(x2, y2));

  ctx.setStrokeColor(new Color(color));
  ctx.setLineWidth(width);
  ctx.addPath(path);
  ctx.strokePath();
}

function hexagon(ctx, cx, cy, radius, color, rotation = Math.PI / 12) {
  const path = new Path();

  for (let i = 0; i < 6; i += 1) {
    const angle = rotation + (Math.PI * 2 * i) / 6;
    const point = new Point(
      cx + Math.cos(angle) * radius,
      cy + Math.sin(angle) * radius,
    );

    if (i === 0) path.move(point);
    else path.addLine(point);
  }

  path.closeSubpath();
  ctx.setFillColor(new Color(color));
  ctx.addPath(path);
  ctx.fillPath();
}

function inRange(row, startDate, endDate) {
  const start = new Date(row.readingDate);
  return start >= startDate && start < endDate;
}

function normalizeRows(res, startDate, endDate) {
  const allIn = res.all_in_with_vat || res.allInWithVat;

  if (Array.isArray(allIn) && allIn.length) {
    return allIn
      .map((x) => ({
        readingDate: x.start || x.readingDate || x.from || x.date,
        endDate: x.end,
        price: Number(x.price?.value ?? x.price),
      }))
      .filter((x) => x.readingDate && Number.isFinite(x.price))
      .filter((x) => inRange(x, startDate, endDate))
      .sort((a, b) => new Date(a.readingDate) - new Date(b.readingDate));
  }

  return (res.Prices || [])
    .map((x) => ({
      readingDate: x.readingDate,
      endDate: x.endDate,
      price: Number(x.price),
    }))
    .filter((x) => x.readingDate && Number.isFinite(x.price))
    .filter((x) => inRange(x, startDate, endDate))
    .sort((a, b) => new Date(a.readingDate) - new Date(b.readingDate));
}

async function loadForDay(date, startDate, endDate) {
  const res = await new Request(url(date)).loadJSON();
  return normalizeRows(res, startDate, endDate);
}

async function load() {
  const todayRows = await loadForDay(todayStart, todayStart, tomorrowStart);
  let tomorrowRows = [];

  try {
    tomorrowRows = await loadForDay(
      tomorrowStart,
      tomorrowStart,
      afterTomorrowStart,
    );
  } catch (_) {
    tomorrowRows = [];
  }

  return todayRows
    .concat(tomorrowRows)
    .sort((a, b) => new Date(a.readingDate) - new Date(b.readingDate));
}

function findCurrentRow(rows) {
  return (
    rows.find((row) => {
      const start = new Date(row.readingDate);
      const end = row.endDate
        ? new Date(row.endDate)
        : new Date(start.getTime() + 15 * 60 * 1000);

      return now >= start && now < end;
    }) ??
    rows.find((row) => new Date(row.readingDate) >= now) ??
    rows[rows.length - 1]
  );
}

function nextTwelveHours(rows) {
  const end = new Date(now.getTime() + 12 * 60 * 60 * 1000);

  return rows.filter((row) => {
    const start = new Date(row.readingDate);
    const rowEnd = row.endDate
      ? new Date(row.endDate)
      : new Date(start.getTime() + 15 * 60 * 1000);

    return rowEnd > now && start < end;
  });
}

function currentQuarterStart() {
  const start = new Date(now);
  start.setSeconds(0);
  start.setMilliseconds(0);
  start.setMinutes(Math.floor(start.getMinutes() / 15) * 15);

  return start;
}

function clockSlots(rows) {
  const firstSlot = currentQuarterStart();

  return Array.from({ length: 48 }, (_, i) => {
    const slotStart = new Date(firstSlot.getTime() + i * 15 * 60 * 1000);
    const row = rows.find((x) => {
      const rowStart = new Date(x.readingDate);
      const rowEnd = x.endDate
        ? new Date(x.endDate)
        : new Date(rowStart.getTime() + 15 * 60 * 1000);

      return slotStart >= rowStart && slotStart < rowEnd;
    });

    return {
      readingDate: slotStart,
      price: row?.price ?? NaN,
      row,
    };
  });
}

function colorScale(rows) {
  const prices = rows.map((x) => x.price);
  const min = Math.min(...prices);
  let max = Math.max(...prices);

  if (max === min) max = min + 0.01;

  const normalized = prices.map((p) => (p - min) / (max - min));
  const avg = normalized.reduce((a, b) => a + b, 0) / normalized.length;
  const high = (1 + avg) / 2;

  return { min, max, avg, high };
}

function colorFor(price, scale) {
  if (!Number.isFinite(price)) return C.muted;
  if (price < -0.17) return C.darkGreen;
  if (price <= 0) return C.green;

  const normalized = (price - scale.min) / (scale.max - scale.min);

  if (normalized < scale.avg * 0.75) return C.blue;
  if (normalized < scale.avg) return C.green;
  if (normalized > scale.high) return C.red;
  if (normalized > scale.avg) return C.orange;

  return C.yellow;
}

function timeLabel(date) {
  const d = new Date(date);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");

  return `${hh}:${mm}`;
}

function angleForDate(date) {
  const d = new Date(date);
  const hours = d.getHours() % 12;
  const minutes = d.getMinutes();
  const seconds = d.getSeconds();

  return (
    ((hours + minutes / 60 + seconds / 3600) / 12) * Math.PI * 2 -
    Math.PI / 2
  );
}

function point(cx, cy, radius, angle) {
  return {
    x: cx + Math.cos(angle) * radius,
    y: cy + Math.sin(angle) * radius,
  };
}

function drawTick(ctx, cx, cy, angle, innerRadius, outerRadius, color, width) {
  const a = point(cx, cy, innerRadius, angle);
  const b = point(cx, cy, outerRadius, angle);

  line(ctx, a.x, a.y, b.x, b.y, color, width);
}

function drawHand(ctx, cx, cy, angle, radius, color, width, tail = 0) {
  const tip = point(cx, cy, radius, angle);
  const back = point(cx, cy, -tail, angle);

  line(ctx, back.x, back.y, tip.x, tip.y, color, width);
}

function drawClock(ctx, slots, currentRow) {
  const cx = W / 2;
  const cy = H / 2 - 20;
  const radius = 360;
  const pricedSlots = slots.filter((x) => Number.isFinite(x.price));
  const scale = colorScale(pricedSlots.length ? pricedSlots : [currentRow]);
  const currentColor = colorFor(currentRow.price, scale);

  rect(ctx, 0, 0, W, H, C.bg);
  rect(ctx, 70, 70, W - 140, H - 140, C.card);
  hexagon(ctx, W / 2 + 155, 575, 420, `${currentColor}55`);

  ellipse(
    ctx,
    cx - radius - 34,
    cy - radius - 34,
    (radius + 34) * 2,
    (radius + 34) * 2,
    "#e9e6d899",
  );
  strokedEllipse(
    ctx,
    cx - radius,
    cy - radius,
    radius * 2,
    radius * 2,
    C.line,
    8,
  );

  for (let i = 0; i < 60; i += 1) {
    const angle = (i / 60) * Math.PI * 2 - Math.PI / 2;
    const hour = i % 5 === 0;

    drawTick(
      ctx,
      cx,
      cy,
      angle,
      hour ? radius - 52 : radius - 30,
      radius - 8,
      hour ? C.text : C.muted,
      hour ? 10 : 4,
    );
  }

  slots.forEach((slot) => {
    const start = new Date(slot.readingDate);
    const active =
      now >= start && now < new Date(start.getTime() + 15 * 60 * 1000);
    const color = active ? C.orange : colorFor(slot.price, scale);
    const angle = angleForDate(slot.readingDate);

    drawTick(
      ctx,
      cx,
      cy,
      angle,
      radius - 112,
      radius - 58,
      color,
      active ? 20 : 14,
    );
  });

  const minuteAngle =
    ((now.getMinutes() + now.getSeconds() / 60) / 60) * Math.PI * 2 -
    Math.PI / 2;
  const hourAngle =
    (((now.getHours() % 12) + now.getMinutes() / 60) / 12) * Math.PI * 2 -
    Math.PI / 2;

  drawHand(ctx, cx, cy, hourAngle, radius - 180, C.text, 22, 36);
  drawHand(ctx, cx, cy, minuteAngle, radius - 110, C.text, 14, 48);
  drawHand(ctx, cx, cy, angleForDate(now), radius - 72, C.orange, 5, 58);

  ellipse(ctx, cx - 28, cy - 28, 56, 56, C.orange);
  ellipse(ctx, cx - 13, cy - 13, 26, 26, C.card);

  rect(ctx, cx - 230, cy + 205, 460, 132, `${C.card}ee`);
  text(
    ctx,
    "NU",
    cx - 210,
    cy + 226,
    120,
    46,
    Font.heavySystemFont(36),
    C.orange,
    "center",
  );
  text(
    ctx,
    timeLabel(currentRow.readingDate),
    cx + 88,
    cy + 226,
    120,
    46,
    Font.boldSystemFont(34),
    C.muted,
    "center",
  );
  text(
    ctx,
    money(currentRow.price),
    cx - 200,
    cy + 272,
    400,
    58,
    Font.heavySystemFont(52),
    C.text,
    "center",
  );
}

async function main() {
  const rows = await load();
  if (!rows.length) throw new Error("Geen stroomprijzen gevonden");

  const currentRow = findCurrentRow(rows);
  const futureRows = nextTwelveHours(rows);
  const slots = clockSlots(futureRows.length ? futureRows : [currentRow]);

  const ctx = new DrawContext();
  ctx.size = new Size(W, H);
  ctx.opaque = false;

  drawClock(ctx, slots, currentRow);

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
