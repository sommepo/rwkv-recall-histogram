// Lays the histogram out in a W x H box: the baseline and one bar per percent
// of RWKV R. Shared by the deck list chart and the reviewer's miniature.
// Returns null when no card has a recall yet.
//
// With data.due (cards RWKV counts as due, per percent) the red part of each
// bar is the cards at or below their own desired retention, and data.targets
// are drawn as faint lines. Without it, the chart falls back to one line at
// data.target and colours whole bars by which side of it they are on.
window.__rwkvRecallPlot = function (data, W, H, pad) {
    const target = data.target;
    const perCard = !!data.due;
    const clean = (buckets) => Object.entries(buckets || {})
        .map(([key, count]) => [Math.min(100, Math.max(0, Number(key))), count])
        .filter(([, count]) => count > 0);
    const entries = clean(data.buckets);
    if (!entries.length) return null;
    const targets = perCard ? (data.targets || []) : [target];

    // Start at the configured left edge, or further right when the lowest
    // cards leave it empty; the desired retentions always stay in view.
    const lowest = Math.min(...targets, ...entries.map(([percent]) => percent));
    const min = Math.max(data.min, Math.min(90, Math.floor((lowest - 1) / 10) * 10));
    // Everything below the left edge is piled onto the first bar.
    const clipped = entries.some(([percent]) => percent < min);
    const counts = new Array(101 - min).fill(0);
    const due = new Array(101 - min).fill(0);
    let total = 0, below = 0;
    for (const [percent, count] of entries) {
        counts[Math.max(percent, min) - min] += count;
        total += count;
        if (!perCard && percent < target) below += count;
    }
    for (const [percent, count] of clean(data.due)) due[Math.max(percent, min) - min] += count;

    const plotW = W - pad.left - pad.right, plotH = H - pad.top - pad.bottom;
    const slot = plotW / counts.length;
    const peak = Math.max(...counts);
    const base = pad.top + plotH;
    const x = (percent) => pad.left + (percent - min + 0.5) * slot;
    const tone = (percent) =>
        perCard ? "rr-ok" : percent < target ? "rr-low" : percent < target + data.near ? "rr-near" : "rr-ok";
    const rect = (cls, percent, height) =>
        `<rect class="${cls}" x="${(x(percent) - slot * 0.36).toFixed(2)}" y="${(base - height).toFixed(2)}" width="${(slot * 0.72).toFixed(2)}" height="${height.toFixed(2)}" rx="${Math.min(3, slot * 0.36, height / 2).toFixed(2)}"/>`;

    let bars = "";
    counts.forEach((count, index) => {
        if (!count) return;
        const percent = min + index;
        const height = Math.max(2, (count / peak) * plotH);
        // the two series are scored a moment apart, so a card can change bar
        const dueHere = Math.min(count, due[index]);
        below += dueHere;
        let label = (index === 0 && clipped ? "≤" : "") + percent + "%: " + count.toLocaleString() + " cards";
        if (perCard && dueHere) label += ", " + dueHere.toLocaleString() + " due";
        bars += "<g>" + rect(dueHere === count && perCard ? "rr-low" : tone(percent), percent, height);
        if (dueHere && dueHere < count) bars += rect("rr-low", percent, Math.max(2, (dueHere / count) * height));
        bars += `<title>${label}</title></g>`;
    });

    // A line sits on the boundary between "below target" and "at target".
    let lines = "";
    for (const mark of targets) {
        const lineX = Math.max(pad.left, x(mark) - slot / 2).toFixed(2);
        lines += `<line class="${perCard ? "rr-tier" : "rr-target"}" x1="${lineX}" x2="${lineX}" y1="0" y2="${base}"/>`;
    }
    const axis = `<line class="rr-axis" x1="${pad.left}" x2="${W - pad.right}" y1="${base}" y2="${base}"/>`;
    return {
        // tier lines go behind the bars, the single target line in front
        marks: perCard ? axis + lines + bars : axis + bars + lines,
        x, min, clipped, total, below, perCard,
    };
};

// Draws the RWKV recall histogram. Called on render with the last known
// counts and again whenever the add-on finishes a recount.
window.__rwkvRecallSet = function (data, error) {
    const root = document.getElementById("rwkv-recall");
    if (!root) return;

    const title = '<div class="rr-title">RWKV recall now · ' +
        (data.due ? "red = due (below its desired retention)" : "red line = desired retention") + "</div>";
    if (!data.buckets) {
        root.innerHTML = title + '<div class="rr-note">' + (error || "Loading…") + "</div>";
        return;
    }

    const W = 640, H = 170;
    const plot = __rwkvRecallPlot(data, W, H, { left: 8, right: 8, top: 8, bottom: 22 });
    if (!plot) {
        root.innerHTML = title + '<div class="rr-note">No cards with an RWKV recall yet</div>';
        return;
    }

    let ticks = "";
    for (let percent = Math.ceil(plot.min / 10) * 10; percent <= 100; percent += 10) {
        const text = (percent === plot.min && plot.clipped ? "≤" : "") + percent + "%";
        ticks += `<text class="rr-tick" x="${plot.x(percent).toFixed(2)}" y="${H - 6}">${text}</text>`;
    }

    const share = ((plot.below / plot.total) * 100).toFixed(1);
    root.innerHTML =
        title +
        `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Cards by RWKV recall">` +
        plot.marks +
        ticks +
        "</svg>" +
        `<div class="rr-note">${plot.below.toLocaleString()} of ${plot.total.toLocaleString()} cards (${share}%) ` +
        (plot.perCard ? "due" : `below ${+data.target.toFixed(1)}%`) + "</div>";
};
