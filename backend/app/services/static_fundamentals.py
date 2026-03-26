# ── Static Sector & Industry Map ────────────────────────────────────
# Primary source for sector/industry data.
# Yahoo Finance .info is unreliable — this dictionary is the truth.
# Format: "TICKER": ("Sector", "Industry")
#
# To add a new stock, just add a line here.
# Sector changes are extremely rare (only during major restructuring),
# so this data stays accurate for years.

STATIC_FUNDAMENTALS: dict[str, tuple[str, str]] = {
    # ════════════════════════════════════════════════════════════════
    # US STOCKS (~100)
    # ════════════════════════════════════════════════════════════════

    # ── Technology ──────────────────────────────────────────────────
    "AAPL":  ("Technology", "Consumer Electronics"),
    "MSFT":  ("Technology", "Software—Infrastructure"),
    "GOOGL": ("Technology", "Internet Content & Information"),
    "META":  ("Technology", "Internet Content & Information"),
    "NVDA":  ("Technology", "Semiconductors"),
    "AVGO":  ("Technology", "Semiconductors"),
    "AMD":   ("Technology", "Semiconductors"),
    "INTC":  ("Technology", "Semiconductors"),
    "QCOM":  ("Technology", "Semiconductors"),
    "MU":    ("Technology", "Semiconductors"),
    "TXN":   ("Technology", "Semiconductors"),
    "LRCX":  ("Technology", "Semiconductor Equipment"),
    "KLAC":  ("Technology", "Semiconductor Equipment"),
    "AMAT":  ("Technology", "Semiconductor Equipment"),
    "ARM":   ("Technology", "Semiconductors"),
    "MRVL":  ("Technology", "Semiconductors"),
    "ORCL":  ("Technology", "Software—Infrastructure"),
    "CRM":   ("Technology", "Software—Application"),
    "ADBE":  ("Technology", "Software—Application"),
    "NOW":   ("Technology", "Software—Application"),
    "SNPS":  ("Technology", "Software—Application"),
    "CDNS":  ("Technology", "Software—Application"),
    "PANW":  ("Technology", "Software—Infrastructure"),
    "CRWD":  ("Technology", "Software—Infrastructure"),
    "ZS":    ("Technology", "Software—Infrastructure"),
    "DDOG":  ("Technology", "Software—Application"),
    "SNOW":  ("Technology", "Software—Application"),
    "NET":   ("Technology", "Software—Infrastructure"),
    "PLTR":  ("Technology", "Software—Application"),
    "DELL":  ("Technology", "Computer Hardware"),
    "HPE":   ("Technology", "Communication Equipment"),
    "IBM":   ("Technology", "Information Technology Services"),
    "ACN":   ("Technology", "Information Technology Services"),
    "CSCO":  ("Technology", "Communication Equipment"),
    "SMCI":  ("Technology", "Computer Hardware"),

    # ── Communication Services ─────────────────────────────────────
    "NFLX":  ("Communication Services", "Entertainment"),
    "DIS":   ("Communication Services", "Entertainment"),
    "SPOT":  ("Communication Services", "Internet Content & Information"),
    "SNAP":  ("Communication Services", "Internet Content & Information"),
    "RBLX":  ("Communication Services", "Electronic Gaming & Multimedia"),
    "ROKU":  ("Communication Services", "Entertainment"),
    "T":     ("Communication Services", "Telecom Services"),
    "VZ":    ("Communication Services", "Telecom Services"),

    # ── Consumer Cyclical ──────────────────────────────────────────
    "AMZN":  ("Consumer Cyclical", "Internet Retail"),
    "TSLA":  ("Consumer Cyclical", "Auto Manufacturers"),
    "HD":    ("Consumer Cyclical", "Home Improvement Retail"),
    "LOW":   ("Consumer Cyclical", "Home Improvement Retail"),
    "NKE":   ("Consumer Cyclical", "Footwear & Accessories"),
    "SBUX":  ("Consumer Cyclical", "Restaurants"),
    "BKNG":  ("Consumer Cyclical", "Travel Services"),
    "ABNB":  ("Consumer Cyclical", "Travel Services"),
    "UBER":  ("Consumer Cyclical", "Software—Application"),
    "SHOP":  ("Consumer Cyclical", "Internet Retail"),
    "RIVN":  ("Consumer Cyclical", "Auto Manufacturers"),
    "LCID":  ("Consumer Cyclical", "Auto Manufacturers"),

    # ── Consumer Defensive ─────────────────────────────────────────
    "WMT":   ("Consumer Defensive", "Discount Stores"),
    "COST":  ("Consumer Defensive", "Discount Stores"),
    "PG":    ("Consumer Defensive", "Household & Personal Products"),
    "KO":    ("Consumer Defensive", "Beverages—Non-Alcoholic"),
    "PEP":   ("Consumer Defensive", "Beverages—Non-Alcoholic"),
    "MDLZ":  ("Consumer Defensive", "Confectioners"),

    # ── Healthcare ─────────────────────────────────────────────────
    "LLY":   ("Healthcare", "Drug Manufacturers"),
    "UNH":   ("Healthcare", "Healthcare Plans"),
    "JNJ":   ("Healthcare", "Drug Manufacturers"),
    "MRK":   ("Healthcare", "Drug Manufacturers"),
    "ABBV":  ("Healthcare", "Drug Manufacturers"),
    "TMO":   ("Healthcare", "Diagnostics & Research"),
    "PFE":   ("Healthcare", "Drug Manufacturers"),
    "AMGN":  ("Healthcare", "Drug Manufacturers"),
    "GILD":  ("Healthcare", "Drug Manufacturers"),
    "ISRG":  ("Healthcare", "Medical Instruments & Supplies"),

    # ── Financials ─────────────────────────────────────────────────
    "BRK-B": ("Financial Services", "Insurance—Diversified"),
    "V":     ("Financial Services", "Credit Services"),
    "MA":    ("Financial Services", "Credit Services"),
    "JPM":   ("Financial Services", "Banks—Diversified"),
    "GS":    ("Financial Services", "Capital Markets"),
    "MS":    ("Financial Services", "Capital Markets"),
    "BLK":   ("Financial Services", "Asset Management"),
    "SPGI":  ("Financial Services", "Financial Data & Stock Exchanges"),
    "AXP":   ("Financial Services", "Credit Services"),
    "PYPL":  ("Financial Services", "Credit Services"),
    "COIN":  ("Financial Services", "Financial Data & Stock Exchanges"),
    "SQ":    ("Financial Services", "Software—Infrastructure"),
    "MSTR":  ("Technology", "Software—Application"),

    # ── Energy ─────────────────────────────────────────────────────
    "XOM":   ("Energy", "Oil & Gas Integrated"),
    "CVX":   ("Energy", "Oil & Gas Integrated"),
    "COP":   ("Energy", "Oil & Gas E&P"),

    # ── Industrials ────────────────────────────────────────────────
    "BA":    ("Industrials", "Aerospace & Defense"),
    "CAT":   ("Industrials", "Farm & Heavy Construction Machinery"),
    "DE":    ("Industrials", "Farm & Heavy Construction Machinery"),
    "HON":   ("Industrials", "Conglomerates"),
    "LMT":   ("Industrials", "Aerospace & Defense"),
    "RTX":   ("Industrials", "Aerospace & Defense"),
    "GE":    ("Industrials", "Aerospace & Defense"),
    "UNP":   ("Industrials", "Railroads"),
    "ADP":   ("Industrials", "Staffing & Employment Services"),
    "MMM":   ("Industrials", "Conglomerates"),
    "FIS":   ("Technology", "Information Technology Services"),

    # ── Utilities ──────────────────────────────────────────────────
    "NEE":   ("Utilities", "Utilities—Regulated Electric"),

    # ════════════════════════════════════════════════════════════════
    # KOREAN STOCKS (~70)
    # ════════════════════════════════════════════════════════════════

    # ── Technology ──────────────────────────────────────────────────
    "005930.KS": ("Technology", "Consumer Electronics"),
    "000660.KS": ("Technology", "Semiconductors"),
    "006400.KS": ("Technology", "Electronic Components"),
    "009150.KS": ("Technology", "Electronic Components"),
    "018260.KS": ("Technology", "Information Technology Services"),
    "034220.KS": ("Technology", "Electronic Components"),
    "042700.KS": ("Technology", "Semiconductor Equipment"),
    "011070.KS": ("Technology", "Electronic Components"),
    "058470.KS": ("Technology", "Semiconductor Equipment"),
    "267260.KS": ("Technology", "Electrical Equipment"),
    "010120.KS": ("Technology", "Electrical Equipment"),
    "022100.KS": ("Technology", "Information Technology Services"),

    # ── Communication Services ─────────────────────────────────────
    "035420.KS": ("Communication Services", "Internet Content & Information"),
    "035720.KS": ("Communication Services", "Internet Content & Information"),
    "323410.KS": ("Communication Services", "Internet Content & Information"),
    "377300.KS": ("Communication Services", "Internet Content & Information"),
    "017670.KS": ("Communication Services", "Telecom Services"),
    "030200.KS": ("Communication Services", "Telecom Services"),
    "035760.KS": ("Communication Services", "Entertainment"),
    "259960.KS": ("Communication Services", "Electronic Gaming & Multimedia"),
    "352820.KS": ("Communication Services", "Entertainment"),
    "036570.KS": ("Communication Services", "Electronic Gaming & Multimedia"),
    "251270.KS": ("Communication Services", "Electronic Gaming & Multimedia"),
    "263750.KS": ("Communication Services", "Electronic Gaming & Multimedia"),

    # ── Consumer Cyclical ──────────────────────────────────────────
    "005380.KS": ("Consumer Cyclical", "Auto Manufacturers"),
    "000270.KS": ("Consumer Cyclical", "Auto Manufacturers"),
    "012330.KS": ("Consumer Cyclical", "Auto Parts"),
    "086280.KS": ("Consumer Cyclical", "Specialty Retail"),
    "004020.KS": ("Basic Materials", "Steel"),
    "000720.KS": ("Industrials", "Engineering & Construction"),
    "161390.KS": ("Consumer Cyclical", "Auto Parts"),
    "090430.KS": ("Consumer Defensive", "Household & Personal Products"),
    "051900.KS": ("Consumer Defensive", "Household & Personal Products"),
    "021240.KS": ("Consumer Cyclical", "Furnishings & Fixtures"),

    # ── Healthcare / Bio ───────────────────────────────────────────
    "207940.KS": ("Healthcare", "Biotechnology"),
    "068270.KS": ("Healthcare", "Biotechnology"),
    "326030.KS": ("Healthcare", "Drug Manufacturers"),
    "000100.KS": ("Healthcare", "Drug Manufacturers"),
    "006280.KS": ("Healthcare", "Drug Manufacturers"),
    "128940.KS": ("Healthcare", "Drug Manufacturers"),
    "302440.KS": ("Healthcare", "Biotechnology"),
    "028300.KS": ("Healthcare", "Biotechnology"),

    # ── Financials ─────────────────────────────────────────────────
    "105560.KS": ("Financial Services", "Banks—Diversified"),
    "055550.KS": ("Financial Services", "Banks—Diversified"),
    "086790.KS": ("Financial Services", "Banks—Diversified"),
    "316140.KS": ("Financial Services", "Banks—Diversified"),
    "138040.KS": ("Financial Services", "Insurance—Diversified"),
    "032830.KS": ("Financial Services", "Insurance—Life"),
    "000810.KS": ("Financial Services", "Insurance—Property & Casualty"),
    "024110.KS": ("Financial Services", "Banks—Regional"),
    "006800.KS": ("Financial Services", "Capital Markets"),
    "071050.KS": ("Financial Services", "Capital Markets"),
    "005830.KS": ("Financial Services", "Insurance—Property & Casualty"),
    "005940.KS": ("Financial Services", "Capital Markets"),
    "016360.KS": ("Financial Services", "Capital Markets"),
    "088350.KS": ("Financial Services", "Insurance—Life"),

    # ── Energy / Chemicals ─────────────────────────────────────────
    "051910.KS": ("Basic Materials", "Specialty Chemicals"),
    "096770.KS": ("Energy", "Oil & Gas Refining"),
    "010950.KS": ("Energy", "Oil & Gas Refining"),
    "373220.KS": ("Industrials", "Electrical Equipment"),
    "009830.KS": ("Basic Materials", "Specialty Chemicals"),
    "285130.KS": ("Basic Materials", "Specialty Chemicals"),
    "247540.KS": ("Basic Materials", "Specialty Chemicals"),
    "086520.KS": ("Basic Materials", "Specialty Chemicals"),

    # ── Industrials / Conglomerates ────────────────────────────────
    "028260.KS": ("Industrials", "Conglomerates"),
    "012450.KS": ("Industrials", "Aerospace & Defense"),
    "034020.KS": ("Industrials", "Specialty Industrial Machinery"),
    "005490.KS": ("Basic Materials", "Steel"),
    "003670.KS": ("Basic Materials", "Specialty Chemicals"),
    "010130.KS": ("Basic Materials", "Other Industrial Metals"),
    "034730.KS": ("Industrials", "Conglomerates"),
    "402340.KS": ("Technology", "Information Technology Services"),
    "003550.KS": ("Industrials", "Conglomerates"),
    "042660.KS": ("Industrials", "Marine Shipping"),
    "009540.KS": ("Industrials", "Marine Shipping"),
    "329180.KS": ("Industrials", "Marine Shipping"),
    "010140.KS": ("Industrials", "Marine Shipping"),
    "241560.KS": ("Industrials", "Farm & Heavy Construction Machinery"),
    "454910.KS": ("Industrials", "Specialty Industrial Machinery"),
    "277810.KS": ("Industrials", "Specialty Industrial Machinery"),
    "051600.KS": ("Industrials", "Specialty Industrial Machinery"),

    # ── Utilities ──────────────────────────────────────────────────
    "015760.KS": ("Utilities", "Utilities—Regulated Electric"),

    # ── Consumer Defensive ─────────────────────────────────────────
    "097950.KS": ("Consumer Defensive", "Packaged Foods"),
    "033780.KS": ("Consumer Defensive", "Tobacco"),

    # ── Transportation ─────────────────────────────────────────────
    "003490.KS": ("Industrials", "Airlines"),
}
