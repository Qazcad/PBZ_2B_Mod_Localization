"use strict";

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

const runtime = globalThis.__PBZModsMenuRuntime;
if (!runtime || runtime.gameStarted !== true) throw new Error("DLC attire description requires Mods Menu after MainStart");

const {AppearanceMixinInterface} = require("UI/Widget/Appearance");
const {FText} = require("cpp");
const prototype = AppearanceMixinInterface.prototype;
const methods = ["updateUnifiedText", "BP_InitWidget"];
if (methods.some(method => typeof prototype[method] !== "function")) {
    throw new Error("DLC attire description: native Appearance interface is unavailable");
}

function sync(page, id) {
    setLanguage(); // <--- Вызов смены языка

    if (page.inputBarSuspended || String(id || "") !== DATA.id || page.isOutfitLocked(DATA.id)) return;
    const view = page.W_UnifiedTextDescription;
    if (!view || !view.ItemNameText || !view.DetailText) return;
    
    if (typeof view.ItemNameText.SetText === "function") {
        view.ItemNameText.SetText(FText.FromString(DATA.title));
    } else {
        view.ItemNameText.SetPBZFormatText(FText.FromString(DATA.title));
    }
    
    if (typeof view.DetailText.SetText === "function") {
        view.DetailText.SetText(FText.FromString(DATA.description));
    } else {
        view.DetailText.SetDisplayText(FText.FromString(DATA.description));
    }
    
    view.DelayRefreshBoxHeight();
}

for (const method of methods) {
    const original = prototype[method];
    prototype[method] = function (...args) {
        const result = original.apply(this, args);
        sync(this, method === "updateUnifiedText" ? args[0] : this.selectedOutfitID);
        return result;
    };
}
exports.ready = true;