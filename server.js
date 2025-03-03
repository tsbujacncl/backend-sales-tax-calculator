const express = require('express');
const cors = require('cors');
const fs = require('fs');
const csv = require('csv-parser');

const app = express();
const PORT = process.env.PORT || 3000; // Use dynamic port for deployment

// ✅ Configure CORS to allow only requests from your GitHub Pages
const allowedOrigins = ["https://voteforme-md.github.io/voteformeMD-KCSxNUCATS/"];
app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error("CORS policy does not allow access from this origin"));
        }
    },
    methods: "GET, POST",
    credentials: true
}));

app.use(express.json());

let taxRates = {};

// State name to abbreviation mapping
const stateAbbreviations = {
    "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR", "California": "CA",
    "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE", "Florida": "FL", "Georgia": "GA",
    "Hawaii": "HI", "Idaho": "IL", "Illinois": "IL", "Indiana": "IN", "Iowa": "IA",
    "Kansas": "KS", "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD",
    "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS",
    "Missouri": "MO", "Montana": "MT", "Nebraska": "NE", "Nevada": "NV", "New Hampshire": "NH",
    "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY", "North Carolina": "NC",
    "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK", "Oregon": "OR", "Pennsylvania": "PA",
    "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD", "Tennessee": "TN",
    "Texas": "TX", "Utah": "UT", "Vermont": "VT", "Virginia": "VA", "Washington": "WA",
    "West Virginia": "WV", "Wisconsin": "WI", "Wyoming": "WY"
};

// Function to convert full state names to abbreviations
function getStateAbbreviation(state) {
    return stateAbbreviations[state] || state;
}

// ✅ Load tax rates from CSV
fs.createReadStream('./data/tax_rates.csv')
  .pipe(csv())
  .on('data', (row) => {
    const zipCode = row["Zip Code"];
    taxRates[zipCode] = {
      state: row["State"], 
      taxRegion: row["TaxRegionName"],
      combinedRate: parseFloat(row["EstimatedCombinedRate"]) * 100 || 0,
      stateRate: parseFloat(row["StateRate"]) * 100 || 0,
      countyRate: parseFloat(row["EstimatedCountyRate"]) * 100 || 0,
      cityRate: parseFloat(row["EstimatedCityRate"]) * 100 || 0,
      specialRate: parseFloat(row["EstimatedSpecialRate"]) * 100 || 0
    };
  })
  .on('end', () => console.log("✅ Tax rates loaded successfully."));

// ✅ API to calculate tax
app.post('/calculate-tax', (req, res) => {
    let { products, sellerZip, sellerState, buyerZip, buyerState, deliveryMethod, taxRuleType, isTaxExempt, taxOverrideGroup } = req.body;

    // Convert full state names to abbreviations
    sellerState = getStateAbbreviation(sellerState);
    buyerState = getStateAbbreviation(buyerState);

    if (!taxRates[buyerZip] || !taxRates[sellerZip]) {
        return res.status(400).json({ error: "Invalid ZIP code." });
    }

    const buyerTaxData = taxRates[buyerZip];
    const sellerTaxData = taxRates[sellerZip];

    if (buyerTaxData.state !== buyerState) {
        return res.status(400).json({ error: `Buyer ZIP code ${buyerZip} does not match state ${buyerState}. Expected: ${buyerTaxData.state}.` });
    }
    if (sellerTaxData.state !== sellerState) {
        return res.status(400).json({ error: `Seller ZIP code ${sellerZip} does not match state ${sellerState}. Expected: ${sellerTaxData.state}.` });
    }

    // Determine whether to use Origin-Based or Destination-Based tax
    const taxData = taxRuleType === "Origin-Based" ? sellerTaxData : buyerTaxData;

    let totalPrice = 0, totalTax = 0;
    let stateTaxTotal = 0, countyTaxTotal = 0, cityTaxTotal = 0, specialTaxTotal = 0;

    products.forEach(product => {
        let productTotal = product.price * product.quantity;
        
        // Apply product-specific tax override
        if (product.useCustomTax) {
            productTotal = productTotal * (product.customTaxRate / 100);
        }

        // If the entire order is tax-exempt, skip tax calculations
        if (isTaxExempt) {
            totalPrice += productTotal;
            return;
        }

        // Apply tax override group discount if applicable
        let stateTaxRate = taxData.stateRate;
        let cityTaxRate = taxData.cityRate;

        if (taxOverrideGroup === "50% Reduction") {
            stateTaxRate /= 2;
            cityTaxRate /= 2;
        }

        let stateTax = parseFloat((productTotal * (stateTaxRate / 100)).toFixed(2));
        let countyTax = parseFloat((productTotal * (taxData.countyRate / 100)).toFixed(2));
        let cityTax = parseFloat((productTotal * (cityTaxRate / 100)).toFixed(2));
        let specialTax = parseFloat((productTotal * (taxData.specialRate / 100)).toFixed(2));

        totalPrice += productTotal;
        stateTaxTotal += stateTax;
        countyTaxTotal += countyTax;
        cityTaxTotal += cityTax;
        specialTaxTotal += specialTax;
    });

    // Total sales tax should be sum of individual taxes
    totalTax = stateTaxTotal + countyTaxTotal + cityTaxTotal + specialTaxTotal;

    res.json({
        deliveryMethod,
        taxRuleType,
        taxRegion: taxData.taxRegion,
        totalPrice: totalPrice.toFixed(2),
        totalTax: totalTax.toFixed(2),
        finalTotal: (totalPrice + totalTax).toFixed(2),
        breakdown: {
            stateTax: stateTaxTotal.toFixed(2),
            countyTax: countyTaxTotal.toFixed(2),
            cityTax: cityTaxTotal.toFixed(2),
            specialTax: specialTaxTotal.toFixed(2)
        }
    });
});

// ✅ Handle 404 for unknown routes
app.use((req, res) => {
    res.status(404).json({ error: "Route not found" });
});

// ✅ Start Server
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

