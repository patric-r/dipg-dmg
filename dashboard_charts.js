// --- Shared Defaults & Helpers for Chart.js ---

const CHART_DEFAULTS = {
    textColor: '#9ca3af',
    gridColor: '#1f2937',
    tooltipBg: 'rgba(17, 24, 39, 0.95)',
};

function getCommonChartOptions(extraPlugins = {}, extraScales = {}) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: true,
                position: 'top',
                labels: {
                    color: CHART_DEFAULTS.textColor,
                    boxWidth: 12,
                    padding: 8,
                    font: { size: 13 }
                }
            },
            tooltip: {
                backgroundColor: CHART_DEFAULTS.tooltipBg,
                padding: 8
            },
            ...extraPlugins
        },
        scales: {
            x: {
                grid: { color: CHART_DEFAULTS.gridColor },
                ticks: { color: CHART_DEFAULTS.textColor, font: { size: 12 } }
            },
            y: {
                grid: { color: CHART_DEFAULTS.gridColor },
                ticks: { color: CHART_DEFAULTS.textColor, font: { size: 12 } }
            },
            ...extraScales
        }
    };
}

function mapSeriesToCompressedX(years, values) {
    return years.map((y, idx) => ({
        x: mapYearToCompressedX(y),
        y: values[idx],
        realYear: y
    }));
}

function buildCompressedXAxisScale(years, defaultEndYear, stepPre = 10, stepPost = 5) {
    const minYear = years.length > 0 ? Math.min(...years) : 1970;
    const maxYear = years.length > 0 ? Math.max(...years) : defaultEndYear;
    const yearTicks = buildCompressedYearTicks(minYear, maxYear, stepPre, stepPost);

    return {
        type: 'linear',
        grid: { color: CHART_DEFAULTS.gridColor },
        afterBuildTicks: function(axis) {
            axis.ticks = yearTicks.map(y => ({ value: mapYearToCompressedX(y) }));
        },
        ticks: {
            color: CHART_DEFAULTS.textColor,
            font: { size: 12 },
            callback: function(val) {
                const matched = yearTicks.find(y => Math.abs(mapYearToCompressedX(y) - val) < 0.05);
                return matched !== undefined ? matched : null;
            }
        }
    };
}

function getCompressedYearTooltipTitle(context) {
    const item = context[0];
    const realY = item.raw && item.raw.realYear ? item.raw.realYear : Math.round(unmapCompressedXToYear(item.parsed.x));
    return `Year: ${realY}`;
}

// --- Chart Initializations ---

function initTrendsChart(canvasId, cfg) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    const { trendYears, trendCounts, projCounts, currentYear, currYearActual, currYearProj, dayOfYear } = cfg;

    const trendsChartData = mapSeriesToCompressedX(trendYears, trendCounts);
    const projChartData = trendYears.map((y, idx) => 
        projCounts[idx] !== null ? { x: mapYearToCompressedX(y), y: projCounts[idx], realYear: y } : null
    ).filter(p => p !== null);

    const options = getCommonChartOptions({
        tooltip: {
            backgroundColor: CHART_DEFAULTS.tooltipBg,
            padding: 8,
            callbacks: {
                title: getCompressedYearTooltipTitle,
                label: function(context) {
                    const realY = context.raw && context.raw.realYear ? context.raw.realYear : Math.round(unmapCompressedXToYear(context.parsed.x));
                    if (context.datasetIndex === 1 && realY === currentYear) {
                        return `Projection ${currentYear}: ~${currYearProj} papers (Recorded: ${currYearActual}, Day ${dayOfYear}/365)`;
                    }
                    return `${context.dataset.label}: ${context.parsed.y} papers`;
                }
            }
        }
    }, {
        x: buildCompressedXAxisScale(trendYears, currentYear)
    });

    return new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [
                {
                    label: 'Recorded Publications',
                    data: trendsChartData,
                    backgroundColor: 'rgba(56, 189, 248, 0.15)',
                    borderColor: '#38bdf8',
                    borderWidth: 1.5,
                    fill: true,
                    tension: 0.25,
                    pointRadius: 2
                },
                {
                    label: `Year-end Projection (${currentYear})`,
                    data: projChartData,
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245, 158, 11, 0.08)',
                    borderWidth: 1.5,
                    borderDash: [4, 4],
                    fill: false,
                    tension: 0.25,
                    pointRadius: (ctx) => (ctx.dataIndex === projChartData.length - 1 ? 4 : 0),
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#f59e0b'
                }
            ]
        },
        options: options
    });
}

function initSeniorAuthorsChart(canvasId, cfg) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    const { seniorYears, seniorCounts, currentYear } = cfg;

    const seniorChartData = mapSeriesToCompressedX(seniorYears, seniorCounts);

    const options = getCommonChartOptions({
        tooltip: {
            backgroundColor: CHART_DEFAULTS.tooltipBg,
            padding: 8,
            callbacks: {
                title: getCompressedYearTooltipTitle,
                label: (context) => `${context.dataset.label}: ${context.parsed.y} PIs`
            }
        }
    }, {
        x: buildCompressedXAxisScale(seniorYears, currentYear - 1),
        y: {
            grid: { color: CHART_DEFAULTS.gridColor },
            ticks: { color: CHART_DEFAULTS.textColor, font: { size: 12 } },
            title: {
                display: true,
                text: 'Unique Senior Authors',
                color: CHART_DEFAULTS.textColor,
                font: { size: 13, weight: '600' }
            }
        }
    });

    return new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                label: 'Unique Senior Authors (PIs)',
                data: seniorChartData,
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                borderColor: '#10b981',
                borderWidth: 1.5,
                fill: true,
                tension: 0.25,
                pointRadius: 2,
                pointHoverRadius: 5
            }]
        },
        options: options
    });
}

function initCountryChart(canvasId, cfg) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    const { countryYears, rawCountryDatasets, currentYear } = cfg;

    const countryTransformedDatasets = rawCountryDatasets.map(ds => ({
        ...ds,
        data: mapSeriesToCompressedX(countryYears, ds.data)
    }));

    const options = getCommonChartOptions({
        tooltip: {
            backgroundColor: CHART_DEFAULTS.tooltipBg,
            padding: 8,
            callbacks: {
                title: getCompressedYearTooltipTitle
            }
        }
    }, {
        x: buildCompressedXAxisScale(countryYears, currentYear - 1),
        y: {
            stacked: true,
            grid: { color: CHART_DEFAULTS.gridColor },
            ticks: { color: CHART_DEFAULTS.textColor, font: { size: 12 } },
            title: {
                display: true,
                text: 'Affiliation share',
                color: CHART_DEFAULTS.textColor,
                font: { size: 13, weight: '600' }
            }
        }
    });

    options.interaction = {
        mode: 'index',
        intersect: false
    };
    options.plugins.legend.labels.boxHeight = 12;

    return new Chart(ctx, {
        type: 'line',
        data: { datasets: countryTransformedDatasets },
        options: options
    });
}

function initJournalChart(canvasId, journalPayload) {
    const ctx = document.getElementById(canvasId).getContext('2d');

    const options = getCommonChartOptions({
        legend: { display: false },
        tooltip: {
            backgroundColor: CHART_DEFAULTS.tooltipBg,
            padding: 9,
            callbacks: {
                title: (items) => journalPayload.labels[items[0].dataIndex] || '',
                label: (context) => `Papers: ${context.raw}`
            }
        }
    }, {
        x: {
            type: 'linear',
            grid: { color: CHART_DEFAULTS.gridColor },
            ticks: { color: CHART_DEFAULTS.textColor, font: { size: 11 } },
            title: { display: true, text: 'Papers', color: CHART_DEFAULTS.textColor, font: { size: 12, weight: '600' } }
        },
        y: {
            grid: { display: false },
            ticks: {
                color: '#cbd5e1',
                autoSkip: false,
                font: { size: 11, weight: '500' },
                callback: function(val, index) {
                    const label = journalPayload.labels[index] || '';
                    return label.length > 28 ? label.slice(0, 26) + '…' : label;
                }
            }
        }
    });

    options.indexAxis = 'y';

    options.onClick = (event, activeElements) => {
        if (activeElements.length > 0) {
            const idx = activeElements[0].index;
            filterByJournal(journalPayload.labels[idx]);
        }
    };
    options.onHover = (event, activeElements) => {
        event.native.target.style.cursor = activeElements.length > 0 ? 'pointer' : 'default';
    };

    return new Chart(ctx, {
        type: 'bar',
        data: {
            labels: journalPayload.labels,
            datasets: [{
                label: 'Papers',
                data: journalPayload.counts,
                backgroundColor: 'rgba(56, 189, 248, 0.65)',
                borderColor: '#38bdf8',
                borderWidth: 1,
                borderRadius: 3
            }]
        },
        options: options
    });
}

function initClinicalTrialsChart(canvasId, cfg) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    const { trialYears, trialCounts } = cfg;

    const options = getCommonChartOptions({
        tooltip: {
            backgroundColor: CHART_DEFAULTS.tooltipBg,
            padding: 9,
            callbacks: {
                label: (context) => `${context.dataset.label}: ${context.raw} trials`
            }
        }
    }, {
        y: {
            grid: { color: CHART_DEFAULTS.gridColor },
            ticks: { color: CHART_DEFAULTS.textColor, font: { size: 12 } },
            title: { display: true, text: 'Active Trials', color: CHART_DEFAULTS.textColor, font: { size: 13, weight: '600' } }
        }
    });

    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: trialYears,
            datasets: [{
                label: 'Active/Recruiting Trials',
                data: trialCounts,
                backgroundColor: 'rgba(192, 132, 252, 0.16)',
                borderColor: '#c084fc',
                borderWidth: 2,
                fill: true,
                tension: 0.25,
                pointRadius: 2.5,
                pointHoverRadius: 6
            }]
        },
        options: options
    });
}

function initRecruitingAgeChart(canvasId, ageDistData) {
    const ctx = document.getElementById(canvasId).getContext('2d');

    const options = getCommonChartOptions({
        tooltip: {
            backgroundColor: CHART_DEFAULTS.tooltipBg,
            padding: 9,
            callbacks: {
                title: (items) => `Age: ${items[0].label} (Click to filter)`,
                label: (context) => `${context.raw} recruiting trials include this age`
            }
        }
    }, {
        x: {
            grid: { color: CHART_DEFAULTS.gridColor },
            ticks: {
                color: CHART_DEFAULTS.textColor,
                font: { size: 12 },
                maxRotation: 45,
                autoSkip: true,
                maxTicksLimit: 14
            }
        },
        y: {
            grid: { color: CHART_DEFAULTS.gridColor },
            ticks: { color: CHART_DEFAULTS.textColor, font: { size: 12 } },
            title: { display: true, text: 'Open Trials', color: CHART_DEFAULTS.textColor, font: { size: 13, weight: '600' } }
        }
    });

    options.onClick = (event, activeElements) => {
        if (activeElements.length > 0) {
            const idx = activeElements[0].index;
            const ageNum = parseInt(ageDistData.labels[idx].replace('y', ''), 10);
            applyTrialAgeFilter(ageNum, idx);
        }
    };
    options.onHover = (event, activeElements) => {
        event.native.target.style.cursor = activeElements.length > 0 ? 'pointer' : 'default';
    };

    return new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ageDistData.labels,
            datasets: [{
                label: 'Trials Accepting Age',
                data: ageDistData.counts,
                backgroundColor: ageDistData.labels.map(() => 'rgba(56, 189, 248, 0.55)'),
                borderColor: ageDistData.labels.map(() => '#38bdf8'),
                borderWidth: 1,
                borderRadius: 3
            }]
        },
        options: options
    });
}

function initNetworkGraph(containerId, rawNetworkNodes, rawNetworkEdges) {
    const container = document.getElementById(containerId);
    const nodesDataSet = new vis.DataSet(rawNetworkNodes.map(n => ({
        id: n.id,
        label: n.label,
        title: n.title,
        author_name: n.author_name,
        shape: 'box',
        borderRadius: 8,
        margin: { top: 12, bottom: 12, left: 18, right: 18 },
        borderWidth: 2.5,
        color: n.color,
        font: n.font
    })));

    const edgesDataSet = new vis.DataSet(rawNetworkEdges.map((e, idx) => ({
        id: `edge_${idx}`,
        from: e.from,
        to: e.to,
        value: e.value,
        width: Math.min(8, Math.max(2.5, e.raw_shared * 0.6)),
        title: e.title,
        color: {
            color: 'rgba(148, 163, 184, 0.65)',
            highlight: '#f59e0b',
            hover: '#38bdf8'
        },
        smooth: { type: 'continuous', roundness: 0.15 }
    })));

    const options = {
        layout: {
            randomSeed: 42,
            improvedLayout: false
        },
        physics: {
            solver: 'forceAtlas2Based',
            forceAtlas2Based: {
                gravitationalConstant: -260,
                centralGravity: 0.010,
                springLength: 190,
                springConstant: 0.045,
                damping: 0.75,
                avoidOverlap: 1.0
            },
            maxVelocity: 40,
            stabilization: { iterations: 400, fit: true }
        },
        interaction: {
            hover: true,
            tooltipDelay: 80,
            zoomView: true,
            dragView: true,
            hideEdgesOnZoom: false
        }
    };

    const instance = new vis.Network(container, { nodes: nodesDataSet, edges: edgesDataSet }, options);

    instance.once('stabilizationIterationsDone', function() {
        instance.setOptions({ physics: false });
        setTimeout(() => {
            instance.fit({
                nodes: rawNetworkNodes.map(n => n.id),
                animation: false
            });
        }, 60);
    });

    instance.on('click', function(params) {
        if (params.nodes.length > 0) {
            const nodeId = params.nodes[0];
            const nodeData = rawNetworkNodes.find(n => n.id === nodeId);
            const authorName = nodeData ? (nodeData.author_name || nodeData.label.trim()) : nodeId;
            filterByAuthorName(authorName);
            instance.selectNodes([nodeId]);
            return;
        }

        if (params.edges.length > 0) {
            const edgeId = params.edges[0];
            const edgeData = edgesDataSet.get(edgeId);
            if (edgeData) {
                const n1 = rawNetworkNodes.find(n => n.id === edgeData.from);
                const n2 = rawNetworkNodes.find(n => n.id === edgeData.to);
                highlightCollaboration(edgeData.from, edgeData.to, n1 ? n1.label.trim() : edgeData.from, n2 ? n2.label.trim() : edgeData.to);
            }
        }
    });

    return instance;
}
