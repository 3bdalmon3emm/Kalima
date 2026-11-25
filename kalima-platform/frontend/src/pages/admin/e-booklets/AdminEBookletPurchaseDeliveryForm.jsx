import { useEffect, useState } from "react";
import useReasonPrompt, { askClosingReason } from '@/components/admin/staff-log/useReasonPrompt';
import { useNavigate } from "react-router-dom";
import { PencilLine, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { isGeneratedEBookletTitle } from "@/utils/eBookletTitleUtils";

const asNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeAsset = (response) => response?.data || response || null;

const dimensionsDiffer = (expected = [], uploaded = []) => {
  if (!expected?.length || !uploaded?.length) return false;
  if (expected.length !== uploaded.length) return true;
  return expected.some((dimension, index) => {
    const uploadedDimension = uploaded[index];
    return (
      !uploadedDimension ||
      Number(dimension.width) !== Number(uploadedDimension.width) ||
      Number(dimension.height) !== Number(uploadedDimension.height)
    );
  });
};

export default function AdminEBookletPurchaseDeliveryForm({
  purchase,
  loading,
  t,
  deliverPurchase,
  markPaid,
  prepareCustomTemplate,
  updatePurchaseStatus,
  uploadTeacherDocument,
  onChanged,
}) {
  const navigate = useNavigate();
  const { t: tLog } = useTranslation("staffLog");
  const [askReason, reasonDialog] = useReasonPrompt();
  const [deliveryForm, setDeliveryForm] = useState({
    custom_document_file_id: "",
    display_title: "",
    invite_quota: "30",
    access_expires_at: "",
    student_marketing_price: "",
    internal_price: "",
    page_count: "",
    page_dimensions: [],
    document_filename: "",
    validation_message: "",
    admin_notes: "",
  });

  useEffect(() => {
    if (!purchase) return;
    setDeliveryForm((current) => ({
      ...current,
      display_title:
        (purchase.branding_json?.bookletTitle && !isGeneratedEBookletTitle(purchase.branding_json?.bookletTitle) && purchase.branding_json?.bookletTitle) ||
        purchase.template?.title ||
        (current.display_title && !isGeneratedEBookletTitle(current.display_title) ? current.display_title : "") ||
        purchase.template?.title ||
        "",
      student_marketing_price: String(purchase.marketing_price ?? purchase.price ?? current.student_marketing_price ?? ""),
      internal_price: String(purchase.internal_price ?? current.internal_price ?? ""),
      page_count: "",
      page_dimensions: [],
      document_filename: "",
      validation_message: "",
    }));
  }, [purchase]);

  const handleDocumentUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !purchase) return;
    const response = await uploadTeacherDocument(file, {
      owner_type: "booklet",
      owner_id: purchase.id,
    });
    const asset = normalizeAsset(response);
    const assetId = asset?.id;
    const metadata = asset?.metadata;
    if (!assetId) return;

    const expectedPageCount = Number(purchase.template_version?.page_count || 0);
    const expectedDimensions = Array.isArray(purchase.template_version?.page_dimensions_json)
      ? purchase.template_version.page_dimensions_json
      : [];
    let validationMessage = "";
    if (!metadata?.page_count || !metadata?.page_dimensions?.length) {
      validationMessage = t("admin.purchases.validation.detectRequired");
    } else if (expectedPageCount && metadata.page_count !== expectedPageCount) {
      validationMessage = t("admin.purchases.validation.pageCountMismatch", {
        expected: expectedPageCount,
        actual: metadata.page_count,
      });
    } else if (dimensionsDiffer(expectedDimensions, metadata.page_dimensions)) {
      validationMessage = t("admin.purchases.validation.pageSizeMismatch");
    }

    setDeliveryForm((current) => ({
      ...current,
      custom_document_file_id: String(assetId),
      page_count: metadata?.page_count ? String(metadata.page_count) : "",
      page_dimensions: metadata?.page_dimensions || [],
      document_filename: file.name,
      validation_message: validationMessage,
    }));
  };

  const handleDeliver = async () => {
    if (!purchase || !canDeliver) return;
    if (deliveryForm.validation_message || !deliveryForm.custom_document_file_id || !deliveryForm.access_expires_at) return;
    try {
      await deliverPurchase(purchase.id, {
        custom_document_file_id: Number(deliveryForm.custom_document_file_id),
        display_title: deliveryForm.display_title,
        invite_quota: asNumber(deliveryForm.invite_quota, 0),
        access_expires_at: deliveryForm.access_expires_at,
        student_marketing_price: asNumber(deliveryForm.student_marketing_price, 0),
        internal_price: asNumber(deliveryForm.internal_price, 0),
        page_count: asNumber(deliveryForm.page_count, 0),
        page_dimensions: deliveryForm.page_dimensions,
      });
      onChanged?.();
    } catch {
      // The shared API layer already displays the actionable server response.
    }
  };

  const handleStatus = async (nextStatus) => {
    if (!purchase) return;
    const reason = await askClosingReason(askReason, tLog, purchase.status, nextStatus);
    if (reason === null) return;
    await updatePurchaseStatus(purchase.id, nextStatus, deliveryForm.admin_notes, reason);
    onChanged?.();
  };

  const handleApprovePayment = async () => {
    if (!purchase || !markPaid) return;
    await markPaid(purchase.id);
    onChanged?.();
  };

  const handleEditTeacherTemplate = async () => {
    if (!purchase) return;
    const response = await prepareCustomTemplate(purchase.id);
    const custom = response?.data;
    const templateId = custom?.template_id || purchase.template_id;
    const versionId = custom?.template_version_id;
    if (templateId && versionId) {
      navigate(`/admin/e-booklets/${templateId}/edit?teacherTemplate=1&purchaseId=${purchase.id}&versionId=${versionId}`);
    }
  };

  if (!purchase) {
    return (
      <div className="rounded-lg border bg-background p-8 text-center text-sm text-muted-foreground">
        {t("admin.purchases.selectPurchase")}
      </div>
    );
  }

  const isDelivered = String(purchase.status) === "delivered";
  const canApprovePayment = ["pending", "awaiting_payment", "customization_in_progress"].includes(String(purchase.status));
  const canDeliver = ["paid", "ready"].includes(String(purchase.status));
  const deliverDisabled = loading || isDelivered || !canDeliver || Boolean(deliveryForm.validation_message) || !deliveryForm.custom_document_file_id || !deliveryForm.access_expires_at;

  return (
    <section className="space-y-4 rounded-lg border bg-background p-4" data-testid="admin-e-booklet-purchases-delivery-section">
      {reasonDialog}
      <div>
        <h2 className="text-lg font-semibold">{t("admin.purchases.delivery")}</h2>
        <p className="text-sm text-muted-foreground">
          {purchase.teacher?.name || t("common.teacher")} - {purchase.template?.title}
        </p>
      </div>

      <div className="grid gap-3">
        <div className="space-y-2">
          <Label>{t("admin.purchases.teacherTitle")}</Label>
          <Input
            value={deliveryForm.display_title}
            onChange={(event) => setDeliveryForm((current) => ({ ...current, display_title: event.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label>{t("admin.purchases.teacherPdf")}</Label>
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-h-9 flex-1 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              {deliveryForm.custom_document_file_id
                ? deliveryForm.document_filename || t("admin.purchases.teacherPdfUploaded", { id: deliveryForm.custom_document_file_id })
                : t("admin.purchases.teacherPdfEmpty")}
            </div>
            <label className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border bg-background px-3 text-sm font-medium hover:bg-accent">
              <Upload className="h-4 w-4" />
              {deliveryForm.custom_document_file_id ? t("common.replace") : t("common.upload")}
              <input
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={handleDocumentUpload}
                data-testid="ebooklet-teacher-document-upload-input"
              />
            </label>
          </div>
          {deliveryForm.validation_message && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {deliveryForm.validation_message}
            </div>
          )}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>{t("admin.purchases.detectedPages")}</Label>
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
              {deliveryForm.page_count || t("admin.purchases.uploadPdf")}
              <span className="text-muted-foreground">
                {" / "}
                {t("admin.purchases.templatePages", { count: purchase.template_version?.page_count || 0 })}
              </span>
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("admin.purchases.inviteQuota", { defaultValue: "Student seat quota" })}</Label>
            <Input
              type="number"
              min="0"
              value={deliveryForm.invite_quota}
              onChange={(event) => setDeliveryForm((current) => ({ ...current, invite_quota: event.target.value }))}
            />
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>{t("admin.purchases.accessExpiresAt", { defaultValue: "Student access expires" })}</Label>
            <Input
              type="date"
              value={deliveryForm.access_expires_at}
              onChange={(event) => setDeliveryForm((current) => ({ ...current, access_expires_at: event.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("admin.purchases.studentMarketingPrice", { defaultValue: "Student store price" })}</Label>
            <Input
              type="number"
              min="0"
              value={deliveryForm.student_marketing_price}
              onChange={(event) => setDeliveryForm((current) => ({ ...current, student_marketing_price: event.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              {t("admin.purchases.studentMarketingPriceHint")}
            </p>
          </div>
        </div>
        <div className="space-y-2">
          <Label>{t("admin.purchases.internalPrice", { defaultValue: "Internal teacher cost" })}</Label>
          <Input
            type="number"
            min="0"
            value={deliveryForm.internal_price}
            onChange={(event) => setDeliveryForm((current) => ({ ...current, internal_price: event.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label>{t("admin.purchases.adminNotes")}</Label>
          <Textarea
            value={deliveryForm.admin_notes}
            onChange={(event) => setDeliveryForm((current) => ({ ...current, admin_notes: event.target.value }))}
            placeholder={t("admin.purchases.adminNotesPlaceholder")}
          />
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button type="button" variant="outline" onClick={handleEditTeacherTemplate} disabled={loading} className="sm:col-span-2">
          <PencilLine className="h-4 w-4" />
          {t("admin.purchases.editTeacherTemplate", { defaultValue: "Edit this teacher's eBooklet template" })}
        </Button>
        {!isDelivered && (
          <Button variant="outline" onClick={() => handleStatus("customization_in_progress")} disabled={loading}>
            {t("common.inProgress")}
          </Button>
        )}
        {isDelivered && (
          <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 sm:col-span-2">
            {t("admin.purchases.alreadyDelivered", { defaultValue: "This e-booklet has already been delivered." })}
          </div>
        )}
        {!isDelivered && !canDeliver && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 sm:col-span-2">
            {t("admin.purchases.approvePaymentBeforeDelivery", { defaultValue: "Approve the payment before delivering this e-booklet." })}
          </div>
        )}
        {!isDelivered && !canDeliver && canApprovePayment && (
          <Button type="button" onClick={handleApprovePayment} disabled={loading} className="sm:col-span-2">
            {t("admin.purchases.approvePaymentShort", { defaultValue: "Approve payment" })}
          </Button>
        )}
        {!isDelivered && (
          <Button
            onClick={handleDeliver}
            disabled={deliverDisabled}
          >
            {t("admin.purchases.deliver")}
          </Button>
        )}
      </div>
    </section>
  );
}
