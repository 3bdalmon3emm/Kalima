import i18n from "../i18n";

const isArabic = (lang) => (lang || i18n.language || "").startsWith("ar");

// A level (or stage) title in the current UI language. Levels saved before
// the Arabic title existed fall back to the English one.
export function levelTitle(level, lang) {
    if (!level) return "";
    return (isArabic(lang) && level.title_ar) || level.title || "";
}

// Levels arrive from the API already ordered (stage, then level). This keeps
// that order and groups them under their stage; unplaced levels go last.
export function groupLevelsByStage(levels = []) {
    const groups = [];
    const byKey = new Map();
    for (const level of levels) {
        const key = level.stages?.id ?? "none";
        if (!byKey.has(key)) {
            const group = { stage: level.stages || null, levels: [] };
            byKey.set(key, group);
            groups.push(group);
        }
        byKey.get(key).levels.push(level);
    }
    return groups.sort((a, b) => (a.stage ? 0 : 1) - (b.stage ? 0 : 1));
}
