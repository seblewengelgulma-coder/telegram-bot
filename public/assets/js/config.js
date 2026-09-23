/**
 * Telegram WebApp Config
 */
export const tg = window.Telegram?.WebApp || {};
export const USER_ID = tg.initDataUnsafe?.user?.id || null;
export const USER_NAME = tg.initDataUnsafe?.user?.first_name || 'Guest';