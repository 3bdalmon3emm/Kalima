import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpDown,
  BookOpenCheck,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Eye,
  FileText,
  Filter,
  HardDrive,
  HelpCircle,
  KeyRound,
  Loader2,
  Maximize2,
  Minimize2,
  Plus,
  Printer,
  RefreshCcw,
  Save,
  Search,
  ShieldOff,
  SlidersHorizontal,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAdminEBookletInstances, useAdminEBookletTermsMilestones } from "@/hooks/admin/useAdminEBooklets";
import useExport from "@/hooks/useExport";
import { useTranslation } from "react-i18next";
import AdminEBookletStudentDevicePanel from "./AdminEBookletStudentDevicePanel";

const numberValue = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const optionalNumberValue = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getPrintBatchPdfFilename = (batch) => {
  const safeLabel = String(batch?.label || "")
    .trim()
    .replace(/[\u0000-\u001F<>:"/\\|?*]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/\.pdf$/i, "")
    .replace(/\.+$/, "");
  const fallback = `e-booklet-access-codes-${batch?.id || "batch"}`;
  return `${safeLabel || fallback}.pdf`;
};

const DEFAULT_PRINT_FIELD_VISIBILITY = Object.freeze({
  gradeClass: true,
  registrationMethod: true,
  price: true,
  redCustomText: true,
  teacherImage: true,
});

const normalizePrintFieldVisibility = (visibleFields = {}) => ({
  ...DEFAULT_PRINT_FIELD_VISIBILITY,
  ...visibleFields,
});

import { getEBookletDisplayTitle, isGeneratedEBookletTitle } from "@/utils/eBookletTitleUtils";

const getEBookletTitle = (instance, fallback) => getEBookletDisplayTitle(instance, fallback);

const pageMotion = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.2, 0, 0, 1] } },
};

const listMotion = {
  hidden: {},
  show: { transition: { staggerChildren: 0.025 } },
};

const rowMotion = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.18, ease: [0.2, 0, 0, 1] } },
};

const panelMotion = {
  hidden: { height: 0, opacity: 0 },
  show: { height: "auto", opacity: 1, transition: { duration: 0.22, ease: [0.2, 0, 0, 1] } },
  exit: { height: 0, opacity: 0, transition: { duration: 0.16, ease: [0.4, 0, 1, 1] } },
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

export default function AdminEBookletInstancesPage({ teacherId = null }) {
  const { t, i18n } = useTranslation("eBooklets");
  const {
    instances,
    pagination,
    status,
    loading,
    fetchAllInstances,
    setStatus,
    setPage,
    updateQuota,
    revokeTeacherAccess,
    listAccessCodes,
    generateAccessCodes,
    listAccessCodePrintTemplates,
    createAccessCodePrintTemplate,
    updateAccessCodePrintTemplate,
    archiveAccessCodePrintTemplate,
    activateAccessCodePrintTemplate,
    deleteAccessCodePrintTemplate,
    listAccessCodePrintPresets,
    createAccessCodePrintPreset,
    listAccessCodePrintBatches,
    generateAccessCodePrintBatch,
    uploadAccessCodePrintImage,
    fetchAccessCodePrintImageBlobUrl,
    previewAccessCodePrintCard,
    downloadAccessCodePrintBatchPdf,
  } = useAdminEBookletInstances();
  const { terms, fetchTerms } = useAdminEBookletTermsMilestones();
  const { exportData, loading: exportLoading, exportProgress } = useExport();
  const [quotaDrafts, setQuotaDrafts] = useState({});
  const [expandedInstanceKey, setExpandedInstanceKey] = useState(null);
  const [expandedDeviceKey, setExpandedDeviceKey] = useState(null);
  const [expandedAccessKey, setExpandedAccessKey] = useState(null);
  const [accessCodeDrafts, setAccessCodeDrafts] = useState({});
  const [printDrafts, setPrintDrafts] = useState({});
  const [printTemplates, setPrintTemplates] = useState([]);
  const [printPresets, setPrintPresets] = useState([]);
  const [printUploadState, setPrintUploadState] = useState({});
  const [printUploadedAssets, setPrintUploadedAssets] = useState({});
  const [printBatches, setPrintBatches] = useState({});
  const [printBatchHistory, setPrintBatchHistory] = useState({});
  const [printWarnings, setPrintWarnings] = useState({});
  const [printPreviewUrls, setPrintPreviewUrls] = useState({});
  const [printPreviewLoading, setPrintPreviewLoading] = useState({});
  const [printPreviewErrors, setPrintPreviewErrors] = useState({});
  const [collapsedPrintSections, setCollapsedPrintSections] = useState({});
  const [generatedCodes, setGeneratedCodes] = useState({});
  const [existingCodes, setExistingCodes] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [quotaFilter, setQuotaFilter] = useState("all");
  const [deviceFilter, setDeviceFilter] = useState("all");
  const [sortBy, setSortBy] = useState("name_asc");
  const [perPage, setPerPage] = useState("25");
  const [teacherListPage, setTeacherListPage] = useState(1);
  const [bookletSearchQuery, setBookletSearchQuery] = useState("");
  const [bookletStatusFilter, setBookletStatusFilter] = useState("all");
  const [bookletSortBy, setBookletSortBy] = useState("default");

  const selectedTeacherId = teacherId ? String(teacherId) : null;

  useEffect(() => {
    setTeacherListPage(1);
  }, [searchQuery, quotaFilter, deviceFilter, sortBy, perPage, status]);

  const reloadInstances = () => fetchAllInstances({
    ...(selectedTeacherId ? { teacher_id: selectedTeacherId, include_students: true } : { include_students: false }),
  });

  useEffect(() => {
    reloadInstances().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchAllInstances, selectedTeacherId]);
  useEffect(() => { fetchTerms({ status: "active" }).catch(() => {}); }, [fetchTerms]);
  useEffect(() => {
    listAccessCodePrintTemplates()
      .then((response) => setPrintTemplates(Array.isArray(response?.data) ? response.data : []))
      .catch(() => {});
  }, [listAccessCodePrintTemplates]);
  useEffect(() => {
    listAccessCodePrintPresets({ active: true })
      .then((response) => setPrintPresets(Array.isArray(response?.data) ? response.data : []))
      .catch(() => {});
  }, [listAccessCodePrintPresets]);
  useEffect(() => {
    setQuotaDrafts(Object.fromEntries(instances.map((instance) => [instance.id, instance.invite_quota ?? 0])));
  }, [instances]);

  useEffect(() => {
    const activeTerm = terms.find((term) => term.status === "active") || terms[0];
    if (!activeTerm) return;
    setAccessCodeDrafts((current) => {
      const next = { ...current };
      instances.forEach((instance) => {
        if (!next[instance.id]) {
          next[instance.id] = { termId: String(activeTerm.id), kind: "paid", count: "1", maxRedemptions: "1", expiresAt: "" };
        }
      });
      return next;
    });
    setPrintDrafts((current) => {
      const next = { ...current };
      instances.forEach((instance) => {
        if (!next[instance.id]) {
          next[instance.id] = {
            templateId: "",
            batchName: "",
            teacherImageFileAssetId: "",
            gradeClassText: instance.template?.grade_level || instance.grade_level || "",
            registrationMethodText: t("admin.instances.defaultRegistrationMethod", { defaultValue: "كود أو منصة" }),
            priceText: "",
            redCustomText: "",
            visibleFields: { ...DEFAULT_PRINT_FIELD_VISIBILITY },
          };
        }
      });
      return next;
    });
  }, [instances, terms, t]);


  const grouped = useMemo(() => instances.reduce((acc, instance) => {
    const key = instance.teacher?.id || "unknown";
    if (!acc[key]) acc[key] = { teacher: instance.teacher, rows: [] };
    acc[key].rows.push(instance);
    return acc;
  }, {}), [instances]);

  const summary = useMemo(() => instances.reduce((acc, instance) => {
    acc.total += 1;
    acc.active += instance.status === "active" ? 1 : 0;
    acc.suspended += instance.status === "suspended" ? 1 : 0;
    acc.seats += numberValue(instance.used_invites_count, instance._count?.access_records || 0);
    acc.quota += numberValue(instance.invite_quota);
    const devices = optionalNumberValue(instance.used_devices_count ?? instance.active_devices_count ?? instance.devices_count);
    acc.devices += devices || 0;
    return acc;
  }, { total: 0, active: 0, suspended: 0, seats: 0, quota: 0, devices: 0 }), [instances]);

  const teacherGroups = useMemo(() => Object.entries(grouped), [grouped]);
  const selectedTeacherGroup = useMemo(
    () => teacherGroups.find(([teacherId]) => String(teacherId) === selectedTeacherId) || null,
    [selectedTeacherId, teacherGroups],
  );

  const filteredTeacherGroups = useMemo(() => {
    let result = teacherGroups.map(([tId, group]) => {
      const groupSeats = group.rows.reduce((sum, instance) => sum + numberValue(instance.used_invites_count, instance._count?.access_records || 0), 0);
      const groupQuota = group.rows.reduce((sum, instance) => sum + numberValue(instance.invite_quota), 0);
      const groupDevices = group.rows.reduce((sum, instance) => sum + (optionalNumberValue(instance.used_devices_count ?? instance.active_devices_count ?? instance.devices_count) || 0), 0);
      const activeCount = group.rows.filter((instance) => instance.status === "active").length;
      return {
        teacherId: tId,
        group,
        groupSeats,
        groupQuota,
        groupDevices,
        activeCount,
      };
    });

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(({ teacherId: tId, group }) => {
        const teacherName = String(group.teacher?.name || "").toLowerCase();
        const teacherEmail = String(group.teacher?.email || "").toLowerCase();
        const teacherPhone = String(group.teacher?.phone || "").toLowerCase();
        const normalizedId = String(tId).toLowerCase();

        if (teacherName.includes(q) || teacherEmail.includes(q) || teacherPhone.includes(q) || normalizedId.includes(q)) {
          return true;
        }

        const hasMatchingBooklet = group.rows.some((instance) => {
          const title = getEBookletTitle(instance, "").toLowerCase();
          const displayTitle = String(instance.display_title || "").toLowerCase();
          const grade = String(instance.template?.grade_level || instance.grade_level || "").toLowerCase();
          return title.includes(q) || displayTitle.includes(q) || grade.includes(q);
        });
        if (hasMatchingBooklet) return true;

        const hasMatchingStudent = group.rows.some((instance) => {
          const students = Array.isArray(instance.students) ? instance.students : [];
          return students.some((s) => {
            const studentName = String(s.user?.name || "").toLowerCase();
            const studentEmail = String(s.user?.email || "").toLowerCase();
            return studentName.includes(q) || studentEmail.includes(q);
          });
        });
        return hasMatchingStudent;
      });
    }

    if (quotaFilter === "near_over") {
      result = result.filter(({ groupSeats, groupQuota }) => groupQuota > 0 && (groupSeats / groupQuota) >= 0.8);
    } else if (quotaFilter === "available") {
      result = result.filter(({ groupSeats, groupQuota }) => groupQuota > 0 && (groupSeats / groupQuota) < 0.8);
    } else if (quotaFilter === "full") {
      result = result.filter(({ groupSeats, groupQuota }) => groupQuota > 0 && groupSeats >= groupQuota);
    } else if (quotaFilter === "zero") {
      result = result.filter(({ groupSeats }) => groupSeats === 0);
    }

    if (deviceFilter === "has_devices") {
      result = result.filter(({ groupDevices }) => groupDevices > 0);
    } else if (deviceFilter === "no_devices") {
      result = result.filter(({ groupDevices }) => groupDevices === 0);
    }

    result.sort((a, b) => {
      if (sortBy === "name_asc") {
        return (a.group.teacher?.name || "").localeCompare(b.group.teacher?.name || "", i18n.language);
      }
      if (sortBy === "name_desc") {
        return (b.group.teacher?.name || "").localeCompare(a.group.teacher?.name || "", i18n.language);
      }
      if (sortBy === "most_booklets") {
        return b.group.rows.length - a.group.rows.length;
      }
      if (sortBy === "most_seats") {
        return b.groupSeats - a.groupSeats;
      }
      if (sortBy === "most_devices") {
        return b.groupDevices - a.groupDevices;
      }
      return 0;
    });

    return result;
  }, [teacherGroups, searchQuery, quotaFilter, deviceFilter, sortBy, i18n.language]);

  const hasActiveTeacherFilters = Boolean(
    searchQuery.trim() ||
    status !== "all" ||
    quotaFilter !== "all" ||
    deviceFilter !== "all" ||
    sortBy !== "name_asc"
  );

  const handleClearAllFilters = () => {
    setSearchQuery("");
    setStatus("all");
    setQuotaFilter("all");
    setDeviceFilter("all");
    setSortBy("name_asc");
    setTeacherListPage(1);
  };

  const paginatedTeacherGroups = useMemo(() => {
    if (perPage === "all") return filteredTeacherGroups;
    const limit = Number(perPage) || 25;
    const startIndex = (teacherListPage - 1) * limit;
    return filteredTeacherGroups.slice(startIndex, startIndex + limit);
  }, [filteredTeacherGroups, teacherListPage, perPage]);

  const totalTeacherPages = useMemo(() => {
    if (perPage === "all") return 1;
    const limit = Number(perPage) || 25;
    return Math.max(1, Math.ceil(filteredTeacherGroups.length / limit));
  }, [filteredTeacherGroups.length, perPage]);

  const filteredTeacherRows = useMemo(() => {
    if (!selectedTeacherGroup) return [];
    const [, group] = selectedTeacherGroup;
    let rows = [...group.rows];

    const q = bookletSearchQuery.trim().toLowerCase();
    if (q) {
      rows = rows.filter((instance) => {
        const title = getEBookletTitle(instance, "").toLowerCase();
        const displayTitle = String(instance.display_title || "").toLowerCase();
        const grade = String(instance.template?.grade_level || instance.grade_level || "").toLowerCase();
        const students = Array.isArray(instance.students) ? instance.students : [];
        const studentMatch = students.some((s) => {
          const sName = String(s.user?.name || "").toLowerCase();
          const sEmail = String(s.user?.email || "").toLowerCase();
          return sName.includes(q) || sEmail.includes(q);
        });
        return title.includes(q) || displayTitle.includes(q) || grade.includes(q) || studentMatch;
      });
    }

    if (bookletStatusFilter && bookletStatusFilter !== "all") {
      rows = rows.filter((instance) => instance.status === bookletStatusFilter);
    }

    if (bookletSortBy === "title_asc") {
      rows.sort((a, b) => getEBookletTitle(a, "").localeCompare(getEBookletTitle(b, ""), i18n.language));
    } else if (bookletSortBy === "title_desc") {
      rows.sort((a, b) => getEBookletTitle(b, "").localeCompare(getEBookletTitle(a, ""), i18n.language));
    } else if (bookletSortBy === "most_seats") {
      rows.sort((a, b) => numberValue(b.used_invites_count, b._count?.access_records || 0) - numberValue(a.used_invites_count, a._count?.access_records || 0));
    } else if (bookletSortBy === "expiry_asc") {
      rows.sort((a, b) => {
        const dateA = new Date(a.access_expires_at || a.expires_at || 0).getTime();
        const dateB = new Date(b.access_expires_at || b.expires_at || 0).getTime();
        return dateA - dateB;
      });
    }

    return rows;
  }, [selectedTeacherGroup, bookletSearchQuery, bookletStatusFilter, bookletSortBy, i18n.language]);

  const hasActiveBookletFilters = Boolean(
    bookletSearchQuery.trim() ||
    bookletStatusFilter !== "all" ||
    bookletSortBy !== "default"
  );

  const initialLoading = loading && instances.length === 0;

  const formatDate = (value, withTime = false) => {
    if (!value) return t("admin.instances.noExpiry");
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return t("admin.instances.noExpiry");
    return new Intl.DateTimeFormat(i18n.language, withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }).format(date);
  };

  const handleQuotaSave = async (instanceId) => {
    await updateQuota(instanceId, Number(quotaDrafts[instanceId] || 0));
    reloadInstances();
  };

  const handleRevoke = async (instanceId) => {
    if (!window.confirm(t("admin.instances.revokeConfirm"))) return;
    await revokeTeacherAccess(instanceId);
    reloadInstances();
  };

  const updateAccessCodeDraft = (instanceId, field, value) => {
    setAccessCodeDrafts((current) => ({
      ...current,
      [instanceId]: { ...(current[instanceId] || {}), [field]: value },
    }));
  };

  const updatePrintDraft = (instanceId, field, value) => {
    setPrintDrafts((current) => ({
      ...current,
      [instanceId]: { ...(current[instanceId] || {}), [field]: value },
    }));
  };

  const updatePrintFieldVisibility = (instanceId, field, visible) => {
    setPrintDrafts((current) => ({
      ...current,
      [instanceId]: {
        ...(current[instanceId] || {}),
        visibleFields: {
          ...normalizePrintFieldVisibility((current[instanceId] || {}).visibleFields),
          [field]: visible,
        },
      },
    }));
  };

  const togglePrintSection = (instanceId) => {
    setCollapsedPrintSections((current) => ({ ...current, [instanceId]: !current[instanceId] }));
  };

  const refreshPrintTemplates = async () => {
    const response = await listAccessCodePrintTemplates();
    const templates = Array.isArray(response?.data) ? response.data : [];
    setPrintTemplates(templates);
    return templates;
  };

  const refreshPrintPresets = async () => {
    const response = await listAccessCodePrintPresets({ active: true });
    const presets = Array.isArray(response?.data) ? response.data : [];
    setPrintPresets(presets);
    return presets;
  };

  const presetsByType = (type) => printPresets.filter((preset) => preset.preset_type === type || preset.presetType === type);

  const uploadPrintImage = async (file, target) => {
    if (!file) return null;
    const uploadedName = file.name || "";
    setPrintUploadState((current) => ({ ...current, [target]: "uploading" }));
    try {
      const response = await uploadAccessCodePrintImage(file, {
        owner_type: "e_booklet_access_code_print",
        file_type: "image",
      });
      const assetId = Number(response?.data?.id ?? response?.data?.data?.id ?? response?.id);
      if (!Number.isInteger(assetId) || assetId <= 0) {
        throw new Error("Upload completed without a saved file asset ID.");
      }
      setPrintUploadState((current) => ({ ...current, [target]: "done" }));
      setPrintUploadedAssets((current) => ({
        ...current,
        [target]: { assetId, name: uploadedName },
      }));
      return assetId;
    } catch (error) {
      setPrintUploadState((current) => ({ ...current, [target]: "error" }));
      setPrintUploadedAssets((current) => {
        const next = { ...current };
        delete next[target];
        return next;
      });
      throw error;
    }
  };

  const handleBackgroundUpload = async (event) => {
    const assetId = await uploadPrintImage(event.target.files?.[0], "background");
    if (assetId) {
      setTemplateDraft((current) => ({ ...current, backgroundFileAssetId: String(assetId) }));
    }
    event.target.value = "";
  };

  const handleTeacherImageUpload = async (instanceId, event) => {
    const assetId = await uploadPrintImage(event.target.files?.[0], `teacher-${instanceId}`);
    if (assetId) {
      updatePrintDraft(instanceId, "teacherImageFileAssetId", String(assetId));
    }
    event.target.value = "";
  };

  const loadAccessCodes = async (instance) => {
    const teacherId = instance.teacher?.id || instance.teacher_id;
    if (!teacherId) return;
    const response = await listAccessCodes({ bookletInstanceId: instance.id, teacherId });
    setExistingCodes((current) => ({ ...current, [instance.id]: Array.isArray(response?.data) ? response.data : [] }));
  };

  const loadPrintBatches = async (instance) => {
    const teacherId = instance.teacher?.id || instance.teacher_id;
    const response = await listAccessCodePrintBatches({ bookletInstanceId: instance.id, teacherId });
    setPrintBatchHistory((current) => ({ ...current, [instance.id]: Array.isArray(response?.data) ? response.data : [] }));
  };

  const toggleAccessPanel = async (instance) => {
    const nextKey = expandedAccessKey === instance.id ? null : instance.id;
    setExpandedInstanceKey(instance.id);
    setExpandedAccessKey(nextKey);
    if (nextKey) {
      await loadAccessCodes(instance);
      await loadPrintBatches(instance);
    }
  };

  const toggleInstance = (instanceId) => {
    const nextKey = expandedInstanceKey === instanceId ? null : instanceId;
    setExpandedInstanceKey(nextKey);
    if (!nextKey) {
      setExpandedAccessKey(null);
      setExpandedDeviceKey(null);
    }
  };

  const handleGenerateAccessCodes = async (instance) => {
    const draft = accessCodeDrafts[instance.id] || {};
    const payload = {
      bookletInstanceId: Number(instance.id),
      teacherId: Number(instance.teacher?.id || instance.teacher_id),
      termId: Number(draft.termId),
      kind: draft.kind || "paid",
      count: Number(draft.count || 1),
      maxRedemptions: Number(draft.maxRedemptions || 1),
      expiresAt: draft.expiresAt || null,
    };
    const response = await generateAccessCodes(payload);
    const codes = Array.isArray(response?.data?.codes) ? response.data.codes : [];
    setGeneratedCodes((current) => ({ ...current, [instance.id]: codes }));
    await loadAccessCodes(instance);
  };

  const handleGeneratePrintableBatch = async (instance) => {
    const accessDraft = accessCodeDrafts[instance.id] || {};
    const printDraft = printDrafts[instance.id] || {};
    const eBookletTitle = getEBookletTitle(instance, t("common.eBooklet"));
    const payload = {
      bookletInstanceId: Number(instance.id),
      teacherId: Number(instance.teacher?.id || instance.teacher_id),
      termId: Number(accessDraft.termId),
      templateId: Number(printDraft.templateId),
      kind: accessDraft.kind || "paid",
      count: Number(accessDraft.count || 1),
      maxRedemptions: 1,
      expiresAt: accessDraft.expiresAt || null,
      label: printDraft.batchName || `${eBookletTitle} - ${formatDate(new Date().toISOString(), true)}`,
      batchValues: {
        gradeClassText: printDraft.gradeClassText || eBookletTitle,
        registrationMethodText: printDraft.registrationMethodText || t("admin.instances.defaultRegistrationMethod", { defaultValue: "كود أو منصة" }),
        priceText: printDraft.priceText || null,
        redCustomText: printDraft.redCustomText || null,
      },
      visibleFields: normalizePrintFieldVisibility(printDraft.visibleFields),
      teacherImageFileAssetId: printDraft.teacherImageFileAssetId ? Number(printDraft.teacherImageFileAssetId) : null,
    };
    const response = await generateAccessCodePrintBatch(payload);
    const batch = response?.data?.batch || response?.data;
    const warning = response?.data?.warning;
    setPrintWarnings((current) => ({ ...current, [instance.id]: warning || null }));
    if (batch?.id) {
      setPrintBatches((current) => ({ ...current, [instance.id]: batch }));
      await downloadAccessCodePrintBatchPdf(batch.id, getPrintBatchPdfFilename(batch));
    }
    await loadAccessCodes(instance);
    await loadPrintBatches(instance);
  };

  const handlePreviewPrintableCard = async (instance) => {
    const printDraft = printDrafts[instance.id] || {};
    const eBookletTitle = getEBookletTitle(instance, t("common.eBooklet"));
    setPrintPreviewLoading((current) => ({ ...current, [instance.id]: true }));
    setPrintPreviewErrors((current) => ({ ...current, [instance.id]: "" }));
    try {
      const url = await previewAccessCodePrintCard({
        templateId: Number(printDraft.templateId),
        code: "KLM PREV IEW 001",
        teacherImageFileAssetId: printDraft.teacherImageFileAssetId ? Number(printDraft.teacherImageFileAssetId) : null,
        batchValues: {
          gradeClassText: printDraft.gradeClassText || eBookletTitle,
          registrationMethodText: printDraft.registrationMethodText || t("admin.instances.defaultRegistrationMethod", { defaultValue: "كود أو منصة" }),
          priceText: printDraft.priceText || null,
          redCustomText: printDraft.redCustomText || null,
        },
        visibleFields: normalizePrintFieldVisibility(printDraft.visibleFields),
      });
      setPrintPreviewUrls((current) => {
        if (current[instance.id]) URL.revokeObjectURL(current[instance.id]);
        return { ...current, [instance.id]: url };
      });
    } catch (error) {
      setPrintPreviewErrors((current) => ({
        ...current,
        [instance.id]: error?.response?.data?.message || error?.message || t("admin.instances.printPreviewFailed", { defaultValue: "Preview failed. Check the template and try again." }),
      }));
    } finally {
      setPrintPreviewLoading((current) => ({ ...current, [instance.id]: false }));
    }
  };

  const copyGeneratedCodes = async (instanceId) => {
    const codes = generatedCodes[instanceId] || [];
    const text = codes.map((item) => item.whatsappMessage || `${item.code} ${item.redeemUrl || ""}`.trim()).join("\n\n");
    if (!text) return;
    await navigator.clipboard?.writeText(text);
  };

  const handleExport = (lang = "ar") => {
    // On a single teacher's page, export just that teacher's booklets and
    // students (slim layout). On the all-teachers page keep the full export.
    if (selectedTeacherId) {
      exportData({
        resource: `admin/e-booklet-teachers/${selectedTeacherId}/students`,
        format: "xlsx",
        lang,
        rtl: lang === "ar",
      });
      return;
    }
    exportData({
      resource: "admin/e-booklet-instances",
      format: "xlsx",
      filters: status && status !== "all" ? { status } : {},
      lang,
      rtl: lang === "ar",
    });
  };

  // Per-booklet export: one Excel file for a single instance's students
  // (teacher, booklet title, and each student's details + access/opened status).
  const handleExportInstanceStudents = (instance) => {
    exportData({
      resource: `admin/e-booklet-instances/${instance.id}/students`,
      format: "xlsx",
      lang: "ar",
      rtl: true,
    });
  };


  return (
    <TooltipProvider delayDuration={150}>
    <motion.div className="space-y-4" data-testid="admin-e-booklet-instances-page" variants={pageMotion} initial="hidden" animate="show">
      <motion.section className="@container rounded-2xl border bg-background p-4 shadow-sm" layout>
        <div className="flex flex-col gap-3 @xl:flex-row @xl:items-center @xl:justify-between">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              <BookOpenCheck className="h-6 w-6 text-primary" />
              {t("admin.instances.title")}
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t("admin.instances.description")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select className="h-10 rounded-xl border bg-background px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="all">{t("statuses.all")}</option>
              <option value="active">{t("statuses.active")}</option>
              <option value="archived">{t("statuses.archived")}</option>
              <option value="suspended">{t("statuses.suspended")}</option>
            </select>
            <DropdownMenu dir={i18n.dir()}>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" className="rounded-xl" disabled={exportLoading} data-testid="admin-e-booklet-access-export-button">
                  <Download className="h-4 w-4" />
                  {t("admin.instances.exportExcel", { defaultValue: "Export Excel" })}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExport("ar")} disabled={exportLoading} data-testid="admin-e-booklet-access-export-ar">
                  {t("admin.instances.exportArabicRtl", { defaultValue: "Arabic RTL Excel" })}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("en")} disabled={exportLoading} data-testid="admin-e-booklet-access-export-en">
                  {t("admin.instances.exportEnglish", { defaultValue: "English Excel" })}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => reloadInstances()} disabled={loading}>
              <RefreshCcw className="h-4 w-4" />
              {t("common.refresh")}
            </Button>
          </div>
        </div>
        {exportLoading && exportProgress > 0 && (
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-sm text-muted-foreground">
              <span>{t("export.exporting", { defaultValue: "Exporting..." })}</span>
              <span>{exportProgress}%</span>
            </div>
            <Progress value={exportProgress} />
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
          <Badge variant="outline" className="rounded-lg px-2.5 py-1 font-medium">
            <span className="font-semibold text-foreground me-1">{summary.total}</span>
            {t("admin.instances.totalAccess", { defaultValue: "total access" })}
          </Badge>
          <Badge variant="outline" className="rounded-lg px-2.5 py-1 font-medium text-emerald-600">
            <span className="font-semibold me-1">{summary.active}</span>
            {t("statuses.active")}
          </Badge>
          <Badge variant="outline" className="rounded-lg px-2.5 py-1 font-medium">
            <span className="font-semibold text-foreground me-1">{summary.seats}/{summary.quota || 0}</span>
            {t("admin.instances.seats", { defaultValue: "seats" })}
          </Badge>
          <Badge variant="outline" className="rounded-lg px-2.5 py-1 font-medium">
            <span className="font-semibold text-foreground me-1">{summary.devices}</span>
            {t("teacher.invites.usedDevices")}
          </Badge>
        </div>
      </motion.section>

      {initialLoading && <div className="rounded-2xl border bg-background p-8 text-center text-sm text-muted-foreground shadow-sm">{t("admin.instances.loading")}</div>}
      {!initialLoading && !selectedTeacherId && instances.length === 0 && <div className="rounded-2xl border bg-background p-8 text-center text-sm text-muted-foreground shadow-sm">{t("admin.instances.empty")}</div>}

      {!initialLoading && !selectedTeacherId && teacherGroups.length > 0 && (
        <motion.section className="@container rounded-2xl border bg-background p-4 shadow-sm space-y-3" layout>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-full @3xl:flex-1 @3xl:min-w-[280px] @4xl:max-w-md shrink-0">
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                className="h-10 w-full rounded-xl ps-9 pe-9 text-sm"
                placeholder={t("admin.instances.searchPlaceholder", { defaultValue: "Search by teacher name, email, booklet, or student..." })}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={t("common.clear", { defaultValue: "Clear" })}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full @3xl:w-auto @3xl:justify-end">
              <select
                className="h-10 rounded-xl border bg-background px-3 text-xs font-medium text-foreground @sm:text-sm flex-1 @sm:flex-initial shrink-0 min-w-[130px]"
                value={quotaFilter}
                onChange={(e) => setQuotaFilter(e.target.value)}
                aria-label={t("admin.instances.filterByQuota", { defaultValue: "Quota status" })}
              >
                <option value="all">{t("admin.instances.allQuotas", { defaultValue: "All quotas" })}</option>
                <option value="near_over">{t("admin.instances.nearOrOverQuota", { defaultValue: "Near / Over quota (≥80%)" })}</option>
                <option value="available">{t("admin.instances.availableQuota", { defaultValue: "Available capacity (<80%)" })}</option>
                <option value="full">{t("admin.instances.fullQuota", { defaultValue: "Full quota (100%)" })}</option>
                <option value="zero">{t("admin.instances.zeroUsage", { defaultValue: "Zero seats used" })}</option>
              </select>

              <select
                className="h-10 rounded-xl border bg-background px-3 text-xs font-medium text-foreground @sm:text-sm flex-1 @sm:flex-initial shrink-0 min-w-[130px]"
                value={deviceFilter}
                onChange={(e) => setDeviceFilter(e.target.value)}
                aria-label={t("admin.instances.filterByDevices", { defaultValue: "Device activity" })}
              >
                <option value="all">{t("admin.instances.allDevices", { defaultValue: "All devices" })}</option>
                <option value="has_devices">{t("admin.instances.hasActiveDevices", { defaultValue: "Has active devices" })}</option>
                <option value="no_devices">{t("admin.instances.noActiveDevices", { defaultValue: "No active devices" })}</option>
              </select>

              <div className="flex items-center gap-1.5 flex-1 @sm:flex-initial shrink-0 min-w-[150px]">
                <ArrowUpDown className="h-4 w-4 text-muted-foreground shrink-0 hidden @sm:inline" />
                <select
                  className="h-10 w-full rounded-xl border bg-background px-3 text-xs font-medium text-foreground @sm:text-sm"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  aria-label={t("admin.instances.sortBy", { defaultValue: "Sort by" })}
                >
                  <option value="name_asc">{t("admin.instances.sortTeacherAsc", { defaultValue: "Teacher name (A-Z)" })}</option>
                  <option value="name_desc">{t("admin.instances.sortTeacherDesc", { defaultValue: "Teacher name (Z-A)" })}</option>
                  <option value="most_booklets">{t("admin.instances.sortMostBooklets", { defaultValue: "Most e-booklets" })}</option>
                  <option value="most_seats">{t("admin.instances.sortMostSeats", { defaultValue: "Most seats used" })}</option>
                  <option value="most_devices">{t("admin.instances.sortMostDevices", { defaultValue: "Most active devices" })}</option>
                </select>
              </div>

              <select
                className="h-10 rounded-xl border bg-background px-3 text-xs font-medium text-foreground @sm:text-sm flex-1 @sm:flex-initial shrink-0 min-w-[90px]"
                value={perPage}
                onChange={(e) => setPerPage(e.target.value)}
                aria-label={t("admin.instances.perPage", { defaultValue: "Per page" })}
              >
                <option value="10">10 / {t("admin.instances.perPage", { defaultValue: "page" })}</option>
                <option value="25">25 / {t("admin.instances.perPage", { defaultValue: "page" })}</option>
                <option value="50">50 / {t("admin.instances.perPage", { defaultValue: "page" })}</option>
                <option value="100">100 / {t("admin.instances.perPage", { defaultValue: "page" })}</option>
                <option value="all">{t("admin.instances.all", { defaultValue: "All" })}</option>
              </select>

              {hasActiveTeacherFilters && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleClearAllFilters}
                  className="h-10 rounded-xl text-xs gap-1.5 text-muted-foreground hover:text-foreground shrink-0"
                >
                  <X className="h-4 w-4" />
                  {t("admin.instances.clearFilters", { defaultValue: "Clear filters" })}
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 @sm:flex-row @sm:items-center @sm:justify-between border-t pt-2.5 text-xs text-muted-foreground">
            <div className="flex flex-wrap items-center gap-1.5">
              <span>
                {hasActiveTeacherFilters
                  ? t("admin.instances.showingFilteredTeachers", {
                      defaultValue: "Showing {{shown}} of {{total}} teachers (filtered from {{all}})",
                      shown: paginatedTeacherGroups.length,
                      total: filteredTeacherGroups.length,
                      all: teacherGroups.length,
                    })
                  : t("admin.instances.showingTeachersCount", {
                      defaultValue: "Showing {{shown}} of {{total}} teachers",
                      shown: paginatedTeacherGroups.length,
                      total: teacherGroups.length,
                    })}
              </span>

              {searchQuery && (
                <Badge variant="secondary" className="gap-1 rounded-lg text-xs font-normal">
                  <Search className="h-3 w-3" />
                  "{searchQuery}"
                  <button type="button" onClick={() => setSearchQuery("")} className="hover:text-foreground">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              {status !== "all" && (
                <Badge variant="secondary" className="gap-1 rounded-lg text-xs font-normal">
                  {t(`statuses.${status}`)}
                  <button type="button" onClick={() => setStatus("all")} className="hover:text-foreground">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              {quotaFilter !== "all" && (
                <Badge variant="secondary" className="gap-1 rounded-lg text-xs font-normal">
                  {quotaFilter === "near_over" && t("admin.instances.nearOrOverQuota")}
                  {quotaFilter === "available" && t("admin.instances.availableQuota")}
                  {quotaFilter === "full" && t("admin.instances.fullQuota")}
                  {quotaFilter === "zero" && t("admin.instances.zeroUsage")}
                  <button type="button" onClick={() => setQuotaFilter("all")} className="hover:text-foreground">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              {deviceFilter !== "all" && (
                <Badge variant="secondary" className="gap-1 rounded-lg text-xs font-normal">
                  {deviceFilter === "has_devices" ? t("admin.instances.hasActiveDevices") : t("admin.instances.noActiveDevices")}
                  <button type="button" onClick={() => setDeviceFilter("all")} className="hover:text-foreground">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
            </div>

            {totalTeacherPages > 1 && (
              <div className="flex items-center gap-1 font-medium shrink-0">
                <span>{teacherListPage} / {totalTeacherPages}</span>
              </div>
            )}
          </div>
        </motion.section>
      )}

      {!initialLoading && !selectedTeacherId && teacherGroups.length > 0 && filteredTeacherGroups.length === 0 && (
        <div className="rounded-2xl border bg-background p-8 text-center shadow-sm space-y-3">
          <SlidersHorizontal className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <p className="text-sm text-muted-foreground">{t("admin.instances.noResultsFound", { defaultValue: "No teachers match your search or filter criteria." })}</p>
          <Button type="button" variant="outline" size="sm" onClick={handleClearAllFilters} className="rounded-xl">
            <X className="h-4 w-4" />
            {t("admin.instances.clearFilters", { defaultValue: "Clear filters" })}
          </Button>
        </div>
      )}

      {!initialLoading && !selectedTeacherId && paginatedTeacherGroups.length > 0 && (
        <motion.section className="@container overflow-hidden rounded-2xl border bg-background shadow-sm" variants={listMotion} initial="hidden" animate="show">
          <div className="hidden @lg:grid @lg:grid-cols-[minmax(0,1.8fr)_150px_180px_140px] gap-3 border-b bg-muted/25 px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground @lg:items-center">
            <span>{t("common.teacher", { defaultValue: "Teacher" })}</span>
            <span>{t("admin.instances.eBooklets", { defaultValue: "E-booklets" })}</span>
            <span>{t("admin.instances.seats", { defaultValue: "Seats" })}</span>
            <span className="text-end">{t("common.actions", { defaultValue: "Actions" })}</span>
          </div>
          <div className="divide-y">
            {paginatedTeacherGroups.map(({ teacherId, group, groupSeats, groupQuota, groupDevices, activeCount }) => {
              return (
                <motion.article key={teacherId} className="bg-card" variants={rowMotion}>
                  <div className="flex flex-col gap-3 px-4 py-4 @lg:grid @lg:grid-cols-[minmax(0,1.8fr)_150px_180px_140px] @lg:items-center">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{group.teacher?.name || t("common.teacher")}</div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">{group.teacher?.email || t("admin.instances.teacherMissing")}</div>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-semibold text-foreground">{group.rows.length}</span>
                      <span className="text-muted-foreground">{t("admin.instances.eBooklets", { defaultValue: "e-booklets" })}</span>
                      <Badge variant={activeCount === group.rows.length ? "secondary" : "outline"} className="rounded-full text-[11px]">
                        {activeCount} {t("statuses.active")}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <span className="font-semibold text-foreground">{groupSeats}/{groupQuota || 0}</span> {t("admin.instances.seats", { defaultValue: "seats" })}
                    </div>
                    <div className="flex @lg:justify-end shrink-0">
                      <Button asChild variant="outline" size="sm" className="w-full @lg:w-auto rounded-xl">
                        <Link to={`/admin/e-booklets/access/teachers/${teacherId}`}>
                          {t("admin.instances.viewTeacherDetails", { defaultValue: "View details" })}
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </motion.article>
              );
            })}
          </div>
        </motion.section>
      )}

      {!initialLoading && selectedTeacherId && !selectedTeacherGroup && (
        <div className="rounded-2xl border bg-background p-8 text-center shadow-sm">
          <p className="text-sm text-muted-foreground">{t("admin.instances.teacherNotFound", { defaultValue: "This teacher is not available in the current access list." })}</p>
          <Button asChild variant="outline" className="mt-4 rounded-xl">
            <Link to="/admin/e-booklets/access"><ArrowLeft className="h-4 w-4" />{t("admin.instances.backToTeachers", { defaultValue: "All teachers" })}</Link>
          </Button>
        </div>
      )}

      {!initialLoading && selectedTeacherGroup && (
        <motion.div className="space-y-3" variants={listMotion} initial="hidden" animate="show">
          {[selectedTeacherGroup].map(([teacherId, group]) => {
            const groupSeats = group.rows.reduce((sum, instance) => sum + numberValue(instance.used_invites_count, instance._count?.access_records || 0), 0);
            const groupQuota = group.rows.reduce((sum, instance) => sum + numberValue(instance.invite_quota), 0);

            return (
              <motion.section key={teacherId} className="@container overflow-hidden rounded-2xl border bg-background shadow-sm" variants={rowMotion} layout>
                <div className="flex flex-col gap-3 border-b bg-muted/25 px-4 py-3 @md:flex-row @md:items-center @md:justify-between">
                  <div className="min-w-0">
                    <Button asChild variant="ghost" size="sm" className="-ms-2 mb-2 rounded-xl">
                      <Link to="/admin/e-booklets/access"><ArrowLeft className="h-4 w-4" />{t("admin.instances.backToTeachers", { defaultValue: "All teachers" })}</Link>
                    </Button>
                    <h2 className="truncate text-base font-semibold">{group.teacher?.name || t("common.teacher")}</h2>
                    <p className="truncate text-xs text-muted-foreground">{group.teacher?.email || t("admin.instances.teacherMissing")}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{group.rows.length} {t("admin.instances.eBooklets", { defaultValue: "e-booklets" })}</Badge>
                    <Badge variant="secondary">{t("admin.instances.seatsSummary", { defaultValue: "{{used}}/{{quota}} seats", used: groupSeats, quota: groupQuota || 0 })}</Badge>
                  </div>
                </div>

                <div className="border-b bg-background p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="relative w-full @2xl:flex-1 @2xl:min-w-[240px] @3xl:max-w-sm shrink-0">
                      <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                      <Input
                        className="h-9 w-full rounded-xl ps-9 pe-9 text-xs @sm:text-sm"
                        placeholder={t("admin.instances.searchBookletsPlaceholder", { defaultValue: "Search by booklet title or student..." })}
                        value={bookletSearchQuery}
                        onChange={(e) => setBookletSearchQuery(e.target.value)}
                      />
                      {bookletSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setBookletSearchQuery("")}
                          className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          aria-label={t("common.clear", { defaultValue: "Clear" })}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 w-full @2xl:w-auto @2xl:justify-end">
                      <select
                        className="h-9 rounded-xl border bg-background px-2.5 text-xs text-foreground flex-1 @sm:flex-initial shrink-0 min-w-[110px]"
                        value={bookletStatusFilter}
                        onChange={(e) => setBookletStatusFilter(e.target.value)}
                      >
                        <option value="all">{t("statuses.all")}</option>
                        <option value="active">{t("statuses.active")}</option>
                        <option value="archived">{t("statuses.archived")}</option>
                        <option value="suspended">{t("statuses.suspended")}</option>
                      </select>
                      <select
                        className="h-9 rounded-xl border bg-background px-2.5 text-xs text-foreground flex-1 @sm:flex-initial shrink-0 min-w-[130px]"
                        value={bookletSortBy}
                        onChange={(e) => setBookletSortBy(e.target.value)}
                      >
                        <option value="default">{t("admin.instances.sortBy", { defaultValue: "Sort by" })}</option>
                        <option value="title_asc">{t("admin.instances.sortBookletTitleAsc", { defaultValue: "Title (A-Z)" })}</option>
                        <option value="title_desc">{t("admin.instances.sortBookletTitleDesc", { defaultValue: "Title (Z-A)" })}</option>
                        <option value="most_seats">{t("admin.instances.sortBookletSeats", { defaultValue: "Most seats used" })}</option>
                        <option value="expiry_asc">{t("admin.instances.sortBookletExpiry", { defaultValue: "Expiry date" })}</option>
                      </select>
                      {hasActiveBookletFilters && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => { setBookletSearchQuery(""); setBookletStatusFilter("all"); setBookletSortBy("default"); }}
                          className="h-9 rounded-xl text-xs gap-1 text-muted-foreground hover:text-foreground shrink-0"
                        >
                          <X className="h-3.5 w-3.5" />
                          {t("admin.instances.clearFilters", { defaultValue: "Clear" })}
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {hasActiveBookletFilters
                      ? t("admin.instances.showingFilteredBooklets", {
                          defaultValue: "Showing {{shown}} of {{total}} e-booklets (filtered from {{all}})",
                          shown: filteredTeacherRows.length,
                          total: filteredTeacherRows.length,
                          all: group.rows.length,
                        })
                      : t("admin.instances.showingBookletsCount", {
                          defaultValue: "Showing {{shown}} of {{total}} e-booklets",
                          shown: filteredTeacherRows.length,
                          total: group.rows.length,
                        })}
                  </div>
                </div>

                {filteredTeacherRows.length === 0 && (
                  <div className="p-8 text-center text-xs text-muted-foreground @sm:text-sm">
                    <p>{t("admin.instances.noBookletsFound", { defaultValue: "No e-booklets match your search criteria for this teacher." })}</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => { setBookletSearchQuery(""); setBookletStatusFilter("all"); setBookletSortBy("default"); }}
                      className="mt-3 rounded-xl"
                    >
                      <X className="h-3.5 w-3.5" />
                      {t("admin.instances.clearFilters", { defaultValue: "Clear filters" })}
                    </Button>
                  </div>
                )}

                <div className="divide-y">
                  {filteredTeacherRows.map((instance) => {
                    const usedSeats = numberValue(instance.used_invites_count, instance._count?.access_records || 0);
                    const usedDevices = optionalNumberValue(instance.used_devices_count ?? instance.active_devices_count ?? instance.devices_count);
                    const students = Array.isArray(instance.students) ? instance.students : [];
                    const quota = numberValue(quotaDrafts[instance.id]);
                    const quotaPercent = quota > 0 ? Math.min(100, Math.round((usedSeats / quota) * 100)) : 0;
                    const accessExpanded = expandedAccessKey === instance.id;
                    const instanceExpanded = expandedInstanceKey === instance.id;
                    const eBookletTitle = getEBookletTitle(instance, t("common.eBooklet"));
                    const unusedActivePaidCodes = (existingCodes[instance.id] || []).filter((code) => code.kind === "paid" && code.status === "active" && Number(code.redeemed_count || 0) === 0).length;
                    const remainingSeats = Math.max(0, quota - usedSeats);
                    const showSeatWarning = unusedActivePaidCodes > remainingSeats;
                    const printSectionCollapsed = Boolean(collapsedPrintSections[instance.id]);
                    const printDraft = printDrafts[instance.id] || {};
                    const teacherUploadTarget = `teacher-${instance.id}`;
                    const teacherUploadStatus = printUploadState[teacherUploadTarget];
                    const teacherUploadedAsset = printUploadedAssets[teacherUploadTarget];
                    const teacherImageUploading = teacherUploadStatus === "uploading";
                    const canGeneratePrintableBatch = Boolean(
                      accessCodeDrafts[instance.id]?.termId
                      && printDraft.templateId
                      && (instance.teacher?.id || instance.teacher_id)
                      && !teacherImageUploading
                    );

                    return (
                      <motion.article key={instance.id} className="bg-card" variants={rowMotion} layout="position">
                        <motion.button type="button" className="flex flex-col gap-2.5 p-4 text-left transition hover:bg-muted/30 @lg:grid @lg:grid-cols-[minmax(0,1.8fr)_100px_120px_110px_140px_110px] @lg:items-center w-full" onClick={() => toggleInstance(instance.id)} aria-expanded={instanceExpanded} whileHover={{ backgroundColor: "var(--muted)" }} whileTap={{ scale: 0.995 }} transition={{ duration: 0.12 }}>
                          <div className="flex min-w-0 items-center gap-2">
                            <motion.span animate={{ rotate: instanceExpanded ? 90 : 0 }} transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}>
                              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                            </motion.span>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold" title={eBookletTitle}>{eBookletTitle}</div>
                              <div className="truncate text-xs text-muted-foreground">{instance.template_version?.version_label || instance.template_version?.version_number || t("common.version")}</div>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground @lg:contents">
                            <Badge className="w-fit" variant={instance.status === "active" ? "default" : "outline"}>{t(`statuses.${instance.status}`, { defaultValue: instance.status })}</Badge>
                            <div><span className="font-medium text-foreground">{usedSeats}/{quota || 0}</span> {t("admin.instances.seats", { defaultValue: "seats" })}</div>
                            <div><span className="font-medium text-foreground">{students.length}</span> {t("common.student", { defaultValue: "students" })}</div>
                            <div><span className="font-medium text-foreground">{usedDevices === null ? "-" : usedDevices}</span> {t("teacher.invites.usedDevices")}</div>
                            <div className="@lg:text-right">{formatDate(instance.access_expires_at || instance.expires_at)}</div>
                          </div>
                        </motion.button>

                        <AnimatePresence initial={false}>
                          {instanceExpanded && (
                          <motion.div className="overflow-hidden border-t bg-muted/10" variants={panelMotion} initial="hidden" animate="show" exit="exit">
                          <div className="@container/instance space-y-4 p-4">
                            <div className="grid gap-4 @xl/instance:grid-cols-[1fr_340px] @3xl/instance:grid-cols-[1fr_380px]">
                              <div className="space-y-3 rounded-2xl border bg-background p-4 shadow-sm">
                                <div className="flex items-center justify-between text-xs text-muted-foreground">
                                  <span>{t("admin.instances.capacity", { defaultValue: "Seat capacity" })}</span>
                                  <span className="font-semibold text-foreground">{quotaPercent}%</span>
                                </div>
                                <div className="h-2 overflow-hidden rounded-full bg-muted">
                                  <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${quotaPercent}%` }} />
                                </div>
                                <div className="grid gap-2 grid-cols-1 @xs/instance:grid-cols-3">
                                  <div className="rounded-xl bg-muted/50 p-3 text-sm">
                                    <div className="font-semibold text-foreground">{usedSeats}</div>
                                    <div className="text-xs text-muted-foreground">{t("admin.instances.usedStudentSeats", { defaultValue: "Used student seats" })}</div>
                                  </div>
                                  <div className="rounded-xl bg-muted/50 p-3 text-sm">
                                    <div className="font-semibold text-foreground">{quota || 0}</div>
                                    <div className="text-xs text-muted-foreground">{t("admin.instances.studentSeatQuota", { defaultValue: "Student seat quota" })}</div>
                                  </div>
                                  <div className="rounded-xl bg-muted/50 p-3 text-sm">
                                    <div className="font-semibold text-foreground">{usedDevices === null ? "-" : usedDevices}</div>
                                    <div className="text-xs text-muted-foreground">{t("teacher.invites.usedDevices")}</div>
                                  </div>
                                </div>
                              </div>

                              <div className="flex flex-col justify-between gap-3 rounded-2xl border bg-background p-4 shadow-sm">
                                <div className="flex items-center gap-2">
                                  <Input
                                    className="h-10 rounded-xl"
                                    type="number"
                                    min="0"
                                    value={quotaDrafts[instance.id] ?? 0}
                                    onChange={(event) => setQuotaDrafts((current) => ({ ...current, [instance.id]: event.target.value }))}
                                  />
                                  <Button
                                    type="button"
                                    className="rounded-xl shrink-0"
                                    variant="outline"
                                    onClick={() => handleQuotaSave(instance.id)}
                                    title={t("common.save")}
                                  >
                                    <Save className="h-4 w-4" />
                                    {t("common.save")}
                                  </Button>
                                </div>
                                <div className="grid gap-2 grid-cols-1 @xs/instance:grid-cols-2">
                                  <Button asChild size="sm" variant="outline" className="justify-start rounded-xl">
                                    <Link to={`/admin/e-booklets/access/${instance.id}/students`}>
                                      <Users className="h-4 w-4" />
                                      {t("admin.instances.showStudents")}
                                    </Link>
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="justify-start rounded-xl"
                                    onClick={() => handleExportInstanceStudents(instance)}
                                    disabled={exportLoading}
                                    data-testid={`admin-e-booklet-instance-export-${instance.id}`}
                                  >
                                    <Download className="h-4 w-4" />
                                    {t("admin.instances.exportStudents", { defaultValue: "تصدير الطلاب" })}
                                  </Button>
                                  <Button asChild size="sm" variant="outline" className="justify-start rounded-xl">
                                    <Link to={`/admin/e-booklets/access/${instance.id}/view`}>
                                      <Eye className="h-4 w-4" />
                                      {t("admin.instances.adminView")}
                                    </Link>
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant={accessExpanded ? "default" : "outline"}
                                    className="justify-start rounded-xl"
                                    onClick={() => toggleAccessPanel(instance)}
                                  >
                                    <KeyRound className="h-4 w-4" />
                                    {t("admin.instances.accessCodes", { defaultValue: "Access codes" })}
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="justify-start rounded-xl text-destructive hover:text-destructive"
                                    onClick={() => handleRevoke(instance.id)}
                                    disabled={instance.status !== "active"}
                                  >
                                    <ShieldOff className="h-4 w-4" />
                                    {t("admin.instances.revoke")}
                                  </Button>
                                </div>
                              </div>
                            </div>

                            <div className="rounded-2xl border bg-background p-4 shadow-sm">
                              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                                <Users className="h-4 w-4 text-primary" />
                                {t("admin.instances.nestedStudents", { defaultValue: "Students with access" })}
                                <Badge variant="outline">{students.length}</Badge>
                              </div>
                              {students.length === 0 ? (
                                <div className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
                                  {t("admin.instances.noStudents", { defaultValue: "No students have active access yet." })}
                                </div>
                              ) : (
                                <div className="grid gap-3 grid-cols-1 @lg/instance:grid-cols-2">
                                  {students.map((student) => {
                                    const studentUserId = student.user_id || student.user?.id;
                                    const devicePanelKey = `${instance.id}-${studentUserId}`;
                                    const devicesExpanded = expandedDeviceKey === devicePanelKey;
                                    return (
                                      <div key={student.id || devicePanelKey} className="@container/student rounded-xl border bg-card p-3.5 text-xs shadow-xs space-y-2.5">
                                        <div className="flex flex-col gap-2 @sm/student:flex-row @sm/student:items-start @sm/student:justify-between">
                                          <div className="min-w-0">
                                            <div className="truncate text-sm font-medium text-foreground">
                                              {student.user?.name || student.user?.email || t("common.student", { defaultValue: "Student" })}
                                            </div>
                                            <div className="truncate text-muted-foreground">
                                              {student.user?.email || `ID ${studentUserId}`}
                                            </div>
                                          </div>
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            className="rounded-xl shrink-0"
                                            onClick={() => setExpandedDeviceKey(devicesExpanded ? null : devicePanelKey)}
                                          >
                                            <HardDrive className="h-4 w-4" />
                                            {devicesExpanded ? t("admin.instances.hideDevicesInline") : t("admin.instances.manageDevicesInline")}
                                          </Button>
                                        </div>
                                        <div className="grid gap-2 rounded-lg bg-muted/50 p-2.5 grid-cols-1 @sm/student:grid-cols-3 text-muted-foreground">
                                          <div><span className="font-medium text-foreground">{t("admin.instances.devices", { defaultValue: "Devices" })}:</span> {student.devices_summary?.active_count ?? 0}/{student.devices_summary?.allowed_devices ?? 1}</div>
                                          <div><span className="font-medium text-foreground">{t("admin.instances.viewerOpens", { defaultValue: "Viewer opens" })}:</span> {student.analytics_summary?.viewer_opened ?? 0}</div>
                                          <div className="truncate"><span className="font-medium text-foreground">{t("admin.instances.source", { defaultValue: "Source" })}:</span> {student.purchase_reference?.source || student.analytics_summary?.source || student.access_source || "-"}</div>
                                        </div>
                                        {devicesExpanded && (
                                          <AdminEBookletStudentDevicePanel
                                            instanceId={instance.id}
                                            userId={studentUserId}
                                            student={student}
                                            expanded={devicesExpanded}
                                            onSummaryRefresh={() => reloadInstances()}
                                          />
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            <AnimatePresence initial={false}>
                              {accessExpanded && (
                                <motion.div
                                  className="@container/access overflow-hidden rounded-2xl border bg-background shadow-sm"
                                  data-testid="admin-e-booklet-access-code-panel"
                                  variants={panelMotion}
                                  initial="hidden"
                                  animate="show"
                                  exit="exit"
                                >
                                  <div className="space-y-4 p-4">
                                    <div className="flex flex-col gap-2 @sm/access:flex-row @sm/access:items-center @sm/access:justify-between border-b pb-3">
                                      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                        <KeyRound className="h-4 w-4 text-primary" />
                                        {t("admin.instances.accessCodes", { defaultValue: "Access codes" })}
                                      </div>
                                      <Button type="button" size="sm" variant="outline" className="rounded-xl shrink-0" onClick={() => loadAccessCodes(instance)}>
                                        <RefreshCcw className="h-3.5 w-3.5" />
                                        {t("common.refresh")}
                                      </Button>
                                    </div>

                                    <TooltipProvider delayDuration={150}>
                                      <div className="grid gap-3 grid-cols-1 @xs/access:grid-cols-2 @md/access:grid-cols-3 @xl/access:grid-cols-5 items-start">
                                        <label className="flex flex-col justify-start gap-1.5 text-xs font-medium text-muted-foreground min-w-0">
                                          <div className="flex h-5 items-center gap-1 leading-none">
                                            <AccessCodeFieldLabel tooltip={t("admin.instances.selectTermTooltip", { defaultValue: "Choose the active term or policy these codes belong to. Milestones and rewards are calculated under that term." })}>
                                              {t("admin.instances.selectTerm", { defaultValue: "Select term" })}
                                            </AccessCodeFieldLabel>
                                          </div>
                                          <select
                                            className="h-10 w-full rounded-xl border bg-background px-3 text-sm text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
                                            value={accessCodeDrafts[instance.id]?.termId || ""}
                                            onChange={(event) => updateAccessCodeDraft(instance.id, "termId", event.target.value)}
                                          >
                                            <option value="">{t("admin.instances.selectTerm", { defaultValue: "Select term" })}</option>
                                            {terms.map((term) => (
                                              <option key={term.id} value={String(term.id)}>{term.name}</option>
                                            ))}
                                          </select>
                                        </label>

                                        <label className="flex flex-col justify-start gap-1.5 text-xs font-medium text-muted-foreground min-w-0">
                                          <div className="flex h-5 items-center gap-1 leading-none">
                                            <AccessCodeFieldLabel tooltip={t("admin.instances.codeTypeTooltip", { defaultValue: "Paid codes count toward paid redemptions and milestones. Free codes grant access without counting as paid." })}>
                                              {t("admin.instances.codeType", { defaultValue: "Code type" })}
                                            </AccessCodeFieldLabel>
                                          </div>
                                          <select
                                            className="h-10 w-full rounded-xl border bg-background px-3 text-sm text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
                                            value={accessCodeDrafts[instance.id]?.kind || "paid"}
                                            onChange={(event) => updateAccessCodeDraft(instance.id, "kind", event.target.value)}
                                          >
                                            <option value="paid">{t("admin.instances.paidCode", { defaultValue: "Paid" })}</option>
                                            <option value="free">{t("admin.instances.freeCode", { defaultValue: "Free" })}</option>
                                          </select>
                                        </label>

                                        <label className="flex flex-col justify-start gap-1.5 text-xs font-medium text-muted-foreground min-w-0">
                                          <div className="flex h-5 items-center gap-1 leading-none">
                                            <AccessCodeFieldLabel tooltip={t("admin.instances.codeCountTooltip", { defaultValue: "How many unique access codes to create in this batch." })}>
                                              {t("admin.instances.codeCount", { defaultValue: "Code count" })}
                                            </AccessCodeFieldLabel>
                                          </div>
                                          <Input
                                            className="h-10 w-full rounded-xl text-foreground"
                                            type="number"
                                            min="1"
                                            max="100"
                                            value={accessCodeDrafts[instance.id]?.count || "1"}
                                            onChange={(event) => updateAccessCodeDraft(instance.id, "count", event.target.value)}
                                          />
                                        </label>

                                        <label className="flex flex-col justify-start gap-1.5 text-xs font-medium text-muted-foreground min-w-0">
                                          <div className="flex h-5 items-center gap-1 leading-none">
                                            <AccessCodeFieldLabel tooltip={t("admin.instances.maxRedemptionsTooltip", { defaultValue: "How many students can use each individual code. Use 1 when every student should receive a private code." })}>
                                              {t("admin.instances.maxRedemptions", { defaultValue: "Max redemptions" })}
                                            </AccessCodeFieldLabel>
                                          </div>
                                          <Input
                                            className="h-10 w-full rounded-xl text-foreground"
                                            type="number"
                                            min="1"
                                            value={accessCodeDrafts[instance.id]?.maxRedemptions || "1"}
                                            onChange={(event) => updateAccessCodeDraft(instance.id, "maxRedemptions", event.target.value)}
                                          />
                                        </label>

                                        <label className="flex flex-col justify-start gap-1.5 text-xs font-medium text-muted-foreground min-w-0">
                                          <div className="flex h-5 items-center gap-1 leading-none">
                                            <span>{t("admin.instances.expiresAt", { defaultValue: "Expiry date" })}</span>
                                          </div>
                                          <Input
                                            className="h-10 w-full rounded-xl text-foreground"
                                            type="date"
                                            value={accessCodeDrafts[instance.id]?.expiresAt || ""}
                                            onChange={(event) => updateAccessCodeDraft(instance.id, "expiresAt", event.target.value)}
                                          />
                                        </label>
                                      </div>
                                    </TooltipProvider>

                                    <div className="flex flex-wrap items-center gap-2 pt-1">
                                      <Button
                                        type="button"
                                        size="sm"
                                        className="rounded-xl"
                                        onClick={() => handleGenerateAccessCodes(instance)}
                                        disabled={!accessCodeDrafts[instance.id]?.termId || !(instance.teacher?.id || instance.teacher_id)}
                                      >
                                        {t("admin.instances.generateCodes", { defaultValue: "Generate codes" })}
                                      </Button>
                                      {(generatedCodes[instance.id] || []).length > 0 && (
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          className="rounded-xl"
                                          onClick={() => copyGeneratedCodes(instance.id)}
                                        >
                                          <Copy className="h-4 w-4" />
                                          {t("admin.instances.copyGeneratedCodes", { defaultValue: "Copy generated codes" })}
                                        </Button>
                                      )}
                                    </div>

                                    <div className="@container/print space-y-3.5 rounded-2xl border bg-muted/20 p-3.5 sm:p-4">
                                      <div className="flex flex-col gap-2 @sm/print:flex-row @sm/print:items-start @sm/print:justify-between">
                                        <div className="min-w-0">
                                          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                            <Printer className="h-4 w-4 text-primary" />
                                            {t("admin.instances.printableBatch", { defaultValue: "Printable PDF batch" })}
                                          </div>
                                          <p className="mt-1 text-xs text-muted-foreground">
                                            {t("admin.instances.printableBatchDescription", { defaultValue: "Creates one printed access-code card per student with QR login prefill." })}
                                          </p>
                                        </div>
                                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                                          {printBatches[instance.id]?.id && (
                                            <Button
                                              type="button"
                                              size="sm"
                                              variant="outline"
                                              className="rounded-xl"
                                              onClick={() => downloadAccessCodePrintBatchPdf(printBatches[instance.id].id, getPrintBatchPdfFilename(printBatches[instance.id]))}
                                            >
                                              <FileText className="h-4 w-4" />
                                              {t("admin.instances.downloadLastPdf", { defaultValue: "Download last PDF" })}
                                            </Button>
                                          )}
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            className="rounded-xl"
                                            onClick={() => togglePrintSection(instance.id)}
                                            aria-expanded={!printSectionCollapsed}
                                          >
                                            {printSectionCollapsed ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
                                            {printSectionCollapsed
                                              ? t("admin.instances.expandPrintSection", { defaultValue: "Show print section" })
                                              : t("admin.instances.minimizePrintSection", { defaultValue: "Minimize" })}
                                          </Button>
                                        </div>
                                      </div>

                                      <AnimatePresence initial={false}>
                                        {!printSectionCollapsed && (
                                          <motion.div className="space-y-4 pt-1" variants={panelMotion} initial="hidden" animate="show" exit="exit">
                                            <div className="@container/guide rounded-xl border border-primary/20 bg-primary/5 p-3.5 sm:p-4 overflow-hidden">
                                              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                                                <HelpCircle className="h-4 w-4 shrink-0 text-primary" />
                                                <span>{t("admin.instances.printSystemGuideTitle", { defaultValue: "طريقة استخدام نظام طباعة أكواد الكتيبات" })}</span>
                                              </div>
                                              <div className="grid gap-2.5 grid-cols-1 @lg/guide:grid-cols-2 text-xs leading-relaxed text-muted-foreground">
                                                {[
                                                  t("admin.instances.printSystemGuideStep1", { defaultValue: "اختر قالب الطباعة المناسب للكارت الثابت 827 x 438 بكسل." }),
                                                  t("admin.instances.printSystemGuideStep2", { defaultValue: "ارفع صورة المدرس من هنا إذا كان الكارت يحتاجها. لا يتم سحبها من ملف المدرس." }),
                                                  t("admin.instances.printSystemGuideStep3", { defaultValue: "املأ الصف أو المجموعة وطريقة التسجيل والسعر الاختياري، واترك النص الأحمر حسب الحاجة." }),
                                                  t("admin.instances.printSystemGuideStep4", { defaultValue: "حدد عدد الأكواد ونوعها وتاريخ الانتهاء من حقول أكواد الوصول بالأعلى." }),
                                                  t("admin.instances.printSystemGuideStep5", { defaultValue: "استخدم المعاينة للتأكد من مكان QR والبيانات قبل إنشاء الملف." }),
                                                  t("admin.instances.printSystemGuideStep6", { defaultValue: "اضغط إنشاء PDF. كل كارت مطبوع يساوي طالب واحد، والطالب يسجل الدخول قبل التفعيل." }),
                                                ].map((stepText, index) => (
                                                  <div key={index} className="flex items-start gap-2.5 min-w-0">
                                                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
                                                      {index + 1}
                                                    </span>
                                                    <p className="min-w-0 flex-1 leading-5 text-foreground/90 break-words">{stepText}</p>
                                                  </div>
                                                ))}
                                              </div>
                                            </div>

                                            <div className="grid gap-3 grid-cols-1 @md/print:grid-cols-2 @2xl/print:grid-cols-3 items-start">
                                              <div className="flex flex-col justify-start gap-1.5 min-w-0">
                                                <div className="flex h-5 items-center gap-1 text-xs font-medium text-muted-foreground">
                                                  <AccessCodeFieldLabel tooltip={t("admin.instances.printTemplateIdTooltip", { defaultValue: "Template ID controls the fixed 827 x 438 px card layout and background." })}>
                                                    {t("admin.instances.printTemplateId", { defaultValue: "Template ID" })}
                                                  </AccessCodeFieldLabel>
                                                </div>
                                                <select
                                                  className="h-10 w-full rounded-xl border bg-background px-3 text-sm text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
                                                  value={printDrafts[instance.id]?.templateId || ""}
                                                  onChange={(event) => updatePrintDraft(instance.id, "templateId", event.target.value)}
                                                >
                                                  <option value="">{t("admin.instances.selectPrintTemplate", { defaultValue: "Select template" })}</option>
                                                  {printTemplates.filter((template) => template.status !== "archived").map((template) => (
                                                    <option key={template.id} value={String(template.id)}>#{template.id} {template.name}</option>
                                                  ))}
                                                </select>
                                              </div>

                                              <div className="flex flex-col justify-start gap-1.5 min-w-0">
                                                <div className="flex h-5 items-center gap-1 text-xs font-medium text-muted-foreground">
                                                  <span>{t("admin.instances.printBatchName", { defaultValue: "Batch name" })}</span>
                                                </div>
                                                <Input
                                                  className="h-10 w-full rounded-xl text-foreground"
                                                  placeholder={t("admin.instances.printBatchNamePlaceholder", { defaultValue: "Optional batch label..." })}
                                                  value={printDrafts[instance.id]?.batchName || ""}
                                                  onChange={(event) => updatePrintDraft(instance.id, "batchName", event.target.value)}
                                                />
                                              </div>

                                              <div className="flex flex-col justify-start gap-1.5 min-w-0 @md/print:col-span-2 @2xl/print:col-span-1">
                                                <div className="flex h-5 items-center gap-1 text-xs font-medium text-muted-foreground">
                                                  <AccessCodeFieldLabel tooltip={t("admin.instances.teacherImageAssetTooltip", { defaultValue: "Optional uploaded teacher image file asset ID. This is supplied by the generator, not the teacher profile." })}>
                                                    {t("admin.instances.teacherImageAssetId", { defaultValue: "Teacher image" })}
                                                  </AccessCodeFieldLabel>
                                                </div>
                                                <div className="grid gap-2 grid-cols-1 @xs/print:grid-cols-[minmax(0,1fr)_100px]">
                                                  <Input
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={(event) => handleTeacherImageUpload(instance.id, event)}
                                                    uploading={teacherImageUploading}
                                                    fileName={printDraft.teacherImageFileAssetId ? `#${printDraft.teacherImageFileAssetId}` : ""}
                                                    buttonText={t("common.upload", { defaultValue: "Upload" })}
                                                    placeholder={t("admin.instances.noFileChosen", { defaultValue: "No image selected" })}
                                                    className="rounded-xl"
                                                  />
                                                  <Input
                                                    className="h-10 rounded-xl text-foreground text-center"
                                                    placeholder={t("admin.instances.assetId", { defaultValue: "Asset ID" })}
                                                    type="number"
                                                    min="1"
                                                    value={printDraft.teacherImageFileAssetId || ""}
                                                    onChange={(event) => updatePrintDraft(instance.id, "teacherImageFileAssetId", event.target.value)}
                                                  />
                                                </div>
                                                {teacherImageUploading && (
                                                  <div className="rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-800">
                                                    {t("admin.instances.teacherImageUploading", { defaultValue: "Uploading teacher image..." })}
                                                  </div>
                                                )}
                                                {teacherUploadStatus === "done" && printDraft.teacherImageFileAssetId && (
                                                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-800">
                                                    {t("admin.instances.teacherImageUploaded", {
                                                      defaultValue: "Teacher image saved: {{name}} (asset #{{id}})",
                                                      name: teacherUploadedAsset?.name || t("admin.instances.uploadedImage", { defaultValue: "uploaded image" }),
                                                      id: printDraft.teacherImageFileAssetId,
                                                    })}
                                                  </div>
                                                )}
                                                {teacherUploadStatus === "error" && (
                                                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-[11px] font-medium text-destructive">
                                                    {t("admin.instances.teacherImageUploadFailed", { defaultValue: "Teacher image upload failed. Try again before generating the PDF." })}
                                                  </div>
                                                )}
                                              </div>
                                            </div>

                                            <div className="grid gap-3 grid-cols-1 @sm/print:grid-cols-2 @xl/print:grid-cols-4 items-start">
                                              <div className="flex flex-col justify-start gap-1.5 min-w-0">
                                                <div className="flex h-5 items-center justify-between gap-1 text-xs font-medium text-muted-foreground">
                                                  <span>{t("admin.instances.gradeClassText", { defaultValue: "Grade/class text" })}</span>
                                                  {presetsByType("grade_class").length > 0 && (
                                                    <select
                                                      className="max-w-[130px] rounded border bg-background px-1.5 py-0.5 text-[11px] text-primary focus:outline-none cursor-pointer"
                                                      value=""
                                                      onChange={(e) => {
                                                        if (e.target.value) updatePrintDraft(instance.id, "gradeClassText", e.target.value);
                                                      }}
                                                    >
                                                      <option value="">{t("admin.instances.choosePresetOptional", { defaultValue: "Presets..." })}</option>
                                                      {presetsByType("grade_class").map((preset) => (
                                                        <option key={preset.id} value={preset.display_text || preset.displayText}>
                                                          {preset.label || preset.display_text}
                                                        </option>
                                                      ))}
                                                    </select>
                                                  )}
                                                </div>
                                                <Input
                                                  className="h-10 w-full rounded-xl text-foreground"
                                                  placeholder={t("admin.instances.gradeClassPlaceholder", { defaultValue: "الصف الثالث الثانوي" })}
                                                  value={printDrafts[instance.id]?.gradeClassText || ""}
                                                  onChange={(event) => updatePrintDraft(instance.id, "gradeClassText", event.target.value)}
                                                />
                                              </div>

                                              <div className="flex flex-col justify-start gap-1.5 min-w-0">
                                                <div className="flex h-5 items-center justify-between gap-1 text-xs font-medium text-muted-foreground">
                                                  <span>{t("admin.instances.registrationMethodText", { defaultValue: "Registration method" })}</span>
                                                  {presetsByType("registration_method").length > 0 && (
                                                    <select
                                                      className="max-w-[130px] rounded border bg-background px-1.5 py-0.5 text-[11px] text-primary focus:outline-none cursor-pointer"
                                                      value=""
                                                      onChange={(e) => {
                                                        if (e.target.value) updatePrintDraft(instance.id, "registrationMethodText", e.target.value);
                                                      }}
                                                    >
                                                      <option value="">{t("admin.instances.choosePresetOptional", { defaultValue: "Presets..." })}</option>
                                                      {presetsByType("registration_method").map((preset) => (
                                                        <option key={preset.id} value={preset.display_text || preset.displayText}>
                                                          {preset.label || preset.display_text}
                                                        </option>
                                                      ))}
                                                    </select>
                                                  )}
                                                </div>
                                                <Input
                                                  className="h-10 w-full rounded-xl text-foreground"
                                                  placeholder={t("admin.instances.registrationMethodPlaceholder", { defaultValue: "كود أو منصة" })}
                                                  value={printDrafts[instance.id]?.registrationMethodText || ""}
                                                  onChange={(event) => updatePrintDraft(instance.id, "registrationMethodText", event.target.value)}
                                                />
                                              </div>

                                              <div className="flex flex-col justify-start gap-1.5 min-w-0">
                                                <div className="flex h-5 items-center gap-1 text-xs font-medium text-muted-foreground">
                                                  <span>{t("admin.instances.priceText", { defaultValue: "Price text" })}</span>
                                                </div>
                                                <Input
                                                  className="h-10 w-full rounded-xl text-foreground"
                                                  placeholder={t("admin.instances.pricePlaceholder", { defaultValue: "50 ج.م" })}
                                                  value={printDrafts[instance.id]?.priceText || ""}
                                                  onChange={(event) => updatePrintDraft(instance.id, "priceText", event.target.value)}
                                                />
                                              </div>

                                              <div className="flex flex-col justify-start gap-1.5 min-w-0">
                                                <div className="flex h-5 items-center gap-1 text-xs font-medium text-muted-foreground">
                                                  <AccessCodeFieldLabel tooltip={t("admin.instances.redCustomTextTooltip", { defaultValue: "The only blank card text field from the brief. It remains free optional text." })}>
                                                    {t("admin.instances.redCustomText", { defaultValue: "Red custom text" })}
                                                  </AccessCodeFieldLabel>
                                                </div>
                                                <Input
                                                  className="h-10 w-full rounded-xl text-foreground"
                                                  placeholder={t("admin.instances.redCustomTextPlaceholder", { defaultValue: "سطر أحمر اختياري..." })}
                                                  value={printDrafts[instance.id]?.redCustomText || ""}
                                                  onChange={(event) => updatePrintDraft(instance.id, "redCustomText", event.target.value)}
                                                />
                                              </div>
                                            </div>

                                            <div className="rounded-xl border bg-background p-3.5 space-y-2.5">
                                              <div>
                                                <div className="text-xs font-semibold text-foreground">
                                                  {t("admin.instances.printFieldVisibility", { defaultValue: "Print visibility" })}
                                                </div>
                                                <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                                                  {t("admin.instances.printFieldVisibilityDescription", { defaultValue: "Turn a field on to include it in the preview and PDF, or off to hide it from print." })}
                                                </p>
                                              </div>
                                              <div className="grid gap-2 grid-cols-1 @xs/print:grid-cols-2 @md/print:grid-cols-3 @xl/print:grid-cols-5">
                                                {[
                                                  ["gradeClass", t("admin.instances.gradeClassText", { defaultValue: "Grade/class text" })],
                                                  ["registrationMethod", t("admin.instances.registrationMethodText", { defaultValue: "Registration method" })],
                                                  ["price", t("admin.instances.priceText", { defaultValue: "Price text" })],
                                                  ["redCustomText", t("admin.instances.redCustomText", { defaultValue: "Red custom text" })],
                                                  ["teacherImage", t("admin.instances.teacherImageAssetId", { defaultValue: "Teacher image" })],
                                                ].map(([field, label]) => {
                                                  const isVisible = normalizePrintFieldVisibility(printDraft.visibleFields)[field];
                                                  const labelId = `print-visibility-${instance.id}-${field}`;
                                                  return (
                                                    <div key={field} className="flex min-w-0 items-center justify-between gap-2.5 rounded-xl border bg-muted/20 px-3 py-2 transition hover:bg-muted/30">
                                                      <div id={labelId} className="min-w-0">
                                                        <div className="truncate text-xs font-medium text-foreground">{label}</div>
                                                        <div className="mt-0.5 text-[10px] text-muted-foreground">
                                                          {isVisible
                                                            ? t("admin.instances.visibleOnPrint", { defaultValue: "Visible" })
                                                            : t("admin.instances.hiddenOnPrint", { defaultValue: "Hidden" })}
                                                        </div>
                                                      </div>
                                                      <Switch
                                                        checked={isVisible}
                                                        onCheckedChange={(visible) => updatePrintFieldVisibility(instance.id, field, visible)}
                                                        aria-labelledby={labelId}
                                                      />
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-2 pt-1">
                                              <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                className="rounded-xl"
                                                onClick={() => handlePreviewPrintableCard(instance)}
                                                disabled={!printDrafts[instance.id]?.templateId || Boolean(printPreviewLoading[instance.id])}
                                              >
                                                {printPreviewLoading[instance.id] ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                                                {printPreviewLoading[instance.id]
                                                  ? t("admin.instances.previewLoading", { defaultValue: "Previewing..." })
                                                  : t("admin.instances.previewPrintableCard", { defaultValue: "Preview card" })}
                                              </Button>
                                              <Button
                                                type="button"
                                                size="sm"
                                                className="rounded-xl"
                                                onClick={() => handleGeneratePrintableBatch(instance)}
                                                disabled={!canGeneratePrintableBatch}
                                              >
                                                <Printer className="h-4 w-4" />
                                                {t("admin.instances.generatePrintablePdf", { defaultValue: "Generate printable PDF" })}
                                              </Button>
                                              <span className="text-xs text-muted-foreground">
                                                {t("admin.instances.printOneCodePerStudent", { defaultValue: "Print batches force one code per student." })}
                                              </span>
                                            </div>

                                            {printWarnings[instance.id] && (
                                              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                                                {printWarnings[instance.id].message || t("admin.instances.printSeatWarning", { defaultValue: "Remaining student seats are below unused active paid codes. Codes do not reserve seats." })}
                                              </div>
                                            )}
                                            {showSeatWarning && (
                                              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                                                {t("admin.instances.unusedCodeSeatWarning", { defaultValue: "Remaining student seats are below unused active paid codes. Codes do not reserve seats; redemption will re-check capacity." })}
                                              </div>
                                            )}
                                            {printPreviewErrors[instance.id] && (
                                              <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs font-medium text-destructive">
                                                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                                <span>{printPreviewErrors[instance.id]}</span>
                                              </div>
                                            )}

                                            {printPreviewUrls[instance.id] && (
                                              <div className="rounded-xl border bg-background p-3">
                                                <div className="mb-2 text-xs font-semibold text-muted-foreground">{t("admin.instances.backendPreview", { defaultValue: "Backend-rendered preview" })}</div>
                                                <img src={printPreviewUrls[instance.id]} alt={t("admin.instances.backendPreview", { defaultValue: "Backend-rendered preview" })} className="h-auto w-full max-w-[827px] rounded-lg border shadow-xs" />
                                              </div>
                                            )}

                                            {(printBatchHistory[instance.id] || []).length > 0 && (
                                              <div className="rounded-xl border bg-background p-3">
                                                <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                                                  <FileText className="h-3.5 w-3.5" />
                                                  {t("admin.instances.printBatchHistory", { defaultValue: "Generated PDF batches" })}
                                                </div>
                                                <div className="grid gap-2">
                                                  {(printBatchHistory[instance.id] || []).slice(0, 5).map((batch) => {
                                                    const snapshotValues = batch.snapshot_json?.batchValues || batch.snapshotJson?.batchValues || {};
                                                    return (
                                                      <div key={batch.id} className="grid gap-2 rounded-lg border p-2.5 text-xs grid-cols-1 @md/print:grid-cols-[1fr_100px_100px_auto] @md/print:items-center">
                                                        <div className="min-w-0">
                                                          <div className="truncate font-medium text-foreground">#{batch.id} {batch.label}</div>
                                                          <div className="truncate text-muted-foreground">{snapshotValues.gradeClassText || "-"} / {snapshotValues.registrationMethodText || "-"}</div>
                                                        </div>
                                                        <div className="capitalize text-muted-foreground">{batch.kind}</div>
                                                        <div><span className="font-semibold text-foreground">{batch._count?.codes || batch.count}</span> {t("admin.instances.cards", { defaultValue: "cards" })}</div>
                                                        <Button type="button" size="sm" variant="outline" className="rounded-xl shrink-0" onClick={() => downloadAccessCodePrintBatchPdf(batch.id, getPrintBatchPdfFilename(batch))}>
                                                          <Download className="h-4 w-4" />
                                                          PDF
                                                        </Button>
                                                      </div>
                                                    );
                                                  })}
                                                </div>
                                              </div>
                                            )}
                                          </motion.div>
                                        )}
                                      </AnimatePresence>
                                    </div>

                                    {(generatedCodes[instance.id] || []).length > 0 && (
                                      <div className="rounded-xl bg-muted p-3 text-xs space-y-2">
                                        <div className="font-semibold text-foreground">{t("admin.instances.generatedNow", { defaultValue: "Generated now" })}</div>
                                        <div className="grid gap-2 grid-cols-1 @md/access:grid-cols-2">
                                          {generatedCodes[instance.id].map((item) => (
                                            <code key={item.record?.id || item.code} className="break-all rounded-lg border bg-background p-2 font-mono text-xs text-foreground">
                                              {item.code}
                                            </code>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    <div className="grid gap-2 grid-cols-1 @md/access:grid-cols-2">
                                      {(existingCodes[instance.id] || []).slice(0, 10).map((code) => (
                                        <div key={code.id} className="rounded-xl border bg-background p-3 text-xs flex flex-col justify-between gap-1 shadow-xs">
                                          <div className="font-medium text-foreground truncate">{code.kind} • {code.status} • <span className="font-mono">****{code.code_hint}</span></div>
                                          <div className="text-muted-foreground">{t("admin.instances.redemptions", { defaultValue: "Redemptions" })}: {code.redeemed_count}/{code.max_redemptions}</div>
                                        </div>
                                      ))}
                                      {(existingCodes[instance.id] || []).length === 0 && (
                                        <div className="col-span-full rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
                                          {t("admin.instances.noAccessCodes", { defaultValue: "No access codes generated yet." })}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                          </motion.div>
                        )}
                        </AnimatePresence>
                      </motion.article>
                    );
                  })}
                </div>
              </motion.section>
            );
          })}
        </motion.div>
      )}

      {!selectedTeacherId && filteredTeacherGroups.length > 0 && (
        <div className="@container flex flex-col gap-3 rounded-2xl border bg-background p-4 shadow-sm @sm:flex-row @sm:items-center @sm:justify-between">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl"
              disabled={teacherListPage <= 1 || loading}
              onClick={() => setTeacherListPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
              {t("common.previous")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl"
              disabled={teacherListPage >= totalTeacherPages || loading}
              onClick={() => setTeacherListPage((p) => Math.min(totalTeacherPages, p + 1))}
            >
              {t("common.next")}
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <span className="text-center text-xs text-muted-foreground @sm:text-sm">
            {t("admin.instances.showingTeachersCount", {
              defaultValue: "Showing {{shown}} of {{total}} teachers",
              shown: paginatedTeacherGroups.length,
              total: filteredTeacherGroups.length,
            })}
            {totalTeacherPages > 1 && ` — ${t("admin.instances.pagination", { page: teacherListPage, total: totalTeacherPages })}`}
          </span>
        </div>
      )}
    </motion.div>
    </TooltipProvider>
  );
}
