import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { BookOpenCheck, Loader2, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import api from "@/api/axios";
import useAuth from "@/hooks/auth/useAuth";
import { useStudentEBooklets } from "@/hooks/useEBookletAccess";
import { useTranslation } from "react-i18next";
import { getBaseUrl } from "@/lib/storeUtils";

const TERMS_VERSION = "e-booklet-invite-v1";
const apiOrigin = getBaseUrl();

const normalizePayload = (payload) => payload?.data && !Array.isArray(payload.data) ? payload.data : payload;
const redemptionInstanceId = (payload) => {
  const result = normalizePayload(payload);
  return result?.bookletInstanceId || result?.booklet_instance_id || result?.bookletInstance?.id || result?.booklet_instance?.id;
};

export default function EBookletPrintedCodeQrPage() {
  const { t } = useTranslation("eBooklets");
  const { ref } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading } = useAuth() || {};
  const { getPrintQrPrefill, redeemAccessCode } = useStudentEBooklets();
  const [prefill, setPrefill] = useState(null);
  const [teacherImageObjectUrl, setTeacherImageObjectUrl] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [state, setState] = useState({ status: "idle", message: "" });
  const redirectPath = `/e-booklet-code/qr/${encodeURIComponent(ref || "")}`;
  const teacherImageUrl = prefill?.teacherImageUrl?.startsWith("/api/")
    ? `${apiOrigin}${prefill.teacherImageUrl}`
    : prefill?.teacherImageUrl;

  useEffect(() => {
    if (!ref || !isAuthenticated) return;
    setState({ status: "loading", message: "" });
    getPrintQrPrefill(ref)
      .then((response) => {
        setPrefill(normalizePayload(response));
        setState({ status: "idle", message: "" });
      })
      .catch((error) => {
        setState({ status: "error", message: error?.response?.data?.message || t("inviteAccept.codeRedemption.error") });
      });
  }, [getPrintQrPrefill, isAuthenticated, ref, t]);

  useEffect(() => {
    if (!teacherImageUrl) {
      setTeacherImageObjectUrl("");
      return undefined;
    }
    let active = true;
    const requestUrl = teacherImageUrl.startsWith("/api/")
      ? `${apiOrigin}${teacherImageUrl}`
      : teacherImageUrl;
    api.get(requestUrl, { responseType: "blob" })
      .then((response) => {
        if (!active) return;
        const objectUrl = URL.createObjectURL(response.data);
        setTeacherImageObjectUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return objectUrl;
        });
      })
      .catch(() => setTeacherImageObjectUrl(""));
    return () => {
      active = false;
    };
  }, [teacherImageUrl]);

  const submit = async () => {
    if (!prefill?.code) return;
    if (!termsAccepted) {
      setState({ status: "error", message: t("inviteAccept.termsRequired") });
      return;
    }
    setState({ status: "loading", message: "" });
    try {
      const response = await redeemAccessCode(prefill.code, TERMS_VERSION);
      const instanceId = redemptionInstanceId(response?.data ?? response);
      if (instanceId) {
        navigate(`/student/e-booklets/${instanceId}`, { replace: true });
        return;
      }
      setState({ status: "success", message: t("inviteAccept.codeRedemption.paidSuccess") });
    } catch (error) {
      setState({ status: "error", message: error?.response?.data?.message || t("inviteAccept.codeRedemption.error") });
    }
  };

  if (authLoading) {
    return <div className="mx-auto flex min-h-[60vh] max-w-lg items-center justify-center text-sm text-muted-foreground"><Loader2 className="me-2 h-4 w-4 animate-spin" />{t("inviteAccept.loading")}</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 text-center">
        <BookOpenCheck className="h-12 w-12 text-primary" />
        <h1 className="mt-4 text-2xl font-bold">{t("inviteAccept.codeRedemption.title")}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{t("inviteAccept.loginRequired")}</p>
        <div className="mt-5 flex gap-2">
          <Button asChild><Link data-testid="e-booklet-printed-code-login" to={`/login?redirect=${encodeURIComponent(redirectPath)}`}>{t("inviteAccept.login")}</Link></Button>
          <Button asChild variant="outline"><Link to={`/signup?redirect=${encodeURIComponent(redirectPath)}`}>{t("inviteAccept.register")}</Link></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-10" data-testid="e-booklet-printed-code-qr-page">
      <div className="text-center">
        <Ticket className="mx-auto h-12 w-12 text-primary" />
        <h1 className="mt-4 text-2xl font-bold">{t("inviteAccept.codeRedemption.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("inviteAccept.codeRedemption.description")}</p>
      </div>

      <section className="space-y-4 rounded-lg border bg-background p-4">
        {state.status === "loading" && !prefill ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground"><Loader2 className="me-2 h-4 w-4 animate-spin" />{t("inviteAccept.loading")}</div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-muted/60 p-3">
                <div className="text-xs text-muted-foreground">{t("common.teacher")}</div>
                <div className="mt-1 font-semibold">{prefill?.teacher?.name || "-"}</div>
              </div>
              <div className="rounded-lg bg-muted/60 p-3">
                <div className="text-xs text-muted-foreground">{t("common.eBooklet")}</div>
                <div className="mt-1 font-semibold">{prefill?.eBooklet?.title || "-"}</div>
              </div>
              <div className="rounded-lg bg-muted/60 p-3">
                <div className="text-xs text-muted-foreground">{t("admin.instances.gradeClassText", { defaultValue: "Grade/class text" })}</div>
                <div className="mt-1 font-semibold">{prefill?.gradeClassText || "-"}</div>
              </div>
              <div className="rounded-lg bg-muted/60 p-3">
                <div className="text-xs text-muted-foreground">{t("admin.instances.registrationMethodText", { defaultValue: "Registration method" })}</div>
                <div className="mt-1 font-semibold">{prefill?.registrationMethodText || "-"}</div>
              </div>
            </div>

            {teacherImageObjectUrl && (
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="mb-2 text-xs text-muted-foreground">{t("admin.instances.teacherImageAssetId", { defaultValue: "Teacher image" })}</div>
                <img src={teacherImageObjectUrl} alt={prefill?.teacher?.name || t("common.teacher")} className="h-36 w-28 rounded-md object-cover" />
              </div>
            )}

            <label className="grid gap-2 text-sm font-medium">
              <span>{t("inviteAccept.codeRedemption.codeLabel")}</span>
              <Input data-testid="e-booklet-printed-code" value={prefill?.code || ""} readOnly className="font-mono tracking-wide" dir="ltr" />
            </label>
            <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
              <input data-testid="e-booklet-printed-code-terms" type="checkbox" className="mt-1" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} />
              <span>{t("inviteAccept.terms")}</span>
            </label>
            <Button data-testid="e-booklet-printed-code-submit" className="w-full" onClick={submit} disabled={state.status === "loading" || !prefill?.code}>
              {state.status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ticket className="h-4 w-4" />}
              {t("inviteAccept.codeRedemption.submit")}
            </Button>
          </>
        )}
      </section>

      {state.message && <div className={`rounded-md border p-3 text-sm ${state.status === "error" ? "text-destructive" : "text-emerald-700"}`}>{state.message}</div>}
      {state.status === "success" && <Button asChild><Link to="/student/e-booklets">{t("inviteAccept.openMyEBooklets")}</Link></Button>}
    </div>
  );
}
