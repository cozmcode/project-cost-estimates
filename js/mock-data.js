// Mock Data for Resource Optimization Engine
// Used for demos and fallback when Supabase is empty

const MOCK_DATA = {
    // 1. Employee Roster (Supply)
    employees: [
        {
            id: 'e1',
            first_name: 'Juho',
            last_name: 'Virtanen',
            nationality: 'Finland',
            role: 'Lead Engineer',
            current_location: 'Finland',
            base_salary_eur: 8500,
            skills: ['Wartsila 31', 'Start-up', 'Safety Lead']
        },
        {
            id: 'e2',
            first_name: 'Alex',
            last_name: 'Silva',
            nationality: 'Portugal',
            role: 'Lead Engineer',
            current_location: 'Portugal',
            base_salary_eur: 6200, // Lower base cost
            skills: ['Wartsila 31', 'Commissioning']
        },
        {
            id: 'e3',
            first_name: 'Rahul',
            last_name: 'Patel',
            nationality: 'India',
            role: 'Senior Technician',
            current_location: 'India',
            base_salary_eur: 4500, // Lowest base cost
            skills: ['Mechanical', 'Overhaul']
        },
        {
            id: 'e4',
            first_name: 'Sarah',
            last_name: 'Jenkins',
            nationality: 'UK',
            role: 'Project Manager',
            current_location: 'UAE', // Specifically for "Optimization: Speed" demo (nearby)
            base_salary_eur: 9000,
            skills: ['PMP', 'Logistics']
        },
        {
            id: 'e5',
            first_name: 'Matti',
            last_name: 'Korhonen',
            nationality: 'Finland',
            role: 'Senior Technician',
            current_location: 'Brazil', // Already in country!
            base_salary_eur: 5500,
            skills: ['Mechanical', 'Electrical']
        }
    ],

    // 2. Visa Rules Knowledge Base (Speed Logic)
    // Format: key = "origin_destination"
    // Updated to use API-compatible field names (waitDays, visaType)
    visaRules: {
        // Destination: Brazil
        'Finland_Brazil': { waitDays: 0, visaType: 'Visa Waiver (90 days)', notes: 'Business meetings allowed. Tech work requires Work Visa (5 days)' },
        'Portugal_Brazil': { waitDays: 0, visaType: 'Visa Waiver', notes: 'Special Treaty' },
        'India_Brazil': { waitDays: 25, visaType: 'Consular Visa Required', notes: 'Must apply at embassy' },
        'UK_Brazil': { waitDays: 0, visaType: 'Visa Waiver', notes: 'Reciprocal agreement' },

        // Destination: USA
        'Finland_USA': { waitDays: 3, visaType: 'ESTA Waiver', notes: 'Instant approval for most' },
        'Portugal_USA': { waitDays: 3, visaType: 'ESTA Waiver', notes: 'Instant approval' },
        'India_USA': { waitDays: 60, visaType: 'B1/B2 Interview Required', notes: 'Long wait times for interview' },

        // Destination: Singapore
        'Finland_Singapore': { waitDays: 14, visaType: 'Employment Pass', notes: 'Online application' },
        'India_Singapore': { waitDays: 21, visaType: 'Employment Pass', notes: 'Online application' }
    },

    // 3. Distance Matrix (Cost Logic - Flight Estimation)
    // Approximate one-way economy flight cost in EUR
    flightCosts: {
        'Finland_Brazil': 1200,
        'Portugal_Brazil': 800, // Cheaper
        'India_Brazil': 1500,
        'UAE_Brazil': 1300,
        'Brazil_Brazil': 0, // Already there!

        'Finland_USA': 900,
        'Portugal_USA': 700,
        'India_USA': 1100,

        'Finland_Singapore': 1000,
        'India_Singapore': 400, // Much cheaper/closer
        'UAE_Singapore': 500
    },

    // 4. Carbon Footprint Estimates (kg CO2 per passenger, one-way)
    // Based on IATA/ICAO methodology averages for economy class
    carbonFootprint: {
        'Finland_Brazil': 1850,    // Long-haul intercontinental
        'Portugal_Brazil': 1420,   // Slightly shorter route
        'India_Brazil': 2100,      // Very long route
        'UAE_Brazil': 1650,
        'Brazil_Brazil': 0,        // No flight

        'Finland_USA': 1200,       // Transatlantic
        'Portugal_USA': 1050,
        'India_USA': 2400,         // Very long route

        'Finland_Singapore': 1580,
        'India_Singapore': 450,    // Regional flight
        'UAE_Singapore': 680
    }
};
