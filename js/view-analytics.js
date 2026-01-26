// Analytics View Logic - Interactive Map & Charts
// Uses Leaflet.js for map and Chart.js for visualisations

let analyticsMap = null;
let countryLayers = {};
let mapInitialized = false;
let chartsInitialized = false;
let donutChart = null;
let barChart = null;

// Mock data for hubs (matching the analytics text)
// Exposed globally for voice commands access
const HUBS = [
    { name: 'India', coords: [20.5937, 78.9629], count: 44, cost: 7200, color: '#4ADE80', type: 'Low Cost' },
    { name: 'Portugal', coords: [39.3999, -8.2245], count: 23, cost: 8500, color: '#4ADE80', type: 'Low Cost' },
    { name: 'Brazil', coords: [-14.2350, -51.9253], count: 24, cost: 9800, color: '#FACC15', type: 'Medium Cost' },
    { name: 'Germany', coords: [51.1657, 10.4515], count: 32, cost: 10100, color: '#FACC15', type: 'Medium Cost' },
    { name: 'Singapore', coords: [1.3521, 103.8198], count: 18, cost: 11200, color: '#F87171', type: 'High Cost' },
    { name: 'USA', coords: [37.0902, -95.7129], count: 45, cost: 12500, color: '#F87171', type: 'High Cost' },
    { name: 'Finland', coords: [61.9241, 25.7482], count: 71, cost: 0, color: '#181C31', type: 'HQ' }
];

// Expose HUBS globally for voice commands
window.ANALYTICS_HUBS = HUBS;

// Chart colour palette (matching HUBS but with adjustments for visibility)
const CHART_COLORS = {
    'India': '#4ADE80',
    'Portugal': '#22C55E',
    'Brazil': '#FACC15',
    'Germany': '#EAB308',
    'Singapore': '#F87171',
    'USA': '#EF4444',
    'Finland': '#40AEBC'  // HQ gets brand teal
};

/**
 * Update the summary statistics at the top
 */
function updateAnalyticsSummary() {
    const totalEngineers = HUBS.reduce((sum, h) => sum + h.count, 0);
    const hubCount = HUBS.length;
    const avgCost = HUBS.filter(h => h.cost > 0).reduce((sum, h, _, arr) => sum + h.cost / arr.length, 0);

    const totalEl = document.getElementById('analytics-total-engineers');
    const hubsEl = document.getElementById('analytics-hub-count');
    const avgCostEl = document.getElementById('analytics-avg-cost');

    if (totalEl) totalEl.textContent = totalEngineers;
    if (hubsEl) hubsEl.textContent = hubCount;
    if (avgCostEl) avgCostEl.textContent = `€${(avgCost / 1000).toFixed(1)}k`;
}

/**
 * Initialise the donut chart for roster distribution
 */
function initDonutChart() {
    const canvas = document.getElementById('analytics-donut-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    // Sort by count descending
    const sorted = [...HUBS].sort((a, b) => b.count - a.count);
    const labels = sorted.map(h => h.name);
    const data = sorted.map(h => h.count);
    const colors = sorted.map(h => CHART_COLORS[h.name] || h.color);

    donutChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderColor: '#ffffff',
                borderWidth: 2,
                hoverBorderWidth: 3,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            cutout: '60%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 12,
                        usePointStyle: true,
                        pointStyle: 'circle',
                        font: {
                            size: 11,
                            family: "'Inter', sans-serif"
                        },
                        color: '#6b7280'
                    }
                },
                tooltip: {
                    backgroundColor: '#181C31',
                    titleFont: { family: "'Inter', sans-serif", weight: '600' },
                    bodyFont: { family: "'Inter', sans-serif" },
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: {
                        label: function(context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((context.raw / total) * 100).toFixed(1);
                            return `${context.raw} engineers (${percentage}%)`;
                        }
                    }
                }
            },
            onClick: handleDonutClick
        }
    });
}

/**
 * Initialise the horizontal bar chart for costs
 */
function initBarChart() {
    const canvas = document.getElementById('analytics-bar-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    // Sort by cost descending (exclude HQ with 0 cost)
    const sorted = [...HUBS].filter(h => h.cost > 0).sort((a, b) => b.cost - a.cost);
    const labels = sorted.map(h => h.name);
    const data = sorted.map(h => h.cost);
    const colors = sorted.map(h => CHART_COLORS[h.name] || h.color);

    barChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Avg Monthly Cost (€)',
                data: data,
                backgroundColor: colors,
                borderColor: colors.map(c => c),
                borderWidth: 0,
                borderRadius: 6,
                barThickness: 28
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: '#181C31',
                    titleFont: { family: "'Inter', sans-serif", weight: '600' },
                    bodyFont: { family: "'Inter', sans-serif" },
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: {
                        label: function(context) {
                            const hub = HUBS.find(h => h.name === context.label);
                            return [
                                `€${context.raw.toLocaleString()} avg cost`,
                                hub ? `${hub.count} engineers` : '',
                                hub ? `${hub.type}` : ''
                            ].filter(Boolean);
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: '#f1f5f9',
                        drawBorder: false
                    },
                    ticks: {
                        font: { size: 10, family: "'Inter', sans-serif" },
                        color: '#9ca3af',
                        callback: function(value) {
                            return '€' + (value / 1000).toFixed(0) + 'k';
                        }
                    }
                },
                y: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        font: { size: 11, family: "'Inter', sans-serif", weight: '500' },
                        color: '#374151'
                    }
                }
            },
            onClick: handleBarClick
        }
    });
}

/**
 * Handle click on donut chart segment - highlight on map
 */
function handleDonutClick(event, elements) {
    if (elements.length === 0) return;

    const index = elements[0].index;
    const sorted = [...HUBS].sort((a, b) => b.count - a.count);
    const hub = sorted[index];

    if (hub) {
        highlightOnMap(hub.name);
    }
}

/**
 * Handle click on bar chart - highlight on map
 */
function handleBarClick(event, elements) {
    if (elements.length === 0) return;

    const index = elements[0].index;
    const sorted = [...HUBS].filter(h => h.cost > 0).sort((a, b) => b.cost - a.cost);
    const hub = sorted[index];

    if (hub) {
        highlightOnMap(hub.name);
    }
}

/**
 * Highlight a country on the map (internal function)
 */
function highlightOnMap(countryName) {
    const key = countryName.toLowerCase();
    const target = countryLayers[key];

    if (target && analyticsMap) {
        analyticsMap.flyTo(target.coords, 5, {
            animate: true,
            duration: 1.5
        });

        setTimeout(() => {
            target.marker.openPopup();
        }, 1500);
    }
}

/**
 * Initialise the Leaflet map
 */
function initAnalyticsMap() {
    if (mapInitialized) return;

    const mapContainer = document.getElementById('analytics-map');
    if (!mapContainer) return;

    // Initialize Leaflet
    analyticsMap = L.map('analytics-map', {
        center: [20, 0],
        zoom: 2,
        zoomControl: false,
        attributionControl: false
    });

    // Add Esri Canvas Dark Grey Tiles
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri',
        maxZoom: 16
    }).addTo(analyticsMap);

    // Add Labels layer
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Labels &copy; Esri',
        maxZoom: 16,
        pane: 'shadowPane'
    }).addTo(analyticsMap);

    // Add Markers for each hub
    HUBS.forEach(hub => {
        const size = Math.max(12, Math.min(32, hub.count / 2));
        const markerColor = hub.type === 'HQ' ? '#ffffff' : hub.color;

        const icon = L.divIcon({
            className: 'custom-div-icon',
            html: `
                <div style="
                    background-color: ${markerColor};
                    width: ${size}px;
                    height: ${size}px;
                    border-radius: 50%;
                    opacity: 0.9;
                    box-shadow: 0 0 12px ${markerColor};
                    border: 2px solid white;
                "></div>
                <div class="pulse-ring" style="border-color: ${markerColor}"></div>
            `,
            iconSize: [size, size],
            iconAnchor: [size/2, size/2]
        });

        const marker = L.marker(hub.coords, { icon: icon }).addTo(analyticsMap);

        // Popup with hub details
        marker.bindPopup(`
            <div class="text-sm font-sans" style="min-width: 140px;">
                <strong style="color: ${markerColor}; font-size: 14px;">${hub.name}</strong>
                <span style="font-size: 10px; color: #9ca3af; margin-left: 4px;">(${hub.type})</span><br>
                <div style="margin-top: 8px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                        <span style="color: #6b7280;">Engineers:</span>
                        <strong>${hub.count}</strong>
                    </div>
                    ${hub.cost > 0 ? `
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: #6b7280;">Avg Cost:</span>
                        <strong>€${hub.cost.toLocaleString()}</strong>
                    </div>
                    ` : '<span style="color: #40AEBC; font-weight: 600;">Headquarters</span>'}
                </div>
            </div>
        `);

        countryLayers[hub.name.toLowerCase()] = { marker, coords: hub.coords };
    });

    mapInitialized = true;

    setTimeout(() => {
        analyticsMap.invalidateSize();
    }, 100);
}

/**
 * Initialise all analytics charts and map
 */
function initAnalytics() {
    updateAnalyticsSummary();

    if (!chartsInitialized) {
        initDonutChart();
        initBarChart();
        chartsInitialized = true;
    }

    initAnalyticsMap();
}

/**
 * Public function to highlight a country (for Voice Control)
 */
window.highlightMapCountry = function(countryName) {
    // Switch to analytics tab if not active
    switchMainTab('analytics');

    const key = countryName.toLowerCase();
    const target = countryLayers[key];

    if (target && analyticsMap) {
        analyticsMap.flyTo(target.coords, 5, {
            animate: true,
            duration: 1.5
        });

        setTimeout(() => {
            target.marker.openPopup();
        }, 1500);

        return true;
    }
    return false;
};

// Hook into the tab switcher to render analytics when tab is opened
const originalSwitchMainTab = window.switchMainTab;
window.switchMainTab = function(tab) {
    // Call original logic (from view-staffing.js)
    if (typeof originalSwitchMainTab === 'function') {
        originalSwitchMainTab(tab);
    } else {
        // Fallback if original is not available yet
        const calcSection = document.getElementById('section-calculator');
        const staffSection = document.getElementById('section-staffing');
        const analyticsSection = document.getElementById('section-analytics');
        const navCalc = document.getElementById('nav-calculator');
        const navStaff = document.getElementById('nav-staffing');
        const navAnalytics = document.getElementById('nav-analytics');

        if (calcSection) calcSection.classList.add('hidden');
        if (staffSection) staffSection.classList.add('hidden');
        if (analyticsSection) analyticsSection.classList.add('hidden');

        if (navCalc) navCalc.classList.remove('nav-tab-active');
        if (navStaff) navStaff.classList.remove('nav-tab-active');
        if (navAnalytics) navAnalytics.classList.remove('nav-tab-active');

        if (tab === 'calculator') {
            if (calcSection) calcSection.classList.remove('hidden');
            if (navCalc) navCalc.classList.add('nav-tab-active');
        } else if (tab === 'staffing') {
            if (staffSection) staffSection.classList.remove('hidden');
            if (navStaff) navStaff.classList.add('nav-tab-active');
        } else if (tab === 'analytics') {
            if (analyticsSection) analyticsSection.classList.remove('hidden');
            if (navAnalytics) navAnalytics.classList.add('nav-tab-active');
        }
    }

    // Initialize analytics (charts + map) when tab is selected
    if (tab === 'analytics') {
        setTimeout(initAnalytics, 50);
    }
};
