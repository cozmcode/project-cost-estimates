// Resource Optimization Engine - Logic Module

class StaffingEngine {
    constructor() {
        this.candidates = MOCK_DATA.employees;
        this.visaRules = MOCK_DATA.visaRules;
        this.flightCosts = MOCK_DATA.flightCosts;
    }

    /**
     * Find the best candidates for a project based on weighting
     * @param {Object} project - { role, country, durationMonths, count }
     * @param {Object} weights - { cost: 0-100, speed: 0-100, compliance: 0-100 }
     */
    optimizeTeam(project, weights) {
        // 1. Filter by Role
        const qualified = this.candidates.filter(c => c.role === project.role);

        // 2. Score each candidate
        const scoredCandidates = qualified.map(candidate => {
            const scores = this.calculateScores(candidate, project);

            // Calculate Weighted Total Score (0-100)
            // Normalize weights to sum to 1
            const totalWeight = weights.cost + weights.speed + weights.compliance;
            const wCost = totalWeight ? weights.cost / totalWeight : 0.33;
            const wSpeed = totalWeight ? weights.speed / totalWeight : 0.33;
            const wComp = totalWeight ? weights.compliance / totalWeight : 0.33;

            const finalScore = (scores.costScore * wCost) +
                (scores.speedScore * wSpeed) +
                (scores.complianceScore * wComp);

            return {
                ...candidate,
                scores,
                finalScore: Math.round(finalScore)
            };
        });

        // 3. Sort by Final Score (Descending)
        return scoredCandidates.sort((a, b) => b.finalScore - a.finalScore).slice(0, project.count);
    }

    calculateScores(candidate, project) {
        // --- Speed Score (Visa Logic) ---
        // Logic: 0 days = 100pts, 60 days = 0pts
        let speedScore = 0;
        let visaDetails = { days: 0, type: 'Unknown' };

        // Check if already in country
        if (candidate.current_location === project.country) {
            speedScore = 100;
            visaDetails = { days: 0, type: 'Already in Country' };
        } else {
            const ruleKey = `${candidate.nationality}_${project.country}`;
            const rule = this.visaRules[ruleKey] || { days: 30, type: 'Standard Application' }; // Default fallback
            visaDetails = rule;

            // Linear decay: 100 at 0 days, 0 at 60 days
            speedScore = Math.max(0, 100 - (rule.days * 1.6));
        }

        // --- Cost Score (Salary + Flight) ---
        // Logic: Relative to the pool. Lowest cost in pool = 100pts.
        // For this demo, we use hardcoded "Global Max/Min" anchors to keep it simple
        const flightKey = `${candidate.current_location}_${project.country}`;
        const flightCost = this.flightCosts[flightKey] || 1000;

        // Monthly Salary * Duration + Flight
        const totalAssignmentCost = (candidate.base_salary_eur * project.durationMonths) + flightCost;

        // Heuristic: Min reasonable cost for 6mo = 30k, Max = 100k
        // 30k = 100pts, 100k = 0pts
        const minCostAnchor = 30000;
        const maxCostAnchor = 100000;
        let costScore = ((maxCostAnchor - totalAssignmentCost) / (maxCostAnchor - minCostAnchor)) * 100;
        costScore = Math.min(100, Math.max(0, costScore));

        // --- Compliance Score ---
        // Logic: 100 unless red flags exist
        let complianceScore = 100;
        let risks = [];

        // Risk 1: Working on Tourist Visa (Simplified Logic)
        if (visaDetails.type.includes('Tourist') || visaDetails.type.includes('Waiver')) {
            // If project > 30 days and using Waiver, that's a risk in some countries
            if (project.durationMonths > 1 && project.country === 'Brazil' && visaDetails.type.includes('Waiver')) {
                complianceScore = 50;
                risks.push('Risk: Working 3+ months on Waiver');
            }
        }

        return {
            speedScore: Math.round(speedScore),
            costScore: Math.round(costScore),
            complianceScore,
            details: {
                visaDays: visaDetails.days,
                visaType: visaDetails.type,
                totalCost: totalAssignmentCost,
                risks
            }
        };
    }
}

// Global instance
const staffingEngine = new StaffingEngine();
