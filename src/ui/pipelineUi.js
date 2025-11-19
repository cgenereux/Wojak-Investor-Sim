(function (global) {
    function getPipelineHTML(company) {
        let html = '<h3 class="investment-title">Product Pipeline</h3>';

        if (!company.products || company.products.length === 0) {
            return '';
        }

        company.products.forEach(product => {
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
                    html += `<div class="connector ${connectorClass}"></div>`;
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
