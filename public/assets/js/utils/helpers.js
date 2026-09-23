/**
 * Data and Formatting Helper Functions
 */

// 1. የቢንጎ ቁጥሮችን በ B-I-N-G-O ፊደላት መቅረጫ (Format)
export function getFormattedBingoNum(number) {
    const num = Number(number);
    if (num >= 1 && num <= 15) return `B-${num}`;
    if (num >= 16 && num <= 30) return `I-${num}`;
    if (num >= 31 && num <= 45) return `N-${num}`;
    if (num >= 46 && num <= 60) return `G-${num}`;
    if (num >= 61 && num <= 75) return `O-${num}`;
    return `${num}`;
}

// 2. የገንዘብ መጠንን በብር (ETB) መልክ ማስተካከያ (e.g. 1,500.00 ETB)
export function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'ETB',
        minimumFractionDigits: 2
    }).format(amount).replace('ETB', '') + ' ETB';
}

// 3. የርዝመት ገደብ ያላቸውን ጽሁፎች ማሳጠሪያ (e.g., "0x1234...5678")
export function truncateString(str, maxLength = 10) {
    if (!str) return '';
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength) + '...';
}

// 4. የስልክ ቁጥር ኢትዮጵያዊ ፎርማት መሆኑን ማረጋገጫ (Validation)
export function isValidEthiopianPhone(phone) {
    const regex = /^(09|07|\+2519|\+2517)[0-9]{8}$/;
    return regex.test(phone.trim());
}

// 5. ከ Telegram WebApp Haptic Feedback መስጫ (ስልኩ እንዲርገበገብ ለማድረግ)
export function triggerHaptic(type = 'light') {
    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback) {
        if (type === 'success' || type === 'error' || type === 'warning') {
            window.Telegram.WebApp.HapticFeedback.notificationOccurred(type);
        } else {
            window.Telegram.WebApp.HapticFeedback.impactOccurred(type);
        }
    }
}