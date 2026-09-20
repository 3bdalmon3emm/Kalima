import { useCallback, useEffect, useMemo, useState } from "react";
import i18n from "@/i18n";
import useApiMutation from "./useApiMutation";
import { getApiUrl } from "@/lib/storeUtils";

const E_BOOKLET_CART_KEY = "kalima:e-booklet-cart:v1";
const API_BASE_URL = getApiUrl().replace(/\/$/, "");

const parseNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getActiveVersion = (template) => {
  if (!template) return null;
  if (template.active_version) return template.active_version;
  if (template.template_version) return template.template_version;
  if (Array.isArray(template.versions) && template.versions.length > 0) {
    return template.versions[0];
  }
  return null;
};

const getHotspotCount = (template, version) => {
  return (
    template?.hotspot_count ??
    version?._count?.hotspots ??
    template?._count?.hotspots ??
    0
  );
};

const getHotspots = (template, version) => {
  if (Array.isArray(version?.hotspots)) return version.hotspots;
  if (Array.isArray(template?.hotspots)) return template.hotspots;
  return [];
};

const getInstanceTemplate = (instance) => instance?.template || instance;

const getInstanceVersion = (instance, template) =>
  instance?.template_version || template?.active_version || template?.template_version;

const getPublicCoverUrl = (template) => {
  const assetId = template?.cover_file_id || template?.cover_file?.id;
  return assetId ? `${API_BASE_URL}/e-booklet-store/covers/${assetId}` : null;
};

const getReleaseInfo = (template) => {
  const releaseAt = template?.release_at || template?.releaseAt || null;
  const releaseDate = releaseAt ? new Date(releaseAt) : null;
  const isReleased = template?.is_released ?? (!releaseDate || releaseDate <= new Date());
  return {
    release_at: releaseAt,
    is_released: Boolean(isReleased),
    time_until_release_ms: template?.time_until_release_ms ?? (releaseDate && releaseDate > new Date() ? releaseDate.getTime() - Date.now() : null),
    exact_minute: template?.exact_minute ?? (releaseDate ? releaseDate.getMinutes() : null),
  };
};

export const normalizeEBookletTemplate = (template) => {
  const sourceTemplate = getInstanceTemplate(template);
  const activeVersion = getInstanceVersion(template, sourceTemplate) || getActiveVersion(sourceTemplate);
  const releaseInfo = getReleaseInfo(sourceTemplate || template);

  return {
    ...template,
    template: sourceTemplate,
    instanceId: template?.instanceId ?? (template?.template_id && template?.id !== template?.template_id ? template?.id : undefined),
    template_id: template?.template_id || sourceTemplate?.id,
    template_version_id: template?.template_version_id || activeVersion?.id,
    activeVersion,
    coverUrl:
      sourceTemplate?.cover_url ||
      sourceTemplate?.cover_file?.url ||
      sourceTemplate?.cover_file?.storage_url ||
      getPublicCoverUrl(sourceTemplate) ||
      null,
    categoryTitle:
      sourceTemplate?.category?.title ||
      sourceTemplate?.category_title ||
      null,
    pageCount: parseNumber(
      sourceTemplate?.page_count ?? activeVersion?.page_count,
      0,
    ),
    hotspotCount: parseNumber(getHotspotCount(sourceTemplate, activeVersion), 0),
    hotspots: getHotspots(sourceTemplate, activeVersion),
    price: parseNumber(template?.student_marketing_price ?? template?.price, 0),
    currency: template?.currency || sourceTemplate?.currency || "EGP",
    title: sourceTemplate?.title || template?.title,
    slug: sourceTemplate?.slug || template?.slug || String(template?.id || ""),
    description: sourceTemplate?.description || template?.description,
    teacherName: template?.teacher?.name || template?.teacher?.full_name || template?.teacher_name || null,
    seatsRemaining: template?.seats_remaining ?? template?.remaining_seats,
    studentLimit: template?.student_limit,
    accessExpiresAt: template?.access_expires_at,
    payment_methods: sourceTemplate?.payment_methods || template?.payment_methods || [],
    required_fields: sourceTemplate?.required_fields || template?.required_fields || [],
    release_at: releaseInfo.release_at,
    is_released: releaseInfo.is_released,
    time_until_release_ms: releaseInfo.time_until_release_ms,
    exact_minute: releaseInfo.exact_minute,
  };
};

const readCart = () => {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(E_BOOKLET_CART_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeCart = (items) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(E_BOOKLET_CART_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event("e-booklet-cart-change"));
};

export const buildEBookletCartItem = (template) => {
  const normalized = normalizeEBookletTemplate(template);

  return {
    id: normalized.instanceId || normalized.template_id,
    instance_id: normalized.instanceId,
    template_id: normalized.template_id,
    template_version_id: normalized.template_version_id || normalized.activeVersion?.id,
    slug: normalized.slug,
    title: normalized.title,
    description: normalized.description,
    price: normalized.price,
    unit_price: normalized.price,
    quantity: 1,
    currency: normalized.currency,
    coverUrl: normalized.coverUrl,
    pageCount: normalized.pageCount,
    hotspotCount: normalized.hotspotCount,
    payment_methods: normalized.payment_methods || [],
    required_fields: normalized.required_fields || [],
    release_at: normalized.release_at,
    is_released: normalized.is_released,
    time_until_release_ms: normalized.time_until_release_ms,
    exact_minute: normalized.exact_minute,
  };
};

export function useEBookletCart() {
  const [items, setItems] = useState(readCart);

  useEffect(() => {
    const sync = () => setItems(readCart());
    window.addEventListener("storage", sync);
    window.addEventListener("e-booklet-cart-change", sync);

    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("e-booklet-cart-change", sync);
    };
  }, []);

  const addTemplate = useCallback((template) => {
    const nextItem = buildEBookletCartItem(template);
    const currentItems = readCart();
    const existingIndex = currentItems.findIndex(
      (item) => String(item.template_id) === String(nextItem.template_id),
    );
    const nextItems =
      existingIndex >= 0
        ? currentItems.map((item, index) => (index === existingIndex ? nextItem : item))
        : [...currentItems, nextItem];
    writeCart(nextItems);
    setItems(nextItems);
    return nextItem;
  }, []);

  const removeItem = useCallback((templateId) => {
    const nextItems = readCart().filter(
      (item) => String(item.template_id) !== String(templateId),
    );
    writeCart(nextItems);
    setItems(nextItems);
  }, []);

  const clear = useCallback(() => {
    writeCart([]);
    setItems([]);
  }, []);

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + parseNumber(item.price, 0), 0),
    [items],
  );
  const discount = 0;
  const total = subtotal - discount;

  const count = useMemo(() => items.length, [items]);

  return {
    items,
    item: items[0] || null,
    count,
    subtotal,
    discount,
    total,
    currency: items[0]?.currency || "EGP",
    addTemplate,
    removeItem,
    clear,
  };
}

export function useEBookletStore(initialParams = {}) {
  const { mutate: fetchApi, loading: apiLoading } = useApiMutation();
  const [templates, setTemplates] = useState([]);
  const [filters, setFilters] = useState({
    search: initialParams.search || "",
    category_id: initialParams.category_id || null,
  });
  const [pagination, setPagination] = useState({
    page: initialParams.page ?? 1,
    limit: initialParams.limit ?? 12,
    total: 0,
  });
  const [initLoading, setInitLoading] = useState(true);

  const fetchTemplates = useCallback(async () => {
    const query = new URLSearchParams();
    query.set("page", String(pagination.page));
    query.set("limit", String(pagination.limit));
    if (filters.search) query.set("search", filters.search);
    if (filters.category_id) query.set("category_id", filters.category_id);

    try {
      const response = await fetchApi({
        endpoint: `/e-booklet-store?${query.toString()}`,
        method: "get",
      }, false);

      setTemplates(
        Array.isArray(response?.data)
          ? response.data.map(normalizeEBookletTemplate)
          : [],
      );
      setPagination((current) => ({
        ...current,
        total: response?.total ?? 0,
        page: response?.page ?? current.page,
        limit: response?.limit ?? current.limit,
      }));
    } catch (error) {
      console.error("Failed to fetch e-booklet templates:", error);
      setTemplates([]);
    } finally {
      setInitLoading(false);
    }
  }, [
    fetchApi,
    filters.category_id,
    filters.search,
    pagination.limit,
    pagination.page,
  ]);

  useEffect(() => {
    setInitLoading(true);
    fetchTemplates();
  }, [fetchTemplates]);

  const setSearch = useCallback((search) => {
    setFilters((current) => ({ ...current, search }));
    setPagination((current) => ({ ...current, page: 1 }));
  }, []);

  const setCategory = useCallback((categoryId) => {
    setFilters((current) => ({ ...current, category_id: categoryId }));
    setPagination((current) => ({ ...current, page: 1 }));
  }, []);

  const setPage = useCallback((page) => {
    setPagination((current) => ({ ...current, page }));
  }, []);

  return {
    templates,
    filters,
    pagination,
    setSearch,
    setCategory,
    setPage,
    refresh: fetchTemplates,
    loading: apiLoading || initLoading,
  };
}

export function useEBookletTemplate(templateId, options = {}) {
  const { legacyInstance = false } = options;
  const { mutate: fetchApi, loading: apiLoading } = useApiMutation();
  const [template, setTemplate] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [initLoading, setInitLoading] = useState(Boolean(templateId));

  useEffect(() => {
    if (!templateId) return undefined;
    let active = true;

    const fetchTemplate = async () => {
      setInitLoading(true);
      setNotFound(false);

      try {
        const response = await fetchApi({
          endpoint: legacyInstance
            ? `/e-booklet-store/instances/${templateId}`
            : `/e-booklet-store/${templateId}`,
          method: "get",
        }, false);

        if (!active) return;
        if (response?.success && response?.data) {
          setTemplate(normalizeEBookletTemplate(response.data));
        } else {
          setTemplate(null);
          setNotFound(true);
        }
      } catch (error) {
        if (!active) return;
        console.error(`Failed to fetch e-booklet template ${templateId}:`, error);
        setTemplate(null);
        setNotFound(true);
      } finally {
        if (active) setInitLoading(false);
      }
    };

    fetchTemplate();
    return () => {
      active = false;
    };
  }, [fetchApi, legacyInstance, templateId]);

  return {
    template,
    notFound,
    loading: apiLoading || initLoading,
  };
}

export function useEBookletCheckout() {
  const { mutate, loading, error } = useApiMutation();

  const checkRepeatPurchases = useCallback(
    async (templateIds) => {
      return mutate(
        {
          endpoint: "/e-booklet-checkout/repeat-purchases",
          method: "post",
          data: { template_ids: templateIds },
          showToast: false,
        },
        false,
      );
    },
    [mutate],
  );

  const submitCheckout = useCallback(
    async (payload) => {
      return mutate({
        endpoint: "/e-booklet-checkout",
        method: "post",
        data: payload,
        defaultSuccessMessage: i18n.t("eBooklets:toasts.requestSubmitted"),
      });
    },
    [mutate],
  );

  return {
    checkRepeatPurchases,
    submitCheckout,
    loading,
    error,
  };
}

export function useEBookletOrders() {
  const { mutate: fetchApi, loading, error } = useApiMutation();
  const [orders, setOrders] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1, limit: 20 });
  const [filters, setFilters] = useState({ status: "all" });

  const fetchOrders = useCallback(
    async (params = {}) => {
      const nextPage = params.page ?? pagination.page;
      const nextLimit = params.limit ?? pagination.limit;
      const nextStatus = params.status ?? filters.status;
      const query = {
        page: nextPage,
        limit: nextLimit,
        ...(nextStatus && nextStatus !== "all" ? { status: nextStatus } : {}),
      };

      const response = await fetchApi(
        {
          endpoint: "/e-booklet-orders",
          method: "get",
          params: query,
        },
        false,
      );
      const payload = Array.isArray(response?.data) ? response : (response?.data || response || {});
      const data = Array.isArray(payload.data) ? payload.data : [];
      const total = payload.total ?? data.length;
      const page = payload.page ?? nextPage ?? 1;
      const limit = payload.limit ?? nextLimit ?? 20;
      setOrders(data);
      setPagination({
        total,
        page,
        pages: Math.max(1, Math.ceil(total / Math.max(1, limit))),
        limit,
      });
      return payload;
    },
    [fetchApi, filters.status, pagination.limit, pagination.page],
  );

  const setStatus = useCallback((status) => {
    setFilters((current) => ({ ...current, status }));
    setPagination((current) => ({ ...current, page: 1 }));
  }, []);

  const setPage = useCallback((page) => {
    setPagination((current) => ({ ...current, page }));
  }, []);

  return { orders, pagination, filters, fetchOrders, setStatus, setPage, loading, error };
}
