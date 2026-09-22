import { useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Maximize2, Move, SlidersHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const PRINT_CARD_WIDTH_PX = 827;
export const PRINT_CARD_HEIGHT_PX = 438;
export const PRINT_CARD_PPI = 300;
export const PRINT_TEXT_FONT_OPTIONS = [
  { value: "Noto Sans Arabic", fallbackLabel: "Noto Sans Arabic" },
  { value: "Noto Kufi Arabic", fallbackLabel: "Noto Kufi Arabic" },
  { value: "Noto Naskh Arabic", fallbackLabel: "Noto Naskh Arabic" },
  { value: "Alexandria", fallbackLabel: "Alexandria" },
  { value: "Aref Ruqaa", fallbackLabel: "Aref Ruqaa" },
  { value: "Tajawal", fallbackLabel: "Tajawal" },
  { value: "IBM Plex Sans Arabic", fallbackLabel: "IBM Plex Sans Arabic" },
  { value: "Reem Kufi", fallbackLabel: "Reem Kufi" },
];
export const DEFAULT_PRINT_TEXT_FONT_FAMILY = PRINT_TEXT_FONT_OPTIONS[0].value;

export const DEFAULT_PRINT_TEMPLATE_LAYOUT = {
  fields: {
    qr: { x: 604, y: 88, width: 96, height: 96 },
    codeNumber: { x: 601, y: 309, width: 125, height: 34, direction: "ltr", align: "center", fontSize: 18, color: "#111827", fontFamily: DEFAULT_PRINT_TEXT_FONT_FAMILY },
    teacherImage: { x: 345, y: 70, width: 118, height: 178 },
    registrationMethod: { x: 590, y: 74, width: 120, height: 28, direction: "rtl", align: "center", fontSize: 15, color: "#111827", fontFamily: DEFAULT_PRINT_TEXT_FONT_FAMILY },
    gradeClass: { x: 43, y: 296, width: 124, height: 48, direction: "rtl", align: "center", fontSize: 17, color: "#111827", fontFamily: DEFAULT_PRINT_TEXT_FONT_FAMILY },
    price: { x: 0, y: 36, width: 205, height: 48, direction: "rtl", align: "center", fontSize: 16, color: "#111827", fontFamily: DEFAULT_PRINT_TEXT_FONT_FAMILY },
    redCustomText: { x: 57, y: 95, width: 102, height: 75, direction: "rtl", align: "center", fontSize: 16, color: "#dc2626", fontFamily: DEFAULT_PRINT_TEXT_FONT_FAMILY },
  },
};

const FIELD_LABEL_DEFAULTS = {
  qr: "QR code",
  codeNumber: "Code number",
  teacherImage: "Teacher image",
  registrationMethod: "Registration method",
  gradeClass: "Grade/class",
  price: "Price",
  redCustomText: "Red custom text",
};

const FIELD_SETTING_LABEL_DEFAULTS = {
  x: "X",
  y: "Y",
  width: "Width",
  height: "Height",
  fontSize: "Font size",
  fontFamily: "Arabic font",
};

const FIELD_ORDER = ["qr", "codeNumber", "teacherImage", "registrationMethod", "gradeClass", "price", "redCustomText"];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const numberValue = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export default function PrintTemplateLayoutEditor({ value, onChange, backgroundImageUrl = "" }) {
  const { t, i18n } = useTranslation("eBooklets");
  const layout = value || DEFAULT_PRINT_TEMPLATE_LAYOUT;
  const fields = layout.fields || {};
  const fieldKeys = useMemo(() => {
    const keys = Object.keys(fields);
    return [...FIELD_ORDER.filter((key) => keys.includes(key)), ...keys.filter((key) => !FIELD_ORDER.includes(key))];
  }, [fields]);
  const [selectedKey, setSelectedKey] = useState(fieldKeys[0] || "qr");
  const [dragState, setDragState] = useState(null);
  const previewRef = useRef(null);
  const selected = fields[selectedKey] || {};
  const getFieldLabel = (fieldKey) => t(`admin.instances.printEditor.fields.${fieldKey}`, { defaultValue: FIELD_LABEL_DEFAULTS[fieldKey] || fieldKey });
  const getSettingLabel = (settingKey) => t(`admin.instances.printEditor.settings.${settingKey}`, { defaultValue: FIELD_SETTING_LABEL_DEFAULTS[settingKey] || settingKey });
  const selectedLabel = getFieldLabel(selectedKey);
  const selectedHasTextControls = selected.fontSize !== undefined || selected.color !== undefined || selected.direction || selected.align || selected.fontFamily;
  const selectedFontFamily = selected.fontFamily || DEFAULT_PRINT_TEXT_FONT_FAMILY;
  const numberFields = selectedHasTextControls ? ["x", "y", "width", "height", "fontSize"] : ["x", "y", "width", "height"];

  const updateField = (fieldKey, patch) => {
    const current = fields[fieldKey] || {};
    onChange({
      ...layout,
      fields: {
        ...fields,
        [fieldKey]: {
          ...current,
          ...patch,
        },
      },
    });
  };

  useEffect(() => {
    if (!dragState) return undefined;
    const handleMove = (event) => {
      const box = previewRef.current?.getBoundingClientRect();
      if (!box) return;
      const dx = ((event.clientX - dragState.startX) / box.width) * PRINT_CARD_WIDTH_PX;
      const dy = ((event.clientY - dragState.startY) / box.height) * PRINT_CARD_HEIGHT_PX;
      const next = dragState.mode === "resize"
        ? {
          width: Math.round(clamp(dragState.field.width + dx, 12, PRINT_CARD_WIDTH_PX - dragState.field.x)),
          height: Math.round(clamp(dragState.field.height + dy, 12, PRINT_CARD_HEIGHT_PX - dragState.field.y)),
        }
        : {
          x: Math.round(clamp(dragState.field.x + dx, 0, PRINT_CARD_WIDTH_PX - dragState.field.width)),
          y: Math.round(clamp(dragState.field.y + dy, 0, PRINT_CARD_HEIGHT_PX - dragState.field.height)),
        };
      updateField(dragState.fieldKey, next);
    };
    const handleUp = () => setDragState(null);
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [dragState]);

  const beginDrag = (event, fieldKey, mode) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedKey(fieldKey);
    setDragState({
      fieldKey,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      field: { ...fields[fieldKey] },
    });
  };

  const setNumber = (key, rawValue) => {
    const fallback = key === "width" || key === "height" ? 12 : 0;
    updateField(selectedKey, { [key]: Math.round(numberValue(rawValue, fallback)) });
  };

  return (
    <div className="@container grid gap-4 @3xl:grid-cols-[minmax(0,1fr)_320px]" data-testid="print-template-layout-editor">
      <div className="min-w-0 rounded-2xl border bg-background p-3 shadow-sm">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Crosshair className="h-4 w-4 text-primary" />
              {t("admin.instances.printEditor.canvasTitle", { defaultValue: "Layout canvas" })}
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {t("admin.instances.printEditor.canvasDescription", { defaultValue: "Drag each variable layer on the exact print card size." })}
            </p>
          </div>
          <div className="shrink-0 rounded-full border bg-muted/50 px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {PRINT_CARD_WIDTH_PX} x {PRINT_CARD_HEIGHT_PX} px
          </div>
        </div>
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {fieldKeys.map((fieldKey) => (
            <Button
              key={fieldKey}
              type="button"
              size="sm"
              variant={selectedKey === fieldKey ? "default" : "outline"}
              className="h-8 shrink-0 rounded-full px-3 text-xs"
              onClick={() => setSelectedKey(fieldKey)}
            >
              {getFieldLabel(fieldKey)}
            </Button>
          ))}
        </div>
        <div
          ref={previewRef}
          className="relative w-full overflow-hidden rounded-xl border bg-white shadow-inner"
          style={{ aspectRatio: `${PRINT_CARD_WIDTH_PX} / ${PRINT_CARD_HEIGHT_PX}` }}
        >
          {backgroundImageUrl ? (
            <img
              src={backgroundImageUrl}
              alt=""
              className="pointer-events-none absolute inset-0 h-full w-full select-none object-fill"
              draggable={false}
            />
          ) : (
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(15,23,42,0.14)_1px,transparent_0)] [background-size:16px_16px]" />
          )}
          {fieldKeys.map((fieldKey) => {
            const field = fields[fieldKey];
            const active = selectedKey === fieldKey;
            return (
              <button
                key={fieldKey}
                type="button"
                className={`absolute flex items-center justify-center border text-[11px] font-semibold transition ${active ? "border-primary bg-primary/15 text-primary" : "border-slate-400 bg-white/75 text-slate-700"}`}
                style={{
                  left: `${(field.x / PRINT_CARD_WIDTH_PX) * 100}%`,
                  top: `${(field.y / PRINT_CARD_HEIGHT_PX) * 100}%`,
                  width: `${(field.width / PRINT_CARD_WIDTH_PX) * 100}%`,
                  height: `${(field.height / PRINT_CARD_HEIGHT_PX) * 100}%`,
                  ...(field.fontSize !== undefined || field.fontFamily ? { fontFamily: field.fontFamily || DEFAULT_PRINT_TEXT_FONT_FAMILY } : {}),
                }}
                onPointerDown={(event) => beginDrag(event, fieldKey, "move")}
                onClick={() => setSelectedKey(fieldKey)}
              >
                <span className="truncate px-1">{getFieldLabel(fieldKey)}</span>
                <span
                  className="absolute bottom-0 right-0 flex h-5 w-5 translate-x-1/2 translate-y-1/2 items-center justify-center rounded-full border bg-background shadow-sm"
                  onPointerDown={(event) => beginDrag(event, fieldKey, "resize")}
                  aria-hidden="true"
                >
                  <Maximize2 className="h-2.5 w-2.5" />
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Move className="h-3.5 w-3.5" />
          {t("admin.instances.printEditor.dragHint", { defaultValue: "Drag a layer to move it. Drag the lower corner to resize." })}
        </div>
      </div>
      <div className="min-w-0 rounded-2xl border bg-muted/20 p-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <SlidersHorizontal className="h-4 w-4 text-primary" />
            {t("admin.instances.printEditor.selectedField", { defaultValue: "Selected field" })}
          </div>
          <p className="text-xs leading-5 text-muted-foreground">{selectedLabel}</p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {numberFields.map((key) => (
            <label key={key} className="grid gap-1 text-xs font-medium text-muted-foreground">
              <span>{getSettingLabel(key)}</span>
              <Input className="h-9 rounded-xl text-foreground" type="number" value={selected[key] ?? ""} onChange={(event) => setNumber(key, event.target.value)} />
            </label>
          ))}
        </div>
        {selectedHasTextControls && (
          <div className="mt-3 grid gap-2">
            {selected.color !== undefined && (
              <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                <span>{t("admin.instances.printEditor.textColor", { defaultValue: "Text color" })}</span>
                <Input className="h-9 rounded-xl text-foreground" type="text" value={selected.color || ""} onChange={(event) => updateField(selectedKey, { color: event.target.value })} />
              </label>
            )}
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              <span>{t("admin.instances.printEditor.fontFamily", { defaultValue: "Arabic font" })}</span>
              <select
                className="h-9 rounded-xl border bg-background px-3 text-sm text-foreground"
                value={selectedFontFamily}
                onChange={(event) => updateField(selectedKey, { fontFamily: event.target.value })}
                data-testid={`print-template-font-family-${selectedKey}`}
                aria-label={t("admin.instances.printEditor.fontFamily", { defaultValue: "Arabic font" })}
                style={{ fontFamily: selectedFontFamily }}
              >
                {PRINT_TEXT_FONT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value} style={{ fontFamily: option.value }}>
                    {t(`admin.instances.printEditor.fonts.${option.value}`, { defaultValue: option.fallbackLabel })}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {selected.direction && (
                <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                  <span>{t("admin.instances.printEditor.direction", { defaultValue: "Direction" })}</span>
                  <select dir={i18n.dir()} className="h-9 rounded-xl border bg-background px-3 text-sm text-foreground" value={selected.direction || "rtl"} onChange={(event) => updateField(selectedKey, { direction: event.target.value })}>
                    <option value="rtl">{t("admin.instances.printEditor.rtl", { defaultValue: "RTL (Right to Left)" })}</option>
                    <option value="ltr">{t("admin.instances.printEditor.ltr", { defaultValue: "LTR (Left to Right)" })}</option>
                  </select>
                </label>
              )}
              {selected.align && (
                <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                  <span>{t("admin.instances.printEditor.align", { defaultValue: "Align" })}</span>
                  <select dir={i18n.dir()} className="h-9 rounded-xl border bg-background px-3 text-sm text-foreground" value={selected.align || "center"} onChange={(event) => updateField(selectedKey, { align: event.target.value })}>
                    <option value="start">{t("admin.instances.printEditor.alignStart", { defaultValue: "Start" })}</option>
                    <option value="center">{t("admin.instances.printEditor.alignCenter", { defaultValue: "Center" })}</option>
                    <option value="end">{t("admin.instances.printEditor.alignEnd", { defaultValue: "End" })}</option>
                  </select>
                </label>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
