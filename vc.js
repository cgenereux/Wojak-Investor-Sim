const vcContent = document.getElementById('vc-content');

function renderVentureCompanies() {
    fetch('venture_companies.json')
        .then(response => response.json())
        .then(companies => {
            const ventureCompaniesGrid = document.getElementById('ventureCompaniesGrid');
            ventureCompaniesGrid.innerHTML = ''; // Clear previous content
            companies.forEach(company => {
                const companyDiv = document.createElement('div');
                companyDiv.classList.add('company-card');
                companyDiv.innerHTML = `
                    <h3>${company.name}</h3>
                    <p>Sector: ${company.sector}</p>
                    <p>Valuation: ${company.valuation_usd.toLocaleString()}</p>
                    <p>Funding Round: ${company.funding_round}</p>
                    <button onclick="investInVentureCompany('${company.name}', ${company.valuation_usd})">Invest</button>
                `;
                ventureCompaniesGrid.appendChild(companyDiv);
            });
        })
        .catch(error => console.error('Error loading venture companies:', error));
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