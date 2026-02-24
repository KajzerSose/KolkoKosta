# Active Context: Kolko Kosta - Croatian Supermarket Price Comparison

## Current State

**Project Status**: ✅ Initial version deployed

The project has been transformed from a Next.js starter template into "Kolko Kosta" - a Croatian supermarket price comparison website that fetches daily price data from api.cijene.dev.

## Recently Completed

- [x] Explored cijene-api GitHub repository and live API at api.cijene.dev
- [x] Understood ZIP archive structure (stores.csv, products.csv, prices.csv per chain)
- [x] Installed dependencies: recharts, jszip, papaparse
- [x] Built cijene.ts library for data fetching and parsing
- [x] Created /api/search endpoint for product search with city filtering
- [x] Created /api/cities endpoint with comprehensive Croatian city list
- [x] Created /api/history endpoint for price history data
- [x] Built main page with search, city selector, popular searches
- [x] Built ProductCard component with price comparison bars
- [x] Built PriceHistoryChart component with recharts line chart
- [x] TypeScript and ESLint checks pass
- [x] Committed and pushed to repository

## Current Structure

| File/Directory | Purpose | Status |
|----------------|---------|--------|
| `src/app/page.tsx` | Main search page with city selector | ✅ Ready |
| `src/app/layout.tsx` | Root layout with Croatian metadata | ✅ Ready |
| `src/app/globals.css` | Global styles | ✅ Ready |
| `src/app/api/search/route.ts` | Product search API | ✅ Ready |
| `src/app/api/cities/route.ts` | Croatian cities list API | ✅ Ready |
| `src/app/api/history/route.ts` | Price history API | ✅ Ready |
| `src/lib/cijene.ts` | Data fetching/parsing library | ✅ Ready |
| `src/components/ProductCard.tsx` | Product with price comparison | ✅ Ready |
| `src/components/PriceHistoryChart.tsx` | Price history line chart | ✅ Ready |

## Data Source

- **API**: https://api.cijene.dev/v0/list - lists available daily ZIP archives
- **Archives**: https://api.cijene.dev/v0/archive/YYYY-MM-DD.zip - daily ZIP files (~80MB each)
- **Structure**: Each ZIP contains folders per chain with stores.csv, products.csv, prices.csv
- **Chains**: Konzum, Spar, Studenac, Plodine, Lidl, Tommy, Kaufland, Eurospin, dm, KTC, Metro, Trgocentar, Vrutak, Ribola, NTL, Roto, Boso, Brodokomerc, Jadranka Trgovina, Trgovina Krk
- **Data available since**: 2025-05-15

## Known Issues / Limitations

- ZIP files are ~80MB, too large for Next.js data cache (2MB limit) - warning during build but works at runtime
- Price history API downloads multiple ZIP files which is slow - consider optimization
- The ZIP files are processed server-side on each request (no persistent caching)

## Current Focus

The initial version is deployed. Next steps based on user feedback:
1. Performance optimization (caching, streaming)
2. UI improvements
3. Additional features (barcode scanner, shopping list, etc.)

## Session History

| Date | Changes |
|------|---------|
| 2026-02-24 | Initial build of Kolko Kosta price comparison website |
