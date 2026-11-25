import { useState, useEffect, useCallback } from 'react';
import useApiMutation from './useApiMutation';
import { buildQueryString } from '@/lib/queryUtils';

export const useOrders = (optionsOrId = null) => {
    const { mutate: fetchApi, loading: apiLoading } = useApiMutation();

    let id = null;
    let initialLimit = 8;
    let autoFetch = true;

    let initialProductId = null;

    if (optionsOrId !== null) {
        if (typeof optionsOrId === 'object') {
            id = optionsOrId.id || null;
            initialLimit = optionsOrId.limit || 8;
            if (optionsOrId.autoFetch !== undefined) autoFetch = optionsOrId.autoFetch;
            if (optionsOrId.productId !== undefined) initialProductId = optionsOrId.productId;
        } else {
            id = optionsOrId;
        }
    }

    // List state
    const [orders, setOrders] = useState([]);
    const [pagination, setPagination] = useState({
        total: 0,
        page: 1,
        pages: 1,
        limit: initialLimit
    });
    const [filters, setFilters] = useState({
        search: '',
        status: '',
        startDate: null,
        endDate: null,
        productId: initialProductId,
    });

    // Single order state
    const [selectedOrder, setSelectedOrder] = useState(null);

    const [initLoading, setInitLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);

    const loading = apiLoading || initLoading;

    const buildQuery = useCallback(() => {
        return buildQueryString({ pagination, filters });
    }, [pagination.page, pagination.limit, filters]);

    const fetchOrders = useCallback(async () => {
        try {
            const data = await fetchApi({
                endpoint: `/purchases?${buildQuery()}`,
                method: 'get'
            });

            if (data?.success) {
                // The API might return purchases wrapped in data.purchases or just as the data object directly
                const resultData = data.data?.purchases || data.data || [];
                setOrders(resultData);

                const responsePage = data.pagination || data;
                setPagination(prev => ({
                    ...prev,
                    total: responsePage.total ?? prev.total,
                    page: responsePage.page ?? prev.page,
                    pages: responsePage.pages ?? prev.pages,
                    limit: responsePage.limit ?? prev.limit,
                }));
            } else {
                setOrders([]);
            }
        } catch (error) {
            console.error("Failed to fetch orders:", error);
            setOrders([]);
        } finally {
            setInitLoading(false);
        }
    }, [fetchApi, buildQuery]);

    const fetchMyOrders = useCallback(async () => {
        try {
            const data = await fetchApi({
                endpoint: `/purchases/my?${buildQuery()}`,
                method: 'get'
            });

            if (data?.success) {
                const resultData = data.data?.purchases || data.data || [];
                setOrders(resultData);

                const responsePage = data.pagination || data;
                setPagination(prev => ({
                    ...prev,
                    total: responsePage.total ?? prev.total,
                    page: responsePage.page ?? prev.page,
                    pages: responsePage.pages ?? prev.pages,
                    limit: responsePage.limit ?? prev.limit,
                }));
            } else {
                setOrders([]);
            }
        } catch (error) {
            console.error("Failed to fetch my orders:", error);
            setOrders([]);
        } finally {
            setInitLoading(false);
        }
    }, [fetchApi, buildQuery]);

    const fetchOrderById = useCallback(async (orderId) => {
        try {
            const data = await fetchApi({
                endpoint: `/purchases/${orderId}`,
                method: 'get'
            });

            if (data?.success) {
                // The single purchase might be wrapped in data.purchase or just data.data
                const resultData = data.data?.purchase || data.data;
                setSelectedOrder(resultData);
            } else {
                setSelectedOrder(null);
            }
        } catch (error) {
            console.error(`Failed to fetch order ${orderId}:`, error);
            setSelectedOrder(null);
        } finally {
            setInitLoading(false);
        }
    }, [fetchApi]);

    useEffect(() => {
        if (!autoFetch) {
            setInitLoading(false);
            return;
        }
        setInitLoading(true);
        if (id) {
            fetchOrderById(id);
        } else {
            fetchOrders();
        }
    }, [id, fetchOrders, fetchOrderById, autoFetch]);

    const handleAction = async (actionFn) => {
        setActionLoading(true);
        try {
            return await actionFn();
        } finally {
            setActionLoading(false);
        }
    };

    const receiveOrder = (orderId) => handleAction(() => fetchApi({ endpoint: `/purchases/${orderId}/receive`, method: 'patch' }).then(res => { if (!id) fetchOrders(); else fetchOrderById(id); return res; }));
    const confirmOrder = (orderId) => handleAction(() => fetchApi({ endpoint: `/purchases/${orderId}/confirm`, method: 'patch' }).then(res => { if (!id) fetchOrders(); else fetchOrderById(id); return res; }));
    const deliverOrder = (orderId) => handleAction(() => fetchApi({ endpoint: `/purchases/${orderId}/deliver`, method: 'patch' }).then(res => { if (!id) fetchOrders(); else fetchOrderById(id); return res; }));
    const returnOrder = (orderId) => handleAction(() => fetchApi({ endpoint: `/purchases/${orderId}/return`, method: 'patch' }).then(res => { if (!id) fetchOrders(); else fetchOrderById(id); return res; }));
    const addAdminNote = (orderId, note) => handleAction(() => fetchApi({ endpoint: `/purchases/${orderId}/admin-note`, method: 'patch', data: { admin_notes: note } }).then(res => { if (!id) fetchOrders(); else fetchOrderById(id); return res; }));

    // Deleting needs a reason (kept with the order for the Admin).
    const deleteOrder = (orderId, reason) => handleAction(() => fetchApi({ endpoint: `/purchases/${orderId}`, method: 'delete', data: { reason } }).then(res => { if (!id) fetchOrders(); return res; }));
    const deleteOrderItem = (orderId, itemId) => handleAction(() => fetchApi({ endpoint: `/purchases/${orderId}/items/${itemId}`, method: 'delete' }).then(res => { if (id) fetchOrderById(id); return res; }));

    const setSearch = useCallback((query) => {
        setFilters((prev) => ({ ...prev, search: query }));
        setPagination((prev) => ({ ...prev, page: 1 }));
    }, []);

    const setStatus = useCallback((status) => {
        setFilters((prev) => ({ ...prev, status }));
        setPagination((prev) => ({ ...prev, page: 1 }));
    }, []);

    // The customer's current account level.
    const setFlag = useCallback((flag) => {
        setFilters((prev) => ({ ...prev, flag: flag === 'all' ? '' : flag }));
        setPagination((prev) => ({ ...prev, page: 1 }));
    }, []);

    const setDateRange = useCallback((startDate, endDate) => {
        setFilters((prev) => ({ ...prev, startDate, endDate }));
        setPagination((prev) => ({ ...prev, page: 1 }));
    }, []);

    const setPage = useCallback((page) => {
        setPagination((prev) => ({ ...prev, page }));
    }, []);

    return {
        // State
        orders,
        pagination,
        filters,
        selectedOrder,
        loading,
        actionLoading,

        // Actions
        fetchOrders,
        fetchMyOrders,
        fetchOrderById,
        receiveOrder,
        confirmOrder,
        deliverOrder,
        returnOrder,
        addAdminNote,
        deleteOrder,
        deleteOrderItem,

        // Setters
        setSearch,
        setStatus,
        setFlag,
        setDateRange,
        setPage
    };
};

export default useOrders;
