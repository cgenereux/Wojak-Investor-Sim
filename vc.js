const vcContent = document.getElementById('vc-content');

function renderVentureCompanies(companiesData, formatLargeNumber) {
    const ventureCompaniesGrid = document.getElementById('ventureCompaniesGrid');
    ventureCompaniesGrid.innerHTML = ''; // Clear previous content
    companiesData.forEach(company => {
        const companyDiv = document.createElement('div');
        companyDiv.classList.add('company-box'); // Use company-box class for consistent styling
        companyDiv.dataset.companyName = company.name; // Add data-company-name for consistency
        companyDiv.innerHTML = `
            <div class="company-name">${company.name}</div>
            <div class="company-info">
                <div class="company-valuation" data-company-cap="${company.name}">Valuation: ${formatLargeNumber(company.valuation_usd)}</div>
                <div class="company-sector">Sector: ${company.sector}</div>
                <div class="company-funding-round">Funding Round: ${company.funding_round}</div>
            </div>
        `;
        ventureCompaniesGrid.appendChild(companyDiv);
    });
}

function investInVentureCompany(companyName, valuation) {
    console.log(`Investing in ${companyName} with valuation ${valuation.toLocaleString()}`);
    // Add investment logic here
}

function initVC() {
    if (netWorth >= 5000000) {
        // renderVentureCompanies(); // Render venture companies when unlocked - moved to main.js vcBtn listener
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