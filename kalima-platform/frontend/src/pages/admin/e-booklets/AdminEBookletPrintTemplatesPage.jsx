import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  FileText,
  HelpCircle,
  Loader2,
  Plus,
  Printer,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAdminEBookletInstances } from "@/hooks/admin/useAdminEBooklets";
import { useTranslation } from "react-i18next";
import PrintTemplateLayoutEditor, { DEFAULT_PRINT_TEMPLATE_LAYOUT } from "./PrintTemplateLayoutEditor";

const pageMotion = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.2, 0, 0, 1] } },
};

function AccessCodeFieldLabel({ children, tooltip }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span>{children}</span>
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              role="button"
              tabIndex={0}
              aria-label={tooltip}
            >
              <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={6} className="max-w-[240px] text-center leading-5">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </span>
  );
}

function PrintFormField({ label, tooltip, children, className = "" }) {
  return (
    <label className={`grid min-w-0 content-start gap-1 text-xs font-medium text-muted-foreground ${className}`}>
      {tooltip ? <AccessCodeFieldLabel tooltip={tooltip}>{label}</AccessCodeFieldLabel> : <span>{label}</span>}
      {children}
    </label>
  );
}

export default function AdminEBookletPrintTemplatesPage() {
  const { t } = useTranslation("eBooklets");
  const {
    listAccessCodePrintTemplates,
    createAccessCodePrintTemplate,
    updateAccessCodePrintTemplate,
    archiveAccessCodePrintTemplate,
    activateAccessCodePrintTemplate,
    deleteAccessCodePrintTemplate,
    listAccessCodePrintPresets,
    createAccessCodePrintPreset,
    uploadAccessCodePrintImage,
    fetchAccessCodePrintImageBlobUrl,
  } = useAdminEBookletInstances();

  const [printTemplates, setPrintTemplates] = useState([]);
  const [printPresets, setPrintPresets] = useState([]);
  const [presetDraft, setPresetDraft] = useState({ presetType: "registration_method", label: "", displayText: "" });
  const [templateDraft, setTemplateDraft] = useState({ name: "", backgroundFileAssetId: "", layout: DEFAULT_PRINT_TEMPLATE_LAYOUT });
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [printUploadState, setPrintUploadState] = useState({});
  const [templateBackgroundPreviewUrl, setTemplateBackgroundPreviewUrl] = useState("");
  const [loading, setLoading] = useState(true);

  const normalizeList = (res) => (Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []));

  useEffect(() => {
    let mounted = true;
    const loadData = async () => {
      setLoading(true);
      try {
        const [templatesRes, presetsRes] = await Promise.all([
          listAccessCodePrintTemplates(),
          listAccessCodePrintPresets(),
        ]);
        if (mounted) {
          setPrintTemplates(normalizeList(templatesRes));
          setPrintPresets(normalizeList(presetsRes));
        }
      } catch (err) {
        console.error("Failed to load print templates/presets", err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    loadData();
    return () => { mounted = false; };
  }, [listAccessCodePrintTemplates, listAccessCodePrintPresets]);

  useEffect(() => {
    let active = true;
    const backgroundAssetId = templateDraft.backgroundFileAssetId;
    if (!backgroundAssetId) {
      setTemplateBackgroundPreviewUrl("");
      return undefined;
    }
    fetchAccessCodePrintImageBlobUrl(backgroundAssetId)
      .then((url) => {
        if (active) setTemplateBackgroundPreviewUrl(url || "");
      })
      .catch(() => {
        if (active) setTemplateBackgroundPreviewUrl("");
      });
    return () => {
      active = false;
    };
  }, [templateDraft.backgroundFileAssetId, fetchAccessCodePrintImageBlobUrl]);

  const handleBackgroundUpload = async (event) => {
    const file = event.target?.files?.[0];
    if (!file) return;
    setPrintUploadState((curr) => ({ ...curr, background: "uploading" }));
    try {
      const response = await uploadAccessCodePrintImage(file);
      const asset = response?.data || response;
      if (asset?.id) {
        setTemplateDraft((curr) => ({
          ...curr,
          backgroundFileAssetId: String(asset.id),
          name: curr.name || file.name.replace(/\.[^/.]+$/, ""),
        }));
        setPrintUploadState((curr) => ({ ...curr, background: "done" }));
      }
    } catch {
      setPrintUploadState((curr) => ({ ...curr, background: "error" }));
    }
  };

  const handleSavePrintTemplate = async () => {
    if (!templateDraft.backgroundFileAssetId) return;
    try {
      if (editingTemplateId) {
        await updateAccessCodePrintTemplate(editingTemplateId, {
          name: templateDraft.name || t("admin.instances.defaultPrintTemplateName", { defaultValue: "E-booklet access-code card" }),
          backgroundFileAssetId: Number(templateDraft.backgroundFileAssetId),
          // Fixed print-card dimensions the backend requires (827x438 @ 300 PPI).
          widthPx: 827,
          heightPx: 438,
          ppi: 300,
          layout: templateDraft.layout,
        });
      } else {
        await createAccessCodePrintTemplate({
          name: templateDraft.name || t("admin.instances.defaultPrintTemplateName", { defaultValue: "E-booklet access-code card" }),
          backgroundFileAssetId: Number(templateDraft.backgroundFileAssetId),
          // Fixed print-card dimensions the backend requires (827x438 @ 300 PPI).
          widthPx: 827,
          heightPx: 438,
          ppi: 300,
          layout: templateDraft.layout,
        });
      }
      const refreshed = await listAccessCodePrintTemplates();
      setPrintTemplates(normalizeList(refreshed));
      setEditingTemplateId(null);
      setTemplateDraft({ name: "", backgroundFileAssetId: "", layout: DEFAULT_PRINT_TEMPLATE_LAYOUT });
    } catch (err) {
      console.error("Failed to save print template", err);
    }
  };

  const handleEditPrintTemplate = (template) => {
    setEditingTemplateId(template.id);
    setTemplateDraft({
      name: template.name || "",
      backgroundFileAssetId: String(template.background_file_asset_id || template.backgroundFileAssetId || ""),
      layout: template.layout_json || template.layout || DEFAULT_PRINT_TEMPLATE_LAYOUT,
    });
  };

  const handleArchivePrintTemplate = async (template) => {
    try {
      if (template.status === "archived") {
        await activateAccessCodePrintTemplate(template.id);
      } else {
        await archiveAccessCodePrintTemplate(template.id);
      }
      const refreshed = await listAccessCodePrintTemplates();
      setPrintTemplates(normalizeList(refreshed));
    } catch (err) {
      console.error("Failed to toggle archive on print template", err);
    }
  };

  const handleDeletePrintTemplate = async (templateId) => {
    if (!window.confirm(t("admin.instances.deletePrintTemplateConfirm", { defaultValue: "Are you sure you want to delete this print template?" }))) return;
    try {
      await deleteAccessCodePrintTemplate(templateId);
      const refreshed = await listAccessCodePrintTemplates();
      setPrintTemplates(normalizeList(refreshed));
      if (editingTemplateId === templateId) {
        setEditingTemplateId(null);
        setTemplateDraft({ name: "", backgroundFileAssetId: "", layout: DEFAULT_PRINT_TEMPLATE_LAYOUT });
      }
    } catch (err) {
      console.error("Failed to delete print template", err);
    }
  };

  const handleCreatePrintPreset = async () => {
    if (!presetDraft.displayText.trim()) return;
    try {
      await createAccessCodePrintPreset({
        presetType: presetDraft.presetType,
        label: presetDraft.label.trim() || presetDraft.displayText.trim(),
        displayText: presetDraft.displayText.trim(),
      });
      const refreshed = await listAccessCodePrintPresets();
      setPrintPresets(normalizeList(refreshed));
      setPresetDraft((curr) => ({ ...curr, label: "", displayText: "" }));
    } catch (err) {
      console.error("Failed to create print preset", err);
    }
  };

  return (
    <TooltipProvider delayDuration={150}>
      <motion.div className="space-y-6" data-testid="admin-e-booklet-print-templates-page" variants={pageMotion} initial="hidden" animate="show">
        {/* Header & Overview Card */}
        <div className="@container rounded-3xl border bg-background p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-3 @xl:flex-row @xl:items-center @xl:justify-between">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                <Printer className="h-6 w-6 text-primary" />
                {t("admin.workspace.tabs.printTemplates", { defaultValue: "Print Templates" })}
              </h1>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                {t("admin.instances.printTemplatesDescription", { defaultValue: "Create and configure reusable 827 x 438 px printed card templates with variable QR codes, student IDs, teacher images, and text labels." })}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-xl px-3 py-1.5 font-medium">
                <Printer className="h-4 w-4 me-1.5 text-primary inline" />
                {printTemplates.length} {t("admin.instances.savedPrintTemplates", { defaultValue: "saved templates" })}
              </Badge>
              <Badge variant="outline" className="rounded-xl px-3 py-1.5 font-medium">
                <FileText className="h-4 w-4 me-1.5 text-primary inline" />
                {printPresets.length} {t("admin.instances.printPresets", { defaultValue: "text presets" })}
              </Badge>
            </div>
          </div>
        </div>

        {/* Template Creation & Layout Editor */}
        <div className="@container rounded-3xl border bg-background p-5 shadow-sm sm:p-6 space-y-6">
          <div className="grid gap-6 @3xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 space-y-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-primary">{t("admin.instances.printTemplateSetupStep", { defaultValue: "Step 1" })}</div>
                <div className="text-base font-semibold text-foreground">{t("admin.instances.printTemplateSetupTitle", { defaultValue: "Create the card base" })}</div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("admin.instances.printTemplateSetupDescription", { defaultValue: "Name the template, attach the finished background artwork, then save the reusable card base." })}</p>
              </div>
              <div className="grid w-full min-w-0 gap-3 grid-cols-1 @sm:grid-cols-2 @md:grid-cols-3 items-end">
                <PrintFormField label={t("admin.instances.printTemplateName", { defaultValue: "Template name" })}>
                  <Input className="h-10 w-full rounded-xl text-foreground" value={templateDraft.name} placeholder={t("admin.instances.defaultPrintTemplateName", { defaultValue: "E-booklet access-code card" })} onChange={(event) => setTemplateDraft((current) => ({ ...current, name: event.target.value }))} />
                </PrintFormField>
                <PrintFormField label={t("admin.instances.backgroundImage", { defaultValue: "Background image" })} tooltip={t("admin.instances.backgroundImageTooltip", { defaultValue: "Upload the final 827 x 438 px card artwork before positioning QR, code, and text fields." })}>
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={handleBackgroundUpload}
                    uploading={printUploadState.background === "uploading"}
                    fileName={templateDraft.backgroundFileAssetId ? `#${templateDraft.backgroundFileAssetId}` : ""}
                    buttonText={t("common.upload", { defaultValue: "Upload" })}
                    placeholder={t("admin.instances.noFileChosen", { defaultValue: "No image selected" })}
                    className="rounded-xl"
                  />
                </PrintFormField>
                <PrintFormField label={t("admin.instances.backgroundAssetId", { defaultValue: "Background asset ID" })}>
                  <Input className="h-10 w-full rounded-xl text-foreground" type="number" min="1" value={templateDraft.backgroundFileAssetId} onChange={(event) => setTemplateDraft((current) => ({ ...current, backgroundFileAssetId: event.target.value }))} />
                </PrintFormField>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button type="button" className="h-10 rounded-xl px-5" onClick={handleSavePrintTemplate} disabled={!templateDraft.backgroundFileAssetId}>
                  <Plus className="h-4 w-4 me-1.5" />
                  {editingTemplateId ? t("common.save", { defaultValue: "Save" }) : t("common.create", { defaultValue: "Create" })}
                </Button>
                {editingTemplateId && (
                  <Button type="button" size="sm" variant="ghost" className="h-10 rounded-xl" onClick={() => { setEditingTemplateId(null); setTemplateDraft({ name: "", backgroundFileAssetId: "", layout: DEFAULT_PRINT_TEMPLATE_LAYOUT }); }}>
                    {t("common.cancel", { defaultValue: "Cancel" })}
                  </Button>
                )}
              </div>
            </div>
            <div className="rounded-2xl border bg-muted/30 p-4 text-xs leading-5 text-muted-foreground self-start">
              <div className="mb-2 font-semibold text-foreground">{t("admin.instances.printTemplateChecklist", { defaultValue: "Production checklist" })}</div>
              <ul className="space-y-2">
                <li>{t("admin.instances.printTemplateTipSize", { defaultValue: "Tip: start from a 827 x 438 px image so the PDF output matches the card exactly." })}</li>
                <li>{t("admin.instances.printTemplateTipLayers", { defaultValue: "Tip: keep variable content out of the background. QR, code number, teacher image, grade, price, and red text are positioned below." })}</li>
                <li>{t("admin.instances.printTemplateTipSave", { defaultValue: "Tip: save the template, then use Preview card inside a batch to verify the backend-rendered result." })}</li>
              </ul>
            </div>
          </div>

          <div className="border-t pt-5">
            <div className="mb-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-primary">{t("admin.instances.printTemplateLayoutStep", { defaultValue: "Step 2" })}</div>
              <div className="text-base font-semibold text-foreground">{t("admin.instances.printTemplateLayoutTitle", { defaultValue: "Position the variable layers" })}</div>
            </div>
            <PrintTemplateLayoutEditor
              value={templateDraft.layout}
              backgroundImageUrl={templateBackgroundPreviewUrl}
              onChange={(layout) => setTemplateDraft((current) => ({ ...current, layout }))}
            />
          </div>
        </div>

        {/* Saved Templates List */}
        <div className="@container rounded-3xl border bg-background p-5 shadow-sm sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-base font-semibold text-foreground">{t("admin.instances.savedPrintTemplateList", { defaultValue: "Saved templates" })}</div>
            <Badge variant="secondary" className="rounded-full">{printTemplates.length}</Badge>
          </div>
          {printTemplates.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              {t("admin.instances.noSavedTemplates", { defaultValue: "No print templates saved yet. Create one above." })}
            </div>
          ) : (
            <div className="grid gap-3 grid-cols-1 @sm:grid-cols-2 @xl:grid-cols-3">
              {printTemplates.map((template) => (
                <div key={template.id} className="flex flex-col justify-between rounded-2xl border bg-card p-4 transition hover:shadow-xs space-y-3">
                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm truncate">#{template.id} {template.name}</span>
                      <Badge variant={template.status === "archived" ? "outline" : "secondary"} className={`text-[11px] ${template.status === "archived" ? "text-amber-600" : "text-emerald-600"}`}>
                        {template.status === "archived" ? t("statuses.archived", { defaultValue: "Archived" }) : t("statuses.active", { defaultValue: "Active" })}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("admin.instances.backgroundAssetId", { defaultValue: "Background asset ID" })}: {template.background_file_asset_id || template.backgroundFileAssetId || "-"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 border-t pt-3 text-xs">
                    <Button type="button" size="sm" variant="outline" className="h-8 rounded-xl text-xs" onClick={() => handleEditPrintTemplate(template)}>
                      {t("common.edit", { defaultValue: "Edit" })}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="h-8 rounded-xl text-xs" onClick={() => handleArchivePrintTemplate(template)}>
                      {template.status === "archived" ? t("common.activate", { defaultValue: "Activate" }) : t("common.archive", { defaultValue: "Archive" })}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="h-8 rounded-xl text-xs text-destructive hover:text-destructive ms-auto" onClick={() => handleDeletePrintTemplate(template.id)} aria-label={t("admin.instances.deletePrintTemplate", { defaultValue: "Delete print template" })}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Text Presets Manager */}
        <div className="@container rounded-3xl border bg-background p-5 shadow-sm sm:p-6 space-y-4">
          <div className="mb-2">
            <div className="flex items-center gap-2 text-base font-semibold"><FileText className="h-4 w-4 text-primary" />{t("admin.instances.printPresets", { defaultValue: "Print text presets" })}</div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("admin.instances.printPresetsDescription", { defaultValue: "Reusable text snippets for batch grade and registration labels." })}</p>
          </div>
          <div className="grid w-full min-w-0 gap-3 grid-cols-1 @sm:grid-cols-2 @lg:grid-cols-3 items-end">
            <PrintFormField label={t("admin.instances.presetType", { defaultValue: "Preset type" })}>
              <select className="h-10 w-full rounded-xl border bg-background px-3 text-sm text-foreground" value={presetDraft.presetType} onChange={(event) => setPresetDraft((current) => ({ ...current, presetType: event.target.value }))}>
                <option value="registration_method">{t("admin.instances.registrationMethodText", { defaultValue: "Registration method" })}</option>
                <option value="grade_class">{t("admin.instances.gradeClassText", { defaultValue: "Grade/class text" })}</option>
              </select>
            </PrintFormField>
            <PrintFormField label={t("admin.instances.presetLabel", { defaultValue: "Preset label" })}>
              <Input className="h-10 w-full rounded-xl text-foreground" value={presetDraft.label} onChange={(event) => setPresetDraft((current) => ({ ...current, label: event.target.value }))} />
            </PrintFormField>
            <PrintFormField label={t("admin.instances.presetDisplayText", { defaultValue: "Printed text" })}>
              <Input className="h-10 w-full rounded-xl text-foreground" value={presetDraft.displayText} onChange={(event) => setPresetDraft((current) => ({ ...current, displayText: event.target.value }))} />
            </PrintFormField>
          </div>
          <div>
            <Button type="button" variant="outline" className="h-10 rounded-xl" onClick={handleCreatePrintPreset} disabled={!presetDraft.displayText.trim()}>
              <Plus className="h-4 w-4 me-1.5" />
              {t("common.add", { defaultValue: "Add" })}
            </Button>
          </div>
          {printPresets.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">
              {printPresets.map((preset) => (
                <Badge key={preset.id} variant="secondary" className="rounded-xl px-3 py-1.5 text-xs font-normal">
                  <span className="font-semibold me-1">
                    [{(preset.preset_type || preset.presetType) === "registration_method" ? t("admin.instances.registrationMethodText", { defaultValue: "Registration method" }) : t("admin.instances.gradeClassText", { defaultValue: "Grade/class text" })}]:
                  </span>
                  {preset.label || preset.display_text}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </TooltipProvider>
  );
}
