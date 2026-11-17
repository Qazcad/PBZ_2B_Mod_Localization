"use strict";

// BuildYoRHaUniformWardrobe.py embeds the adapter and its data at the marker below.
// Install this generated entry through Mods Menu 0.5.1's owned loose-script path.
// Its bootstrap finishes the original MainStart before requiring this module.
exports.ready = false;
const runtime = globalThis.__PBZModsMenuRuntime;
if (!runtime || runtime.gameStarted !== true) throw new Error("YoRHa Uniform wardrobe requires Mods Menu 0.5.1 native loader after MainStart");

const AppearanceClass = require("UI/Widget/Appearance").AppearanceMixinInterface;
const methods = ["updateUnifiedText", "BP_InitWidget", "initSlotCallbacks", "FinishCurrentWidget", "Destruct", "BackInput"];
if (!AppearanceClass || !AppearanceClass.prototype || methods.some(name => typeof AppearanceClass.prototype[name] !== "function"))
    throw new Error("YoRHa Uniform wardrobe: current native Appearance interface is unavailable");

const adapter = (() => {
    const exports = {};
    "use strict";

// Inlined into the owned Mods Menu loader entry by BuildYoRHaUniformWardrobe.py.
// This module owns only widgets, navigation and the official Bridge request.
const UE = require("ue");
const P = require("puerts");
const cpp = require("cpp");
const { TRANSLATIONS } = require("./localization.js");
let DATA = TRANSLATIONS["en"];

function setLanguage() {
    let lang = "en";
    try {
        const currentLang = UE.KismetInternationalizationLibrary.GetCurrentLanguage();
        if (currentLang.startsWith("ru")) lang = "ru";
        else if (currentLang.startsWith("zh")) lang = "zh";
    } catch(e) { console.warn("Language detect error"); }
    if (TRANSLATIONS[lang]) DATA = TRANSLATIONS[lang];
    else DATA = TRANSLATIONS["en"];
}
const pages = new WeakMap();
const installed = new WeakSet();
const ROW = "/Game/PBZContent/UI/Settings/Editors/W_SettingsListEntry_Discrete.W_SettingsListEntry_Discrete_C";
const SCALAR = "/Game/PBZContent/UI/Settings/Editors/W_SettingsListEntry_Scalar.W_SettingsListEntry_Scalar_C";
const DENSITY = "StockingDenier";
const DENIER_MIN = 5, DENIER_MAX = 120, DENIER_SPAN = DENIER_MAX - DENIER_MIN;
const fromFraction = f => DENIER_MIN + f * DENIER_SPAN;
const denierText = value => `${value}D`;
const T = value => cpp.FText.FromString(String(value));
const tryRead = fn => { try { return fn(); } catch (_) { return undefined; } };
let lastId = 0;
let paths;
let saving;
let unconfirmed;

function files() {
    if (!paths) {
        const content = String(UE.KismetSystemLibrary.GetProjectContentDirectory()).replace(/[\\/]*$/, "/");
        const base = UE.KismetSystemLibrary.ConvertToAbsolutePath(content + "../../platform/steam/ue4ss/Mods/");
        const at = rel => UE.KismetSystemLibrary.ConvertToAbsolutePath(base + "/" + rel);
        const bridge = rel => at("PBZModsMenuBridge/" + rel);
        paths = { config: at("PBZYoRHaUniform/PBZYoRHaUniform.config.json"),
            pending: bridge("pending-PBZYoRHaUniform.json"), ack: bridge("saved-PBZYoRHaUniform.txt"),
            events: bridge("events-PBZYoRHaUniform.txt"), done: bridge("done-PBZYoRHaUniform.txt"),
            index: bridge("mods-index.txt"), status: bridge("status.txt"), script: bridge("Scripts/main.lua") };
    }
    return paths;
}

// undefined = absent, null = present but unreadable; never replace either config.
function load(path) {
    if (!UE.BlueprintPathsLibrary.FileExists(path)) return undefined;
    const out = P.$ref("");
    return UE.EasyCsv.LoadStringFromLocalFile(path, out) ? String(P.$unref(out)).replace(/^\uFEFF/, "") : null;
}
function field(text, key) {
    const match = new RegExp("^" + key + "=([^\\r\\n]*)\\r?$", "m").exec(String(text || ""));
    return match ? match[1] : "";
}
const complete = text => typeof text === "string" && /^End=1\r?$/m.test(text);
const nextId = floor => lastId = Math.max(Date.now(), lastId + 1, floor || 0);

function bridgeProblem() {
    const f = files(), bridge = load(f.status);
    if (bridge === undefined) return UE.BlueprintPathsLibrary.FileExists(f.script)
        ? "Bridge 未运行：尚无状态文件，请检查 UE4SS"
        : "未找到 Mods Menu Bridge，请安装 Bridge 0.2+ 并检查 UE4SS";
    if (bridge === null || !complete(bridge)) return "Bridge 状态不可读或未写完，请稍后重试并检查 UE4SS";
    const pollText = field(bridge, "Poll"), poll = Number(pollText);
    // Both clocks are Unix epoch seconds: JS Date.now()/1000 and Lua os.time().
    // No timezone offset. A malformed timestamp must also block a save.
    if (!/^\d+$/.test(pollText) || !Number.isSafeInteger(poll) || poll <= 0
        || Math.abs(Date.now() / 1000 - poll) >= 15) return "Bridge 未运行或状态已过期，请检查 UE4SS";
    if (!(parseFloat(field(bridge, "Version")) >= 0.2)) return "Bridge 版本不支持保存确认，请更新至 0.2+";
    const index = load(f.index);
    if (index === undefined) return "Bridge 配置索引尚未生成，请检查 UE4SS / Bridge";
    if (index === null) return "Bridge 配置索引不可读，请稍后重试";
    if (!/^; Acks=1\r?$/m.test(index)) return "Bridge 配置索引不支持保存确认，请检查 Bridge 版本";
    return "";
}

function snapshot(text) {
    if (typeof text !== "string") throw new Error("衣装差分配置未生成或不可读，请检查 PBZYoRHaUniform / UE4SS");
    const result = JSON.parse(text);
    if (!result || Array.isArray(result) || typeof result !== "object") throw new Error("配置格式无效");
    delete result.StockingDensityProbe;
    for (const [key, value] of Object.entries(DATA.defaults)) {
        if (!Object.prototype.hasOwnProperty.call(result, key)) result[key] = value;
    }
    for (const setting of DATA.settings) {
        if (!setting.options.some(option => option.value === result[setting.key])) throw new Error("配置选项无效");
    }
    // Preserve any unrelated flat config fields when committing a single option.
    if (Object.values(result).some(value => value === null || typeof value === "object")) throw new Error("配置必须为平坦 JSON");
    return result;
}
function same(a, b) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(key => a[key] === b[key]);
}
function status(s, text) {
    if (!s || !s.status) return;
    s.status.SetText(T(text));
    s.status.SetVisibility(text ? UE.ESlateVisibility.HitTestInvisible : UE.ESlateVisibility.Collapsed);
}
function alive(s) { return s.page && pages.get(s.page) === s && !s.page.inputBarSuspended; }
function busy(s, value) {
    s.busy = value;
    for (const row of s.rows) if (row.change) row.button.SetIsEnabled(!value);
}
function render(s) {
    for (const row of s.rows) {
        if (row.slider) {
            const value = s.values[DENSITY];
            row.entry.Slider_SettingValue.SetValue((value - DENIER_MIN) / DENIER_SPAN);
            for (const label of [row.entry.Text_SettingValue, row.entry.CurrentValue]) label.SetText(T(denierText(value)));
            continue;
        }
        const labels = UE.NewArray(UE.BuiltinText);
        for (const option of row.options) labels.Add(T(option.label));
        row.entry.Rotator_SettingValue.PopulateTextLabels(labels);
        row.entry.Rotator_SettingValue.SetSelectedItem(row.setting ? row.options.findIndex(o => o.value === s.values[row.setting.key]) : 0);
    }
}

// Preserve all pre-existing Action lines. Another writer's half-file is a retry,
// never permission to drop queued actions. Retain a full failed write for retry.
function notify(s) {
    const f = files();
    const old = load(f.events), done = load(f.done);
    // Official done files carry only Action=<n>; they have no End marker.
    const doneAction = done === undefined ? "0" : field(done, "Action");
    if (done === null || !/^\d+$/.test(doneAction) || !Number.isSafeInteger(Number(doneAction))) return false;
    if (!s.eventText && (old === null || old !== undefined && !complete(old))) return false;
    if (!s.eventText) {
        const ids = [...String(old || "").matchAll(/^(?:Changed|Action)=(\d+)/gm)].map(m => Number(m[1]));
        const id = nextId(Math.max(Number(doneAction), 0, ...ids) + 1);
        const actions = String(old || "").split(/\r?\n/).filter(line => /^Action=\d+ [A-Za-z0-9_]+$/.test(line));
        s.eventText = "; PBZUniform wardrobe: official Mods Menu event protocol\r\nChanged=" + id
            + actions.map(line => "\r\n" + line).join("") + "\r\nEnd=1\r\n";
    } else if (complete(old)) {
        // A later menu action must also survive a retry of our failed write.
        const actions = new Set([...s.eventText.matchAll(/^Action=\d+ [A-Za-z0-9_]+\r?$/gm)].map(m => m[0].trim()));
        for (const m of old.matchAll(/^Action=\d+ [A-Za-z0-9_]+\r?$/gm)) actions.add(m[0].trim());
        const floor = Math.max(0, Number(doneAction),
            ...[...old.matchAll(/^(?:Changed|Action)=(\d+)/gm)].map(m => Number(m[1])));
        s.eventText = "; PBZUniform wardrobe: official Mods Menu event protocol\r\nChanged=" + nextId(floor + 1)
            + [...actions].map(line => "\r\n" + line).join("") + "\r\nEnd=1\r\n";
    }
    if (!UE.EasyCsv.SaveStringToFileWithFullPath(s.eventText, f.events)) return false;
    return load(f.events) === s.eventText;
}

function finishSave(job, message, success) {
    if (saving === job) saving = undefined;
    // Keep only file-protocol values for an explicit next-entry/submit retry.
    if (!success) unconfirmed = { id: job.id, after: job.after, eventText: job.eventText };
    const s = job.view;
    job.view = undefined;
    if (!s || !alive(s)) return;
    s.job = undefined;
    busy(s, false);
    if (success) { s.values = job.after; render(s); }
    status(s, success ? "" : message);
}
function recoverSave() {
    if (!unconfirmed) return true;
    const job = unconfirmed, f = files(), ack = load(f.ack);
    if (!complete(ack)) return false;
    const ackId = Number(field(ack, "Save"));
    if (!Number.isSafeInteger(ackId)) return false;
    // A later official save supersedes this request; never replay its patch.
    if (ackId > job.id) { unconfirmed = undefined; return true; }
    if (ackId !== job.id) return false;
    if (!same(snapshot(load(f.config)), job.after)) { unconfirmed = undefined; return true; }
    if (!notify(job)) return false;
    unconfirmed = undefined;
    return true;
}
// A save may finish after the page closes. This bounded job keeps no widget
// reference after detach, but still delivers Changed for a landed Bridge save.
function checkSave(job) {
    try {
        const f = files(), ack = load(f.ack);
        if (!job.landed && complete(ack) && field(ack, "Save") === String(job.id)) {
            if (!same(snapshot(load(f.config)), job.after)) throw new Error("配置已被其他设置更改，请重新进入本页");
            job.landed = true;
        }
        if (job.landed && notify(job)) { finishSave(job, "已保存", true); return; }
        if (++job.tries < 12) { setTimeout(() => checkSave(job), 250); return; }
        finishSave(job, job.landed ? "配置已保存，刷新通知未完成；请重新进入本页" : "保存未确认，请重新进入本页核对", false);
    } catch (error) { finishSave(job, String(error.message || error), false); }
}
function commit(s, patch) {
    if (!alive(s) || s.busy) return;
    if (saving) { status(s, "另一项设置正在保存，请稍后重试"); return; }
    try {
        // Coalesce a pending slider edit with another setting/preset submission.
        if (s.densityDirty !== undefined) patch = Object.assign({ [DENSITY]: s.densityDirty }, patch);
        if (!recoverSave()) throw new Error("上次保存或刷新尚未确认，请稍后重试");
        const f = files();
        const problem = bridgeProblem();
        if (problem) throw new Error(problem);
        // Never overwrite a different writer's request that has not landed.
        const pending = load(f.pending);
        if (pending === null || pending !== undefined && Number(field(pending, "Save")) !== Number(field(load(f.ack), "Save"))) throw new Error("另一项设置正在保存，请稍后重试");
        const before = snapshot(load(f.config));
        const after = snapshot(JSON.stringify(Object.assign({}, before, patch)));
        if (same(before, after)) { clearDensity(s); s.values = before; render(s); status(s, ""); return; }
        const id = nextId(Math.max(Number(field(load(f.ack), "Save")) || 0, Number(field(pending, "Save")) || 0) + 1);
        const text = JSON.stringify(after, null, 2).replace(/[\u007f-\uFFFF]/g, c => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0")) + "\r\n";
        if (!UE.EasyCsv.SaveStringToFileWithFullPath("Save=" + id + "\n" + text, f.pending)) throw new Error("保存请求失败");
        clearDensity(s);
        busy(s, true);
        status(s, "");
        const job = { view: s, id, after, tries: 0, landed: false };
        saving = s.job = job;
        setTimeout(() => checkSave(job), 250);
    } catch (error) { status(s, String(error.message || error)); }
}

// Only an active mouse press samples geometry. Disk writes happen on release or
// after left/right has been idle for 350 ms, using the existing Bridge ACK job.
function clearDensity(s) {
    if (s.densityTimer !== undefined) clearTimeout(s.densityTimer);
    s.densityTimer = undefined;
    s.densityDirty = undefined;
}
function flushDensity(s) {
    if (s.densityTimer !== undefined) clearTimeout(s.densityTimer);
    s.densityTimer = undefined;
    if (s.densityDirty !== undefined && alive(s) && !s.busy) commit(s, { [DENSITY]: s.densityDirty });
}
function setDensity(s, value, dragging) {
    if (!alive(s) || s.busy) return;
    const next = Math.max(DENIER_MIN, Math.min(DENIER_MAX, Math.round(value)));
    if (!Number.isFinite(next) || next === s.values[DENSITY]) return;
    s.values[DENSITY] = s.densityDirty = next;
    render(s);
    status(s, "调整中…");
    if (s.densityTimer !== undefined) clearTimeout(s.densityTimer);
    s.densityTimer = dragging ? undefined : setTimeout(() => flushDensity(s), 350);
}
function pointerFraction(row) {
    const geo = row.entry.Slider_SettingValue.GetCachedGeometry();
    const left = UE.SlateBlueprintLibrary.LocalToAbsolute(geo, new UE.Vector2D(0, 0)).X;
    const width = UE.SlateBlueprintLibrary.GetAbsoluteSize(geo).X;
    return width > 0 ? (UE.WidgetLayoutLibrary.GetMousePositionOnPlatform().X - left) / width : undefined;
}
function pointerSide(s, row) {
    if (require("Library/UIHelper").default.IsGamepadInputType(s.page) || !row.button.IsHovered()) return undefined;
    const fraction = pointerFraction(row);
    return fraction === undefined ? undefined : fraction < 0 ? -1 : fraction > 1 ? 1 : 0;
}
function stopDrag(s, flush) {
    if (s.dragTimer !== undefined) clearTimeout(s.dragTimer);
    s.dragTimer = undefined;
    s.drag = undefined;
    if (flush) flushDensity(s);
}
function dragDensity(s, row) {
    if (!alive(s) || s.drag !== row) return stopDrag(s, false);
    if (!row.button.IsPressed()) return stopDrag(s, true);
    try {
        const fraction = pointerFraction(row);
        if (fraction !== undefined) setDensity(s, fromFraction(fraction), true);
        s.dragTimer = setTimeout(() => dragDensity(s, row), 16);
    } catch (error) { stopDrag(s, false); status(s, String(error.message || error)); }
}

function restoreSlot(s) {
    const saved = s.navigation;
    if (!saved) return;
    s.navigation = undefined;
    const button = saved.button, data = saved.copy.Right, dir = UE.EUINavigation.Right;
    // The snapshot lives in a separate native object: SetNavigationRule replaces
    // the original struct (including its delegate), so a JS alias is not a copy.
    const name = String(data.WidgetToFocus || "None");
    if (name && name !== "None") button.SetNavigationRule(dir, data.Rule, data.WidgetToFocus);
    else if (data.Rule === UE.EUINavigationRule.Custom) button.SetNavigationRuleCustom(dir, data.CustomDelegate);
    else if (data.Rule === UE.EUINavigationRule.CustomBoundary) button.SetNavigationRuleCustomBoundary(dir, data.CustomDelegate);
    else if (data.Rule === UE.EUINavigationRule.Explicit) button.SetNavigationRuleExplicit(dir, saved.target);
    else button.SetNavigationRuleBase(dir, data.Rule);
    if (!saved.hadNavigation) button.Navigation = null;
}
function returnToSlots(s) {
    if (!alive(s) || !s.source) return;
    s.inControls = false;
    focusRow(s);
    s.source.SetKeyboardFocus();
}
function bindSlot(s) {
    restoreSlot(s);
    const button = s.source;
    if (!button || s.page.W_SystemPanel && s.page.W_SystemPanel.disableSlotsNavigation) return false;
    if (!button.SetNavigationRuleCustom || !button.SetNavigationRuleBase || !button.SetKeyboardFocus) return false;
    const copy = UE.NewObject(UE.WidgetNavigation.StaticClass(), s.page);
    const hadNavigation = !!button.Navigation;
    if (hadNavigation) copy.Right = button.Navigation.Right;
    const data = copy.Right, rule = data.Rule;
    const name = String(data.WidgetToFocus || "None");
    let target;
    if (rule === UE.EUINavigationRule.Explicit && (!name || name === "None")) {
        target = data.Widget;
        if (!tryRead(() => UE.KismetSystemLibrary.IsValid(target))) return false;
    }
    if ((rule === UE.EUINavigationRule.Custom || rule === UE.EUINavigationRule.CustomBoundary)
        && (!name || name === "None") && !data.CustomDelegate) return false;
    s.navigation = { button, copy, hadNavigation, target };
    button.SetNavigationRuleCustom(UE.EUINavigation.Right, P.toDelegate(button, () => {
        if (!alive(s)) return button;
        // Native BP_InitWidget can set this flag after creating the slots.
        // Respect the live panel gate just like its own navigation lambdas.
        const panel = s.page.W_SystemPanel;
        if (panel && panel.disableSlotsNavigation) {
            if (panel.slotNavDisabledHandler) panel.slotNavDisabledHandler();
            return button;
        }
        s.inControls = true;
        focusRow(s, s.rows[0]);
        return s.rows[0].button;
    }));
    return true;
}

function transparent(button) {
    // Same wrapper style as Mods Menu 0.5.1: the native row owns its highlight.
    const style = button.WidgetStyle;
    for (const state of ["Normal", "Hovered", "Pressed", "Disabled"]) {
        const brush = style[state];
        brush.DrawAs = UE.ESlateBrushDrawType.NoDrawType;
        style[state] = brush;
    }
    style.NormalPadding = new UE.Margin(0, 0, 0, 0);
    style.PressedPadding = new UE.Margin(0, 0, 0, 0);
    button.SetStyle(style);
}
function selectRow(row, selected) {
    const entry = row.entry;
    entry.SetSelected(selected);
    const callback = selected ? "BP_OnSelected" : "BP_OnDeselected";
    // Follow Mods Menu's Scalar selection: BP handlers expect a native Setting.
    if (!row.slider && typeof entry[callback] === "function") entry[callback]();
    if (row.slider) {
        for (const [label, focused] of [[entry.Text_LeftValue, true], [entry.Text_RightValue, true],
            [entry.Text_SettingValue, true], [entry.CurrentValue, false]]) {
            if (label) label.SetVisibility(selected === focused ? UE.ESlateVisibility.SelfHitTestInvisible : UE.ESlateVisibility.Hidden);
        }
    }
    const colour = selected ? entry.SelectedColor : entry.DefaultColor;
    const label = entry.Text_SettingName;
    if (colour && typeof label.OverrideTextColor === "function") label.OverrideTextColor(colour);
    else if (colour && typeof label.SetColorAndOpacity === "function") label.SetColorAndOpacity(colour);
    if (row.slider && colour) for (const label of [entry.Text_LeftValue, entry.Text_RightValue]) {
        if (label && typeof label.OverrideTextColor === "function") label.OverrideTextColor(colour);
        else if (label && typeof label.SetColorAndOpacity === "function") label.SetColorAndOpacity(colour);
    }
    if (row.options.length === 1) {
        for (const name of ["Button_Increase", "Button_Decrease", "IncreaseOverlay", "DecreaseOverlay"])
            if (entry[name]) entry[name].SetVisibility(UE.ESlateVisibility.Hidden);
    }
}
function focusRow(s, row) {
    if (s.selected === row) return;
    if (s.selected) selectRow(s.selected, false);
    s.selected = row;
    if (row) selectRow(row, true);
}
function addRow(s, label, options, change, setting) {
    const slider = setting && setting.key === DENSITY;
    const entry = UE.WidgetBlueprintLibrary.Create(s.page, slider ? s.scalarClass : s.rowClass, s.pc);
    if (!entry || typeof entry.SetSelected !== "function" || !entry.Text_SettingName || !entry.Button_Increase || !entry.Button_Decrease
        || (slider ? !entry.Slider_SettingValue || !entry.Text_SettingValue || !entry.CurrentValue
            || typeof entry.Slider_SettingValue.SetValue !== "function" || typeof entry.Slider_SettingValue.GetCachedGeometry !== "function"
            : !entry.Rotator_SettingValue)) throw new Error("原生差分行不可用：" + (slider ? "Scalar" : "Discrete"));
    const button = UE.NewObject(UE.Button.StaticClass(), s.page);
    transparent(button);
    const slot = button.AddChild(entry);
    slot.SetPadding(new UE.Margin(0, 0, 0, 0));
    slot.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Fill);
    slot.SetVerticalAlignment(UE.EVerticalAlignment.VAlign_Fill);
    entry.SetVisibility(UE.ESlateVisibility.HitTestInvisible);
    entry.Text_SettingName.SetText(T(label));
    if (slider) {
        // PBZSettingSlider exposes IsFocusable, but not its setter in this build.
        const bar = entry.Slider_SettingValue;
        if (typeof bar.SetIsFocusable === "function") bar.SetIsFocusable(false);
        else bar.IsFocusable = false;
        if (entry.Text_LeftValue) entry.Text_LeftValue.SetText(T(denierText(DENIER_MIN)));
        if (entry.Text_RightValue) entry.Text_RightValue.SetText(T(denierText(DENIER_MAX)));
    } else entry.Rotator_SettingValue.SetIsFocusable(false);
    entry.Button_Increase.SetIsFocusable(false);
    entry.Button_Decrease.SetIsFocusable(false);
    s.scroll.AddChild(button);
    const row = { entry, button, options, change, setting, slider };
    s.rows.push(row);
    selectRow(row, false);
    const click = () => {
        if (!alive(s)) return;
        s.inControls = true;
        focusRow(s, row);
        try {
            if (slider) {
                if (row.dragClick) { row.dragClick = false; return; }
                const side = pointerSide(s, row);
                if (side === 0) {
                    setDensity(s, fromFraction(pointerFraction(row)), false);
                    flushDensity(s);
                    return;
                }
                change(side === -1 ? -1 : 1);
            } else if (change) change(1);
        } catch (error) { status(s, String(error.message || error)); }
    };
    const hover = () => { if (!s.drag && alive(s)) { s.inControls = true; focusRow(s, row); button.SetKeyboardFocus(); } };
    button.OnClicked.Add(click);
    button.OnHovered.Add(hover);
    s.callbacks.push([button.OnClicked, click], [button.OnHovered, hover]);
    if (slider) {
        if (!button.OnPressed || !button.OnReleased || typeof button.IsPressed !== "function") throw new Error("原生滑条鼠标拖动接口不可用");
        const press = () => {
            if (!alive(s) || s.busy) return;
            try {
                row.dragClick = pointerSide(s, row) === 0;
                if (!row.dragClick) return;
                s.inControls = true;
                focusRow(s, row);
                button.SetKeyboardFocus();
                if (s.densityTimer !== undefined) clearTimeout(s.densityTimer);
                s.densityTimer = undefined;
                s.drag = row;
                dragDensity(s, row);
            } catch (error) { stopDrag(s, false); status(s, String(error.message || error)); }
        };
        const release = () => {
            if (s.drag !== row) return;
            try {
                const fraction = pointerFraction(row);
                if (fraction !== undefined) setDensity(s, fromFraction(fraction), true);
            } catch (error) { status(s, String(error.message || error)); }
            stopDrag(s, true);
        };
        button.OnPressed.Add(press);
        button.OnReleased.Add(release);
        s.callbacks.push([button.OnPressed, press], [button.OnReleased, release]);
    }
}

function build(page, source) {
    const s = { page, source, rows: [], callbacks: [], values: snapshot(load(files().config)), inControls: false };
    pages.set(page, s);
    try {
        const description = page.W_UnifiedTextDescription;
        let anchor = description && description.DetailText, parent;
        // Only append inside the description's own multi-child VerticalBox.
        // Never AddChild into a SizeBox/Border/Button/Switcher or replace text.
        for (let depth = 0; anchor && depth < 8; depth++) {
            parent = anchor.GetParent();
            if (parent && parent.IsA(UE.VerticalBox.StaticClass())) break;
            if (!parent || parent === description) { parent = undefined; break; }
            anchor = parent;
            parent = undefined;
        }
        if (!parent) throw new Error("描述区没有可安全挂载的 VerticalBox");
        s.host = UE.NewObject(UE.VerticalBox.StaticClass(), page);
        s.status = UE.NewObject(UE.TextBlock.StaticClass(), page);
        s.status.SetVisibility(UE.ESlateVisibility.Collapsed);
        const size = UE.NewObject(UE.SizeBox.StaticClass(), page);
        size.SetHeightOverride(Math.min(360, DATA.settings.length * 64 + 16));
        s.host.AddChild(size);
        s.scroll = UE.NewObject(UE.ScrollBox.StaticClass(), page);
        s.scroll.SetScrollWhenFocusChanges(UE.EScrollWhenFocusChanges.AnimatedScroll);
        size.AddChild(s.scroll);
        s.pc = UE.GameplayStatics.GetPlayerController(page, 0);
        s.rowClass = UE.Class.Load(ROW);
        s.scalarClass = UE.Class.Load(SCALAR);
        if (!s.rowClass || !s.scalarClass || !UE.SlateBlueprintLibrary || !UE.WidgetLayoutLibrary) throw new Error("原生设置/滑条控件未加载");
        for (const setting of DATA.settings) addRow(s, setting.label, setting.options, delta => {
            if (!alive(s) || s.busy) return;
            if (setting.key === DENSITY) { setDensity(s, s.values[DENSITY] + delta, false); return; }
            const current = snapshot(load(files().config));
            const index = setting.options.findIndex(option => option.value === current[setting.key]);
            commit(s, { [setting.key]: setting.options[(index + delta + setting.options.length) % setting.options.length].value });
        }, setting);
        s.host.AddChild(s.status);
        parent.AddChild(s.host);
        if (typeof description.DelayRefreshBoxHeight === "function") description.DelayRefreshBoxHeight();
        render(s);
        // Native navigation must be set after attaching the widgets to Slate.
        s.rows.forEach((row, i) => {
            for (const [dir, delta] of [[UE.EUINavigation.Left, -1], [UE.EUINavigation.Right, 1]]) {
                row.button.SetNavigationRule(dir, UE.EUINavigationRule.Custom, "");
                row.button.SetNavigationRuleCustom(dir, P.toDelegate(row.button, () => {
                    if (alive(s)) {
                        s.inControls = true;
                        focusRow(s, row);
                        try { if (row.change) row.change(delta); } catch (error) { status(s, String(error.message || error)); }
                    }
                    return row.button;
                }));
            }
            row.button.SetNavigationRuleCustom(UE.EUINavigation.Up, P.toDelegate(row.button, () => {
                if (i === 0) { s.inControls = false; focusRow(s); return s.source || row.button; }
                focusRow(s, s.rows[i - 1]);
                return s.rows[i - 1].button;
            }));
            row.button.SetNavigationRuleCustom(UE.EUINavigation.Down, P.toDelegate(row.button, () => {
                if (i + 1 === s.rows.length) { s.inControls = false; focusRow(s); return s.source || row.button; }
                focusRow(s, s.rows[i + 1]);
                return s.rows[i + 1].button;
            }));
        });
        bindSlot(s);
        // The native item title and DetailText stay above these controls.
        // Show a short save result only after an explicit user action.
        status(s, "");
        return s;
    } catch (error) { detach(page); throw error; }
}

function detach(page) {
    const s = pages.get(page);
    if (!s) return;
    // Submit the final preview once before losing the view, then cancel all UI timers.
    stopDrag(s, false);
    flushDensity(s);
    clearDensity(s);
    pages.delete(page);
    if (s.job) { s.job.view = undefined; s.job = undefined; }
    try { restoreSlot(s); } catch (error) { console.warn("[YoRHaUniformWardrobe] navigation restore: " + String(error)); }
    for (const [delegate, callback] of s.callbacks) tryRead(() => delegate.Remove(callback));
    for (const row of s.rows) for (const direction of [UE.EUINavigation.Up, UE.EUINavigation.Down, UE.EUINavigation.Left, UE.EUINavigation.Right]) {
        tryRead(() => row.button.SetNavigationRuleBase(direction, UE.EUINavigationRule.Escape));
    }
    if (s.inControls && s.source) tryRead(() => s.source.SetKeyboardFocus());
    if (s.host) tryRead(() => s.host.RemoveFromParent());
    s.page = s.source = s.host = s.scroll = s.status = s.pc = s.rowClass = s.scalarClass = undefined;
    s.selected = undefined;
    s.rows.length = s.callbacks.length = 0;
}
function sync(page, id) {
    setLanguage();
    if (page.inputBarSuspended || String(id || "") !== DATA.outfitId) {
        detach(page);
        page.__yorhaUniformWardrobeSelectedButton = undefined;
        return;
    }
    // Custom localization keys are absent from the game's localization table.
    // Use the existing native title and paragraph widgets after native init.
    if (page.isOutfitLocked(DATA.outfitId)) { detach(page); return; }
    const description = page.W_UnifiedTextDescription;
    if (description && description.ItemNameText && description.DetailText) {
        // Используем SetText, чтобы обойти систему локализации
        if (typeof description.ItemNameText.SetText === "function") {
            description.ItemNameText.SetText(T(DATA.title));
        } else {
            description.ItemNameText.SetPBZFormatText(T(DATA.title));
        }
        
        if (typeof description.DetailText.SetText === "function") {
            description.DetailText.SetText(T(DATA.description));
        } else {
            description.DetailText.SetDisplayText(T(DATA.description));
        }
        description.DelayRefreshBoxHeight();
    }
    try {
        const recovered = recoverSave();
        const source = page.__yorhaUniformWardrobeSelectedButton;
        const s = pages.get(page);
        if (s) {
            if (s.source !== source) { restoreSlot(s); s.source = source; bindSlot(s); }
            if (!s.busy && s.densityDirty === undefined && !s.drag) { s.values = snapshot(load(files().config)); render(s); }
        } else build(page, source);
        if (!recovered) status(pages.get(page), "上次保存或刷新尚未确认，请稍后重试");
    } catch (error) { console.warn("[YoRHaUniformWardrobe] " + String(error.message || error)); }
}

function install(AppearanceClass) {
    if (!AppearanceClass || !AppearanceClass.prototype || installed.has(AppearanceClass)) return;
    installed.add(AppearanceClass);
    const prototype = AppearanceClass.prototype;
    for (const method of ["updateUnifiedText", "BP_InitWidget"]) {
        const original = prototype[method];
        prototype[method] = function (...args) {
            const result = original.apply(this, args);
            sync(this, method === "updateUnifiedText" ? args[0] : this.selectedOutfitID);
            return result;
        };
    }
    const initSlots = prototype.initSlotCallbacks;
    prototype.initSlotCallbacks = function (...args) {
        const result = initSlots.apply(this, args), selected = this.slotSelectedLambda;
        this.slotSelectedLambda = (button, index) => {
            const s = pages.get(this);
            if (s) { s.inControls = false; focusRow(s); }
            this.__yorhaUniformWardrobeSelectedButton = button;
            return selected(button, index);
        };
        return result;
    };
    for (const method of ["FinishCurrentWidget", "Destruct"]) {
        const original = prototype[method];
        prototype[method] = function (...args) {
            detach(this);
            this.__yorhaUniformWardrobeSelectedButton = undefined;
            return original.apply(this, args);
        };
    }
    const back = prototype.BackInput;
    prototype.BackInput = function (...args) {
        const s = pages.get(this);
        const focused = s && s.rows.some(row => tryRead(() => row.button.HasKeyboardFocus())
            || tryRead(() => row.button.HasUserFocus(s.pc)));
        if (s && s.inControls && focused && alive(s)) { returnToSlots(s); return; }
        return back.apply(this, args);
    };
}
exports.install = install;

    return exports;
})();

// MainStart stores this very class in MixinHelpObject.Method. Its later
// OnStartMixinDelegate passes that class to blueprint.mixin for W_Appearance_V2.
// Patch before the first Appearance widget; let the game's own lifecycle mix it.
adapter.install(AppearanceClass);
exports.ready = true;
