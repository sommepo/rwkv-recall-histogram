// The same histogram as a text-free miniature in the reviewer's bottom bar.
// It sits beside "Edit", in the free strip left of the answer buttons, as tall
// as the bar allows and as wide as the strip allows up to MAX_W; it hides when
// the strip cannot hold MIN_W.
(function () {
    const MIN_W = 132, MAX_W = 340, MIN_H = 26, GAP = 14, EDGE = 4;
    let data = null, box = null, widest = 0, queued = false, drawn = "";

    const shown = (el) => (el && el.offsetParent ? el : null);

    function draw(W, H) {
        const key = W + "x" + H;
        if (drawn === key) return;
        drawn = key;
        const plot = data && data.buckets
            ? __rwkvRecallPlot(data, W, H, { left: 1, right: 1, top: 3, bottom: 1 })
            : null;
        box.innerHTML = plot
            ? `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">${plot.marks}</svg>`
            : "";
    }

    function place() {
        if (!box) return;
        const mid = document.querySelector("#middle table");
        const hide = () => { if (box.style.display !== "none") box.style.display = "none"; };
        if (!mid) return hide();
        const m = mid.getBoundingClientRect();
        // the answer buttons are wider than "Show Answer": keep clear of the
        // widest seen, so the chart does not change size on every flip
        widest = Math.max(widest, m.width);
        const edit = shown(document.querySelector("#innertable td.stat:first-child button"));
        const left = Math.round((edit ? edit.getBoundingClientRect().right : 0) + GAP);
        const room = Math.floor((m.left + m.right) / 2 - widest / 2 - GAP - left);
        if (room < MIN_W) return hide();
        const W = Math.min(MAX_W, room);
        const H = Math.max(MIN_H, window.innerHeight - 2 * EDGE);
        draw(W, H);
        if (!box.firstChild) return hide();
        const css = `left: ${left}px; top: ${Math.round((window.innerHeight - H) / 2)}px;`;
        if (box.style.cssText !== css) box.style.cssText = css;
    }

    function schedule() {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => { queued = false; place(); });
    }

    window.__rwkvRecallMini = function (next) {
        data = next;
        drawn = "";
        if (!document.body) return;
        if (!box) {
            box = document.createElement("div");
            box.id = "rwkv-recall-mini";
            document.body.appendChild(box);
        }
        place();
    };

    function start() {
        if (data) __rwkvRecallMini(data);
        window.addEventListener("resize", schedule);
        const middle = document.getElementById("middle");
        if (middle) new MutationObserver(schedule).observe(middle, { childList: true });
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
})();
