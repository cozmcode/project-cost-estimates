// Analytics View Logic - Interactive Map
// Uses Leaflet.js with CartoDB Dark Matter tiles

let analyticsMap = null;
let countryLayers = {};
let mapInitialized = false;

// Mock data for hubs (matching the analytics text)
const HUBS = [
    { name: 'Brazil', coords: [-14.2350, -51.9253], count: 24, cost: 9800, color: '#40AEBC' }, // Teal
    { name: 'USA', coords: [37.0902, -95.7129], count: 45, cost: 12500, color: '#BD8941' }, // Gold
    { name: 'Singapore', coords: [1.3521, 103.8198], count: 18, cost: 11200, color: '#83849E' }, // Grey
    { name: 'Germany', coords: [51.1657, 10.4515], count: 32, cost: 10100, color: '#3FAFBE' }, // Light Teal
    { name: 'Finland', coords: [61.9241, 25.7482], count: 71, cost: 0, color: '#ffffff' } // HQ
];

// Initialize the map
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

    // Add CartoDB Dark Matter Tiles (Sleek, professional look)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(analyticsMap);

    // Add Markers
    HUBS.forEach(hub => {
        // Pulse marker using CSS
        const size = Math.max(10, Math.min(30, hub.count / 2)); // Scale size by headcount
        
        const icon = L.divIcon({
            className: 'custom-div-icon',
            html: `
                <div style="
                    background-color: ${hub.color};
                    width: ${size}px;
                    height: ${size}px;
                    border-radius: 50%;
                    opacity: 0.8;
                    box-shadow: 0 0 10px ${hub.color};
                    border: 2px solid white;
                "></div>
                <div class="pulse-ring" style="border-color: ${hub.color}"></div>
            `,
            iconSize: [size, size],
            iconAnchor: [size/2, size/2]
        });

        const marker = L.marker(hub.coords, { icon: icon }).addTo(analyticsMap);
        
        // Tooltip
        marker.bindPopup(`
            <div class="text-sm font-sans">
                <strong style="color: ${hub.color}">${hub.name}</strong><br>
                Staff: ${hub.count}<br>
                ${hub.cost > 0 ? `Avg Cost: €${hub.cost.toLocaleString()}` : 'Headquarters'}
            </div>
        `);

        // Store for programmatic access
        countryLayers[hub.name.toLowerCase()] = { marker, coords: hub.coords };
    });

    mapInitialized = true;
    
    // Invalidate size after a small delay to ensure it renders correctly in the tab
    setTimeout(() => {
        analyticsMap.invalidateSize();
    }, 100);
}

// Function to highlight a country (for Voice Control)
window.highlightMapCountry = function(countryName) {
    // Switch to analytics tab if not active
    switchMainTab('analytics');
    
    const key = countryName.toLowerCase();
    const target = countryLayers[key];

    if (target && analyticsMap) {
        // Fly to location
        analyticsMap.flyTo(target.coords, 5, {
            animate: true,
            duration: 1.5
        });
        
        // Open popup
        setTimeout(() => {
            target.marker.openPopup();
        }, 1500);
        
        return true; // Found
    }
    return false; // Not found
};

// Hook into the tab switcher to render map when tab is opened
// (We override the existing switchMainTab to add this hook)
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

    // Initialize map if analytics tab is selected
    if (tab === 'analytics') {
        // Small timeout to allow DOM to unhide first
        setTimeout(initAnalyticsMap, 50);
    }
};
