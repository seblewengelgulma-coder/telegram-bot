/**
 * UI Helper Utility Functions
 */

// 1. Toast / Alert ማሳወቂያ ማሳያ (ምሳሌ፡ ስኬት፣ ስህተት ወይም ማስጠንቀቂያ)
export function showNotification(message, type = 'info') {
    const existingToast = document.getElementById('custom-toast');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.id = 'custom-toast';
    
    // የቲም ከለሮች እንደ ማሳወቂያው አይነት
    let bgColor = 'bg-blue-600';
    if (type === 'success') bgColor = 'bg-green-600';
    if (type === 'error') bgColor = 'bg-red-600';
    if (type === 'warning') bgColor = 'bg-yellow-600';

    toast.className = `fixed top-5 right-5 z-50 ${bgColor} text-white px-4 py-3 rounded-xl shadow-lg transition-all duration-300 transform translate-y-0 text-sm font-medium flex items-center gap-2`;
    toast.innerHTML = `
        <span>${message}</span>
        <button onclick="this.parentElement.remove()" class="ml-2 font-bold text-lg">&times;</button>
    `;

    document.body.appendChild(toast);

    // ከ 3 ሰከንድ በኋላ በራሱ እንዲጠፋ
    setTimeout(() => {
        if (toast) toast.remove();
    }, 3000);
}

// 2. Modals (ፖፕ-አፕ) መክፈቻ እና መዝጋቻ
export function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
}

export function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

// 3. Loading Spinner መቆጣጠሪያ
export function showLoading(elementId) {
    const el = document.getElementById(elementId);
    if (el) {
        el.dataset.originalHtml = el.innerHTML;
        el.innerHTML = `<div class="animate-spin rounded-full h-5 w-5 border-b-2 border-white mx-auto"></div>`;
        el.disabled = true;
    }
}

export function hideLoading(elementId) {
    const el = document.getElementById(elementId);
    if (el && el.dataset.originalHtml) {
        el.innerHTML = el.dataset.originalHtml;
        el.disabled = false;
    }
}

// 4. Tab Switching (በየገጾቹ/ታቦቹ መካከል ለመቀያየር)
export function switchTab(tabName) {
    const tabs = document.querySelectorAll('.tab-content');
    const navButtons = document.querySelectorAll('.nav-btn');

    tabs.forEach(tab => {
        if (tab.id === `${tabName}-tab`) {
            tab.classList.remove('hidden');
        } else {
            tab.classList.add('hidden');
        }
    });

    navButtons.forEach(btn => {
        if (btn.dataset.tab === tabName) {
            btn.classList.add('active-tab');
        } else {
            btn.classList.remove('active-tab');
        }
    });
}