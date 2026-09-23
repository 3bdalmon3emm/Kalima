import { useCallback, useRef, useState } from "react";
import axiosInstance from "@/api/axios";
import i18n from "@/i18n";
import useApiMutation from "../useApiMutation";

const normalizeListResponse = (response) => ({
  data: Array.isArray(response?.data) ? response.data : [],
  total: Number(response?.total ?? 0),
  page: Number(response?.page ?? 1),
  limit: Number(response?.limit ?? 20),
  pages: Number(response?.pages ?? Math.max(1, Math.ceil(Number(response?.total ?? 0) / Math.max(1, Number(response?.limit ?? 20))))),
});

const ANALYTICS_QUERY_KEYS = {
  startDate: "start_date",
  endDate: "end_date",
  teacherId: "teacher_id",
  instanceId: "instance_id",
  templateId: "template_id",
  studentId: "student_id",
};

const buildQueryString = (filters = {}) => {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "" && value !== "all") {
      query.set(ANALYTICS_QUERY_KEYS[key] || key, String(value));
    }
  });
  return query.toString();
};

const startOfDay = (value) => {
  if (!value) return null;
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const endOfDay = (value) => {
  if (!value) return null;
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
};

const buildPurchaseFilterParams = (filters = {}) => {
  const params = {};
  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "" || value === "all") return;
    params[key] = value instanceof Date ? value.toISOString() : String(value);
  });
  return params;
};

export function useAdminEBookletAnalytics() {
  const { mutate: fetchApi, loading } = useApiMutation();
  const [analytics, setAnalytics] = useState({ events: {}, revenue: {} });

  const fetchAnalytics = useCallback(async (filters = {}) => {
    const query = buildQueryString(filters);
    const response = await fetchApi(
      {
        endpoint: `/admin/e-booklet-analytics${query ? `?${query}` : ""}`,
        method: "get",
      },
      false,
    );
    setAnalytics(response?.data || { events: {}, revenue: {} });
    return response;
  }, [fetchApi]);

  const exportCsv = useCallback(async (filters = {}) => {
    const query = buildQueryString(filters);
    const response = await axiosInstance.get(
      `/admin/e-booklet-analytics.csv${query ? `?${query}` : ""}`,
      { responseType: "blob" },
    );
    const url = URL.createObjectURL(response.data);
    const link = document.createElement("a");
    link.href = url;
    link.download = "e-booklet-analytics.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return response;
  }, []);

  return { analytics, loading, fetchAnalytics, exportCsv };
}

export function useAdminTeacherOptions() {
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchTeachers = useCallback(async (search = "") => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ page: "1", limit: "50", role: "Teacher" });
      if (search.trim()) query.set("search", search.trim());

      const response = await axiosInstance.get(`/admin/users?${query.toString()}`);
      const users = response.data?.data?.users || [];
      setTeachers(Array.isArray(users) ? users : []);
      return users;
    } finally {
      setLoading(false);
    }
  }, []);

  return { teachers, loading, fetchTeachers };
}

export function useAdminEBookletTemplates() {
  const { mutate: fetchApi, loading: apiLoading } = useApiMutation();
  const [templates, setTemplates] = useState([]);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 12,
  });
  const [filters, setFilters] = useState({
    search: "",
    status: "all",
  });
  const [initLoading, setInitLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const buildQuery = useCallback(
    (overrides = {}) => {
      const query = new URLSearchParams();
      const nextFilters = { ...filters, ...overrides };
      const nextPage = overrides.page ?? pagination.page;
      const nextLimit = overrides.limit ?? pagination.limit;

      query.set("page", String(nextPage));
      query.set("limit", String(nextLimit));
      if (nextFilters.search) query.set("search", nextFilters.search);
      if (nextFilters.status && nextFilters.status !== "all") {
        query.set("status", nextFilters.status);
      }

      return query.toString();
    },
    [filters, pagination.limit, pagination.page],
  );

  const fetchTemplates = useCallback(
    async (overrides = {}) => {
      setInitLoading(true);
      try {
        const response = await fetchApi(
          {
            endpoint: `/admin/e-booklet-templates?${buildQuery(overrides)}`,
            method: "get",
          },
          false,
        );
        const normalized = normalizeListResponse(response);
        setTemplates(normalized.data);
        setPagination((current) => ({
          ...current,
          total: normalized.total,
          page: normalized.page,
          limit: normalized.limit,
        }));
        return response;
      } finally {
        setInitLoading(false);
      }
    },
    [buildQuery, fetchApi],
  );

  const setSearch = useCallback((search) => {
    setFilters((current) => ({ ...current, search }));
    setPagination((current) => ({ ...current, page: 1 }));
  }, []);

  const setStatus = useCallback((status) => {
    setFilters((current) => ({ ...current, status }));
    setPagination((current) => ({ ...current, page: 1 }));
  }, []);

  const setPage = useCallback((page) => {
    setPagination((current) => ({ ...current, page }));
  }, []);

  const runAction = useCallback(async (action) => {
    setActionLoading(true);
    try {
      return await action();
    } finally {
      setActionLoading(false);
    }
  }, []);

  const updateTemplate = useCallback(
    (templateId, data) =>
      runAction(() =>
        fetchApi({
          endpoint: `/admin/e-booklet-templates/${templateId}`,
          method: "patch",
          data,
          defaultSuccessMessage: i18n.t("eBooklets:toasts.templateUpdated"),
        }),
      ),
    [fetchApi, runAction],
  );

  const publishVersion = useCallback(
    (versionId) =>
      runAction(() =>
        fetchApi({
          endpoint: `/admin/e-booklet-template-versions/${versionId}/publish`,
          method: "post",
          defaultSuccessMessage: i18n.t("eBooklets:toasts.versionPublished"),
        }),
      ),
    [fetchApi, runAction],
  );

  return {
    templates,
    pagination,
    filters,
    loading: apiLoading || initLoading,
    actionLoading,
    fetchTemplates,
    setSearch,
    setStatus,
    setPage,
    updateTemplate,
    publishVersion,
  };
}

export function useAdminEBookletEditor() {
  const { mutate: fetchApi, loading } = useApiMutation();

  const fetchTemplate = useCallback(
    (templateId) =>
      fetchApi(
        {
          endpoint: `/admin/e-booklet-templates/${templateId}`,
          method: "get",
        },
        false,
      ),
    [fetchApi],
  );

  const fetchVersions = useCallback(
    (templateId) =>
      fetchApi(
        {
          endpoint: `/admin/e-booklet-templates/${templateId}/versions`,
          method: "get",
        },
        false,
      ),
    [fetchApi],
  );

  const createTemplate = useCallback(
    (data) =>
      fetchApi({
        endpoint: "/admin/e-booklet-templates",
        method: "post",
        data,
        defaultSuccessMessage: i18n.t("eBooklets:toasts.templateSaved"),
      }),
    [fetchApi],
  );

  const updateTemplate = useCallback(
    (templateId, data) =>
      fetchApi({
        endpoint: `/admin/e-booklet-templates/${templateId}`,
        method: "patch",
        data,
        defaultSuccessMessage: i18n.t("eBooklets:toasts.templateUpdated"),
      }),
    [fetchApi],
  );

  const createVersion = useCallback(
    (templateId, data) =>
      fetchApi({
        endpoint: `/admin/e-booklet-templates/${templateId}/versions`,
        method: "post",
        data,
        defaultSuccessMessage: i18n.t("eBooklets:toasts.versionSaved"),
      }),
    [fetchApi],
  );

  const updateVersion = useCallback(
    (versionId, data) =>
      fetchApi({
        endpoint: `/admin/e-booklet-template-versions/${versionId}`,
        method: "patch",
        data,
        defaultSuccessMessage: i18n.t("eBooklets:toasts.versionUpdated"),
      }),
    [fetchApi],
  );

  const publishVersion = useCallback(
    (versionId) =>
      fetchApi({
        endpoint: `/admin/e-booklet-template-versions/${versionId}/publish`,
        method: "post",
        defaultSuccessMessage: i18n.t("eBooklets:toasts.versionPublished"),
      }),
    [fetchApi],
  );

  const fetchHotspots = useCallback(
    (versionId, pageNumber) => {
      const query = pageNumber ? `?page_number=${pageNumber}` : "";
      return fetchApi(
        {
          endpoint: `/admin/e-booklet-template-versions/${versionId}/hotspots${query}`,
          method: "get",
        },
        false,
      );
    },
    [fetchApi],
  );

  const createHotspot = useCallback(
    (versionId, data, options = {}) =>
      fetchApi({
        endpoint: `/admin/e-booklet-template-versions/${versionId}/hotspots`,
        method: "post",
        data: { ...data, template_version_id: versionId },
        defaultSuccessMessage: i18n.t("eBooklets:toasts.hotspotSaved"),
        suppressErrorToast: options.suppressErrorToast,
      }, options.showToast !== false),
    [fetchApi],
  );

  const updateHotspot = useCallback(
    (hotspotId, data, options = {}) =>
      fetchApi({
        endpoint: `/admin/e-booklet-hotspots/${hotspotId}`,
        method: "patch",
        data,
        defaultSuccessMessage: i18n.t("eBooklets:toasts.hotspotUpdated"),
        suppressErrorToast: options.suppressErrorToast,
      }, options.showToast !== false),
    [fetchApi],
  );

  const deleteHotspot = useCallback(
    (hotspotId) =>
      fetchApi({
        endpoint: `/admin/e-booklet-hotspots/${hotspotId}`,
        method: "delete",
        defaultSuccessMessage: i18n.t("eBooklets:toasts.hotspotRemoved"),
      }),
    [fetchApi],
  );

  const uploadAsset = useCallback(
    (kind, file, data = {}, options = {}) => {
      const formData = new FormData();
      const fieldName = kind === "cover" ? "cover" : kind === "document" ? "document" : "media";
      formData.append(fieldName, file);
      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          formData.append(key, value);
        }
      });

      return fetchApi({
        endpoint: `/admin/e-booklet-files/${kind}`,
        method: "post",
        data: formData,
        onUploadProgress: options.onUploadProgress,
        signal: options.signal,
        suppressErrorToast: options.suppressErrorToast,
        defaultSuccessMessage: i18n.t("eBooklets:toasts.fileStored"),
      }, options.showToast !== false);
    },
    [fetchApi],
  );

  const fetchAssetBlobUrl = useCallback(async (assetId, params) => {
    if (!assetId) return "";
    const response = await axiosInstance.get(
      `/admin/e-booklet-files/${assetId}/preview`,
      { responseType: "blob", params },
    );
    return URL.createObjectURL(response.data);
  }, []);

  const fetchAssetArrayBuffer = useCallback(async (assetId, params, signal) => {
    if (!assetId) return null;
    const response = await axiosInstance.get(
      `/admin/e-booklet-files/${assetId}/preview`,
      { responseType: "arraybuffer", params, signal },
    );
    return response.data;
  }, []);

  const fetchAssetPagePreviewBlobUrl = useCallback(async (assetId, pageNumber, signal) => {
    if (!assetId || !pageNumber) return "";
    const response = await axiosInstance.get(
      `/admin/e-booklet-files/${assetId}/pages/${pageNumber}/preview`,
      { responseType: "blob", signal },
    );
    return URL.createObjectURL(response.data);
  }, []);

  return {
    loading,
    fetchTemplate,
    fetchVersions,
    createTemplate,
    updateTemplate,
    createVersion,
    updateVersion,
    publishVersion,
    fetchHotspots,
    createHotspot,
    updateHotspot,
    deleteHotspot,
    uploadAsset,
    fetchAssetBlobUrl,
    fetchAssetArrayBuffer,
    fetchAssetPagePreviewBlobUrl,
  };
}

export function useAdminEBookletHotspotLibrary() {
  const { mutate: fetchApi, loading } = useApiMutation();
  const [presets, setPresets] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20 });
  const [filters, setFilters] = useState({ search: "", type: "all", tag: "", includeInactive: false });
  const [actionLoading, setActionLoading] = useState(false);

  const buildQuery = useCallback((overrides = {}) => {
    const query = new URLSearchParams();
    const nextFilters = { ...filters, ...overrides };
    const page = overrides.page ?? pagination.page;
    const limit = overrides.limit ?? pagination.limit;
    query.set("page", String(page));
    query.set("limit", String(limit));
    if (nextFilters.search) query.set("search", nextFilters.search);
    if (nextFilters.type && nextFilters.type !== "all") query.set("type", nextFilters.type);
    if (nextFilters.tag) query.set("tag", nextFilters.tag);
    if (nextFilters.includeInactive) query.set("include_inactive", "true");
    return query.toString();
  }, [filters, pagination.limit, pagination.page]);

  const fetchPresets = useCallback(async (overrides = {}) => {
    const response = await fetchApi({ endpoint: `/admin/e-booklet-hotspot-presets?${buildQuery(overrides)}`, method: "get" }, false);
    const normalized = normalizeListResponse(response);
    setPresets(normalized.data);
    setPagination((current) => ({ ...current, total: normalized.total, page: normalized.page, limit: normalized.limit }));
    return response;
  }, [buildQuery, fetchApi]);

  const fetchPreset = useCallback((presetId) => fetchApi({ endpoint: `/admin/e-booklet-hotspot-presets/${presetId}`, method: "get" }, false), [fetchApi]);

  const runAction = useCallback(async (action) => {
    setActionLoading(true);
    try {
      return await action();
    } finally {
      setActionLoading(false);
    }
  }, []);

  const createPreset = useCallback((data) => runAction(() => fetchApi({ endpoint: "/admin/e-booklet-hotspot-presets", method: "post", data, defaultSuccessMessage: i18n.t("eBooklets:admin.hotspotLibrary.saved") })), [fetchApi, runAction]);
  const updatePresetMetadata = useCallback((presetId, data) => runAction(() => fetchApi({ endpoint: `/admin/e-booklet-hotspot-presets/${presetId}/metadata`, method: "patch", data, defaultSuccessMessage: i18n.t("eBooklets:admin.hotspotLibrary.detailsSaved") })), [fetchApi, runAction]);
  const replacePresetContent = useCallback((presetId, data) => runAction(() => fetchApi({ endpoint: `/admin/e-booklet-hotspot-presets/${presetId}/content`, method: "put", data, defaultSuccessMessage: i18n.t("eBooklets:admin.hotspotLibrary.replaced") })), [fetchApi, runAction]);
  const deletePreset = useCallback((presetId) => runAction(() => fetchApi({ endpoint: `/admin/e-booklet-hotspot-presets/${presetId}`, method: "delete" })), [fetchApi, runAction]);
  const restorePreset = useCallback((presetId) => runAction(() => fetchApi({ endpoint: `/admin/e-booklet-hotspot-presets/${presetId}/restore`, method: "post", defaultSuccessMessage: i18n.t("eBooklets:admin.hotspotLibrary.restored") })), [fetchApi, runAction]);
  const insertPreset = useCallback((versionId, data) => runAction(() => fetchApi({ endpoint: `/admin/e-booklet-template-versions/${versionId}/hotspots/from-preset`, method: "post", data, defaultSuccessMessage: i18n.t("eBooklets:admin.hotspotLibrary.inserted") })), [fetchApi, runAction]);

  const setSearch = useCallback((search) => { setFilters((current) => ({ ...current, search })); setPagination((current) => ({ ...current, page: 1 })); }, []);
  const setType = useCallback((type) => { setFilters((current) => ({ ...current, type })); setPagination((current) => ({ ...current, page: 1 })); }, []);
  const setTag = useCallback((tag) => { setFilters((current) => ({ ...current, tag })); setPagination((current) => ({ ...current, page: 1 })); }, []);
  const setIncludeInactive = useCallback((includeInactive) => { setFilters((current) => ({ ...current, includeInactive })); setPagination((current) => ({ ...current, page: 1 })); }, []);
  const setPage = useCallback((page) => setPagination((current) => ({ ...current, page })), []);

  return {
    presets,
    pagination,
    filters,
    loading,
    actionLoading,
    fetchPresets,
    fetchPreset,
    createPreset,
    updatePresetMetadata,
    replacePresetContent,
    deletePreset,
    restorePreset,
    insertPreset,
    setSearch,
    setType,
    setTag,
    setIncludeInactive,
    setPage,
  };
}

export function useAdminEBookletPurchases() {
  const { mutate: fetchApi, loading } = useApiMutation();
  const [purchases, setPurchases] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1, limit: 12 });
  const [filters, setFilters] = useState({
    search: "",
    status: "all",
    startDate: null,
    endDate: null,
    minTotal: "",
    maxTotal: "",
  });

  const buildPurchaseQuery = useCallback((overrides = {}) => {
    const query = new URLSearchParams();
    const nextFilters = { ...filters, ...overrides };
    const page = overrides.page ?? pagination.page;
    const limit = overrides.limit ?? pagination.limit;
    query.set("page", String(page));
    query.set("limit", String(limit));
    Object.entries(buildPurchaseFilterParams(nextFilters)).forEach(([key, value]) => {
      query.set(key, value);
    });
    return query.toString();
  }, [filters, pagination.limit, pagination.page]);

  const buildPurchaseExportFilters = useCallback(
    (overrides = {}) => buildPurchaseFilterParams({ ...filters, ...overrides }),
    [filters],
  );

  const fetchPurchases = useCallback(
    async (overrides = {}) => {
      const response = await fetchApi(
        {
          endpoint: `/admin/e-booklet-purchases?${buildPurchaseQuery(overrides)}`,
          method: "get",
        },
        false,
      );
      const normalized = normalizeListResponse(response);
      setPurchases(normalized.data);
        setPagination((current) => ({
          ...current,
          total: normalized.total,
          page: normalized.page,
          limit: normalized.limit,
          pages: normalized.pages,
        }));
      return response;
    },
    [buildPurchaseQuery, fetchApi],
  );

  const setPage = useCallback((page) => {
    setPagination((current) => ({ ...current, page }));
  }, []);

  const setSearch = useCallback((search) => {
    setFilters((current) => ({ ...current, search }));
    setPagination((current) => ({ ...current, page: 1 }));
  }, []);

  const changeStatusFilter = useCallback((value) => {
    setFilters((current) => ({ ...current, status: value }));
    setPagination((current) => ({ ...current, page: 1 }));
  }, []);

  const setDateRange = useCallback((startDate, endDate) => {
    setFilters((current) => ({
      ...current,
      startDate: startOfDay(startDate),
      endDate: endOfDay(endDate || startDate),
    }));
    setPagination((current) => ({ ...current, page: 1 }));
  }, []);

  const setTotalRange = useCallback((minTotal, maxTotal) => {
    setFilters((current) => ({ ...current, minTotal, maxTotal }));
    setPagination((current) => ({ ...current, page: 1 }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({ search: "", status: "all", startDate: null, endDate: null, minTotal: "", maxTotal: "" });
    setPagination((current) => ({ ...current, page: 1 }));
  }, []);

  const fetchPurchase = useCallback(
    (purchaseId) =>
      fetchApi(
        {
          endpoint: `/admin/e-booklet-purchases/${purchaseId}`,
          method: "get",
        },
        false,
      ),
    [fetchApi],
  );

  const updatePurchaseStatus = useCallback(
    (purchaseId, nextStatus, adminNotes) =>
      fetchApi({
        endpoint: `/admin/e-booklet-purchases/${purchaseId}/status`,
        method: "patch",
        data: { status: nextStatus, admin_notes: adminNotes },
        defaultSuccessMessage: i18n.t("eBooklets:toasts.purchaseUpdated"),
      }),
    [fetchApi],
  );

  const markPaid = useCallback(
    (purchaseId) =>
      fetchApi({
        endpoint: `/admin/e-booklet-purchases/${purchaseId}/mark-paid`,
        method: "post",
        defaultSuccessMessage: i18n.t("eBooklets:toasts.purchaseMarkedPaid"),
      }),
    [fetchApi],
  );

  const deliverPurchase = useCallback(
    (purchaseId, data) =>
      fetchApi({
        endpoint: `/admin/e-booklet-purchases/${purchaseId}/deliver`,
        method: "post",
        data,
        defaultSuccessMessage: i18n.t("eBooklets:toasts.delivered"),
      }),
    [fetchApi],
  );

  const approveStudentPurchase = useCallback(
    (purchaseId) =>
      fetchApi({
        endpoint: `/admin/e-booklet-student-purchases/${purchaseId}/approve`,
        method: "post",
        defaultSuccessMessage: i18n.t("eBooklets:toasts.studentPurchaseApproved"),
      }),
    [fetchApi],
  );

  const prepareCustomTemplate = useCallback(
    (purchaseId) =>
      fetchApi({
        endpoint: `/admin/e-booklet-purchases/${purchaseId}/custom-template`,
        method: "post",
        defaultSuccessMessage: i18n.t("eBooklets:toasts.teacherTemplateReady", {
          defaultValue: "Teacher-specific eBooklet template is ready to edit.",
        }),
      }),
    [fetchApi],
  );

  const uploadTeacherDocument = useCallback(
    (file, data = {}) => {
      const formData = new FormData();
      formData.append("document", file);
      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          formData.append(key, value);
        }
      });

      return fetchApi({
        endpoint: "/admin/e-booklet-files/document",
        method: "post",
        data: formData,
        defaultSuccessMessage: i18n.t("eBooklets:toasts.teacherDocumentStored"),
      });
    },
    [fetchApi],
  );

  return {
    purchases,
    pagination,
    filters,
    status: filters.status,
    loading,
    setPage,
    setSearch,
    setStatus: changeStatusFilter,
    setDateRange,
    setTotalRange,
    clearFilters,
    buildPurchaseExportFilters,
    fetchPurchases,
    fetchPurchase,
    updatePurchaseStatus,
    markPaid,
    deliverPurchase,
    approveStudentPurchase,
    prepareCustomTemplate,
    uploadTeacherDocument,
  };
}


export function useAdminEBookletInstances() {
  const { mutate: fetchApi } = useApiMutation();
  const [instances, setInstances] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20 });
  const [status, setStatusState] = useState("all");
  const [loading, setLoading] = useState(false);

  const fetchInstances = useCallback(async (overrides = {}) => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      query.set("page", String(overrides.page ?? pagination.page));
      query.set("limit", String(overrides.limit ?? pagination.limit));
      const nextStatus = overrides.status ?? status;
      if (nextStatus && nextStatus !== "all") query.set("status", nextStatus);
      if (overrides.teacher_id) query.set("teacher_id", String(overrides.teacher_id));
      if (overrides.include_students === false) query.set("include_students", "false");
      if (overrides.include_students === true) query.set("include_students", "true");
      const response = await fetchApi({ endpoint: `/admin/e-booklet-instances?${query.toString()}`, method: "get" }, false);
      const normalized = normalizeListResponse(response);
      setInstances(normalized.data);
      setPagination((current) => ({ ...current, total: normalized.total, page: normalized.page, limit: normalized.limit }));
      return response;
    } finally {
      setLoading(false);
    }
  }, [fetchApi, pagination.limit, pagination.page, status]);

  const fetchAllInstances = useCallback(async (overrides = {}) => {
    setLoading(true);
    try {
      const pageSize = Number(overrides.limit) > 0 ? Number(overrides.limit) : 200;
      const nextStatus = overrides.status ?? status;
      let page = 1;
      let all = [];
      let total = Infinity;
      let lastLimit = pageSize;
      while (all.length < total && page <= 50) {
        const query = new URLSearchParams();
        query.set("page", String(page));
        query.set("limit", String(pageSize));
        if (nextStatus && nextStatus !== "all") query.set("status", nextStatus);
        if (overrides.teacher_id) query.set("teacher_id", String(overrides.teacher_id));
        if (overrides.include_students === false) query.set("include_students", "false");
        if (overrides.include_students === true) query.set("include_students", "true");
        const response = await fetchApi({ endpoint: `/admin/e-booklet-instances?${query.toString()}`, method: "get" }, false);
        const normalized = normalizeListResponse(response);
        all = all.concat(normalized.data);
        total = Number(normalized.total || 0);
        lastLimit = normalized.limit;
        if (!normalized.data.length) break;
        page += 1;
      }
      setInstances(all);
      setPagination((current) => ({ ...current, total, page: 1, limit: lastLimit }));
      return { data: all, total, page: 1, limit: lastLimit };
    } finally {
      setLoading(false);
    }
  }, [fetchApi, status]);

  const setPage = useCallback((page) => setPagination((current) => ({ ...current, page })), []);
  const setStatus = useCallback((value) => { setStatusState(value); setPagination((current) => ({ ...current, page: 1 })); }, []);
  const updateQuota = useCallback((instanceId, invite_quota) => fetchApi({ endpoint: `/admin/e-booklet-instances/${instanceId}/update-quota`, method: "post", data: { invite_quota }, defaultSuccessMessage: i18n.t("eBooklets:toasts.quotaUpdated") }), [fetchApi]);
  const updateInstanceAccessExpiry = useCallback((instanceId, access_expires_at) => fetchApi({ endpoint: `/admin/e-booklet-instances/${instanceId}/access-expiry`, method: "post", data: { access_expires_at }, defaultSuccessMessage: i18n.t("eBooklets:toasts.accessExpiryUpdated", { defaultValue: "Access expiry updated" }) }), [fetchApi]);
  const revokeTeacherAccess = useCallback((instanceId) => fetchApi({ endpoint: `/admin/e-booklet-instances/${instanceId}/revoke-access`, method: "post", defaultSuccessMessage: i18n.t("eBooklets:toasts.teacherAccessRevoked") }), [fetchApi]);
  const listAccessCodes = useCallback((filters = {}) => {
    const query = new URLSearchParams();
    if (filters.bookletInstanceId) query.set("bookletInstanceId", String(filters.bookletInstanceId));
    if (filters.teacherId) query.set("teacherId", String(filters.teacherId));
    if (filters.kind && filters.kind !== "all") query.set("kind", filters.kind);
    if (filters.status && filters.status !== "all") query.set("status", filters.status);
    return fetchApi({ endpoint: `/admin/e-booklet-access-codes?${query.toString()}`, method: "get" }, false);
  }, [fetchApi]);
  const generateAccessCodes = useCallback((data) => fetchApi({ endpoint: "/admin/e-booklet-access-codes/bulk", method: "post", data, defaultSuccessMessage: i18n.t("eBooklets:toasts.accessCodesGenerated") }), [fetchApi]);
  const listAccessCodePrintTemplates = useCallback((filters = {}) => {
    const query = new URLSearchParams();
    if (filters.status && filters.status !== "all") query.set("status", filters.status);
    return fetchApi({ endpoint: `/admin/e-booklet-access-code-print/templates${query.toString() ? `?${query.toString()}` : ""}`, method: "get" }, false);
  }, [fetchApi]);
  const createAccessCodePrintTemplate = useCallback((data) => fetchApi({ endpoint: "/admin/e-booklet-access-code-print/templates", method: "post", data, defaultSuccessMessage: i18n.t("eBooklets:toasts.printTemplateSaved", { defaultValue: "Print template saved" }) }), [fetchApi]);
  const updateAccessCodePrintTemplate = useCallback((templateId, data) => fetchApi({ endpoint: `/admin/e-booklet-access-code-print/templates/${templateId}`, method: "patch", data, defaultSuccessMessage: i18n.t("eBooklets:toasts.printTemplateSaved", { defaultValue: "Print template saved" }) }), [fetchApi]);
  const archiveAccessCodePrintTemplate = useCallback((templateId) => fetchApi({ endpoint: `/admin/e-booklet-access-code-print/templates/${templateId}/archive`, method: "patch", defaultSuccessMessage: i18n.t("eBooklets:toasts.printTemplateArchived", { defaultValue: "Print template archived" }) }), [fetchApi]);
  const activateAccessCodePrintTemplate = useCallback((templateId) => fetchApi({ endpoint: `/admin/e-booklet-access-code-print/templates/${templateId}/activate`, method: "patch", defaultSuccessMessage: i18n.t("eBooklets:toasts.printTemplateActivated", { defaultValue: "Print template activated" }) }), [fetchApi]);
  const deleteAccessCodePrintTemplate = useCallback((templateId) => fetchApi({ endpoint: `/admin/e-booklet-access-code-print/templates/${templateId}`, method: "delete", defaultSuccessMessage: i18n.t("eBooklets:toasts.printTemplateDeleted", { defaultValue: "Print template deleted" }) }), [fetchApi]);
  const listAccessCodePrintPresets = useCallback((filters = {}) => {
    const query = new URLSearchParams();
    if (filters.type && filters.type !== "all") query.set("presetType", filters.type);
    if (filters.presetType && filters.presetType !== "all") query.set("presetType", filters.presetType);
    if (filters.active !== undefined) query.set("active", String(filters.active));
    return fetchApi({ endpoint: `/admin/e-booklet-access-code-print/presets${query.toString() ? `?${query.toString()}` : ""}`, method: "get" }, false);
  }, [fetchApi]);
  const createAccessCodePrintPreset = useCallback((data) => fetchApi({ endpoint: "/admin/e-booklet-access-code-print/presets", method: "post", data, defaultSuccessMessage: i18n.t("eBooklets:toasts.printPresetSaved", { defaultValue: "Print preset saved" }) }), [fetchApi]);
  const createAccessCodePrintBatchSnapshot = useCallback((data) => fetchApi({ endpoint: "/admin/e-booklet-access-code-print/batches/snapshot", method: "post", data, defaultSuccessMessage: i18n.t("eBooklets:toasts.printBatchSnapshotSaved", { defaultValue: "Print batch snapshot saved" }) }), [fetchApi]);
  const listAccessCodePrintBatches = useCallback((filters = {}) => {
    const query = new URLSearchParams();
    if (filters.bookletInstanceId) query.set("bookletInstanceId", String(filters.bookletInstanceId));
    if (filters.teacherId) query.set("teacherId", String(filters.teacherId));
    if (filters.templateId) query.set("templateId", String(filters.templateId));
    return fetchApi({ endpoint: `/admin/e-booklet-access-code-print/batches${query.toString() ? `?${query.toString()}` : ""}`, method: "get" }, false);
  }, [fetchApi]);
  const generateAccessCodePrintBatch = useCallback((data) => fetchApi({ endpoint: "/admin/e-booklet-access-code-print/batches", method: "post", data, defaultSuccessMessage: i18n.t("eBooklets:toasts.printBatchGenerated", { defaultValue: "Printable access-code PDF generated" }) }), [fetchApi]);
  const uploadAccessCodePrintImage = useCallback((file, data = {}) => {
    const formData = new FormData();
    formData.append("cover", file);
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        formData.append(key, value);
      }
    });
    return fetchApi({
      endpoint: "/admin/e-booklet-files/cover",
      method: "post",
      data: formData,
      defaultSuccessMessage: i18n.t("eBooklets:toasts.fileStored"),
    });
  }, [fetchApi]);
  const fetchAccessCodePrintImageBlobUrl = useCallback(async (assetId) => {
    if (!assetId) return "";
    const response = await axiosInstance.get(`/admin/e-booklet-files/${assetId}/preview`, { responseType: "blob" });
    return URL.createObjectURL(response.data);
  }, []);
  const previewAccessCodePrintCard = useCallback(async (data) => {
    const response = await axiosInstance.post("/admin/e-booklet-access-code-print/preview", data, { responseType: "blob" });
    const contentType = response.headers?.["content-type"] || response.data?.type || "";
    if (!contentType.includes("image/png")) {
      throw new Error(i18n.t("eBooklets:toasts.printPreviewInvalidResponse", { defaultValue: "Preview did not return an image." }));
    }
    return URL.createObjectURL(response.data);
  }, []);
  const downloadAccessCodePrintBatchPdf = useCallback(async (batchId, filename = "e-booklet-access-codes.pdf") => {
    const response = await axiosInstance.get(`/admin/e-booklet-access-code-print/batches/${batchId}/pdf`, { responseType: "blob" });
    const url = URL.createObjectURL(response.data);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    return response;
  }, []);

  return {
    instances,
    pagination,
    status,
    loading,
    fetchInstances,
    fetchAllInstances,
    setPage,
    setStatus,
    updateQuota,
    updateInstanceAccessExpiry,
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
    createAccessCodePrintBatchSnapshot,
    listAccessCodePrintBatches,
    generateAccessCodePrintBatch,
    uploadAccessCodePrintImage,
    fetchAccessCodePrintImageBlobUrl,
    previewAccessCodePrintCard,
    downloadAccessCodePrintBatchPdf,
  };
}

export function useAdminEBookletTermsMilestones() {
  const { mutate: fetchApi, loading: apiLoading } = useApiMutation();
  const [terms, setTerms] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [progress, setProgress] = useState({ paidRedemptions: 0, achievements: [] });
  const [actionLoading, setActionLoading] = useState(false);
  const runAction = useCallback(async (action) => {
    setActionLoading(true);
    try {
      return await action();
    } finally {
      setActionLoading(false);
    }
  }, []);

  const fetchTerms = useCallback(async (filters = {}, options = {}) => {
    const query = new URLSearchParams();
    if (filters.status && filters.status !== "all") query.set("status", filters.status);
    if (filters.templateId !== undefined) query.set("template_id", filters.templateId === null ? "null" : String(filters.templateId));
    const response = await fetchApi({
      endpoint: `/admin/e-booklet-terms${query.toString() ? `?${query.toString()}` : ""}`,
      method: "get",
      suppressErrorToast: Boolean(options.suppressErrorToast),
    }, false);
    setTerms(Array.isArray(response?.data) ? response.data : []);
    return response;
  }, [fetchApi]);

  const fetchMilestones = useCallback(async (termId, options = {}) => {
    const query = termId ? `?term_id=${termId}` : "";
    const response = await fetchApi({
      endpoint: `/admin/e-booklet-milestones${query}`,
      method: "get",
      suppressErrorToast: Boolean(options.suppressErrorToast),
    }, false);
    const nextMilestones = Array.isArray(response?.data) ? response.data : [];
    setMilestones(nextMilestones);
    return response;
  }, [fetchApi]);

  const fetchProgress = useCallback(async (termId, options = {}) => {
    const query = termId ? `?term_id=${termId}` : "";
    const response = await fetchApi({
      endpoint: `/admin/e-booklet-progress${query}`,
      method: "get",
      suppressErrorToast: Boolean(options.suppressErrorToast),
    }, false);
    setProgress(response?.data || { paidRedemptions: 0, achievements: [] });
    return response;
  }, [fetchApi]);

  const createTerm = useCallback((data) => runAction(() => fetchApi({ endpoint: "/admin/e-booklet-terms", method: "post", data, defaultSuccessMessage: i18n.t("eBooklets:toasts.termSaved") })), [fetchApi, runAction]);
  const updateTerm = useCallback((termId, data) => runAction(() => fetchApi({ endpoint: `/admin/e-booklet-terms/${termId}`, method: "patch", data, defaultSuccessMessage: i18n.t("eBooklets:toasts.termSaved") })), [fetchApi, runAction]);
  const activateTerm = useCallback((termId) => runAction(() => fetchApi({ endpoint: `/admin/e-booklet-terms/${termId}/activate`, method: "post", defaultSuccessMessage: i18n.t("eBooklets:toasts.termActivated") })), [fetchApi, runAction]);
  const createMilestone = useCallback((data) => runAction(() => fetchApi({ endpoint: "/admin/e-booklet-milestones", method: "post", data, defaultSuccessMessage: i18n.t("eBooklets:toasts.milestoneSaved") })), [fetchApi, runAction]);
  const updateMilestone = useCallback((milestoneId, data) => runAction(() => fetchApi({ endpoint: `/admin/e-booklet-milestones/${milestoneId}`, method: "patch", data, defaultSuccessMessage: i18n.t("eBooklets:toasts.milestoneSaved") })), [fetchApi, runAction]);
  const deleteMilestone = useCallback((milestoneId) => runAction(async () => {
    const response = await fetchApi({ endpoint: `/admin/e-booklet-milestones/${milestoneId}`, method: "delete", defaultSuccessMessage: i18n.t("eBooklets:toasts.milestoneDeleted") });
    setMilestones((current) => current.filter((milestone) => Number(milestone.id) !== Number(milestoneId)));
    return response;
  }), [fetchApi, runAction]);
  const reorderMilestones = useCallback((termId, items) => runAction(() => fetchApi({ endpoint: "/admin/e-booklet-milestones/reorder", method: "post", data: { termId, items }, defaultSuccessMessage: i18n.t("eBooklets:toasts.milestonesReordered") })), [fetchApi, runAction]);

  return {
    terms,
    milestones,
    progress,
    loading: apiLoading,
    actionLoading,
    fetchTerms,
    fetchMilestones,
    fetchProgress,
    createTerm,
    updateTerm,
    activateTerm,
    createMilestone,
    updateMilestone,
    deleteMilestone,
    reorderMilestones,
  };
}

export function useAdminEBookletSettings() {
  const { mutate: fetchApi, loading } = useApiMutation();
  const [settings, setSettings] = useState(null);

  const fetchSettings = useCallback(async (options = {}) => {
    const response = await fetchApi({
      endpoint: "/admin/e-booklet-settings",
      method: "get",
      suppressErrorToast: Boolean(options.suppressErrorToast),
    }, false);
    setSettings(response?.data || null);
    return response;
  }, [fetchApi]);

  const updateSettings = useCallback(async (data) => {
    const response = await fetchApi({
      endpoint: "/admin/e-booklet-settings",
      method: "put",
      data,
      defaultSuccessMessage: i18n.t("eBooklets:toasts.settingsSaved", "E-booklet settings saved"),
    });
    setSettings(response?.data || null);
    return response;
  }, [fetchApi]);

  return { settings, loading, fetchSettings, updateSettings };
}

export function useAdminEBookletDevices() {
  const { mutate: fetchApi, loading } = useApiMutation();
  const [devices, setDevices] = useState([]);
  const [students, setStudents] = useState([]);

  const fetchDevices = useCallback(async (instanceId, userId) => {
    if (!instanceId || !userId) { setDevices([]); return { data: [] }; }
    const response = await fetchApi({ endpoint: `/admin/e-booklet-instances/${instanceId}/users/${userId}/devices`, method: "get" }, false);
    setDevices(Array.isArray(response?.data) ? response.data : []);
    return response;
  }, [fetchApi]);

  const fetchStudents = useCallback(async (instanceId) => {
    if (!instanceId) { setStudents([]); return { data: [] }; }
    const response = await fetchApi({ endpoint: `/admin/e-booklet-instances/${instanceId}/students`, method: "get" }, false);
    setStudents(Array.isArray(response?.data) ? response.data : []);
    return response;
  }, [fetchApi]);

  const resetDevices = useCallback((instanceId, userId, reason) => fetchApi({ endpoint: `/admin/e-booklet-instances/${instanceId}/users/${userId}/devices/reset`, method: "post", data: { reason }, defaultSuccessMessage: i18n.t("eBooklets:toasts.devicesReset") }), [fetchApi]);
  const addDeviceAllowance = useCallback((instanceId, userId, allowedDevices, reason) => fetchApi({ endpoint: `/admin/e-booklet-instances/${instanceId}/users/${userId}/device-allowance`, method: "post", data: { allowedDevices: Number(allowedDevices), reason }, defaultSuccessMessage: i18n.t("eBooklets:toasts.deviceAllowanceUpdated") }), [fetchApi]);

  const setDiscoveredStudents = useCallback((rows = []) => {
    setStudents(Array.isArray(rows) ? rows : []);
  }, []);

  return { devices, students, loading, fetchDevices, fetchStudents, resetDevices, addDeviceAllowance, setDiscoveredStudents };
}
