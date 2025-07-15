const vcContent = document.getElementById('vc-content');

function initVC() {
    if (netWorth >= 5000000) {
        vcContent.innerHTML = '<p>Welcome to the Venture Capital world!</p>';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (typeof netWorth !== 'undefined') {
        initVC();
    } else {
        // If main.js hasn't loaded yet, wait for it
        setTimeout(initVC, 500);
    }
});