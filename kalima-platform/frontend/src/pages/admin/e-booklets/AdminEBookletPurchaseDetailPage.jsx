import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { BookOpenCheck, CheckCircle2, ChevronLeft, ExternalLink, Save } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { useAdminEBookletPurchases, useAdminEBookletInstances } from "@/hooks/admin/useAdminEBooklets";
import { formatCurrency, formatOrderDate, getImageUrl } from "@/lib/storeUtils";
import { getEBookletOrderAmount } from "@/components/e-booklets/eBookletOrderUtils";

const statusTone = {
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  awaiting_payment: "border-amber-200 bg-amber-50 text-amber-700",
  paid: "border-sky-200 bg-sky-50 text-sky-700",
  needs_branding_info: "border-orange-200 bg-orange-50 text-orange-700",
  customization_in_progress: "border-purple-200 bg-purple-50 text-purple-700",
  ready: "border-emerald-200 bg-emerald-50 text-emerald-700",
  delivered: "border-green-200 bg-green-50 text-green-700",
  rejected: "border-red-200 bg-red-50 text-red-700",
  cancelled: "border-zinc-200 bg-zinc-100 text-zinc-600",
};

const prettyStatus = (status) => String(status || "").replaceAll("_", " ");
const positiveAmount = (value) => (Number(value) > 0 ? value : null);

function DetailRow({ label, value }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-right font-medium">{value === undefined || value === null || value === "" ? "-" : value}</span>
    </div>
  );
}

function Card({ title, children, className = "" }) {
  return <section className={`space-y-3 rounded-md border p-4 ${className}`}><h3 className="font-medium">{title}</h3>{children}</section>;
}

export default function AdminEBookletPurchaseDetailPage() {
  const { t, i18n } = useTranslation("eBooklets");
  const navigate = useNavigate();
  const { purchaseId } = useParams();
  const {
    loading,
    fetchPurchase,
    updatePurchaseStatus,
    markPaid,
  } = useAdminEBookletPurchases();
  const { updateInstanceAccessExpiry } = useAdminEBookletInstances();
  const [purchase, setPurchase] = useState(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [editingExpiry, setEditingExpiry] = useState(false);
  const [expiryDraft, setExpiryDraft] = useState("");

  const loadPurchase = useCallback(async () => {
    if (!purchaseId) return;
    const response = await fetchPurchase(purchaseId);
    const nextPurchase = response?.data || response || null;
    setPurchase(nextPurchase);
    setAdminNotes(nextPurchase?.admin_notes || "");
  }, [fetchPurchase, purchaseId]);

  useEffect(() => {
    loadPurchase().catch(() => {});
  }, [loadPurchase]);

  if (loading && !purchase) return <div className="p-8"><LoadingSpinner /></div>;

  if (!purchase) {
    return (
      <div className="p-8 text-center">
        <div className="mb-4 text-muted-foreground">{t("admin.purchases.notFound", { defaultValue: "E-booklet purchase not found." })}</div>
        <Button variant="outline" onClick={() => navigate("/admin/e-booklets/orders")}>{t("common.back", { defaultValue: "Back" })}</Button>
      </div>
    );
  }

  const status = String(purchase.status || "");
  const canApprovePayment = ["pending", "awaiting_payment", "customization_in_progress"].includes(status);
  const screenshotSource = purchase.payment_screenshot?.url || (typeof purchase.payment_screenshot === "string" ? purchase.payment_screenshot : null) || purchase.payment_screenshot_url || purchase.payment_proof_url;
  const screenshotUrl = getImageUrl(screenshotSource);
  const requiredFields = purchase.required_fields || [];
  const instance = Array.isArray(purchase.instances) ? purchase.instances[0] : null;
  const basePrice = positiveAmount(purchase.price) || purchase.marketing_price || purchase.student_marketing_price || purchase.total || 0;
  const totalAmount = getEBookletOrderAmount(purchase);
  const paymentMethod = purchase.payment_methods?.name || purchase.payment_method?.name || purchase.payment_method;
  const paymentReference = purchase.payment_reference || purchase.numberTransferredFrom || purchase.payment_number;
  const brandingEntries = purchase.branding_json && typeof purchase.branding_json === "object"
    ? Object.entries(purchase.branding_json).filter(([, value]) => value !== undefined && value !== null && value !== "")
    : [];

  const statusLabel = (value) => t(`orders.statuses.${value}`, { defaultValue: t(`statuses.${value}`, { defaultValue: prettyStatus(value) }) });
  const saveNotes = async () => {
    await updatePurchaseStatus(purchase.id, purchase.status, adminNotes);
    await loadPurchase();
  };
  const approvePayment = async () => {
    await markPaid(purchase.id);
    await loadPurchase();
  };
  const setStatus = async (nextStatus) => {
    await updatePurchaseStatus(purchase.id, nextStatus, adminNotes);
    await loadPurchase();
  };
  const startEditExpiry = () => {
    setExpiryDraft(instance?.access_expires_at ? new Date(instance.access_expires_at).toISOString().slice(0, 10) : "");
    setEditingExpiry(true);
  };
  const saveExpiry = async () => {
    if (!instance?.id || !expiryDraft) return;
    await updateInstanceAccessExpiry(instance.id, expiryDraft);
    setEditingExpiry(false);
    await loadPurchase();
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6" data-testid="admin-e-booklet-purchase-detail-page">
      <div className="flex flex-col gap-4 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin/e-booklets/orders")} aria-label={t("common.back", { defaultValue: "Back" })}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">#{purchase.id}</h1>
              <Badge variant="outline" className={statusTone[status] || "border-slate-200 bg-slate-50 text-slate-700"}>{statusLabel(status)}</Badge>
            </div>
            <div className="text-muted-foreground">{formatOrderDate(purchase.created_at, i18n.language)}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canApprovePayment && <Button onClick={approvePayment}><CheckCircle2 className="h-4 w-4" />{t("admin.purchases.approvePaymentShort", { defaultValue: "Approve payment" })}</Button>}
          {!["delivered", "rejected", "cancelled", "customization_in_progress"].includes(status) && <Button variant="outline" onClick={() => setStatus("customization_in_progress")}>{t("common.inProgress", { defaultValue: "In progress" })}</Button>}
          {status !== "rejected" && status !== "delivered" && <Button variant="outline" className="text-destructive" onClick={() => setStatus("rejected")}>{t("orders.statuses.rejected", { defaultValue: "Rejected" })}</Button>}
          <Button asChild variant="secondary"><Link to={`/admin/e-booklets/orders/${purchase.id}/delivery`}><BookOpenCheck className="h-4 w-4" />{t("admin.purchases.openDelivery", { defaultValue: "Open delivery" })}</Link></Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="space-y-6 md:col-span-2">
          <Card title={t("orders.sections.eBooklet", { defaultValue: "E-booklet" })}>
            <DetailRow label={t("common.eBooklet", { defaultValue: "E-booklet" })} value={purchase.template?.title} />
            <DetailRow label={t("common.version", { defaultValue: "Version" })} value={purchase.template_version?.version_number ? `v${purchase.template_version.version_number}` : null} />
            <DetailRow label={t("common.pages", { defaultValue: "Pages" })} value={purchase.template_version?.page_count} />
            <DetailRow label={t("admin.purchases.instance", { defaultValue: "Instance" })} value={instance?.id ? `#${instance.id}` : "-"} />
          </Card>

          {requiredFields.length > 0 && (
            <Card title={t("orders.details.requiredFields", { defaultValue: "Required Fields" })}>
              <div className="space-y-3">
                {requiredFields.map((field) => {
                  const definition = field.required_field_definitions || {};
                  const fieldType = definition.field_type;
                  const fileUrl = ["file", "image"].includes(fieldType) ? getImageUrl(field.value) : null;
                  return (
                    <div key={field.id || field.field_definition_id} className="rounded-md border p-3">
                      <div className="mb-2 text-sm font-medium">{definition.label || t("orders.details.field", { defaultValue: "Field" })}</div>
                      {fileUrl ? (
                        <a href={fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                          <ExternalLink className="h-3 w-3" />
                          {t("orders.details.viewImage", { defaultValue: "View file" })}
                        </a>
                      ) : (
                        <div className="break-words text-sm text-muted-foreground">{field.value || "-"}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {brandingEntries.length > 0 && (
            <Card title={t("admin.purchases.brandingInfo", { defaultValue: "Branding info" })}>
              <div className="space-y-2">
                {brandingEntries.map(([key, value]) => <DetailRow key={key} label={key.replaceAll("_", " ")} value={typeof value === "object" ? JSON.stringify(value) : String(value)} />)}
              </div>
            </Card>
          )}

          <Card title={t("admin.purchases.adminNotes", { defaultValue: "Admin notes" })}>
            <Textarea value={adminNotes} onChange={(event) => setAdminNotes(event.target.value)} rows={5} maxLength={5000} placeholder={t("admin.purchases.adminNotesPlaceholder", { defaultValue: "Add admin notes" })} />
            <div className="flex items-center justify-end gap-3">
              <span className="text-xs text-muted-foreground">{adminNotes.length} / 5000</span>
              <Button onClick={saveNotes} disabled={loading}><Save className="h-4 w-4" />{t("admin.purchases.saveNote", { defaultValue: "Save note" })}</Button>
            </div>
          </Card>

          <Card title={t("admin.purchases.teacherInfo", { defaultValue: "Teacher Info" })} className="border-primary/20">
            <DetailRow label={t("common.name", { defaultValue: "Name" })} value={purchase.teacher?.name} />
            <DetailRow label={t("common.email", { defaultValue: "Email" })} value={purchase.teacher?.email} />
            <DetailRow label={t("common.phone", { defaultValue: "Phone" })} value={purchase.teacher?.phone} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card title={t("orders.details.orderSummary", { defaultValue: "Order Summary" })}>
            <DetailRow label={t("common.price", { defaultValue: "Price" })} value={formatCurrency(basePrice, t)} />
            <DetailRow label={t("admin.purchases.walletCredit", { defaultValue: "Wallet credit" })} value={formatCurrency(purchase.wallet_credit_applied || 0, t)} />
            <div className="border-t pt-3 text-lg font-bold"><DetailRow label={t("orders.details.total", { defaultValue: "Total" })} value={formatCurrency(totalAmount, t)} /></div>
          </Card>

          <Card title={t("orders.details.paymentInfo", { defaultValue: "Payment Info" })}>
            <DetailRow label={t("orders.details.method", { defaultValue: "Method" })} value={paymentMethod} />
            <DetailRow label={t("admin.purchases.paymentReference", { defaultValue: "Payment reference" })} value={paymentReference} />
            {screenshotUrl && <a href={screenshotUrl} target="_blank" rel="noreferrer" className="mt-3 block overflow-hidden rounded-md border"><img src={screenshotUrl} alt={t("inviteAccept.paymentScreenshot", { defaultValue: "Payment screenshot" })} className="max-h-56 w-full object-cover" /></a>}
          </Card>

          <Card title={t("orders.details.statusTimeline", { defaultValue: "Status Timeline" })}>
            <div className="space-y-4 text-sm">
              <div><div className="font-medium">{t("orders.statuses.created", { defaultValue: "Created" })}</div><div className="text-muted-foreground">{formatOrderDate(purchase.created_at, i18n.language)}</div></div>
              {purchase.updated_at && <div><div className="font-medium">{statusLabel(status)}</div><div className="text-muted-foreground">{formatOrderDate(purchase.updated_at, i18n.language)}</div></div>}
              {instance?.created_at && <div><div className="font-medium">{t("admin.purchases.accessCreated", { defaultValue: "Access created" })}</div><div className="text-muted-foreground">{formatOrderDate(instance.created_at, i18n.language)}</div></div>}
            </div>
          </Card>

          <Card title={t("admin.purchases.deliveryAccessInfo", { defaultValue: "Delivery / Access Info" })}>
            <DetailRow label={t("admin.purchases.instance", { defaultValue: "Instance" })} value={instance?.id ? `#${instance.id}` : "-"} />
            <DetailRow label={t("admin.purchases.inviteQuota", { defaultValue: "Student seat quota" })} value={instance?.invite_quota} />
            <DetailRow label={t("teacher.expiry", { defaultValue: "Expiry" })} value={instance?.access_expires_at ? formatOrderDate(instance.access_expires_at, i18n.language) : "-"} />
            {instance?.id && (
              editingExpiry ? (
                <div className="space-y-2 rounded-md border bg-muted/30 p-2">
                  <Input type="date" value={expiryDraft} onChange={(event) => setExpiryDraft(event.target.value)} data-testid="admin-e-booklet-expiry-input" />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveExpiry} disabled={loading || !expiryDraft} data-testid="admin-e-booklet-expiry-save">{t("common.save", { defaultValue: "Save" })}</Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingExpiry(false)}>{t("common.cancel", { defaultValue: "Cancel" })}</Button>
                  </div>
                </div>
              ) : (
                <Button variant="outline" size="sm" className="w-full" onClick={startEditExpiry} data-testid="admin-e-booklet-edit-expiry-button">
                  {t("admin.purchases.editExpiry", { defaultValue: "Edit expiry date" })}
                </Button>
              )
            )}
            {instance?.id && <Button asChild variant="outline" size="sm" className="w-full"><Link to={`/admin/e-booklets/access/${instance.id}/students`}>{t("admin.instances.students", { defaultValue: "View students" })}</Link></Button>}
          </Card>
        </div>
      </div>
    </div>
  );
}
