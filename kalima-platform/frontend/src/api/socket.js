import { io } from 'socket.io-client';

const resolveSocketURL = () => {
    // Same rule as the API in api/axios.js: the dev site talks to the dev
    // server, not to the production address baked into production builds.
    if (window.location.hostname.includes('dev')) return 'wss://dev.kalima-edu.com';
    const target = import.meta.env.VITE_API_PROXY_TARGET || import.meta.env.VITE_API_URL || '';
    if (!/^https?:\/\//.test(target)) return undefined;
    return target.replace(/\/api\/v\d+\/?$/, '').replace('https', 'wss');
};

const socketURL = resolveSocketURL();
console.log('Socket URL initialized:', socketURL);

const socket = io(socketURL, {
    autoConnect: false, // Don't connect until requested
    auth: {
        token: localStorage.getItem('accessToken')
    }
});

socket.on('connect', () => {
    console.log('Socket connected successfully');
});

socket.on('connect_error', (err) => {
    console.error('Socket connection error:', err.message);
});

socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
});

export const connectSocket = () => {
    const token = localStorage.getItem('accessToken');
    if (token) {
        socket.auth = { token: `Bearer ${token}` };
        // Also set in extraHeaders for some server configurations
        socket.io.opts.extraHeaders = {
            Authorization: `Bearer ${token}`
        };
    } else {
        console.warn('No access token found for socket connection');
    }

    if (!socket.connected) {
        console.log('Attempting to connect to socket...');
        socket.connect();
    }
};

export const disconnectSocket = () => {
    if (socket.connected) {
        socket.disconnect();
    }
};

export default socket;
