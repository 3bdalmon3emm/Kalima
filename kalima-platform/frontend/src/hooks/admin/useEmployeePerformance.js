import { useState, useCallback } from 'react';
import useApiMutation from '../useApiMutation';

// Upper bound for eligible staff (Admin/SubAdmin/Moderator) shown in the
// confirmed-purchases-by-manager table, which has no pagination controls.
const CONFIRMED_COUNT_PAGE_LIMIT = '500';

export const useEmployeePerformance = () => {
    const { mutate: fetchApi, loading: apiLoading } = useApiMutation();

    const [loading, setLoading] = useState(false);
    const [confirmerStats, setConfirmerStats] = useState(null);
    const [confirmedCount, setConfirmedCount] = useState(null);
    const [createdAccounts, setCreatedAccounts] = useState(null);

    const [employeeSalesDetails, setEmployeeSalesDetails] = useState(null);

    const fetchConfirmerStats = useCallback(async () => {
        setLoading(true);
        try {
            const data = await fetchApi({ endpoint: '/admin/dashboard/confirmer-stats', method: 'get' });
            if (data?.success) setConfirmerStats(data.data);
        } finally { setLoading(false); }
    }, [fetchApi]);

    const fetchConfirmedCount = useCallback(async (month, year) => {
        setLoading(true);
        try {
            const queries = new URLSearchParams();
            if (month) queries.append('month', month);
            if (year) queries.append('year', year);
            // This table has no pagination UI, so request all eligible staff in a
            // single page. Without an explicit limit the API defaults to 10 rows,
            // which silently hides every employee past the first 10 (Arabic names
            // sort after Latin ones, so real staff fell off the visible page).
            queries.append('limit', CONFIRMED_COUNT_PAGE_LIMIT);
            const data = await fetchApi({ endpoint: `/purchases/confirmed-count?${queries.toString()}`, method: 'get' });
            if (data?.success) setConfirmedCount(data.data);
        } finally { setLoading(false); }
    }, [fetchApi]);

    const fetchCreatedAccounts = useCallback(async () => {
        setLoading(true);
        try {
            const data = await fetchApi({ endpoint: '/admin/users/stats/created-accounts', method: 'get' });
            if (data?.success) setCreatedAccounts(data.data);
        } finally { setLoading(false); }
    }, [fetchApi]);

    const fetchEmployeeProducts = useCallback(async (employeeId, params = {}) => {
        setLoading(true);
        try {
            const queries = new URLSearchParams();
            if (params.month) queries.append('month', params.month);
            if (params.year) queries.append('year', params.year);
            if (params.type && params.type !== 'all') queries.append('type', params.type);
            if (params.search) queries.append('search', params.search);
            if (params.page) queries.append('page', params.page);
            if (params.limit) queries.append('limit', params.limit);

            const queryString = queries.toString() ? `?${queries.toString()}` : '';
            const data = await fetchApi({
                endpoint: `/purchases/confirmed-items/${employeeId}${queryString}`,
                method: 'get'
            });
            if (data?.success) {
                setEmployeeSalesDetails(data.data);
                return data.data;
            }
            return null;
        } finally {
            setLoading(false);
        }
    }, [fetchApi]);

    return {
        loading: loading || apiLoading,
        confirmerStats,
        confirmedCount,
        createdAccounts,
        employeeSalesDetails,
        fetchConfirmerStats,
        fetchConfirmedCount,
        fetchCreatedAccounts,
        fetchEmployeeProducts
    };
};

export default useEmployeePerformance;
