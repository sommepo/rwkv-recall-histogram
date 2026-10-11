// Lays the histogram out in a W x H box: the baseline, one bar per percent of
// RWKV R and the desired-retention line. Shared by the deck list chart and the
// reviewer's miniature. Returns null when no card has a recall yet.
window.__rwkvRecallPlot = function (data, W, H, pad) {
    const target = data.target;
    const entries = Object.entries(data.buckets)
        .map(([key, count]) => [Math.min(100, Math.max(0, Number(key))), count])
        .filter(([, count]) => count > 0);
    if (!entries.length) return null;

    // Start at the configured left edge, or further right when the lowest
    // cards leave it empty; the desired retention always stays in view.
    const lowest = Math.min(target, ...entries.map(([percent]) => percent));
    const min = Math.max(data.min, Math.min(90, Math.floor((lowest - 1) / 10) * 10));
    // Everything below the left edge is piled onto the first bar.
    const clipped = entries.some(([percent]) => percent < min);
    const counts = new Array(101 - min).fill(0);
    let total = 0, below = 0;
    for (const [percent, count] of entries) {
        counts[Math.max(percent, min) - min] += count;
        total += count;
        if (percent < target) below += count;
    }

    const plotW = W - pad.left - pad.right, plotH = H - pad.top - pad.bottom;
    const slot = plotW / counts.length;
    const peak = Math.max(...counts);
    const base = pad.top + plotH;
    const x = (percent) => pad.left + (percent - min + 0.5) * slot;
    const tone = (percent) =>
        percent < target ? "rr-low" : percent < target + data.near ? "rr-near" : "rr-ok";

    let bars = "";
    counts.forEach((count, index) => {
        if (!count) return;
        const percent = min + index;
        const height = Math.max(2, (count / peak) * plotH);
        const label = (index === 0 && clipped ? "≤" : "") + percent + "%: " + count.toLocaleString() + " cards";
        bars += `<rect class="${tone(percent)}" x="${(x(percent) - slot * 0.36).toFixed(2)}" y="${(base - height).toFixed(2)}" width="${(slot * 0.72).toFixed(2)}" height="${height.toFixed(2)}" rx="${Math.min(3, slot * 0.36).toFixed(2)}"><title>${label}</title></rect>`;
    });

    // The line sits on the boundary between "below target" and "at target".
    const lineX = Math.max(pad.left, x(target) - slot / 2).toFixed(2);
    return {
        marks:
            `<line class="rr-axis" x1="${pad.left}" x2="${W - pad.right}" y1="${base}" y2="${base}"/>` +
            bars +
            `<line class="rr-target" x1="${lineX}" x2="${lineX}" y1="0" y2="${base}"/>`,
        x, min, clipped, total, below,
    };
};

// Draws the RWKV recall histogram. Called on render with the last known
// counts and again whenever the add-on finishes a recount.
window.__rwkvRecallSet = function (data, error) {
    const root = document.getElementById("rwkv-recall");
    if (!root) return;

    const title = '<div class="rr-title">RWKV recall now · red line = desired retention</div>';
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
        `<div class="rr-note">${plot.below.toLocaleString()} of ${plot.total.toLocaleString()} cards (${share}%) below ${+data.target.toFixed(1)}%</div>`;
};
