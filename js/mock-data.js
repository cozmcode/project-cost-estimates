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
        },
        // New candidates for Technology/Strategic Workforce Planning/Expatriate Tax
        {
            id: 'e6',
            first_name: 'Manny',
            last_name: 'Singh',
            nationality: 'UK',
            role: 'Lead Engineer',
            current_location: 'UK',
            base_salary_eur: 5800, // Most cost-effective
            skills: ['Technology', 'Strategic Workforce Planning', 'Expatriate Tax', 'PMP']
        },
        {
            id: 'e7',
            first_name: 'Benjamin',
            last_name: 'Spilka',
            nationality: 'USA',
            role: 'Lead Engineer',
            current_location: 'USA',
            base_salary_eur: 6500, // Mid-range cost
            skills: ['Technology', 'Strategic Workforce Planning', 'Expatriate Tax', 'Commissioning']
        },
        {
            id: 'e8',
            first_name: 'Benjamin',
            last_name: 'Oghene',
            nationality: 'UK',
            role: 'Lead Engineer',
            current_location: 'UK',
            base_salary_eur: 7200, // Higher cost but still competitive
            skills: ['Technology', 'Strategic Workforce Planning', 'Expatriate Tax', 'Safety Lead']
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

        // Destination: USA (general)
        'Finland_USA': { waitDays: 3, visaType: 'ESTA Waiver', notes: 'Instant approval for most' },
        'Portugal_USA': { waitDays: 3, visaType: 'ESTA Waiver', notes: 'Instant approval' },
        'India_USA': { waitDays: 60, visaType: 'B1/B2 Interview Required', notes: 'Long wait times for interview' },
        'UK_USA': { waitDays: 3, visaType: 'ESTA Waiver', notes: 'Instant approval for most' },
        'USA_USA': { waitDays: 0, visaType: 'Domestic', notes: 'No visa required' },

        // Destination: New England, USA
        'Finland_NewEngland': { waitDays: 3, visaType: 'ESTA Waiver', notes: 'Instant approval for most' },
        'Portugal_NewEngland': { waitDays: 3, visaType: 'ESTA Waiver', notes: 'Instant approval' },
        'India_NewEngland': { waitDays: 60, visaType: 'B1/B2 Interview Required', notes: 'Long wait times for interview' },
        'UK_NewEngland': { waitDays: 3, visaType: 'ESTA Waiver', notes: 'VWP eligible' },
        'USA_NewEngland': { waitDays: 0, visaType: 'Domestic', notes: 'No visa required - domestic travel' },
        'UAE_NewEngland': { waitDays: 3, visaType: 'ESTA Waiver', notes: 'VWP eligible' },
        'Brazil_NewEngland': { waitDays: 14, visaType: 'B1/B2 Visa', notes: 'Interview required' },

        // Destination: Jamaica
        'Finland_Jamaica': { waitDays: 0, visaType: 'Visa Waiver', notes: '90 days visa-free for tourism/business' },
        'Portugal_Jamaica': { waitDays: 0, visaType: 'Visa Waiver', notes: '90 days visa-free' },
        'India_Jamaica': { waitDays: 14, visaType: 'Visa Required', notes: 'Apply online or at embassy' },
        'UK_Jamaica': { waitDays: 0, visaType: 'Visa Waiver', notes: '180 days visa-free - Commonwealth' },
        'USA_Jamaica': { waitDays: 0, visaType: 'Visa Waiver', notes: '90 days visa-free' },

        // Destination: Other US Regions (California, Texas, Florida, New York)
        'Finland_California': { waitDays: 3, visaType: 'ESTA Waiver', notes: 'VWP eligible' },
        'UK_California': { waitDays: 3, visaType: 'ESTA Waiver', notes: 'VWP eligible' },
        'USA_California': { waitDays: 0, visaType: 'Domestic', notes: 'No visa required' },
        'Finland_Texas': { waitDays: 3, visaType: 'ESTA Waiver', notes: 'VWP eligible' },
        'UK_Texas': { waitDays: 3, visaType: 'ESTA Waiver', notes: 'VWP eligible' },
        'USA_Texas': { waitDays: 0, visaType: 'Domestic', notes: 'No visa required' },
        'Finland_Florida': { waitDays: 3, visaType: 'ESTA Waiver', notes: 'VWP eligible' },
        'UK_Florida': { waitDays: 3, visaType: 'ESTA Waiver', notes: 'VWP eligible' },
        'USA_Florida': { waitDays: 0, visaType: 'Domestic', notes: 'No visa required' },
        'Finland_NewYork': { waitDays: 3, visaType: 'ESTA Waiver', notes: 'VWP eligible' },
        'UK_NewYork': { waitDays: 3, visaType: 'ESTA Waiver', notes: 'VWP eligible' },
        'USA_NewYork': { waitDays: 0, visaType: 'Domestic', notes: 'No visa required' },

        // Destination: UK Cities (London, Manchester, Edinburgh, Birmingham)
        'Finland_London': { waitDays: 0, visaType: 'Visa Waiver', notes: '6 months visa-free' },
        'USA_London': { waitDays: 0, visaType: 'Visa Waiver', notes: '6 months visa-free' },
        'UK_London': { waitDays: 0, visaType: 'Domestic', notes: 'No visa required' },
        'India_London': { waitDays: 21, visaType: 'Standard Visitor Visa', notes: 'Apply online' },
        'Finland_Manchester': { waitDays: 0, visaType: 'Visa Waiver', notes: '6 months visa-free' },
        'USA_Manchester': { waitDays: 0, visaType: 'Visa Waiver', notes: '6 months visa-free' },
        'UK_Manchester': { waitDays: 0, visaType: 'Domestic', notes: 'No visa required' },
        'Finland_Edinburgh': { waitDays: 0, visaType: 'Visa Waiver', notes: '6 months visa-free' },
        'USA_Edinburgh': { waitDays: 0, visaType: 'Visa Waiver', notes: '6 months visa-free' },
        'UK_Edinburgh': { waitDays: 0, visaType: 'Domestic', notes: 'No visa required' },
        'Finland_Birmingham': { waitDays: 0, visaType: 'Visa Waiver', notes: '6 months visa-free' },
        'USA_Birmingham': { waitDays: 0, visaType: 'Visa Waiver', notes: '6 months visa-free' },
        'UK_Birmingham': { waitDays: 0, visaType: 'Domestic', notes: 'No visa required' },

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
        'UK_USA': 600,
        'USA_USA': 0,

        // New England, USA
        'Finland_NewEngland': 850,
        'Portugal_NewEngland': 650,
        'India_NewEngland': 1050,
        'UK_NewEngland': 550,    // Cheaper - direct flights to Boston
        'USA_NewEngland': 200,   // Domestic flight
        'UAE_NewEngland': 1100,
        'Brazil_NewEngland': 950,

        // Jamaica
        'Finland_Jamaica': 1100,
        'Portugal_Jamaica': 950,
        'India_Jamaica': 1400,
        'UK_Jamaica': 700,       // Good connections from UK
        'USA_Jamaica': 350,      // Short flight from US East Coast

        // Other US Regions
        'Finland_California': 950,
        'UK_California': 700,
        'USA_California': 250,
        'Finland_Texas': 900,
        'UK_Texas': 650,
        'USA_Texas': 200,
        'Finland_Florida': 880,
        'UK_Florida': 620,
        'USA_Florida': 180,
        'Finland_NewYork': 800,
        'UK_NewYork': 500,
        'USA_NewYork': 150,

        // UK Cities
        'Finland_London': 200,
        'USA_London': 550,
        'UK_London': 50,         // Domestic train/bus
        'India_London': 650,
        'Finland_Manchester': 220,
        'USA_Manchester': 580,
        'UK_Manchester': 40,
        'Finland_Edinburgh': 250,
        'USA_Edinburgh': 600,
        'UK_Edinburgh': 60,
        'Finland_Birmingham': 210,
        'USA_Birmingham': 570,
        'UK_Birmingham': 35,

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
        'UK_USA': 950,
        'USA_USA': 0,

        // New England, USA
        'Finland_NewEngland': 1150,
        'Portugal_NewEngland': 980,
        'India_NewEngland': 2300,
        'UK_NewEngland': 850,      // Direct to Boston
        'USA_NewEngland': 180,     // Domestic
        'UAE_NewEngland': 1800,
        'Brazil_NewEngland': 1400,

        // Jamaica
        'Finland_Jamaica': 1650,
        'Portugal_Jamaica': 1400,
        'India_Jamaica': 2500,
        'UK_Jamaica': 1100,
        'USA_Jamaica': 450,        // Short Caribbean flight

        // Other US Regions
        'Finland_California': 1350,
        'UK_California': 1050,
        'USA_California': 280,
        'Finland_Texas': 1280,
        'UK_Texas': 980,
        'USA_Texas': 220,
        'Finland_Florida': 1250,
        'UK_Florida': 950,
        'USA_Florida': 200,
        'Finland_NewYork': 1100,
        'UK_NewYork': 800,
        'USA_NewYork': 150,

        // UK Cities
        'Finland_London': 280,
        'USA_London': 900,
        'UK_London': 10,          // Train/minimal
        'India_London': 1050,
        'Finland_Manchester': 300,
        'USA_Manchester': 920,
        'UK_Manchester': 8,
        'Finland_Edinburgh': 320,
        'USA_Edinburgh': 950,
        'UK_Edinburgh': 15,
        'Finland_Birmingham': 290,
        'USA_Birmingham': 910,
        'UK_Birmingham': 8,

        'Finland_Singapore': 1580,
        'India_Singapore': 450,    // Regional flight
        'UAE_Singapore': 680
    }
};
