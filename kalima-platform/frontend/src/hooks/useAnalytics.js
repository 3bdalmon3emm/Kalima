import { useState, useCallback } from 'react';
import useApiMutation from './useApiMutation';
import { buildQueryString } from '@/lib/queryUtils';
import { getCairoDayRange } from '@/lib/cairoDayRange';

export const useAnalytics = () => {
    const { mutate: fetchApi, loading: apiLoading } = useApiMutation();

    const [storeStats, setStoreStats] = useState(null);
    const [dailyStoreStats, setDailyStoreStats] = useState(null);
    const [userStats, setUserStats] = useState(null);
    const [initLoading, setInitLoading] = useState(true);

    const loading = apiLoading || initLoading;

    const fetchStoreStats = useCallback(async (startDate, endDate) => {
        setInitLoading(true);
        try {
            const queryString = buildQueryString({ filters: { startDate, endDate } });
            const queryPart = queryString ? `?${queryString}` : '';

            const data = await fetchApi({
                endpoint: `/admin/dashboard/store-stats${queryPart}`,
                method: 'get'
            });

            if (data?.success) {
                setStoreStats(data.data?.overview || data.data);
            } else {
                setStoreStats(null);
            }
        } catch (error) {
            console.error("Failed to fetch store stats:", error);
            setStoreStats(null);
        } finally {
            setInitLoading(false);
        }
    }, [fetchApi]);

    const fetchDailyStoreStats = useCallback(async (startDate, endDate) => {
        setInitLoading(true);
        try {
            let finalStartDate = startDate;
            let finalEndDate = endDate;

            if (!startDate && !endDate) {
                const cairoDayRange = getCairoDayRange();
                finalStartDate = cairoDayRange.startDate;
                finalEndDate = cairoDayRange.endDate;
            }

            const queryString = buildQueryString({ filters: { startDate: finalStartDate, endDate: finalEndDate } });

            const data = await fetchApi({
                endpoint: `/admin/dashboard/store-stats?${queryString}`,
                method: 'get'
            });

            if (data?.success) {
                setDailyStoreStats(data.data?.overview || data.data);
            } else {
                setDailyStoreStats(null);
            }
        } catch (error) {
            console.error("Failed to fetch daily store stats:", error);
            setDailyStoreStats(null);
        } finally {
            setInitLoading(false);
        }
    }, [fetchApi]);

    const fetchUserStats = useCallback(async () => {
        setInitLoading(true);
        try {
            const data = await fetchApi({
                endpoint: '/admin/dashboard/user-stats',
                method: 'get'
            });

            if (data?.success) {
                setUserStats(data.data);
            } else {
                setUserStats(null);
            }
        } catch (error) {
            console.error("Failed to fetch user stats:", error);
            setUserStats(null);
        } finally {
            setInitLoading(false);
        }
    }, [fetchApi]);

    return {
        // State
        storeStats,
        dailyStoreStats,
        userStats,
        loading,

        // Actions
        fetchStoreStats,
        fetchDailyStoreStats,
        fetchUserStats
    };
};

export default useAnalytics;
