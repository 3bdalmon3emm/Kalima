import axios from 'axios';
import i18n from '../i18n';
import { toast } from 'sonner';
import { performLocalLogout } from '../lib/authUtils';
import { translateBackendMessage } from '../lib/utils';

const baseURL = window.location.hostname.includes('dev') 
  ? 'https://dev.kalima-edu.com/api/v2' 
  : (import.meta.env.VITE_API_URL || '/api/v2');

const axiosInstance = axios.create({
    baseURL,
    headers: {
        'Content-Type': 'application/json',
    },
    withCredentials: true,
});

let refreshTokenPromise = null;

const decodeToken = (token) => {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function (c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));

        return JSON.parse(jsonPayload);
    } catch (e) {
        return null;
    }
};

// Request Interceptor
axiosInstance.interceptors.request.use(
    async (config) => {
        if (typeof FormData !== 'undefined' && config.data instanceof FormData && config.headers) {
            delete config.headers['Content-Type'];
            if (typeof config.headers.delete === 'function') {
                config.headers.delete('Content-Type');
            }
        }

        // Skip refresh logic for auth endpoints
        if (config.url?.includes('/auth/login') || config.url?.includes('/auth/refresh') || config.url?.includes('/auth/register')) {
            const accessToken = localStorage.getItem('accessToken');
            if (accessToken) {
                config.headers.Authorization = `Bearer ${accessToken}`;
            }
            return config;
        }

        let accessToken = localStorage.getItem('accessToken');
        const refreshToken = localStorage.getItem('refreshToken');

        if (accessToken) {
            const decodedToken = decodeToken(accessToken);
            // Check if token is expired or about to expire in less than 2 minutes (120 seconds)
            const currentTime = Date.now() / 1000;

            if (decodedToken && decodedToken.exp < currentTime + 120) {
                if (refreshToken) {
                    if (!refreshTokenPromise) {
                        refreshTokenPromise = axios.post(`${baseURL}/auth/refresh`, { refreshToken })
                            .then(response => {
                                const newTokens = response.data?.tokens || response.data?.data?.tokens;
                                if (newTokens && newTokens.accessToken) {
                                    localStorage.setItem('accessToken', newTokens.accessToken);
                                    if (newTokens.refreshToken) {
                                        localStorage.setItem('refreshToken', newTokens.refreshToken);
                                    }
                                    return newTokens.accessToken;
                                }
                                throw new Error('No access token returned');
                            })
                            .catch(error => {
                                performLocalLogout();
                                throw error;
                            })
                            .finally(() => {
                                refreshTokenPromise = null;
                            });
                    }

                    try {
                        accessToken = await refreshTokenPromise;
                    } catch (error) {
                        return Promise.reject(error);
                    }
                } else {
                    performLocalLogout();
                    return Promise.reject(new Error('Session expired'));
                }
            }

            config.headers.Authorization = `Bearer ${accessToken}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response Interceptor
axiosInstance.interceptors.response.use(
    (response) => {
        return response;
    },
    (error) => {
        if (axios.isCancel(error) || error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError') {
            return Promise.reject(error);
        }

        if (error?.config?.suppressErrorToast) {
            return Promise.reject(error);
        }

        const { response } = error;
        let errorMessage = i18n.t('auth:errors.default', "حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.");
        let errorDetails = '';

        const extractErrorMessage = (obj) => {
            if (typeof obj === 'string') return obj;
            if (typeof obj === 'object' && obj !== null) {
                return obj.message || obj.msg || obj.error;
            }
            return null;
        };

        const normalizeErrorDetails = (rawErrors) => {
            if (!rawErrors) return '';

            if (Array.isArray(rawErrors)) {
                const details = rawErrors.map(extractErrorMessage).filter(Boolean);
                if (details.length) return details.slice(0, 3).join('\n');
            }

            const detail = extractErrorMessage(rawErrors);
            return detail || '';
        };

        if (response) {
            switch (response.status) {
                case 400:
                    // Handle validation errors or bad requests
                    errorMessage = response.data.message || i18n.t('auth:validation.required', "هذا الحقل مطلوب"); // Fallback
                    break;
                case 409:
                    errorMessage = response.data.message || i18n.t('auth:errors.conflict', "This information is already in use.");
                    break;
                case 422:
                    errorMessage = response.data.message || i18n.t('auth:errors.validation_failed', "Please fix the highlighted fields and try again.");
                    break;
                case 401:
                    if (error.config && error.config.url && error.config.url.includes('/auth/login')) {
                        errorMessage = i18n.t('auth:errors.invalid_credentials', 'البريد الإلكتروني أو كلمة المرور غير صحيحة. يرجى المحاولة مرة أخرى.');
                    } else {
                        errorMessage = i18n.t('auth:errors.unauthorized', "لست مخولاً للقيام بهذا الإجراء.");
                        if (!import.meta.env.DEV || import.meta.env.VITE_DEV_BYPASS_AUTH === 'false') {
                            performLocalLogout();
                        }
                        // Final fallback logout if 401 occurs despite proactive refresh
                    }
                    break;
                case 403:
                    errorMessage = i18n.t('auth:errors.forbidden', "ليس لديك صلاحية للوصول إلى هذا المورد.");
                    break;
                case 404:
                    errorMessage = response.data.message || i18n.t('auth:errors.default', "حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.");
                    break;
                case 500:
                    errorMessage = i18n.t('auth:errors.server_error', "خطأ في الخادم. يرجى المحاولة مرة أخرى لاحقًا.");
                    break;
                default:
                    errorMessage = response.data.message || errorMessage;
            }
            errorDetails = normalizeErrorDetails(
                response?.data?.errors
                || response?.data?.details
                || response?.data?.error
            );
        } else if (error.request) {
            // The request was made but no response was received
            errorMessage = i18n.t('auth:errors.network_error', "خطأ في الشبكة. يرجى التحقق من اتصالك.");
        }

        // in case of empy cart no need to show error toast, as this is a common scenario and we handle it gracefully in the UI
        if (errorMessage !== 'Active cart not found') {
            const translatedMessage = translateBackendMessage(errorMessage);
            const translatedDetails = translateBackendMessage(errorDetails);
            toast.error(translatedMessage, translatedDetails ? { description: translatedDetails } : undefined);
        }
        return Promise.reject(error);
    }
);

export default axiosInstance;