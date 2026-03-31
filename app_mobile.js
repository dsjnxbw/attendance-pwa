const STORAGE_KEY = "attendance_mobile_data_v1";

const state = {
    overtime_records: [],
    leave_records: [],
    version: 1,
};

const el = {
    todayText: document.getElementById("todayText"),
    otStart: document.getElementById("otStart"),
    otEnd: document.getElementById("otEnd"),
    lvStart: document.getElementById("lvStart"),
    lvEnd: document.getElementById("lvEnd"),
    addOtBtn: document.getElementById("addOtBtn"),
    addLvBtn: document.getElementById("addLvBtn"),
    exportBtn: document.getElementById("exportBtn"),
    importInput: document.getElementById("importInput"),
    resetBtn: document.getElementById("resetBtn"),
    delOtBtn: document.getElementById("delOtBtn"),
    delLvBtn: document.getElementById("delLvBtn"),
    sOt: document.getElementById("sOt"),
    sLv: document.getElementById("sLv"),
    sRem: document.getElementById("sRem"),
    sDays: document.getElementById("sDays"),
    otList: document.getElementById("otList"),
    lvList: document.getElementById("lvList"),
    rowTpl: document.getElementById("rowTpl"),
};

function nowInputValue() {
    const d = new Date();
    d.setSeconds(0, 0);
    return toInputDateTime(d);
}

function toInputDateTime(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${day}T${hh}:${mm}`;
}

function toStoreDateTime(d) {
    return toInputDateTime(d).replace("T", " ");
}

function parseInput(v) {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) {
        throw new Error("时间格式无效，请重新选择");
    }
    return d;
}

function parseStore(v) {
    return parseInput(v.replace(" ", "T"));
}

function floorHalf(h) {
    return Math.floor(h * 2) / 2;
}

function ceilHalf(h) {
    return Math.ceil(h * 2) / 2;
}

function dayType(d) {
    const wd = d.getDay();
    if (wd >= 1 && wd <= 5) return "workday";
    if (wd === 6) return "saturday";
    return "holiday";
}

function calcOvertime(start, end) {
    if (end <= start) throw new Error("结束时间必须晚于开始时间");
    if (start.toDateString() !== end.toDateString()) throw new Error("当前版本仅支持同一天内的加班计算");

    const wd = start.getDay();
    const threshold = new Date(start);
    let rule = "周日按打卡";
    if (wd >= 1 && wd <= 5) {
        threshold.setHours(18, 30, 0, 0);
        rule = "工作日18:30后";
    } else if (wd === 6) {
        threshold.setHours(13, 0, 0, 0);
        rule = "周六13:00后";
    }

    const effectiveStart = start > threshold ? start : threshold;
    if (end <= effectiveStart) return [0, rule];
    const hours = (end - effectiveStart) / 3600000;
    return [floorHalf(hours), rule];
}

function calcLeaveSingleDay(start, end) {
    const kind = dayType(start);
    if (kind === "holiday") return [0, "休息时间，无需调休"];

    if (kind === "saturday") {
        const satStart = new Date(start);
        satStart.setHours(8, 30, 0, 0);
        const satEnd = new Date(start);
        satEnd.setHours(11, 30, 0, 0);

        const s = start > satStart ? start : satStart;
        const e = end < satEnd ? end : satEnd;
        if (e <= s) return [0, "休息时间，无需调休"];
        return [ceilHalf((e - s) / 3600000), "周六上午调休"];
    }

    const ws = new Date(start); ws.setHours(8, 30, 0, 0);
    const ls = new Date(start); ls.setHours(11, 30, 0, 0);
    const le = new Date(start); le.setHours(13, 0, 0, 0);
    const we = new Date(start); we.setHours(17, 30, 0, 0);

    const s = start > ws ? start : ws;
    const e = end < we ? end : we;
    if (e <= s) return [0, "休息时间，无需调休"];

    let secs = (e - s) / 1000;
    const loS = s > ls ? s : ls;
    const loE = e < le ? e : le;
    if (loE > loS) secs -= (loE - loS) / 1000;
    if (secs <= 0) return [0, "休息时间，无需调休"];
    return [ceilHalf(secs / 3600), "工作日调休"];
}

function calcLeave(start, end) {
    if (end <= start) throw new Error("结束时间必须晚于开始时间");

    const isSameDay = start.toDateString() === end.toDateString();
    if (isSameDay) return calcLeaveSingleDay(start, end);

    let total = 0;
    let workdays = 0;
    let saturdays = 0;

    const day = new Date(start);
    day.setHours(0, 0, 0, 0);
    const endDay = new Date(end);
    endDay.setHours(0, 0, 0, 0);

    while (day <= endDay) {
        const dayStart = new Date(day);
        const nextDayStart = new Date(day);
        nextDayStart.setDate(nextDayStart.getDate() + 1);

        const segStart = start > dayStart ? start : dayStart;
        const segEnd = end < nextDayStart ? end : nextDayStart;

        if (segEnd > segStart) {
            const [h, r] = calcLeaveSingleDay(segStart, segEnd);
            total += h;
            if (h > 0 && r === "工作日调休") workdays += 1;
            if (h > 0 && r === "周六上午调休") saturdays += 1;
        }

        day.setDate(day.getDate() + 1);
    }

    total = Number(total.toFixed(2));
    if (total <= 0) return [0, "休息时间，无需调休"];
    return [total, `跨日调休(工作日${workdays}天, 周六${saturdays}天)`];
}

function totals() {
    const ot = state.overtime_records.reduce((s, r) => s + Number(r.counted_hours), 0);
    const lv = state.leave_records.reduce((s, r) => s + Number(r.hours), 0);
    const rem = ot - lv;
    return {
        ot: Number(ot.toFixed(2)),
        lv: Number(lv.toFixed(2)),
        rem: Number(rem.toFixed(2)),
        days: Number((rem / 7.5).toFixed(2)),
    };
}

function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: state.version,
        overtime_records: state.overtime_records,
        leave_records: state.leave_records,
    }));
}

function load() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
        const data = JSON.parse(raw);
        state.overtime_records = Array.isArray(data.overtime_records) ? data.overtime_records : [];
        state.leave_records = Array.isArray(data.leave_records) ? data.leave_records : [];
    } catch (_) {
        state.overtime_records = [];
        state.leave_records = [];
    }
}

function rowElement(r, idx, kind) {
    const node = el.rowTpl.content.firstElementChild.cloneNode(true);
    node.querySelector(".pick").dataset.index = String(idx);
    node.querySelector(".pick").dataset.kind = kind;
    node.querySelector(".line1").textContent = `${r.start}  ->  ${r.end}`;
    node.querySelector(".line2").textContent = kind === "ot" ? "加班记录" : "调休记录";
    node.querySelector(".hours").textContent = kind === "ot" ? `${Number(r.counted_hours).toFixed(2)} h` : `${Number(r.hours).toFixed(2)} h`;
    node.querySelector(".rule").textContent = r.rule;
    if ((r.rule || "").includes("无需调休")) node.classList.add("rest");
    return node;
}

function parseStoreDate(value) {
    if (!value) return Number.POSITIVE_INFINITY;
    const d = new Date(String(value).replace(" ", "T"));
    const t = d.getTime();
    return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

function sortRecordsInPlace() {
    state.overtime_records.sort((a, b) => parseStoreDate(a.start) - parseStoreDate(b.start));
    state.leave_records.sort((a, b) => parseStoreDate(a.start) - parseStoreDate(b.start));
}

function render() {
    sortRecordsInPlace();

    const t = totals();
    el.sOt.textContent = t.ot.toFixed(2);
    el.sLv.textContent = t.lv.toFixed(2);
    el.sRem.textContent = t.rem.toFixed(2);
    el.sDays.textContent = t.days.toFixed(2);

    el.otList.innerHTML = "";
    state.overtime_records.forEach((r, i) => el.otList.appendChild(rowElement(r, i, "ot")));
    if (!state.overtime_records.length) el.otList.innerHTML = "<p class='hint'>暂无加班记录</p>";

    el.lvList.innerHTML = "";
    state.leave_records.forEach((r, i) => el.lvList.appendChild(rowElement(r, i, "lv")));
    if (!state.leave_records.length) el.lvList.innerHTML = "<p class='hint'>暂无调休记录</p>";
}

function selectedIndexes(kind) {
    return [...document.querySelectorAll(`.pick[data-kind='${kind}']:checked`)]
        .map(x => Number(x.dataset.index))
        .sort((a, b) => b - a);
}

function exportJson() {
    const t = totals();
    const data = {
        version: 1,
        exported_at: toStoreDateTime(new Date()),
        summary: {
            current_overtime_hours: t.ot,
            used_leave_hours: t.lv,
            remaining_leave_hours: t.rem,
        },
        overtime_records: state.overtime_records,
        leave_records: state.leave_records,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `attendance_export_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
}

function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const data = JSON.parse(reader.result);
            if (!Array.isArray(data.overtime_records) || !Array.isArray(data.leave_records)) {
                throw new Error("文件格式不正确，缺少记录数组");
            }
            state.overtime_records = data.overtime_records;
            state.leave_records = data.leave_records;
            save();
            render();
            alert("导入成功");
        } catch (e) {
            alert(`导入失败: ${e.message}`);
        }
    };
    reader.readAsText(file, "utf-8");
}

function bindEvents() {
    el.addOtBtn.addEventListener("click", () => {
        try {
            const start = parseInput(el.otStart.value);
            const end = parseInput(el.otEnd.value);
            const [hours, rule] = calcOvertime(start, end);
            state.overtime_records.push({
                start: toStoreDateTime(start),
                end: toStoreDateTime(end),
                counted_hours: hours,
                rule,
            });
            save();
            render();
            if (hours === 0) alert("该记录计入加班时长为0小时。");
        } catch (e) {
            alert(e.message);
        }
    });

    el.addLvBtn.addEventListener("click", () => {
        try {
            const start = parseInput(el.lvStart.value);
            const end = parseInput(el.lvEnd.value);
            const [hours, rule] = calcLeave(start, end);
            state.leave_records.push({
                start: toStoreDateTime(start),
                end: toStoreDateTime(end),
                hours,
                rule,
            });
            save();
            render();
            if (rule.includes("无需调休")) alert("休息时间，无需调休。该记录已保存但不计入调休时长。");
        } catch (e) {
            alert(e.message);
        }
    });

    el.delOtBtn.addEventListener("click", () => {
        const indexes = selectedIndexes("ot");
        if (!indexes.length) return alert("请先选择要删除的加班记录");
        indexes.forEach(i => state.overtime_records.splice(i, 1));
        save();
        render();
    });

    el.delLvBtn.addEventListener("click", () => {
        const indexes = selectedIndexes("lv");
        if (!indexes.length) return alert("请先选择要删除的调休记录");
        indexes.forEach(i => state.leave_records.splice(i, 1));
        save();
        render();
    });

    el.resetBtn.addEventListener("click", () => {
        if (!confirm("确定重置全部数据吗？")) return;
        state.overtime_records = [];
        state.leave_records = [];
        save();
        render();
    });

    el.exportBtn.addEventListener("click", exportJson);
    el.importInput.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) importJson(file);
        e.target.value = "";
    });
}

function init() {
    const now = nowInputValue();
    el.otStart.value = now;
    el.otEnd.value = now;
    el.lvStart.value = now;
    el.lvEnd.value = now;
    el.todayText.textContent = new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });

    load();
    bindEvents();
    render();

    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("./sw.js").catch(() => { });
    }
}

init();
