(function (global) {
    function getPipelineHTML(company) {
        const companyName = company.name || 'Company';
        let html = `<h3 class="investment-title">${companyName}'s Product Pipeline</h3>`;

        if (!company.products || company.products.length === 0) {
            return '';
        }

        const products = Array.isArray(company.products)
            ? company.products.filter(product => {
                if (!product) return false;
                const meta = product.__pipelineMeta || {};
                return !meta.retired;
            })
            : [];

        if (!products.length) {
            return '';
        }

        products.forEach(product => {
            html += `<div class="pipeline-section">
                    <h4 class="product-name-label">${product.label}</h4>
                    <div class="pipeline">`;

            let lastStageSucceeded = true;

            product.stages.forEach((stage, index) => {
                let stageClass = 'incomplete';
                let nodeContent = index + 1;

                if (stage.completed) {
                    if (stage.succeeded) {
                        stageClass = 'completed';
                        nodeContent = '✓';
                    } else {
                        stageClass = 'failed';
                        nodeContent = 'X';
                        lastStageSucceeded = false;
                        if (!product.resultFailTimeout) {
                            product.resultFailTimeout = Date.now() + 10000;
                            setTimeout(() => { updatePipelineDisplay(company); }, 10000);
                        }
                    }
                } else if (lastStageSucceeded) {
                    const done = new Set(product.stages.filter(s => s.completed && s.succeeded).map(s => s.id));
                    const canStart = !stage.depends_on || done.has(stage.depends_on);
                    if (canStart) {
                        if (typeof stage.success_prob !== 'undefined' && stage.success_prob < 1) {
                            stageClass = 'completed current current-uncertain';
                            nodeContent = '?';
                        } else if (typeof stage.success_prob !== 'undefined' && stage.success_prob === 1) {
                            stageClass = 'completed current';
                            nodeContent = index + 1;
                        } else {
                            stageClass = 'incomplete current';
                            nodeContent = index + 1;
                        }
                    }
                }

                html += `
                <div class="stage ${stageClass}">
                    <div class="stage-node">${nodeContent}</div>
                    <div class="stage-label">${stage.name}</div>
                </div>
            `;

                if (index < product.stages.length - 1) {
                    let connectorClass = 'incomplete';
                    if (stage.completed) {
                        connectorClass = stage.succeeded ? 'completed' : 'failed';
                    }

                    let infoHtml = '';
                    /*
                    // DISABLED: User feedback indicated this text (probability and time remaining) didn't look good.
                    // Keeping the logic here in case we decide to re-enable it later.
                    
                    // Show info only if this stage is active (incomplete) or future, AND the pipeline is still valid
                    if (!stage.completed && lastStageSucceeded) {
                        const remainingDays = (stage.duration_days || 0) - (stage.elapsed || 0);
                        const months = Math.ceil(Math.max(0, remainingDays) / 30);
                        const prob = stage.success_prob ? Math.round(stage.success_prob * 100) : 0;
                        
                        let timeText = `Results in ${months} month${months === 1 ? '' : 's'}`;
                        if (stage.tries > 0) {
                            timeText += ` (Retry ${stage.tries})`;
                        }

                        infoHtml = `
                        <div class="connector-info">
                            <div class="info-prob">${prob}% chance of success</div>
                            <div class="info-time">${timeText}</div>
                        </div>`;
                    }
                    */

                    html += `<div class="connector ${connectorClass}">
                        ${infoHtml}
                    </div>`;
                }
            });

            html += '</div></div>';
        });

        return html;
    }

    function updatePipelineDisplay(company) {
        const container = document.getElementById('pipelineContainer');
        if (container) {
            const html = getPipelineHTML(company);
            container.innerHTML = html;
            container.style.display = html ? 'block' : 'none';
        }
    }

    global.PipelineUI = { getPipelineHTML, updatePipelineDisplay };
    global.getPipelineHTML = getPipelineHTML;
    global.updatePipelineDisplay = updatePipelineDisplay;
})(typeof globalThis !== 'undefined' ? globalThis : window);
