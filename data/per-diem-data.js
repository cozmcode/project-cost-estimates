// Per diem configuration data (rates, overrides, and sources)
const perDiemConfig = {
    finland: {
        year: 2026,
        sourceName: 'Finnish Tax Admin 2026',
        sourceUrl: 'https://www.vero.fi/syventavat-vero-ohjeet/paatokset/2025/verohallinnon-paatos-verovapaista-matkakustannusten-korvauksista-vuonna-2026/',
        rates: {
            Brazil: 72,
            USA: 86,
            Germany: 78,
            UK: 84,
            UAE: 69,
            Singapore: 79,
            Australia: 72,
            Mexico: 74,
            India: 57,
            SouthAfrica: 53
        },
        cityOverrides: {
            USA: {
                "Standard (Other)": 86,
                "New York": 122,
                "Los Angeles": 122,
                "Washington D.C.": 122
            },
            UK: {
                "Standard (Other)": 84,
                "London": 89,
                "Edinburgh": 89
            }
        },
        defaultRate: 54
    },
    portugal: {
        year: 2025,
        sourceName: 'DGAEP ajudas de custo (missao oficial no estrangeiro, nivel remuneratorio 18+)',
        sourceUrl: 'https://www.dgaep.gov.pt/stap/infoPageTabelas.cfm?objid=C63BAF54-E6CE-49C1-BBF1-C5AC0AF36C68&KeepThis=true#:~:text=Com%20remunera%C3%A7%C3%B5es%20base%20superiores%20ao%20valor%20do%20n%C3%ADvel%20remunerat%C3%B3rio%2018%20-%20148%2C91%20%E2%82%AC',
        flatRate: 148.91
    }
};

window.perDiemConfig = perDiemConfig;
